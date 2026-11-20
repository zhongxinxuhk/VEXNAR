// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The app must read project ownership from these routes. Registration is
// idempotent, and a conversation that already belongs to another project cannot
// be moved by a client that simply switched directories.
func TestDesktopProjectRoutes(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer m.Close()
	tmp := t.TempDir()
	s := New(context.Background(), m, tmp, tmp, tmp)
	s.desktopToken = "project-token"
	handler := s.Handler()

	call := func(method, path, body string) *httptest.ResponseRecorder {
		var reader *strings.Reader
		if body == "" {
			reader = strings.NewReader("")
		} else {
			reader = strings.NewReader(body)
		}
		req := httptest.NewRequest(method, path, reader)
		// The gateway only accepts loopback callers.
		req.RemoteAddr = "127.0.0.1:1234"
		req.Header.Set(desktopTokenHeader, "project-token")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	root := filepath.Join(t.TempDir(), "workspace-alpha")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	payload := fmt.Sprintf(`{"root_path":%q}`, root)
	first := call(http.MethodPost, "/api/desktop/projects", payload)
	if first.Code != http.StatusOK {
		t.Fatalf("register status=%d body=%s", first.Code, first.Body.String())
	}
	var project struct {
		ID       string `json:"id"`
		RootPath string `json:"root_path"`
		Name     string `json:"name"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &project); err != nil {
		t.Fatal(err)
	}
	if project.ID == "" || project.Name != "workspace-alpha" {
		t.Fatalf("unexpected project: %+v", project)
	}
	// Same directory again: one row, same id.
	second := call(http.MethodPost, "/api/desktop/projects", payload)
	if second.Code != http.StatusOK || !strings.Contains(second.Body.String(), project.ID) {
		t.Fatalf("re-register not idempotent: %d %s", second.Code, second.Body.String())
	}
	listed := call(http.MethodGet, "/api/desktop/projects", "")
	if listed.Code != http.StatusOK || !strings.Contains(listed.Body.String(), project.ID) {
		t.Fatalf("list projects: %d %s", listed.Code, listed.Body.String())
	}
	// A relative path is rejected: ownership must be a real directory.
	if bad := call(http.MethodPost, "/api/desktop/projects", `{"root_path":"relative/dir"}`); bad.Code != http.StatusBadRequest {
		t.Fatalf("relative path accepted: %d", bad.Code)
	}

	// Two projects, one thread each, plus an unassigned thread.
	ctx := context.Background()
	other, err := m.PG().RegisterDesktopProject(ctx, filepath.Join(t.TempDir(), "workspace-beta"), "workspace-beta")
	if err != nil {
		t.Fatal(err)
	}
	alphaID := int64(0)
	if _, err := fmt.Sscan(project.ID, &alphaID); err != nil {
		t.Fatalf("project id not numeric: %q", project.ID)
	}
	owned, err := m.PG().CreateConversationInProject("auto", "owned-thread", nil, &alphaID, root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.PG().DeleteConversation(owned.ID) })
	loose, err := m.PG().CreateConversation("auto", "loose-thread", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.PG().DeleteConversation(loose.ID) })

	move := func(id int64, target int64) *httptest.ResponseRecorder {
		return call(http.MethodPost, fmt.Sprintf("/api/desktop/conversations/%d/project", id), fmt.Sprintf(`{"project_id":%d}`, target))
	}
	if conflict := move(owned.ID, other.ID); conflict.Code != http.StatusConflict {
		t.Fatalf("cross-project move allowed: %d %s", conflict.Code, conflict.Body.String())
	}
	bind := move(loose.ID, other.ID)
	if bind.Code != http.StatusOK {
		t.Fatalf("bind unassigned: %d %s", bind.Code, bind.Body.String())
	}
	var bound struct {
		ProjectID *int64 `json:"project_id"`
	}
	if err := json.Unmarshal(bind.Body.Bytes(), &bound); err != nil {
		t.Fatal(err)
	}
	if bound.ProjectID == nil || *bound.ProjectID != other.ID {
		t.Fatalf("bound project = %v want %d (%s)", bound.ProjectID, other.ID, bind.Body.String())
	}
	if missing := move(loose.ID, 999999); missing.Code != http.StatusNotFound {
		t.Fatalf("unknown project accepted: %d", missing.Code)
	}
}

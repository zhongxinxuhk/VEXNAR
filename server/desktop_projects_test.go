// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zhongxinxuhk/vexnar/db"
)

func TestDesktopProjectRoutesRequireLoopbackToken(t *testing.T) {
	s := &Server{desktopToken: "desktop-fixture", jwtKey: []byte("test-key")}
	jwt, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	s.registerDesktopProjects(mux)
	h := s.requireAuth(mux)
	for _, tc := range []struct{ addr, token string }{
		{"127.0.0.1:1234", ""},
		{"127.0.0.1:1234", "incorrect"},
		{"192.0.2.1:1234", s.desktopToken},
	} {
		request := httptest.NewRequest(http.MethodGet, "/api/desktop/projects", nil)
		request.RemoteAddr = tc.addr
		request.Header.Set(desktopTokenHeader, tc.token)
		request.Header.Set("Authorization", "Bearer "+jwt)
		response := httptest.NewRecorder()
		h.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Errorf("address %s: status=%d, want 401", tc.addr, response.Code)
		}
	}
}

func TestDesktopProjectTaskOwnership(t *testing.T) {
	dsn, _, err := db.DSN()
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	pg, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pg.Close() })
	s := &Server{m: &Manager{pg: pg}, desktopToken: "desktop-fixture"}
	h := s.Handler()
	request := func(method, route string, body any, want int, out any) {
		t.Helper()
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(method, route, bytes.NewReader(encoded))
		req.RemoteAddr = "127.0.0.1:1234"
		req.Header.Set(desktopTokenHeader, s.desktopToken)
		response := httptest.NewRecorder()
		h.ServeHTTP(response, req)
		if response.Code != want {
			t.Fatalf("%s %s: status=%d want=%d, body=%s", method, route, response.Code, want, response.Body)
		}
		if out != nil {
			if err := json.Unmarshal(response.Body.Bytes(), out); err != nil {
				t.Fatal(err)
			}
		}
	}
	register := func(path string) db.DesktopProject {
		t.Helper()
		var project db.DesktopProject
		request(http.MethodPost, "/api/desktop/projects", map[string]string{"root_path": path}, 200, &project)
		return project
	}
	rootA := filepath.Join(t.TempDir(), "same")
	rootB := filepath.Join(t.TempDir(), "same")
	for _, path := range []string{rootA, rootB} {
		if err := os.Mkdir(path, 0755); err != nil {
			t.Fatal(err)
		}
	}
	projectA, projectB := register(rootA), register(rootB)
	t.Cleanup(func() { _, _ = pg.Exec(`DELETE FROM desktop_projects WHERE id IN ($1,$2)`, projectA.ID, projectB.ID) })
	if projectA.ID == projectB.ID || projectA.Name != projectB.Name {
		t.Fatalf("same-name roots must have distinct IDs: %+v %+v", projectA, projectB)
	}
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(rootA, alias); err != nil {
		t.Fatal(err)
	}
	if got := register(alias); got != projectA {
		t.Fatalf("alias resolved to different project: %+v, want %+v", got, projectA)
	}
	request(http.MethodPost, "/api/desktop/projects", map[string]string{"root_path": "relative/path"}, 400, nil)

	task, err := pg.CreateTask("existing fixture", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pg.DeleteTask(task.ID) })
	lookup := fmt.Sprintf("/api/desktop/task-projects/%d", task.ID)
	var ownership struct {
		ProjectID *int64 `json:"project_id,string"`
	}
	request(http.MethodGet, lookup, nil, 200, &ownership)
	if ownership.ProjectID != nil {
		t.Fatalf("legacy task was implicitly assigned: %v", *ownership.ProjectID)
	}

	listA := fmt.Sprintf("/api/desktop/projects/%d/tasks", projectA.ID)
	listB := fmt.Sprintf("/api/desktop/projects/%d/tasks", projectB.ID)
	detailA, detailB := fmt.Sprintf("%s/%d", listA, task.ID), fmt.Sprintf("%s/%d", listB, task.ID)
	request(http.MethodGet, detailA, nil, 404, nil)
	request(http.MethodPut, detailA, nil, 200, nil)
	request(http.MethodPut, detailA, nil, 200, nil)
	request(http.MethodPut, detailB, nil, 409, nil)
	request(http.MethodGet, detailB, nil, 404, nil)
	request(http.MethodGet, lookup, nil, 200, &ownership)
	if ownership.ProjectID == nil || *ownership.ProjectID != projectA.ID {
		t.Fatalf("wrong project after binding: %+v", ownership)
	}
	var page struct {
		Tasks []db.DesktopProjectTask `json:"tasks"`
	}
	request(http.MethodGet, listA, nil, 200, &page)
	if len(page.Tasks) != 1 || page.Tasks[0].ID != task.ID {
		t.Fatalf("unexpected project A tasks: %+v", page.Tasks)
	}
	request(http.MethodGet, listB, nil, 200, &page)
	if page.Tasks == nil || len(page.Tasks) != 0 {
		t.Fatalf("project B must return an empty JSON array: %+v", page.Tasks)
	}
	request(http.MethodGet, fmt.Sprintf("%s?before=%d", listA, task.ID), nil, 200, &page)
	if len(page.Tasks) != 0 {
		t.Fatalf("cursor must exclude its own task: %+v", page.Tasks)
	}
	store := pg.Exploration(task.ExplorationID)
	segment, err := store.NewMainSession()
	if err != nil {
		t.Fatal(err)
	}
	branch, err := store.AddIntent(map[string]any{"summary": "current branch"}, 5, nil, "fixture")
	if err != nil {
		t.Fatal(err)
	}
	deletedBranch, err := store.AddIntent(map[string]any{"summary": "deleted branch"}, 5, nil, "fixture")
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range []db.Activity{
		{Worker: "mainagent", Kind: "text", Detail: "original transcript"},
		{Worker: "mainagent", Kind: "user", MainSeg: &segment.Seq, Summary: "current prompt"},
		{Worker: "mainagent", Kind: "thinking", MainSeg: &segment.Seq, Summary: "private reasoning"},
		{Worker: "mainagent", Kind: "tool_use", MainSeg: &segment.Seq, Tool: "read_file", Summary: "private arguments"},
		{Worker: "mainagent", Kind: "result", MainSeg: &segment.Seq, Detail: "current answer\nfull visible text"},
		{Worker: "work#1", Kind: "text", NodeID: &branch, Detail: "branch transcript"},
		{Worker: "work#2", Kind: "text", NodeID: &deletedBranch, Detail: "deleted transcript"},
	} {
		if _, err := store.AppendActivity(event); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.SoftDeleteIntent(deletedBranch, "fixture"); err != nil {
		t.Fatal(err)
	}
	var sessions struct {
		MainSegments []int                  `json:"main_segments"`
		Branches     []desktopProjectBranch `json:"branches"`
	}
	request(http.MethodGet, detailA+"/sessions", nil, 200, &sessions)
	branchKey := fmt.Sprintf("intent:%d", branch)
	if len(sessions.MainSegments) != 2 || sessions.MainSegments[0] != segment.Seq ||
		len(sessions.Branches) != 1 || sessions.Branches[0].Key != branchKey || sessions.Branches[0].Title != "current branch" {
		t.Fatalf("unexpected session list: %+v", sessions)
	}
	request(http.MethodGet, detailB+"/sessions", nil, 404, nil)
	request(http.MethodGet, detailB+"/history", nil, 404, nil)
	request(http.MethodGet, detailA+"/history?session=unknown", nil, 400, nil)
	request(http.MethodGet, fmt.Sprintf("%s/history?session=intent:%d", detailA, deletedBranch), nil, 404, nil)
	var history json.RawMessage
	request(http.MethodGet, detailA+"/history", nil, 200, &history)
	if strings.Contains(string(history), "private reasoning") || strings.Contains(string(history), "private arguments") ||
		strings.Contains(string(history), "original transcript") || strings.Contains(string(history), "branch transcript") ||
		!strings.Contains(string(history), "current answer\\nfull visible text") || !strings.Contains(string(history), `"tool":"read_file"`) {
		t.Fatalf("unexpected current history: %s", history)
	}
	request(http.MethodGet, detailA+"/history?session=main:0", nil, 200, &history)
	if !strings.Contains(string(history), "original transcript") || strings.Contains(string(history), "current answer") {
		t.Fatalf("unexpected original history: %s", history)
	}
	request(http.MethodGet, detailA+"/history?session="+branchKey, nil, 200, &history)
	if !strings.Contains(string(history), "branch transcript") || strings.Contains(string(history), "current answer") {
		t.Fatalf("unexpected branch history: %s", history)
	}
	for i := 0; i < desktopTaskHistorySize; i++ {
		if _, err := store.AppendActivity(db.Activity{Worker: "work#1", Kind: "text", NodeID: &branch, Summary: "additional history"}); err != nil {
			t.Fatal(err)
		}
	}
	var transcriptPage struct {
		Items []struct {
			Text string `json:"text"`
		} `json:"items"`
		NextBefore string `json:"next_before"`
	}
	branchHistory := detailA + "/history?session=" + branchKey
	request(http.MethodGet, branchHistory, nil, 200, &transcriptPage)
	if len(transcriptPage.Items) != desktopTaskHistorySize || transcriptPage.NextBefore == "" {
		t.Fatalf("expected a full page with a cursor: %+v", transcriptPage)
	}
	request(http.MethodGet, branchHistory+"&before="+transcriptPage.NextBefore, nil, 200, &transcriptPage)
	if len(transcriptPage.Items) != 1 || transcriptPage.Items[0].Text != "branch transcript" {
		t.Fatalf("older page has gaps or duplicates: %+v", transcriptPage)
	}

	second, err := pg.CreateTask("concurrent fixture", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pg.DeleteTask(second.ID) })
	foreign, err := pg.Exploration(second.ExplorationID).AddIntent(map[string]any{"summary": "foreign branch"}, 5, nil, "fixture")
	if err != nil {
		t.Fatal(err)
	}
	request(http.MethodGet, fmt.Sprintf("%s/history?session=intent:%d", detailA, foreign), nil, 404, nil)
	results := make(chan error, 2)
	for _, project := range []db.DesktopProject{projectA, projectB} {
		go func() { results <- pg.BindDesktopProjectTask(t.Context(), project.ID, second.ID) }()
	}
	firstErr, secondErr := <-results, <-results
	if firstErr != nil {
		firstErr, secondErr = secondErr, firstErr
	}
	if firstErr != nil || !errors.Is(secondErr, db.ErrDesktopTaskBound) {
		t.Fatalf("concurrent binding must have one winner: %v, %v", firstErr, secondErr)
	}
	if err := pg.DeleteTask(task.ID); err != nil {
		t.Fatal(err)
	}
	request(http.MethodGet, lookup, nil, 404, nil)
	request(http.MethodGet, detailA, nil, 404, nil)
}

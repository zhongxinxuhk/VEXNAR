// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package yakhistory

import (
	"errors"
	"os"
	"strings"
	"testing"
)

func TestAgentScopeAndReportPreviews(t *testing.T) {
	directory := canonicalPath(t.TempDir())
	project := Source{Name: "one", Workspace: directory, ProjectID: 1}
	for _, req := range []Request{
		{Agent: true, Source: project.Name},
		{Agent: true, Workspace: directory, Source: "different"},
		{Agent: true, Workspace: t.TempDir()},
	} {
		if _, err := Resolve([]Source{project}, req); err == nil {
			t.Fatalf("scope should be unavailable: %+v", req)
		}
	}
	if got, err := Resolve([]Source{project}, Request{Agent: true, Workspace: directory}); got.Name != "one" || err != nil {
		t.Fatalf("resolved %+v: %v", got, err)
	}
	raw := []byte("GET /orders?token=fixture HTTP/1.1\r\nAuthorization: Bearer fixture\r\nHost: app.test\r\n\r\nexample-body")
	view := packet(raw, Request{Agent: true})
	if strings.Contains(view.Text, "fixture") || strings.Contains(view.Text, "example-body") ||
		!strings.Contains(view.Text, "Host: app.test") || !view.Truncated || view.Base64 != "" {
		t.Fatalf("unexpected Agent view: %+v", view)
	}
	withBody := packet(raw, Request{Agent: true, IncludeBody: true})
	if !strings.Contains(withBody.Text, "example-body") || strings.Contains(withBody.Text, "fixture") {
		t.Fatalf("unexpected body preview: %+v", withBody)
	}
}

func TestOfficialYakHistory(t *testing.T) {
	path := os.Getenv("VEXNAR_TEST_YAK_HISTORY_CONFIG")
	if path == "" {
		t.Skip("requires an isolated Yak project with the History test records")
	}
	sources, err := Sources(path)
	if err != nil || len(sources) == 0 {
		t.Fatalf("fixtures: %v", err)
	}
	source := sources[0]
	raw, err := Read(t.Context(), source, Request{Action: "list", Status: "201"})
	if err != nil {
		t.Fatal(err)
	}
	page := raw.(Page)
	if page.Total != 1 || len(page.Rows) != 1 || page.Rows[0].ID != 52 {
		t.Fatalf("unexpected history: %+v", page)
	}
	raw, err = Read(t.Context(), source, Request{Action: "detail", ID: "52"})
	if err != nil {
		t.Fatal(err)
	}
	detail := raw.(Detail)
	if detail.Request.Base64 == "" || !strings.Contains(detail.Request.Text, "GET /orders/52") ||
		!strings.Contains(detail.Response.Text, `{"item":"history-qa"}`) {
		t.Fatalf("unexpected packet preview: %+v", detail)
	}
	source.ProjectID++
	if _, err := Read(t.Context(), source, Request{Action: "detail", ID: "52"}); !errors.Is(err, ErrProjectChanged) {
		t.Fatalf("wanted project mismatch, got %v", err)
	}
}

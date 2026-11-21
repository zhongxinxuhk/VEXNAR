// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestListTasksPaging pins the windowed task listing the dsh 任务 panel and the web
// console filter both rely on: no page/size keeps the legacy full-list envelope,
// with them the response is {tasks,total,page,size} and total describes the
// filtered set rather than the page on screen.
func TestListTasksPaging(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer m.Close()

	marker := time.Now().Format("150405.000000")
	created := make([]string, 0, 3)
	for i := 0; i < 3; i++ {
		task, err := m.CreateTask("tasks page "+marker+" #"+string(rune('a'+i)), "goal "+marker, nil, 0, 0)
		if err != nil {
			t.Fatalf("CreateTask[%d]: %v", i, err)
		}
		created = append(created, task.ID)
	}
	defer func() {
		for _, id := range created {
			_ = m.pg.DeleteTask(mustTaskID(t, id))
		}
	}()

	s := &Server{m: m, engine: NewEngine(m), ctx: context.Background()}

	// Legacy shape: every task, no paging keys at all.
	legacy := listTasksJSON(t, s, "")
	if _, ok := legacy["total"]; ok {
		t.Fatalf("legacy response must not gain paging keys: %v", legacy)
	}
	if all, _ := legacy["tasks"].([]any); len(all) < 3 {
		t.Fatalf("legacy response returned %d tasks, want >= 3", len(all))
	}

	// Windowed shape: total is the filtered set, size is the window.
	page1 := listTasksJSON(t, s, "?page=1&size=2")
	if got := int(page1["total"].(float64)); got < 3 {
		t.Fatalf("total=%d, want >= 3", got)
	}
	if got := len(page1["tasks"].([]any)); got != 2 {
		t.Fatalf("page 1 returned %d tasks, want 2", got)
	}
	if page1["page"].(float64) != 1 || page1["size"].(float64) != 2 {
		t.Fatalf("echoed page/size = %v/%v, want 1/2", page1["page"], page1["size"])
	}

	// A keyword narrows the set before the window: exactly the three fixtures.
	scoped := listTasksJSON(t, s, "?q="+marker+"&page=1&size=10")
	if got := int(scoped["total"].(float64)); got != 3 {
		t.Fatalf("q=%s total=%d, want 3", marker, got)
	}

	// A status nobody has yields an empty page with total 0, not the full list.
	empty := listTasksJSON(t, s, "?status=timeout&q="+marker+"&page=1&size=10")
	if got := int(empty["total"].(float64)); got != 0 {
		t.Fatalf("status=timeout total=%d, want 0", got)
	}
	if got := len(empty["tasks"].([]any)); got != 0 {
		t.Fatalf("status=timeout returned %d tasks, want 0", got)
	}

	// Oversized windows are capped so one poll cannot pull an unbounded slice.
	capped := listTasksJSON(t, s, "?page=1&size=9999")
	if got := capped["size"].(float64); got != taskPageMaxSize {
		t.Fatalf("size=%v, want capped %d", capped["size"], taskPageMaxSize)
	}
}

// listTasksJSON drives the list handler and decodes its envelope.
func listTasksJSON(t *testing.T, s *Server, query string) map[string]any {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/api/tasks"+query, nil).WithContext(context.Background())
	recorder := httptest.NewRecorder()
	s.listTasks(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/tasks%s status=%d body=%s", query, recorder.Code, recorder.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode %s: %v", query, err)
	}
	return payload
}

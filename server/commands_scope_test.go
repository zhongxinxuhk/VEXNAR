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
	"testing"
	"time"

	"github.com/zhongxinxuhk/vexnar/db"
)

// TestCommandScopeByTaskID pins the two identities the execution workbench fuses:
// activity rows are keyed by exploration_id, while 任务 and 发现 speak the task id,
// and the two sequences drift as soon as a task is created out of order. A
// ?task_id= query must resolve through the tasks row, return only that task's
// executions, and label every record with the same task id.
func TestCommandScopeByTaskID(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer m.Close()

	marker := fmt.Sprintf("__cmd_scope_%d__", time.Now().UnixNano())
	taskA, err := m.CreateTask("commands scope A "+marker, "goal", nil, 0, 0)
	if err != nil {
		t.Fatalf("CreateTask A: %v", err)
	}
	taskB, err := m.CreateTask("commands scope B "+marker, "goal", nil, 0, 0)
	if err != nil {
		t.Fatalf("CreateTask B: %v", err)
	}
	idA, idB := mustTaskID(t, taskA.ID), mustTaskID(t, taskB.ID)
	defer func() {
		_ = m.pg.DeleteTask(idA)
		_ = m.pg.DeleteTask(idB)
	}()

	expA := seedToolExecution(t, m, idA, marker+"_a")
	seedToolExecution(t, m, idB, marker+"_b")

	s := &Server{m: m}

	// Task identity: exactly one execution, labelled with the task it belongs to.
	records, total := listCommands(t, s, "task_id="+taskA.ID)
	if total != 1 || len(records) != 1 {
		t.Fatalf("task_id scope returned %d/%d records, want 1/1", len(records), total)
	}
	if records[0].TaskID != idA {
		t.Fatalf("record task_id=%d, want %d", records[0].TaskID, idA)
	}
	if records[0].Tool != marker+"_a" {
		t.Fatalf("record tool=%q, want %q", records[0].Tool, marker+"_a")
	}
	if records[0].ExpID != expA {
		t.Fatalf("record exploration_id=%d, want %d", records[0].ExpID, expA)
	}

	// The legacy exploration-id spelling keeps working and reaches the same row.
	legacy, legacyTotal := listCommands(t, s, fmt.Sprintf("task=%d", expA))
	if legacyTotal != 1 || len(legacy) != 1 || legacy[0].ID != records[0].ID {
		t.Fatalf("legacy exploration scope returned %+v (total %d), want the task_id row", legacy, legacyTotal)
	}

	// An unknown task is the caller's mistake, not "everything".
	request := httptest.NewRequest(http.MethodGet, "/api/commands?task_id=999999999", nil)
	recorder := httptest.NewRecorder()
	s.pgListCommands(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("unknown task_id status=%d body=%s, want 404", recorder.Code, recorder.Body.String())
	}

	request = httptest.NewRequest(http.MethodGet, "/api/commands?task_id=not-a-number", nil)
	recorder = httptest.NewRecorder()
	s.pgListCommands(recorder, request)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("malformed task_id status=%d body=%s, want 400", recorder.Code, recorder.Body.String())
	}

	// The tally dialog must describe the same filtered set as the table.
	request = httptest.NewRequest(http.MethodGet, "/api/commands/stats?task_id="+taskA.ID, nil)
	recorder = httptest.NewRecorder()
	s.pgToolStats(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("stats status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var stats struct {
		Stats []db.ToolStat `json:"stats"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &stats); err != nil {
		t.Fatal(err)
	}
	if len(stats.Stats) != 1 || stats.Stats[0].Tool != marker+"_a" || stats.Stats[0].Total != 1 {
		t.Fatalf("scoped stats=%+v, want the single task execution %q", stats.Stats, marker+"_a")
	}
}

// seedToolExecution writes one tool_use/tool_result pair into a task's
// exploration and returns that exploration id.
func seedToolExecution(t *testing.T, m *Manager, taskID int64, tool string) int64 {
	t.Helper()
	task, err := m.pg.GetTask(taskID)
	if err != nil || task == nil {
		t.Fatalf("GetTask(%d): %v", taskID, err)
	}
	store := m.pg.Exploration(task.ExplorationID)
	useID := fmt.Sprintf("use-%s", tool)
	if _, err := store.AppendActivity(db.Activity{
		Kind:      "tool_use",
		Tool:      tool,
		ToolUseID: useID,
		Worker:    "work#test",
		Detail:    `{"command":"id"}`,
	}); err != nil {
		t.Fatalf("append tool_use: %v", err)
	}
	if _, err := store.AppendActivity(db.Activity{
		Kind:      "tool_result",
		ToolUseID: useID,
		Detail:    "uid=0(root)",
	}); err != nil {
		t.Fatalf("append tool_result: %v", err)
	}
	return task.ExplorationID
}

// listCommands drives the list handler and decodes its payload.
func listCommands(t *testing.T, s *Server, query string) ([]db.CommandRecord, int) {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/api/commands?"+query, nil).
		WithContext(context.Background())
	recorder := httptest.NewRecorder()
	s.pgListCommands(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("commands %q status=%d body=%s", query, recorder.Code, recorder.Body.String())
	}
	var payload struct {
		Commands []db.CommandRecord `json:"commands"`
		Total    int                `json:"total"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode commands %q: %v", query, err)
	}
	return payload.Commands, payload.Total
}

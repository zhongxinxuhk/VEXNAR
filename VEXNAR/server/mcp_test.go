// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// mcpTools publishes VEXNAR's own domain tools to external agents. With no
// manager (unit scope) the traffic and asset tools are absent, so the expected
// surface is the task/finding set plus the create_task alias.
func TestMCPToolsExposeDomainSurface(t *testing.T) {
	tools := (&Server{}).mcpTools()

	want := map[string]bool{
		"list_tasks": false, "list_llm_profiles": false,
		"get_task_graph": false, "list_task_findings": false,
		"get_task_node_detail": false, "get_task_worker_trace": false,
		"list_task_worker_traces": false, "search_task_worker_traces": false,
		"add_task_hint": false, "pause_task": false, "spawn_task": false,
		"report_finding": false, "get_finding_traffic": false,
		"bind_finding_traffic": false, "update_finding_report": false,
		"create_task": false,
	}
	for _, tool := range tools {
		if _, ok := want[tool.Name]; !ok {
			t.Errorf("unexpected tool %q", tool.Name)
			continue
		}
		want[tool.Name] = true
		if tool.Description == "" {
			t.Errorf("%s has no description", tool.Name)
		}
		if tool.InputSchema == nil {
			t.Errorf("%s has no input schema", tool.Name)
		}
		if tool.Call == nil {
			t.Errorf("%s has no handler", tool.Name)
		}
	}
	for name, seen := range want {
		if !seen {
			t.Errorf("missing tool %q", name)
		}
	}
}

func TestMCPReportFindingSchemaCarriesTaskID(t *testing.T) {
	var found bool
	for _, tool := range (&Server{}).mcpTools() {
		if tool.Name != "report_finding" {
			continue
		}
		found = true
		props, _ := tool.InputSchema["properties"].(map[string]any)
		if _, ok := props["task_id"]; !ok {
			t.Fatalf("report_finding schema has no task_id: %v", tool.InputSchema)
		}
		required := tool.InputSchema["required"]
		raw, _ := json.Marshal(required)
		if !strings.Contains(string(raw), "task_id") {
			t.Fatalf("report_finding required = %s, want task_id", raw)
		}
	}
	if !found {
		t.Fatal("report_finding not exposed")
	}
}

func TestMCPCreateTaskAliasesSpawnTask(t *testing.T) {
	tools := (&Server{}).mcpTools()
	byName := map[string]int{}
	for i, tool := range tools {
		byName[tool.Name] = i
	}
	spawn, ok := byName["spawn_task"]
	if !ok {
		t.Fatal("spawn_task missing")
	}
	alias, ok := byName["create_task"]
	if !ok {
		t.Fatal("create_task missing")
	}
	a, _ := json.Marshal(tools[spawn].InputSchema)
	b, _ := json.Marshal(tools[alias].InputSchema)
	if string(a) != string(b) {
		t.Fatalf("create_task schema drifted from spawn_task:\n%s\n%s", a, b)
	}
}

func TestMCPTaskScopeAllowlist(t *testing.T) {
	t.Setenv("VEXNAR_MCP_TASK_IDS", "task-a, task-b")
	if err := checkMCPTaskScope(json.RawMessage(`{"task_id":"task-a"}`)); err != nil {
		t.Fatalf("allowed task rejected: %v", err)
	}
	if err := checkMCPTaskScope(json.RawMessage(`{"task_id":"task-b"}`)); err != nil {
		t.Fatalf("allowed task rejected: %v", err)
	}
	if err := checkMCPTaskScope(json.RawMessage(`{"task_id":"task-c"}`)); err == nil {
		t.Fatal("foreign task accepted")
	}
	// Calls without a task id are not narrowed here; the tool itself reports the
	// missing parameter.
	if err := checkMCPTaskScope(json.RawMessage(`{}`)); err != nil {
		t.Fatalf("task-less call rejected by scope: %v", err)
	}
}

// A foreign task must be refused by the wrapper before the handler touches any
// store, which is why this works on a manager-less Server.
func TestMCPToolRefusesForeignTask(t *testing.T) {
	t.Setenv("VEXNAR_MCP_TASK_IDS", "task-a")

	var call func(context.Context, json.RawMessage) (bool, string, error)
	for _, tool := range (&Server{}).mcpTools() {
		if tool.Name != "pause_task" {
			continue
		}
		call = func(ctx context.Context, args json.RawMessage) (bool, string, error) {
			res, err := tool.Call(ctx, args)
			if err != nil {
				return false, "", err
			}
			text := ""
			if len(res.Content) > 0 {
				text = res.Content[0].Text
			}
			return res.IsError, text, nil
		}
	}
	if call == nil {
		t.Fatal("pause_task not exposed")
	}
	isErr, text, err := call(context.Background(), json.RawMessage(`{"task_id":"task-z"}`))
	if err != nil {
		t.Fatalf("call error: %v", err)
	}
	if !isErr || !strings.Contains(text, "授权范围") {
		t.Fatalf("foreign task not refused: isError=%v text=%q", isErr, text)
	}
}

func TestMCPTokenPrefersEnvironment(t *testing.T) {
	t.Setenv("VEXNAR_MCP_TOKEN", "env-token")
	if got := newMCPToken(t.TempDir()); got != "env-token" {
		t.Fatalf("token = %q, want env-token", got)
	}
}

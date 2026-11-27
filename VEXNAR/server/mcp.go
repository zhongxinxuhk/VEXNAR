// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	actool "github.com/Autumn-27/norma/tool"

	"github.com/zhongxinxuhk/vexnar/agent"
	"github.com/zhongxinxuhk/vexnar/mcpserver"
)

// mcpTools lists the domain tools this service exposes to external agents.
//
// The surface is the product's own tool set, not a parallel API: reads discover
// tasks, graphs, findings, assets and recorded traffic, and writes steer a task
// (hint / pause / create), bind evidence and write reports. Reusing the in-process
// CoreTools keeps MCP from drifting away from what VEXNAR's own agents do.
//
// Authorization: the endpoint is loopback-only and bearer-token guarded, so the
// token holder is operator-level. VEXNAR_MCP_TASK_IDS narrows that further: when
// it is set, any call carrying a task_id must name one of the listed tasks.
func (s *Server) mcpTools() []mcpserver.Tool {
	core := []actool.CoreTool{
		// Discovery
		s.toolListTasks(),
		s.toolListLLMProfiles(),
		// Task-scoped reads
		s.toolGetTaskGraph(),
		s.toolListTaskFindings(),
		s.toolGetTaskNodeDetail(),
		s.toolGetWorkerTrace(),
		s.toolListWorkerTraces(),
		s.toolSearchWorkerTraces(),
		// Task-scoped writes
		s.toolAddHint(),
		s.toolPauseTask(),
		s.toolSpawnTask(),
		// Findings and evidence
		s.toolReportFinding(),
		s.toolGetFindingTraffic(),
		s.toolBindFindingTraffic(),
		s.toolUpdateFindingReport(),
	}
	if s.m != nil {
		if tr := s.m.Traffic(); tr != nil {
			for _, t := range tr.Tools() {
				switch t.Name() {
				case "traffic_search", "traffic_get", "traffic_blob":
					core = append(core, t)
				}
			}
		}
		if reg := buildDomainReg(s.m.Assets()); reg != nil {
			if t, ok := reg["list_assets"]; ok {
				core = append(core, t)
			}
		}
	}
	out := make([]mcpserver.Tool, 0, len(core)+1)
	for _, t := range core {
		out = append(out, s.wrapCoreTool(t))
	}
	// create_task is the external-client spelling of spawn_task: one task, started
	// immediately, with an optional parent reference.
	out = append(out, s.wrapCoreToolNamed("create_task",
		"新建任务并立即启动探索引擎，返回 task_id（等价 spawn_task；parent_ref 可选）。",
		s.toolSpawnTask()))
	return out
}

// toolReportFinding exposes report_finding to external agents. The in-process
// tool is task-bound, so the MCP wrapper takes task_id and delegates to a
// ToolSet built on that task's store.
func (s *Server) toolReportFinding() actool.CoreTool {
	desc := "记录确认的漏洞（需真实触发并带可复现证据）。外部客户端同时传 task_id。"
	schema := objSchema(map[string]any{
		"task_id": strParam("任务 id"),
	}, "task_id")
	for _, seed := range agent.BuiltinToolSeeds() {
		if seed.Key != "report_finding" {
			continue
		}
		desc = seed.Desc
		schema = withTaskID(seed.Schema)
		break
	}
	return wrTool("report_finding", desc, schema,
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			return s.delegateToTask(ctx, in, pickToolByName("report_finding"))
		})
}

// pickToolByName selects a task-bound domain tool by wire name. WorkerTools is
// the superset that carries report_finding; the pick returns nil when the tool
// is absent, and delegateToTask reports that instead of panicking.
func pickToolByName(name string) func(*agent.ToolSet) actool.CoreTool {
	return func(ts *agent.ToolSet) actool.CoreTool {
		for _, t := range ts.WorkerTools() {
			if t.Name() == name {
				return t
			}
		}
		return nil
	}
}

// withTaskID clones a tool schema and adds the task_id parameter MCP callers use
// to address a task. The original schema is never mutated.
func withTaskID(schema map[string]any) map[string]any {
	out := make(map[string]any, len(schema)+1)
	for k, v := range schema {
		out[k] = v
	}
	props := map[string]any{}
	if src, ok := schema["properties"].(map[string]any); ok {
		for k, v := range src {
			props[k] = v
		}
	}
	props["task_id"] = strParam("任务 id")
	out["properties"] = props
	var required []string
	switch src := schema["required"].(type) {
	case []string:
		required = append(required, src...)
	case []any:
		for _, v := range src {
			if s, ok := v.(string); ok {
				required = append(required, s)
			}
		}
	}
	required = append(required, "task_id")
	out["required"] = required
	return out
}

// checkMCPTaskScope enforces the optional VEXNAR_MCP_TASK_IDS allowlist.
func checkMCPTaskScope(args json.RawMessage) error {
	raw := strings.TrimSpace(os.Getenv("VEXNAR_MCP_TASK_IDS"))
	if raw == "" {
		return nil
	}
	var head struct {
		TaskID string `json:"task_id"`
	}
	if len(args) > 0 {
		_ = json.Unmarshal(args, &head)
	}
	taskID := strings.TrimSpace(head.TaskID)
	if taskID == "" {
		return nil
	}
	for _, id := range strings.Split(raw, ",") {
		if strings.TrimSpace(id) == taskID {
			return nil
		}
	}
	return fmt.Errorf("task %s 不在 VEXNAR_MCP_TASK_IDS 授权范围内", taskID)
}

// wrapCoreTool adapts the agent tool contract to MCP. The tool keeps its own
// schema and permission semantics; only the result is flattened to text
// content, which is what MCP clients render.
func (s *Server) wrapCoreTool(t actool.CoreTool) mcpserver.Tool {
	return s.wrapCoreToolNamed(t.Name(), t.Description(), t)
}

// wrapCoreToolNamed is wrapCoreTool with an externally visible name/description,
// used by aliases such as create_task.
func (s *Server) wrapCoreToolNamed(name, desc string, t actool.CoreTool) mcpserver.Tool {
	return mcpserver.Tool{
		Name:        name,
		Description: desc,
		InputSchema: t.InputSchema(),
		Call: func(ctx context.Context, args json.RawMessage) (mcpserver.Result, error) {
			if err := checkMCPTaskScope(args); err != nil {
				return mcpserver.ErrorResult(err.Error()), nil
			}
			res, err := t.Call(ctx, args, nil)
			if err != nil {
				return mcpserver.Result{}, err
			}
			text := strings.TrimSpace(res.Flatten())
			if text == "" {
				text = "(empty result)"
			}
			return mcpserver.Result{
				Content: []mcpserver.Content{{Type: "text", Text: text}},
				IsError: res.IsError,
			}, nil
		},
	}
}

// mcpHandler serves POST /mcp. The endpoint is independent of the web console's
// JWT: it authenticates with its own bearer token and only accepts loopback
// callers unless VEXNAR_MCP_ALLOW_REMOTE=1 is set.
func (s *Server) mcpHandler() http.Handler {
	srv := &mcpserver.Server{
		Token:       s.mcpToken,
		Version:     BuildVersion,
		Name:        "vexnar",
		Tools:       s.mcpTools(),
		AllowRemote: strings.TrimSpace(os.Getenv("VEXNAR_MCP_ALLOW_REMOTE")) == "1",
		Logger:      log.Default(),
	}
	return srv.Handler()
}

// newMCPToken resolves the endpoint token. An explicit VEXNAR_MCP_TOKEN wins;
// otherwise a random token is generated and written next to the other runtime
// secrets so the launcher can read it. An empty return disables the endpoint.
func newMCPToken(dataDir string) string {
	if v := strings.TrimSpace(os.Getenv("VEXNAR_MCP_TOKEN")); v != "" {
		return v
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		log.Printf("[mcp] token generation failed: %v (endpoint disabled)", err)
		return ""
	}
	token := hex.EncodeToString(buf)
	if dataDir == "" {
		return token
	}
	path := filepath.Join(dataDir, "mcp.token")
	if err := os.WriteFile(path, []byte(token+"\n"), 0o600); err != nil {
		log.Printf("[mcp] token file %s: %v (endpoint remains active for this process)", path, err)
		return token
	}
	log.Printf("[mcp] endpoint enabled; token written to %s", path)
	return token
}

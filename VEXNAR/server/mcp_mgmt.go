// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/zhongxinxuhk/vexnar/db"
)

// mcpImportResult 是一次导入的结果：成功的按名字回填 id，失败的给出原因。
type mcpImportResult struct {
	Imported []map[string]any `json:"imported"`
	Skipped  []map[string]any `json:"skipped"`
}

// extractMCPServers 从用户粘贴的 JSON 里找出 mcpServers 那段配置。
// 兼容三种常见形态：
//
//	{"mcpServers": {...}}                       ← Claude Desktop / CC Switch
//	{"claude": {"mcpServers": {...}}}           ← CC Switch 导出（按应用分组）
//	{"name": {"command": "..."}, ...}           ← 直接的服务器映射
func extractMCPServers(raw []byte) (map[string]json.RawMessage, error) {
	var generic map[string]json.RawMessage
	if err := json.Unmarshal(raw, &generic); err != nil {
		return nil, fmt.Errorf("JSON 解析失败：%v", err)
	}
	if servers, ok := generic["mcpServers"]; ok {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(servers, &m); err != nil {
			return nil, fmt.Errorf("mcpServers 结构不正确：%v", err)
		}
		return m, nil
	}
	// 按应用分组：取第一个能找到 mcpServers 的分组。
	keys := make([]string, 0, len(generic))
	for k := range generic {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		var nested struct {
			MCPServers map[string]json.RawMessage `json:"mcpServers"`
			Servers    map[string]json.RawMessage `json:"servers"`
		}
		if json.Unmarshal(generic[k], &nested) != nil {
			continue
		}
		if len(nested.MCPServers) > 0 {
			return nested.MCPServers, nil
		}
		if len(nested.Servers) > 0 {
			return nested.Servers, nil
		}
	}
	// 直接映射：所有值都是对象且带 command/url 时按服务器映射处理。
	var m map[string]json.RawMessage
	if json.Unmarshal(raw, &m) != nil {
		return nil, fmt.Errorf("未找到 mcpServers 配置")
	}
	looksLikeServers := len(m) > 0
	for _, v := range m {
		var probe struct {
			Command string `json:"command"`
			URL     string `json:"url"`
		}
		if json.Unmarshal(v, &probe) != nil || (probe.Command == "" && probe.URL == "") {
			looksLikeServers = false
			break
		}
	}
	if looksLikeServers {
		delete(m, "mcpServers")
		return m, nil
	}
	return nil, fmt.Errorf("未找到 mcpServers 配置（支持 Claude Desktop / CC Switch 的 JSON）")
}

// mcpServerFromImport 把一条导入配置转成 db.MCPServer，并给出规范化后的传输方式。
func mcpServerFromImport(name string, raw json.RawMessage, enabled bool) (*db.MCPServer, error) {
	var cfg struct {
		Type     string            `json:"type"`
		Command  string            `json:"command"`
		Args     []any             `json:"args"`
		Env      map[string]string `json:"env"`
		URL      string            `json:"url"`
		Headers  map[string]string `json:"headers"`
		Disabled bool              `json:"disabled"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("配置解析失败：%v", err)
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("服务器名不能为空")
	}
	transport := strings.ToLower(strings.TrimSpace(cfg.Type))
	switch transport {
	case "":
		if strings.TrimSpace(cfg.Command) != "" {
			transport = "stdio"
		} else if strings.HasSuffix(strings.ToLower(cfg.URL), "/sse") {
			transport = "sse"
		} else {
			transport = "http"
		}
	case "streamable-http", "streamablehttp":
		transport = "http"
	}
	if transport != "stdio" && transport != "http" && transport != "sse" {
		return nil, fmt.Errorf("不支持的传输方式：%s", cfg.Type)
	}
	if transport == "stdio" && strings.TrimSpace(cfg.Command) == "" {
		return nil, fmt.Errorf("stdio 服务器缺少 command")
	}
	if transport != "stdio" && strings.TrimSpace(cfg.URL) == "" {
		return nil, fmt.Errorf("%s 服务器缺少 url", transport)
	}
	args := make([]string, 0, len(cfg.Args))
	for _, a := range cfg.Args {
		switch v := a.(type) {
		case string:
			args = append(args, v)
		case float64:
			args = append(args, strings.TrimSuffix(strings.TrimRight(fmt.Sprintf("%f", v), "0"), "."))
		default:
			b, _ := json.Marshal(v)
			args = append(args, string(b))
		}
	}
	env := map[string]string{}
	for k, v := range cfg.Env {
		env[k] = v
	}
	// HTTP/SSE 的 headers 与 stdio 的 env 共用一列（mcphttp 把 env 当 header 发）。
	for k, v := range cfg.Headers {
		env[k] = v
	}
	m := &db.MCPServer{
		Name:      name,
		Transport: transport,
		Command:   strings.TrimSpace(cfg.Command),
		URL:       strings.TrimSpace(cfg.URL),
		Enabled:   enabled && !cfg.Disabled,
	}
	if len(args) > 0 {
		m.Args, _ = json.Marshal(args)
	}
	if len(env) > 0 {
		m.Env, _ = json.Marshal(env)
	}
	return m, nil
}

// pgImportMCP 批量导入 MCP 配置（CC Switch / Claude Desktop 的 JSON）。
// 默认跳过同名服务器，overwrite=true 时覆盖。导入不做工具发现——一次性拉起多个
// stdio 服务器会拖住请求，列表页的「刷新」按钮负责按需发现。
func (s *Server) pgImportMCP(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body struct {
		JSON      json.RawMessage `json:"json"`
		Config    json.RawMessage `json:"config"`
		Raw       string          `json:"raw"`
		Overwrite bool            `json:"overwrite"`
		Enabled   *bool           `json:"enabled"`
	}
	if err := decode(r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	payload := body.JSON
	if len(payload) == 0 {
		payload = body.Config
	}
	if len(payload) == 0 && strings.TrimSpace(body.Raw) != "" {
		payload = json.RawMessage(body.Raw)
	}
	if len(payload) == 0 {
		writeErr(w, 400, "缺少要导入的 JSON（json / config / raw 任一字段）")
		return
	}
	servers, err := extractMCPServers(payload)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	existing, err := pg.ListMCP()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	byName := map[string]*db.MCPServer{}
	for _, m := range existing {
		byName[strings.ToLower(m.Name)] = m
	}
	names := make([]string, 0, len(servers))
	for name := range servers {
		names = append(names, name)
	}
	sort.Strings(names)

	result := mcpImportResult{Imported: []map[string]any{}, Skipped: []map[string]any{}}
	for _, name := range names {
		srv, convErr := mcpServerFromImport(name, servers[name], enabled)
		if convErr != nil {
			result.Skipped = append(result.Skipped, map[string]any{"name": name, "reason": convErr.Error()})
			continue
		}
		if old, ok := byName[strings.ToLower(srv.Name)]; ok {
			if !body.Overwrite {
				result.Skipped = append(result.Skipped, map[string]any{"name": name, "reason": "同名 MCP 已存在（勾选覆盖可替换）"})
				continue
			}
			srv.ID = old.ID
		}
		id, saveErr := pg.SaveMCP(srv)
		if saveErr != nil {
			result.Skipped = append(result.Skipped, map[string]any{"name": name, "reason": saveErr.Error()})
			continue
		}
		result.Imported = append(result.Imported, map[string]any{
			"id": id, "name": srv.Name, "transport": srv.Transport,
		})
	}
	writeJSON(w, 200, map[string]any{
		"imported": result.Imported,
		"skipped":  result.Skipped,
		"total":    len(names),
	})
}

// pgSetMCPEnabled 只改启用位，不动配置——避免整对象回写时把 args/env 覆盖成空。
func (s *Server) pgSetMCPEnabled(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, _ := pathInt(r, "id")
	var body struct {
		Enabled *bool `json:"enabled"`
	}
	if err := decode(r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if body.Enabled == nil {
		writeErr(w, 400, "缺少 enabled 字段")
		return
	}
	if err := pg.SetMCPEnabled(id, *body.Enabled); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"id": id, "enabled": *body.Enabled})
}

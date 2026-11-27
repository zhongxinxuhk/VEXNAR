// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestMarketAndPluginAPI 走真实 mux 验证插件页依赖的接口：
// 市场源列表 / 市场条目（含内置兜底）、MCP 导入与启停、技能启停。
// 需要 PostgreSQL（不可用时跳过）。
func TestMarketAndPluginAPI(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("database unavailable (%v) — skipping plugin API test", err)
	}
	if m.pg == nil {
		t.Skip("postgres unavailable — skipping plugin API test")
	}
	defer m.pg.Close()

	skillDir := t.TempDir()
	s := New(context.Background(), m, skillDir, skillDir, skillDir)
	h := s.Handler()
	tok, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatalf("sign jwt: %v", err)
	}
	do := func(method, path string, body any) (int, map[string]any) {
		var req = httptest.NewRequest(method, path, nil)
		if body != nil {
			b, _ := json.Marshal(body)
			req = httptest.NewRequest(method, path, bytes.NewReader(b))
		}
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out
	}

	// 先清掉可能残留的测试数据（同名前缀），保证断言可重复。
	_, existing := do("GET", "/api/mcp", nil)
	if servers, ok := existing["servers"].([]any); ok {
		for _, raw := range servers {
			srv, _ := raw.(map[string]any)
			name, _ := srv["name"].(string)
			if !strings.HasPrefix(name, "vexnar-test-") {
				continue
			}
			id, _ := srv["id"].(float64)
			do("DELETE", "/api/mcp/"+itoa(int64(id)), nil)
		}
	}

	// 市场源：官方源必须存在（schema 里 seed 的那条）
	code, out := do("GET", "/api/market/sources", nil)
	if code != 200 {
		t.Fatalf("GET market sources: %d (%v)", code, out)
	}
	sources, _ := out["sources"].([]any)
	official := false
	for _, raw := range sources {
		if src, _ := raw.(map[string]any); src["official"] == true {
			official = true
		}
	}
	if !official {
		t.Error("官方市场源缺失（schema seed 未生效）")
	}

	// 市场条目：即使断网也必须返回内置目录
	code, out = do("GET", "/api/market/items?kind=mcp", nil)
	if code != 200 {
		t.Fatalf("GET market items: %d (%v)", code, out)
	}
	items, _ := out["items"].([]any)
	if len(items) == 0 {
		t.Fatalf("市场条目为空（内置兜底未生效）: %v", out)
	}
	for _, raw := range items {
		it, _ := raw.(map[string]any)
		if it["kind"] != "mcp" || it["name"] == nil {
			t.Fatalf("条目格式不正确: %v", it)
		}
		if it["command"] == nil && it["url"] == nil {
			t.Fatalf("MCP 条目缺少启动方式: %v", it)
		}
	}
	_, skillsOut := do("GET", "/api/market/items?kind=skills", nil)
	if sItems, _ := skillsOut["items"].([]any); len(sItems) == 0 {
		t.Errorf("技能市场为空: %v", skillsOut)
	}

	// MCP 导入（CC Switch / Claude Desktop 格式）→ 列表可见 → 停用 → 删除
	importName := fmt.Sprintf("vexnar-test-%d", time.Now().UnixNano())
	code, out = do("POST", "/api/mcp/import", map[string]any{
		"json": map[string]any{"mcpServers": map[string]any{
			importName: map[string]any{"command": "npx", "args": []string{"-y", "demo"}},
		}},
	})
	if code != 200 {
		t.Fatalf("import mcp: %d (%v)", code, out)
	}
	if imported, _ := out["imported"].([]any); len(imported) != 1 {
		t.Fatalf("导入结果不正确: %v", out)
	}
	var importID float64
	code, out = do("GET", "/api/mcp", nil)
	if code != 200 {
		t.Fatalf("list mcp: %d", code)
	}
	for _, raw := range out["servers"].([]any) {
		srv, _ := raw.(map[string]any)
		if srv["name"] == importName {
			importID, _ = srv["id"].(float64)
		}
	}
	if importID == 0 {
		t.Fatalf("导入的 MCP 未出现在列表: %v", out)
	}
	t.Cleanup(func() {
		if code, out := do("DELETE", "/api/mcp/"+itoa(int64(importID)), nil); code != 200 {
			t.Logf("清理测试 MCP 失败: %d (%v)", code, out)
		}
	})

	code, out = do("PUT", "/api/mcp/"+itoa(int64(importID))+"/enabled", map[string]any{"enabled": false})
	if code != 200 || out["enabled"] != false {
		t.Fatalf("MCP 停用失败: %d (%v)", code, out)
	}
	// 重复导入应被跳过而非报错
	code, out = do("POST", "/api/mcp/import", map[string]any{
		"json": map[string]any{"mcpServers": map[string]any{
			importName: map[string]any{"command": "npx"},
		}},
	})
	if code != 200 {
		t.Fatalf("重复导入应返回 200: %d (%v)", code, out)
	}
	if skipped, _ := out["skipped"].([]any); len(skipped) != 1 {
		t.Fatalf("重复导入应跳过 1 条: %v", out)
	}

	// 技能：创建 → 列表（enabled=true）→ 停用 → 列表（enabled=false）→ 启用 → 删除
	skillName := "vexnar-test-" + fmt.Sprintf("%d", time.Now().UnixNano()%1e6)
	code, out = do("POST", "/api/skills", map[string]any{
		"name": skillName, "description": "测试用技能", "instructions": "1. do nothing\n",
	})
	if code != 201 && code != 409 {
		t.Fatalf("create skill: %d (%v)", code, out)
	}
	t.Cleanup(func() { do("DELETE", "/api/skills/"+skillName, nil) })

	skillEnabled := func() bool {
		_, body := do("GET", "/api/skills", nil)
		for _, raw := range body["skills"].([]any) {
			sk, _ := raw.(map[string]any)
			if sk["name"] == skillName {
				on, _ := sk["enabled"].(bool)
				return on
			}
		}
		t.Fatalf("技能 %s 未出现在列表", skillName)
		return false
	}
	if !skillEnabled() {
		t.Fatal("新建技能应为启用状态")
	}
	if code, out = do("PUT", "/api/skills/"+skillName+"/enabled", map[string]any{"enabled": false}); code != 200 {
		t.Fatalf("停用技能失败: %d (%v)", code, out)
	}
	if _, err := os.Stat(filepath.Join(skillDir, skillName, "SKILL.md")); !os.IsNotExist(err) {
		t.Error("停用后 SKILL.md 应被改名")
	}
	if _, err := os.Stat(filepath.Join(skillDir, skillName, "SKILL.md.disabled")); err != nil {
		t.Errorf("停用后应存在 SKILL.md.disabled: %v", err)
	}
	if skillEnabled() {
		t.Error("停用后列表仍显示 enabled=true")
	}
	if code, out = do("PUT", "/api/skills/"+skillName+"/enabled", map[string]any{"enabled": true}); code != 200 {
		t.Fatalf("启用技能失败: %d (%v)", code, out)
	}
	if !skillEnabled() {
		t.Error("重新启用后列表仍显示 enabled=false")
	}

	// 非法市场源必须被拒绝，且不能落库
	code, _ = do("POST", "/api/market/sources", map[string]any{"link": "https://gitlab.com/a/b", "kind": "mcp"})
	if code != 400 {
		t.Errorf("非 GitHub 链接应 400，实际 %d", code)
	}
	if code, _ = do("POST", "/api/market/sources", map[string]any{"link": "../../etc", "kind": "mcp"}); code != 400 {
		t.Errorf("非法仓库名应 400，实际 %d", code)
	}

	// 自定义市场源：添加 → 删除（用本地不存在的仓库验证"保存成功但同步失败"也能落地）
	code, out = do("POST", "/api/market/sources", map[string]any{
		"link": "https://github.com/zhongxinxuhk/vexnar-does-not-exist-" + strings.ToLower(skillName),
		"kind": "skills",
		"name": "测试源",
	})
	if code != 201 {
		t.Fatalf("添加市场源失败: %d (%v)", code, out)
	}
	srcID, _ := out["id"].(float64)
	if srcID == 0 {
		t.Fatalf("市场源 id 缺失: %v", out)
	}
	if _, hasWarn := out["warning"]; !hasWarn {
		t.Errorf("不存在的仓库应返回 warning: %v", out)
	}
	if code, out = do("DELETE", "/api/market/sources/"+itoa(int64(srcID)), nil); code != 200 {
		t.Fatalf("删除市场源失败: %d (%v)", code, out)
	}
}

func itoa(v int64) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/zhongxinxuhk/vexnar/db"
)

func TestParseMarketLink(t *testing.T) {
	cases := []struct {
		link, ref, path         string
		repo, wantRef, wantPath string
		wantErr                 bool
	}{
		{link: "anthropics/skills", repo: "anthropics/skills", wantRef: "", wantPath: ""},
		{link: "https://github.com/anthropics/skills", repo: "anthropics/skills"},
		{link: "https://github.com/anthropics/skills/", repo: "anthropics/skills"},
		{link: "https://github.com/anthropics/skills/tree/main/skills/pdf", repo: "anthropics/skills", wantRef: "main", wantPath: "skills/pdf"},
		{link: "https://github.com/zhongxinxuhk/VEXNAR/blob/main/market/market.json", repo: "zhongxinxuhk/VEXNAR", wantRef: "main", wantPath: "market"},
		{link: "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md", repo: "anthropics/skills", wantRef: "main", wantPath: "skills/pdf"},
		{link: "https://raw.githubusercontent.com/zhongxinxuhk/VEXNAR/main/market/market.json", repo: "zhongxinxuhk/VEXNAR", wantRef: "main", wantPath: "market"},
		// 显式 ref/path 只在链接没给时生效
		{link: "https://github.com/a/b", ref: "dev", path: "sub/dir", repo: "a/b", wantRef: "dev", wantPath: "sub/dir"},
		{link: "https://github.com/a/b/tree/main/x", ref: "dev", repo: "a/b", wantRef: "main", wantPath: "x"},
		{link: "https://gitlab.com/a/b", wantErr: true},
		{link: "https://github.com/onlyowner", wantErr: true},
		{link: "https://github.com/a/b/tree/main/../etc", wantErr: true},
		{link: "", wantErr: true},
	}
	for _, c := range cases {
		repo, ref, p, err := parseMarketLink(c.link, c.ref, c.path)
		if c.wantErr {
			if err == nil {
				t.Errorf("%q: 期望报错，实际得到 %s %s %s", c.link, repo, ref, p)
			}
			continue
		}
		if err != nil {
			t.Errorf("%q: 意外错误 %v", c.link, err)
			continue
		}
		if repo != c.repo || ref != c.wantRef || p != c.wantPath {
			t.Errorf("%q → (%s,%s,%s)，期望 (%s,%s,%s)", c.link, repo, ref, p, c.repo, c.wantRef, c.wantPath)
		}
	}
}

func TestParseMarketIndex(t *testing.T) {
	raw := `{
	  "schema": "vexnar.market/v1",
	  "mcp": [
	    {"name":"fs","transport":"stdio","command":"npx","args":["-y","x"],"tags":["文件"]},
	    {"name":"bad","transport":"stdio"},
	    {"name":"remote","url":"https://example.com/mcp"}
	  ],
	  "skills": [
	    {"name":"pdf","repo":"anthropics/skills","path":"skills/pdf","description":"PDF 工具"},
	    {"name":"nopath","repo":"anthropics/skills"}
	  ]
	}`
	items, err := parseMarketIndex([]byte(raw), "zhongxinxuhk/VEXNAR")
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("期望 3 条（丢掉了缺 command 的 stdio 与缺 path 的技能），实际 %d: %+v", len(items), items)
	}
	if items[0].Kind != "mcp" || items[0].ID == "" {
		t.Errorf("MCP 条目缺少 kind/id: %+v", items[0])
	}
	if items[2].Kind != "skills" || items[2].Repo != "anthropics/skills" {
		t.Errorf("技能条目未归一化: %+v", items[2])
	}

	// 裸数组也要能读
	if _, err := parseMarketIndex([]byte(`[{"kind":"mcp","name":"x","command":"npx"}]`), ""); err != nil {
		t.Errorf("裸数组解析失败: %v", err)
	}
	if _, err := parseMarketIndex([]byte(`{}`), ""); err == nil {
		t.Error("空索引应报错")
	}
}

func TestParseMCPConfig(t *testing.T) {
	raw := `{"mcpServers":{
	  "shell":{"command":"npx","args":["-y","@scope/pkg"]},
	  "remote":{"type":"streamable-http","url":"https://example.com/mcp","headers":{"Authorization":"Bearer t"}},
	  "legacy":{"type":"sse","url":"https://example.com/sse"}
	}}`
	items, err := parseMCPConfig([]byte(raw))
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("期望 3 条，实际 %d", len(items))
	}
	byName := map[string]marketItem{}
	for _, it := range items {
		byName[it.Name] = it
	}
	if byName["shell"].Transport != "stdio" {
		t.Errorf("stdio 推断错误: %+v", byName["shell"])
	}
	if byName["remote"].Transport != "http" {
		t.Errorf("streamable-http 未归一化成 http: %+v", byName["remote"])
	}
	if byName["remote"].Env["Authorization"] != "Bearer t" {
		t.Errorf("headers 未并入 env: %+v", byName["remote"])
	}
	if byName["legacy"].Transport != "sse" {
		t.Errorf("sse 保留失败: %+v", byName["legacy"])
	}
}

func TestParseSkillFrontmatter(t *testing.T) {
	md := []byte("---\nname: pdf\ndescription: >\n  Use this skill for PDF files\n  and forms.\nlicense: MIT\n---\n# body\n")
	name, desc := parseSkillFrontmatter(md)
	if name != "pdf" {
		t.Errorf("name=%q", name)
	}
	if !strings.Contains(desc, "PDF files") || !strings.Contains(desc, "and forms") {
		t.Errorf("块标量 description 解析失败: %q", desc)
	}
	q := []byte("---\nname: \"中文技能\"\ndescription: \"带引号的描述\"\n---\n")
	name, desc = parseSkillFrontmatter(q)
	if name != "中文技能" || desc != "带引号的描述" {
		t.Errorf("引号处理失败: %q %q", name, desc)
	}
	n, d, license, compat, mcps := skillMetaFromFile([]byte("---\nname: a\ndescription: b\nlicense: MIT\ncompatibility: linux\nmcps: [browser, nmap]\n---\n"))
	if n != "a" || d != "b" || license != "MIT" || compat != "linux" || strings.Join(mcps, ",") != "browser,nmap" {
		t.Errorf("元数据解析失败: %q %q %q %q %v", n, d, license, compat, mcps)
	}
}

func TestMCPImportConversion(t *testing.T) {
	raw := []byte(`{"mcpServers":{
	  "shell":{"command":"npx","args":["-y","pkg",1]},
	  "remote":{"url":"https://x/mcp","headers":{"X-Key":"k"},"env":{"A":"1"}},
	  "bad":{"type":"stdio"}
	}}`)
	servers, err := extractMCPServers(raw)
	if err != nil {
		t.Fatalf("提取 mcpServers 失败: %v", err)
	}
	if len(servers) != 3 {
		t.Fatalf("期望 3 个服务器，实际 %d", len(servers))
	}
	srv, err := mcpServerFromImport("shell", servers["shell"], true)
	if err != nil || srv.Transport != "stdio" || srv.Command != "npx" {
		t.Fatalf("stdio 转换失败: %+v %v", srv, err)
	}
	var args []string
	_ = json.Unmarshal(srv.Args, &args)
	if len(args) != 3 || args[2] != "1" {
		t.Errorf("args 规范化失败: %v", args)
	}
	remote, err := mcpServerFromImport("remote", servers["remote"], true)
	if err != nil || remote.Transport != "http" {
		t.Fatalf("http 转换失败: %+v %v", remote, err)
	}
	var env map[string]string
	_ = json.Unmarshal(remote.Env, &env)
	if env["X-Key"] != "k" || env["A"] != "1" {
		t.Errorf("headers 未并入 env: %v", env)
	}
	if _, err := mcpServerFromImport("bad", servers["bad"], true); err == nil {
		t.Error("缺 command 的 stdio 应报错")
	}

	// 按应用分组（CC Switch 导出）与直接映射都要能认
	grouped := []byte(`{"claude":{"mcpServers":{"a":{"command":"x"}}}}`)
	if m, err := extractMCPServers(grouped); err != nil || len(m) != 1 {
		t.Errorf("分组配置提取失败: %v %v", m, err)
	}
	direct := []byte(`{"a":{"command":"x"},"b":{"url":"https://y"}}`)
	if m, err := extractMCPServers(direct); err != nil || len(m) != 2 {
		t.Errorf("直接映射提取失败: %v %v", m, err)
	}
}

// makeTarGz 构造一个 GitHub 风格的 tar.gz（顶层目录 + 一层子目录）。
func makeTarGz(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	names := make([]string, 0, len(entries))
	for name := range entries {
		names = append(names, name)
	}
	sortStrings(names)
	for _, name := range names {
		body := entries[name]
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(body)), Typeflag: tar.TypeReg}); err != nil {
			t.Fatalf("写 tar 头失败: %v", err)
		}
		if _, err := tw.Write([]byte(body)); err != nil {
			t.Fatalf("写 tar 内容失败: %v", err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("关闭 tar 失败: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("关闭 gzip 失败: %v", err)
	}
	return buf.Bytes()
}

func TestExtractTarGz(t *testing.T) {
	archive := makeTarGz(t, map[string]string{
		"repo-main/skills/demo/SKILL.md":       "---\nname: demo\ndescription: d\n---\n",
		"repo-main/skills/demo/scripts/run.sh": "echo hi",
		"repo-main/__MACOSX/junk":              "x",
	})
	dst := t.TempDir()
	files, total, err := extractTarGz(bytes.NewReader(archive), dst)
	if err != nil {
		t.Fatalf("解包失败: %v", err)
	}
	if files != 2 || total == 0 {
		t.Errorf("期望 2 个文件，实际 %d (%d bytes)", files, total)
	}
	if _, err := os.Stat(filepath.Join(dst, "repo-main", "skills", "demo", "SKILL.md")); err != nil {
		t.Errorf("SKILL.md 未解出: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dst, "repo-main", "__MACOSX")); !os.IsNotExist(err) {
		t.Error("__MACOSX 应被跳过")
	}

	roots, err := findSkillRoots(dst)
	if err != nil || len(roots) != 1 || !strings.HasSuffix(roots[0], "skills/demo") {
		t.Fatalf("技能根定位失败: %v %v", roots, err)
	}

	// 路径穿越必须被拒绝
	bad := makeTarGz(t, map[string]string{"repo-main/../../evil.txt": "x"})
	if _, _, err := extractTarGz(bytes.NewReader(bad), t.TempDir()); err == nil {
		t.Error("路径穿越应被拒绝")
	}
}

func TestBuiltinMarketCatalog(t *testing.T) {
	items, err := parseMarketIndex(builtinMarketJSONRaw(), "zhongxinxuhk/VEXNAR")
	if err != nil {
		t.Fatalf("内置目录解析失败: %v", err)
	}
	mcp, skills := 0, 0
	for _, it := range items {
		switch it.Kind {
		case "mcp":
			mcp++
			if it.Command == "" && it.URL == "" {
				t.Errorf("MCP 条目缺少启动方式: %+v", it)
			}
		case "skills":
			skills++
			if it.Repo == "" || it.Path == "" {
				t.Errorf("技能条目缺少仓库/路径: %+v", it)
			}
		}
	}
	if mcp < 10 || skills < 5 {
		t.Errorf("内置目录条目过少：mcp=%d skills=%d", mcp, skills)
	}
	if got := builtinMarketItems("mcp"); len(got) != mcp || !got[0].Builtin {
		t.Errorf("builtinMarketItems 不匹配: %d", len(got))
	}
}

// TestOfficialMarketFile 校验仓库里的 market/market.json（官方市场链接）始终可解析。
func TestOfficialMarketFile(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "market", "market.json"))
	if err != nil {
		t.Fatalf("读取 market/market.json 失败: %v", err)
	}
	var doc struct {
		Schema string `json:"schema"`
		MCP    []any  `json:"mcp"`
		Skills []any  `json:"skills"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("market.json 不是合法 JSON: %v", err)
	}
	if doc.Schema != marketSchema {
		t.Errorf("schema=%q，期望 %q", doc.Schema, marketSchema)
	}
	items, err := parseMarketIndex(raw, "zhongxinxuhk/VEXNAR")
	if err != nil {
		t.Fatalf("官方市场解析失败: %v", err)
	}
	if len(items) != len(doc.MCP)+len(doc.Skills) {
		t.Errorf("有条目被丢弃：解析出 %d，文件里 %d", len(items), len(doc.MCP)+len(doc.Skills))
	}
	for _, it := range items {
		if it.Kind == "skills" && (it.Repo == "" || it.Path == "") {
			t.Errorf("技能条目缺少仓库/路径: %+v", it)
		}
	}
}

// TestDiscoverSkillsFromRepoNetwork 走真实 GitHub 验证"贴个仓库链接就能当技能市场"。
// 默认跳过（离线环境/CI 无网时不应失败）：VEXNAR_TEST_NETWORK=1 go test ./server -run Discover
func TestDiscoverSkillsFromRepoNetwork(t *testing.T) {
	if os.Getenv("VEXNAR_TEST_NETWORK") != "1" {
		t.Skip("设置 VEXNAR_TEST_NETWORK=1 才跑网络测试")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	s := &Server{}
	items, err := s.discoverSkillsFromRepo(ctx, &db.MarketSource{Repo: "anthropics/skills", Kind: "skills", Ref: "main"}, "main")
	if err != nil {
		t.Fatalf("自动发现失败: %v", err)
	}
	if len(items) < 5 {
		t.Fatalf("发现条目过少: %d", len(items))
	}
	found := false
	for _, it := range items {
		if it.Name == "pdf" {
			found = true
			if it.Path != "skills/pdf" {
				t.Errorf("pdf 路径错误: %q", it.Path)
			}
			if it.Description == "" {
				t.Error("pdf 描述为空（frontmatter 未读到）")
			}
		}
	}
	if !found {
		t.Errorf("未发现 pdf 技能: %+v", items)
	}
}

// TestInstallSkillFromGitHubNetwork 真实从 GitHub 装一个技能，验证 tar 下载、
// 目录定位、原子安装与来源记录。默认跳过。
func TestInstallSkillFromGitHubNetwork(t *testing.T) {
	if os.Getenv("VEXNAR_TEST_NETWORK") != "1" {
		t.Skip("设置 VEXNAR_TEST_NETWORK=1 才跑网络测试")
	}
	dir := t.TempDir()
	s := &Server{skillDir: dir}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	name, files, prov, err := s.installSkillFromGitHub(ctx, "anthropics/skills", "main", "skills/pdf", false)
	if err != nil {
		t.Fatalf("安装失败: %v", err)
	}
	if name != "pdf" || files < 2 {
		t.Fatalf("安装结果异常: name=%q files=%d", name, files)
	}
	if prov == nil || prov.Repo != "anthropics/skills" || prov.Path != "skills/pdf" {
		t.Errorf("来源记录不正确: %+v", prov)
	}
	if _, err := os.Stat(filepath.Join(dir, "pdf", "SKILL.md")); err != nil {
		t.Errorf("SKILL.md 未落地: %v", err)
	}
	if p := readSkillProvenance(filepath.Join(dir, "pdf")); p == nil {
		t.Error("provenance 未写入")
	}
	// 已存在且未勾选覆盖 → 明确报错
	if _, _, _, err := s.installSkillFromGitHub(ctx, "anthropics/skills", "main", "skills/pdf", false); err == nil {
		t.Error("重复安装未勾选覆盖时应报错")
	}
	// 停用 / 启用
	if _, err := s.setSkillEnabled("pdf", false); err != nil {
		t.Fatalf("停用失败: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "pdf", "SKILL.md.disabled")); err != nil {
		t.Errorf("停用后应存在 SKILL.md.disabled: %v", err)
	}
	entries, err := s.scanSkillEntries()
	if err != nil || len(entries) != 1 || entries[0].Enabled {
		t.Fatalf("列表未反映停用状态: %+v %v", entries, err)
	}
	if _, err := s.setSkillEnabled("pdf", true); err != nil {
		t.Fatalf("启用失败: %v", err)
	}
	if entries, _ = s.scanSkillEntries(); len(entries) != 1 || !entries[0].Enabled {
		t.Error("列表未反映启用状态")
	}
}

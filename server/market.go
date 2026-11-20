// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/zhongxinxuhk/vexnar/db"
)

// 插件市场：一个"市场"就是一串 GitHub 仓库（可带子目录）。服务端从仓库读取
// market.json（本项目的自有格式，可同时描述 MCP 与技能）或 mcp.json（Claude
// Desktop / CC Switch 的 mcpServers 格式）；技能类市场源即使没有索引文件，
// 也会按仓库树里的 SKILL.md 自动发现条目——这样"贴一个 GitHub 链接就能当市场"。
const (
	marketSchemaFile = "market.json"
	marketMCPFile    = "mcp.json"
	marketSchema     = "vexnar.market/v1"

	marketCacheTTL    = 10 * time.Minute
	marketSyncBudget  = 22 * time.Second
	marketHTTPBudget  = 12 * time.Second
	marketMaxItems    = 200
	marketMaxFile     = 2 << 20 // 索引/描述文件的读取上限
	marketMaxDiscover = 80      // 技能自动发现的条目上限
)

// marketHTTP 是市场抓取专用的客户端：默认 transport 会读取 HTTP(S)_PROXY 环境变量，
// 与 LLM 出站的代理习惯保持一致（内网/受限网络下也能同步市场）。
var marketHTTP = &http.Client{Timeout: marketHTTPBudget}

// marketItem 是市场里的一条可安装条目。MCP 条目携带完整的服务器配置，
// 技能条目携带 {repo, ref, path} —— 安装时按该路径从 GitHub 拉取技能目录。
type marketItem struct {
	ID          string            `json:"id"`
	Kind        string            `json:"kind"`
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Tags        []string          `json:"tags,omitempty"`
	Homepage    string            `json:"homepage,omitempty"`
	Author      string            `json:"author,omitempty"`
	Repo        string            `json:"repo,omitempty"`
	Ref         string            `json:"ref,omitempty"`
	Path        string            `json:"path,omitempty"`
	Transport   string            `json:"transport,omitempty"`
	Command     string            `json:"command,omitempty"`
	Args        []string          `json:"args,omitempty"`
	URL         string            `json:"url,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	// 服务端补充字段，索引文件里不写。
	SourceID   int64  `json:"source_id"`
	SourceName string `json:"source_name,omitempty"`
	SourceRepo string `json:"source_repo,omitempty"`
	Official   bool   `json:"official,omitempty"`
	Builtin    bool   `json:"builtin,omitempty"`
}

// ---------- 链接解析 ----------

var marketRepoRe = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_.-]*/[A-Za-z0-9_][A-Za-z0-9_.-]*$`)

// validMarketRepo 在正则之外再挡掉 "." / ".." 这类看着像目录名的段。
func validMarketRepo(repo string) bool {
	if !marketRepoRe.MatchString(repo) || strings.Contains(repo, "..") {
		return false
	}
	for _, seg := range strings.Split(repo, "/") {
		if seg == "." || seg == ".." {
			return false
		}
	}
	return true
}

// parseMarketLink 把用户粘贴的各种 GitHub 链接归一化成 {repo, ref, path}：
//
//	owner/repo
//	https://github.com/owner/repo
//	https://github.com/owner/repo/tree/<ref>/<path>
//	https://github.com/owner/repo/blob/<ref>/<path>/market.json
//	https://raw.githubusercontent.com/owner/repo/<ref>/<path>
//
// 显式传入的 ref/path 只在链接本身没有给出时生效，避免"填了链接又被表单覆盖"。
func parseMarketLink(raw, ref, sub string) (repo, outRef, outPath string, err error) {
	raw = strings.TrimSpace(raw)
	ref = strings.TrimSpace(ref)
	sub = strings.Trim(strings.TrimSpace(sub), "/")
	if raw == "" {
		return "", "", "", errors.New("请填写 GitHub 仓库或链接")
	}
	if !strings.Contains(raw, "://") {
		// owner/repo，可带 /path（不常见，但容忍）
		parts := strings.Split(strings.Trim(raw, "/"), "/")
		if len(parts) >= 2 && validMarketRepo(parts[0]+"/"+parts[1]) {
			repo = parts[0] + "/" + parts[1]
			if len(parts) > 2 && sub == "" {
				sub = strings.Join(parts[2:], "/")
			}
			return repo, ref, normalizeMarketPath(sub), nil
		}
		return "", "", "", fmt.Errorf("无法识别的仓库名：%s（应为 owner/repo 或 GitHub 链接）", raw)
	}

	u, perr := url.Parse(raw)
	if perr != nil {
		return "", "", "", fmt.Errorf("链接无法解析：%v", perr)
	}
	segs := strings.Split(strings.Trim(u.Path, "/"), "/")
	keep := func(i int) string {
		if i < len(segs) {
			return segs[i]
		}
		return ""
	}
	switch strings.ToLower(u.Host) {
	case "github.com", "www.github.com":
		repo = keep(0) + "/" + keep(1)
		kind := keep(2)
		if kind == "tree" || kind == "blob" {
			// 链接里的分支/目录更具体，优先于表单值
			if r := keep(3); r != "" {
				ref = r
			}
			rest := strings.Join(segs[min(4, len(segs)):], "/")
			if rest != "" {
				if kind == "blob" {
					// 指向具体文件时取它所在目录
					rest = path.Dir(rest)
					if rest == "." {
						rest = ""
					}
				}
				sub = rest
			}
		}
	case "raw.githubusercontent.com":
		repo = keep(0) + "/" + keep(1)
		if r := keep(2); r != "" {
			ref = r
		}
		rest := strings.Join(segs[min(3, len(segs)):], "/")
		if rest != "" {
			// 贴的是文件（market.json、SKILL.md 等）时，用它所在目录
			rest = path.Dir(rest)
			if rest == "." {
				rest = ""
			}
			sub = rest
		}
	case "codeload.github.com":
		repo = keep(0) + "/" + keep(1)
		if ref == "" && keep(2) != "" && keep(2) != "tar.gz" && keep(2) != "zip" {
			ref = keep(2)
		}
	default:
		return "", "", "", fmt.Errorf("只支持 GitHub 链接：%s", u.Host)
	}
	if !validMarketRepo(repo) {
		return "", "", "", fmt.Errorf("链接里没有合法的 owner/repo：%s", raw)
	}
	outPath, bad := marketSafePath(sub)
	if bad != "" {
		return "", "", "", errors.New("目录不合法：" + bad)
	}
	if ref != "" && !marketSafeRef(ref) {
		return "", "", "", fmt.Errorf("分支/标签不合法：%s", ref)
	}
	return repo, ref, outPath, nil
}

// marketSafePath 校验仓库内相对目录：允许中文目录名，拒绝路径穿越与控制字符。
func marketSafePath(p string) (string, string) {
	p = strings.Trim(strings.TrimSpace(p), "/")
	if p == "" {
		return "", ""
	}
	if strings.Contains(p, "..") {
		return "", "不能包含 .."
	}
	if _, msg := skillRelPath(p); msg != "" {
		return "", msg
	}
	return p, ""
}

func normalizeMarketPath(p string) string {
	out, _ := marketSafePath(p)
	return out
}

// marketSafeRef 限制分支/标签字符集，避免拼进 URL 时改变路径语义。
func marketSafeRef(ref string) bool {
	if ref == "" || len(ref) > 120 {
		return false
	}
	for _, r := range ref {
		if r < 0x21 || r > 0x7e || strings.ContainsRune(`/\?#%`, r) {
			return false
		}
	}
	return true
}

// ---------- 抓取 ----------

func marketToken() string {
	for _, k := range []string{"VEXNAR_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

// marketGet 发起一次 GET，返回 body（上限 marketMaxFile）与状态码。
func marketGet(ctx context.Context, rawURL string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json, text/plain;q=0.9")
	req.Header.Set("User-Agent", "vexnar-market/1")
	if tok := marketToken(); tok != "" && strings.Contains(rawURL, "github") {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := marketHTTP.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, marketMaxFile))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}

func marketRawURL(repo, ref, p string) string {
	base := "https://raw.githubusercontent.com/" + repo + "/" + url.PathEscape(ref)
	if p != "" {
		base += "/" + escapeMarketPath(p)
	}
	return base
}

// escapeMarketPath 逐段转义，保留 '/' 作为分隔符。
func escapeMarketPath(p string) string {
	segs := strings.Split(p, "/")
	for i, s := range segs {
		segs[i] = url.PathEscape(s)
	}
	return strings.Join(segs, "/")
}

// fetchMarketSource 读取一个市场源的全部条目。顺序：
//  1. market.json（自有格式，可含 MCP + 技能）
//  2. mcp.json（Claude/CC Switch 兼容的 mcpServers）
//  3. 技能类源按 SKILL.md 自动发现
func (s *Server) fetchMarketSource(ctx context.Context, src *db.MarketSource) ([]marketItem, error) {
	ref := src.Ref
	if ref == "" {
		ref = "main"
	}
	wantSkills := src.Kind == "skills" || src.Kind == "all"
	wantMCP := src.Kind == "mcp" || src.Kind == "all"

	dir := strings.Trim(src.Path, "/")
	if body, code, err := marketGet(ctx, marketRawURL(src.Repo, ref, path.Join(dir, marketSchemaFile))); err == nil && code == 200 {
		items, perr := parseMarketIndex(body, src.Repo)
		if perr != nil {
			return nil, perr
		}
		return items, nil
	}
	if wantMCP {
		for _, name := range []string{marketMCPFile, ".mcp.json"} {
			body, code, err := marketGet(ctx, marketRawURL(src.Repo, ref, path.Join(dir, name)))
			if err != nil || code != 200 {
				continue
			}
			items, perr := parseMCPConfig(body)
			if perr != nil {
				return nil, perr
			}
			return items, nil
		}
	}
	discoverErr := error(nil)
	if wantSkills {
		items, err := s.discoverSkillsFromRepo(ctx, src, ref)
		if err == nil && len(items) > 0 {
			return items, nil
		}
		discoverErr = err
	}
	where := src.Repo
	if dir != "" {
		where += "/" + dir
	}
	if !wantSkills {
		return nil, fmt.Errorf("在 %s 里没有找到 market.json 或 mcp.json（确认源指向的是仓库内实际存在的目录）", where)
	}
	if discoverErr != nil {
		return nil, fmt.Errorf("在 %s 里没有找到 market.json，技能自动发现也失败了：%v", where, discoverErr)
	}
	return nil, fmt.Errorf("在 %s 里没有找到 market.json 或 mcp.json，也没有可自动发现的 SKILL.md", where)
}

// parseMarketIndex 解析自有市场索引。允许三种写法：
//
//	{"mcp":[...],"skills":[...]}   ← 推荐
//	{"items":[...]}                ← 单数组，按条目自带 kind
//	[...]                          ← 裸数组
func parseMarketIndex(raw []byte, repo string) ([]marketItem, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return nil, errors.New("market.json 为空")
	}
	var doc struct {
		Schema string       `json:"schema"`
		Name   string       `json:"name"`
		MCP    []marketItem `json:"mcp"`
		Skills []marketItem `json:"skills"`
		Items  []marketItem `json:"items"`
	}
	if strings.HasPrefix(trimmed, "[") {
		var arr []marketItem
		if err := json.Unmarshal(raw, &arr); err != nil {
			return nil, fmt.Errorf("market.json 解析失败：%v", err)
		}
		doc.Items = arr
	} else if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("market.json 解析失败：%v", err)
	}
	out := make([]marketItem, 0, len(doc.MCP)+len(doc.Skills)+len(doc.Items))
	for _, it := range doc.MCP {
		it.Kind = "mcp"
		out = append(out, it)
	}
	for _, it := range doc.Skills {
		it.Kind = "skills"
		if it.Repo == "" {
			it.Repo = repo
		}
		out = append(out, it)
	}
	out = append(out, doc.Items...)
	return normalizeMarketItems(out, repo)
}

// parseMCPConfig 解析 Claude Desktop / CC Switch 的 mcpServers 配置。
// env 同时承载 stdio 环境变量与 HTTP 头（见 mcphttp：env 即 header）。
func parseMCPConfig(raw []byte) ([]marketItem, error) {
	var doc struct {
		MCPServers map[string]struct {
			Type     string            `json:"type"`
			Command  string            `json:"command"`
			Args     []string          `json:"args"`
			Env      map[string]string `json:"env"`
			URL      string            `json:"url"`
			Headers  map[string]string `json:"headers"`
			Disabled bool              `json:"disabled"`
		} `json:"mcpServers"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("mcp.json 解析失败：%v", err)
	}
	if len(doc.MCPServers) == 0 {
		return nil, errors.New("mcp.json 里没有 mcpServers")
	}
	names := make([]string, 0, len(doc.MCPServers))
	for name := range doc.MCPServers {
		names = append(names, name)
	}
	sortStrings(names)
	out := make([]marketItem, 0, len(names))
	for _, name := range names {
		cfg := doc.MCPServers[name]
		it := marketItem{Kind: "mcp", Name: name, Transport: strings.ToLower(cfg.Type), Command: cfg.Command, Args: cfg.Args, URL: cfg.URL}
		if it.Transport == "" {
			if cfg.Command != "" {
				it.Transport = "stdio"
			} else if strings.HasSuffix(strings.ToLower(cfg.URL), "/sse") {
				it.Transport = "sse"
			} else {
				it.Transport = "http"
			}
		}
		if it.Transport == "streamable-http" || it.Transport == "streamablehttp" {
			it.Transport = "http"
		}
		env := map[string]string{}
		for k, v := range cfg.Env {
			env[k] = v
		}
		for k, v := range cfg.Headers {
			env[k] = v
		}
		if len(env) > 0 {
			it.Env = env
		}
		if cfg.Command != "" {
			it.Description = "stdio · " + cfg.Command + strings.Join(append([]string{""}, cfg.Args...), " ")
		} else {
			it.Description = it.Transport + " · " + cfg.URL
		}
		out = append(out, it)
	}
	return normalizeMarketItems(out, "")
}

// normalizeMarketItems 补全 id/name，剔掉缺字段的条目，并按名字去重。
func normalizeMarketItems(items []marketItem, repo string) ([]marketItem, error) {
	seen := map[string]bool{}
	out := make([]marketItem, 0, len(items))
	for _, it := range items {
		it.Name = strings.TrimSpace(it.Name)
		if it.Name == "" {
			continue
		}
		if it.Kind != "mcp" && it.Kind != "skills" {
			continue
		}
		if it.Kind == "mcp" {
			it.Transport = strings.ToLower(strings.TrimSpace(it.Transport))
			if it.Transport == "" && strings.TrimSpace(it.Command) == "" && strings.TrimSpace(it.URL) != "" {
				// 只给了 URL：默认按 Streamable HTTP 处理（SSE 端点保留 sse）
				if strings.HasSuffix(strings.ToLower(strings.TrimSpace(it.URL)), "/sse") {
					it.Transport = "sse"
				} else {
					it.Transport = "http"
				}
			}
			switch it.Transport {
			case "", "stdio":
				it.Transport = "stdio"
			case "streamable-http", "streamablehttp":
				it.Transport = "http"
			case "http", "sse":
			default:
				continue // 未知传输，跳过
			}
			if it.Transport == "stdio" && strings.TrimSpace(it.Command) == "" {
				continue
			}
			if it.Transport != "stdio" && strings.TrimSpace(it.URL) == "" {
				continue
			}
		} else {
			if it.Repo == "" {
				it.Repo = repo
			}
			if it.Repo == "" || it.Path == "" {
				continue // 技能条目必须能定位到仓库里的目录
			}
			it.Ref = strings.TrimSpace(it.Ref)
			it.Path = normalizeMarketPath(it.Path)
		}
		key := it.Kind + "/" + strings.ToLower(it.Name)
		if seen[key] {
			continue
		}
		seen[key] = true
		if it.ID == "" {
			id := it.Kind + ":" + it.Name
			if it.Path != "" {
				id += "@" + it.Repo + "/" + it.Path
			}
			it.ID = id
		}
		if len(out) >= marketMaxItems {
			break
		}
		out = append(out, it)
	}
	if len(out) == 0 {
		return nil, errors.New("市场索引里没有可用条目（MCP 需要 command 或 url，技能需要 repo + path）")
	}
	return out, nil
}

// discoverSkillsFromRepo 用 GitHub 树接口找出仓库里所有 SKILL.md，把它们所在目录
// 作为可安装技能；描述从各自的 SKILL.md frontmatter 里读，受限并发 + 总预算封顶。
func (s *Server) discoverSkillsFromRepo(ctx context.Context, src *db.MarketSource, ref string) ([]marketItem, error) {
	treeURL := fmt.Sprintf("https://api.github.com/repos/%s/git/trees/%s?recursive=1", src.Repo, url.PathEscape(ref))
	body, code, err := marketGet(ctx, treeURL)
	if err != nil {
		return nil, fmt.Errorf("读取仓库树失败：%v", err)
	}
	if code == 403 || code == 429 {
		return nil, errors.New("GitHub API 限流，请稍后重试或配置 GITHUB_TOKEN")
	}
	if code != 200 {
		return nil, fmt.Errorf("读取仓库树失败：HTTP %d", code)
	}
	var tree struct {
		Tree []struct {
			Path string `json:"path"`
			Type string `json:"type"`
		} `json:"tree"`
	}
	if err := json.Unmarshal(body, &tree); err != nil {
		return nil, fmt.Errorf("仓库树解析失败：%v", err)
	}
	prefix := strings.Trim(src.Path, "/")
	dirs := make([]string, 0, 16)
	for _, node := range tree.Tree {
		if !strings.HasSuffix(node.Path, "/SKILL.md") {
			continue
		}
		dir := strings.TrimSuffix(node.Path, "/SKILL.md")
		if dir == "" {
			continue
		}
		if prefix != "" && dir != prefix && !strings.HasPrefix(dir, prefix+"/") {
			continue
		}
		dirs = append(dirs, dir)
		if len(dirs) >= marketMaxDiscover {
			break
		}
	}
	if len(dirs) == 0 {
		return nil, errors.New("仓库里没有找到 SKILL.md")
	}
	sortStrings(dirs)

	items := make([]marketItem, len(dirs))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 6)
	for i, dir := range dirs {
		items[i] = marketItem{
			Kind: "skills",
			Name: path.Base(dir),
			Repo: src.Repo,
			Ref:  ref,
			Path: dir,
		}
		wg.Add(1)
		go func(i int, dir string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			md, code, err := marketGet(ctx, marketRawURL(src.Repo, ref, dir+"/SKILL.md"))
			if err != nil || code != 200 {
				return
			}
			name, desc := parseSkillFrontmatter(md)
			if name != "" {
				items[i].Name = name
			}
			items[i].Description = desc
		}(i, dir)
	}
	wg.Wait()
	return normalizeMarketItems(items, src.Repo)
}

// parseSkillFrontmatter 读取 SKILL.md YAML 头部的 name / description。
func parseSkillFrontmatter(md []byte) (name, desc string) {
	lines := strings.Split(string(md), "\n")
	in := false
	for i, ln := range lines {
		t := strings.TrimSpace(ln)
		if t == "---" {
			if !in {
				in = true
				continue
			}
			break
		}
		if !in {
			continue
		}
		switch {
		case strings.HasPrefix(t, "name:"):
			name = strings.Trim(strings.TrimSpace(strings.TrimPrefix(t, "name:")), `"'`)
		case strings.HasPrefix(t, "description:"):
			v := strings.TrimSpace(strings.TrimPrefix(t, "description:"))
			if v == ">" || v == "|" || v == ">-" || v == "|-" {
				// 块标量：把后续缩进行拼起来
				var parts []string
				for _, nxt := range lines[i+1:] {
					if strings.TrimSpace(nxt) == "" {
						if len(parts) > 0 {
							parts = append(parts, "")
						}
						continue
					}
					if !strings.HasPrefix(nxt, " ") && !strings.HasPrefix(nxt, "\t") {
						break
					}
					parts = append(parts, strings.TrimSpace(nxt))
				}
				v = strings.TrimSpace(strings.Join(parts, " "))
			} else {
				v = strings.Trim(v, `"'`)
			}
			desc = v
		}
	}
	if len(desc) > 400 {
		desc = desc[:400] + "…"
	}
	return name, desc
}

func sortStrings(v []string) { sort.Strings(v) }

// ---------- 同步 ----------

// syncMarketSource 抓取一个源并写回缓存。失败时保留旧条目，只记录错误。
func (s *Server) syncMarketSource(ctx context.Context, src *db.MarketSource) ([]marketItem, error) {
	items, err := s.fetchMarketSource(ctx, src)
	if err != nil {
		if s.m.pg != nil && src.ID > 0 {
			_ = s.m.pg.SaveMarketSourceSync(src.ID, nil, err.Error())
		}
		return nil, err
	}
	for i := range items {
		items[i].SourceID = src.ID
		items[i].SourceName = src.Name
		items[i].SourceRepo = src.Repo
		items[i].Official = src.Official
		if items[i].Kind == "" {
			items[i].Kind = src.Kind
		}
	}
	if s.m.pg != nil && src.ID > 0 {
		if raw, mErr := json.Marshal(items); mErr == nil {
			_ = s.m.pg.SaveMarketSourceSync(src.ID, raw, "")
		}
	}
	return items, nil
}

func marketSourceHasKind(src *db.MarketSource, kind string) bool {
	return src.Kind == "all" || src.Kind == kind
}

func decodeMarketItems(src *db.MarketSource) []marketItem {
	if len(src.Items) == 0 {
		return nil
	}
	var out []marketItem
	if err := json.Unmarshal(src.Items, &out); err != nil {
		return nil
	}
	for i := range out {
		out[i].SourceID = src.ID
		out[i].SourceName = src.Name
		out[i].SourceRepo = src.Repo
		out[i].Official = src.Official
	}
	return out
}

// ---------- HTTP 接口 ----------

func (s *Server) marketSources(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	sources, err := pg.ListMarketSources()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	type sourceView struct {
		ID        int64      `json:"id"`
		Kind      string     `json:"kind"`
		Name      string     `json:"name"`
		Repo      string     `json:"repo"`
		Ref       string     `json:"ref"`
		Path      string     `json:"path"`
		Official  bool       `json:"official"`
		ItemCount int        `json:"item_count"`
		SyncedAt  *time.Time `json:"synced_at,omitempty"`
		LastError string     `json:"last_error,omitempty"`
	}
	out := make([]sourceView, 0, len(sources))
	for _, src := range sources {
		out = append(out, sourceView{
			ID: src.ID, Kind: src.Kind, Name: src.Name, Repo: src.Repo, Ref: src.Ref,
			Path: src.Path, Official: src.Official, ItemCount: len(decodeMarketItems(src)),
			SyncedAt: src.SyncedAt, LastError: src.LastError,
		})
	}
	writeJSON(w, 200, map[string]any{"sources": out})
}

func (s *Server) addMarketSource(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var body struct {
		Link string `json:"link"`
		Kind string `json:"kind"`
		Name string `json:"name"`
		Ref  string `json:"ref"`
		Path string `json:"path"`
	}
	if err := decode(r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	kind := strings.TrimSpace(body.Kind)
	if kind == "" {
		kind = "all"
	}
	if kind != "mcp" && kind != "skills" && kind != "all" {
		writeErr(w, 400, "kind 只能是 mcp / skills / all")
		return
	}
	repo, ref, sub, err := parseMarketLink(body.Link, body.Ref, body.Path)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if ref == "" {
		ref = "main"
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = repo
		if sub != "" {
			name += "/" + sub
		}
	}
	src := &db.MarketSource{Kind: kind, Name: name, Repo: repo, Ref: ref, Path: sub}
	id, err := pg.SaveMarketSource(src)
	if err != nil {
		writeErr(w, 409, "保存市场源失败（可能已存在同一仓库/目录）："+err.Error())
		return
	}
	src.ID = id
	// 立即试同步一次：源加进来就能看到条目，失败也把错误回给用户而不是静默存下。
	ctx, cancel := context.WithTimeout(r.Context(), marketSyncBudget)
	defer cancel()
	items, syncErr := s.syncMarketSource(ctx, src)
	resp := map[string]any{"id": id, "repo": repo, "ref": ref, "path": sub, "kind": kind, "name": name}
	if syncErr != nil {
		resp["warning"] = "市场源已保存，但首次同步失败：" + syncErr.Error()
		resp["items"] = []marketItem{}
		writeJSON(w, 201, resp)
		return
	}
	resp["items"] = items
	writeJSON(w, 201, resp)
}

func (s *Server) deleteMarketSource(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, _ := pathInt(r, "id")
	all, err := pg.ListMarketSources()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	for _, src := range all {
		if src.ID != id {
			continue
		}
		if src.Official {
			writeErr(w, 400, "官方市场源不可删除")
			return
		}
		if err := pg.DeleteMarketSource(id); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"deleted": id})
		return
	}
	writeErr(w, 404, "市场源不存在")
}

func (s *Server) syncMarketSourceByID(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, _ := pathInt(r, "id")
	all, err := pg.ListMarketSources()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	var target *db.MarketSource
	for _, src := range all {
		if src.ID == id {
			target = src
			break
		}
	}
	if target == nil {
		writeErr(w, 404, "市场源不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), marketSyncBudget)
	defer cancel()
	items, syncErr := s.syncMarketSource(ctx, target)
	if syncErr != nil {
		writeErr(w, 502, syncErr.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"items": items, "count": len(items)})
}

// marketItems 返回某一类（mcp / skills）的全部市场条目。
// 缓存超过 TTL 或 refresh=1 时同步；官方源整源失败时回落到内置目录，
// 保证离线/被墙时市场页不是空白。
func (s *Server) marketItems(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	if kind != "mcp" && kind != "skills" {
		writeErr(w, 400, "kind 只能是 mcp / skills")
		return
	}
	refresh := r.URL.Query().Get("refresh") == "1"
	sources, err := pg.ListMarketSources()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), marketSyncBudget)
	defer cancel()

	var (
		mu       sync.Mutex
		wg       sync.WaitGroup
		items    []marketItem
		warnings []string
	)
	for _, src := range sources {
		if !marketSourceHasKind(src, kind) {
			continue
		}
		cached := decodeMarketItems(src)
		stale := src.SyncedAt == nil || time.Since(*src.SyncedAt) > marketCacheTTL
		if !refresh && !stale && len(cached) > 0 {
			mu.Lock()
			items = append(items, cached...)
			mu.Unlock()
			continue
		}
		wg.Add(1)
		go func(src *db.MarketSource) {
			defer wg.Done()
			fresh, sErr := s.syncMarketSource(ctx, src)
			mu.Lock()
			defer mu.Unlock()
			if sErr != nil {
				warnings = append(warnings, fmt.Sprintf("%s 同步失败：%v", src.Name, sErr))
				items = append(items, cached...)
				return
			}
			items = append(items, fresh...)
		}(src)
	}
	wg.Wait()

	// 同一仓库可能被多个源引用（例如官方市场里也列了别人的技能），按 id 去重。
	seen := map[string]bool{}
	merged := make([]marketItem, 0, len(items))
	for _, it := range items {
		if it.Kind != kind || seen[it.ID] {
			continue
		}
		seen[it.ID] = true
		merged = append(merged, it)
	}
	// 没有任何可用条目时用内置目录兜底，避免市场页在断网首次打开时全空。
	builtin := false
	if len(merged) == 0 {
		merged = builtinMarketItems(kind)
		builtin = true
		warnings = append(warnings, "当前无法访问市场源，已展示内置目录")
	}

	writeJSON(w, 200, map[string]any{
		"kind":     kind,
		"items":    merged,
		"count":    len(merged),
		"builtin":  builtin,
		"warnings": warnings,
	})
}

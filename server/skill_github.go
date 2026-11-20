// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// 从 GitHub 安装技能：下载仓库 tar.gz，定位目标目录里的 SKILL.md，把它所在的
// 整个目录原子地搬进 skillDir。目录里额外写一份 .vexnar-skill.json 记录来源，
// 这样"更新"就是带上 overwrite 再装一次，卸载后也不会留下无主文件。
// skillDownloadHTTP 用于整包下载：仓库 tar.gz 可能有几十 MB，不能套用市场抓取的 12s 上限。
var skillDownloadHTTP = &http.Client{Timeout: 150 * time.Second}

const (
	maxSkillTarBytes = 80 << 20
	skillProvFile    = ".vexnar-skill.json"
	skillDisabledExt = ".disabled"
)

// skillProvenance 记录一个技能的安装来源。
type skillProvenance struct {
	Repo        string    `json:"repo"`
	Ref         string    `json:"ref"`
	Path        string    `json:"path,omitempty"`
	InstalledAt time.Time `json:"installed_at"`
}

func readSkillProvenance(dir string) *skillProvenance {
	raw, err := os.ReadFile(filepath.Join(dir, skillProvFile))
	if err != nil {
		return nil
	}
	var p skillProvenance
	if json.Unmarshal(raw, &p) != nil || p.Repo == "" {
		return nil
	}
	return &p
}

func writeSkillProvenance(dir string, p *skillProvenance) {
	raw, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(filepath.Join(dir, skillProvFile), append(raw, '\n'), 0o644)
}

// githubTarballURL 走 codeload，不消耗 GitHub API 配额。
func githubTarballURL(repo, ref string) string {
	return fmt.Sprintf("https://codeload.github.com/%s/tar.gz/%s", repo, ref)
}

// downloadGitHubTarball 下载并解包到 dst（保留 tar 内的顶层目录）。
// 逐条校验路径，拒绝 ..、绝对路径、设备文件与超限条目。
func downloadGitHubTarball(ctx context.Context, repo, ref, dst string) (int, int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubTarballURL(repo, ref), nil)
	if err != nil {
		return 0, 0, err
	}
	req.Header.Set("User-Agent", "vexnar-skill-installer/1")
	if tok := marketToken(); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := skillDownloadHTTP.Do(req)
	if err != nil {
		return 0, 0, fmt.Errorf("下载 %s@%s 失败：%v", repo, ref, err)
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case 200:
	case 401, 403:
		return 0, 0, fmt.Errorf("无权访问 %s（私有仓库请配置 GITHUB_TOKEN）", repo)
	case 404:
		return 0, 0, fmt.Errorf("仓库或分支不存在：%s@%s", repo, ref)
	default:
		return 0, 0, fmt.Errorf("下载 %s@%s 失败：HTTP %d", repo, ref, resp.StatusCode)
	}
	return extractTarGz(io.LimitReader(resp.Body, maxSkillTarBytes+1), dst)
}

// extractTarGz 解包 tar.gz 到 dst，返回文件数与字节数。
func extractTarGz(r io.Reader, dst string) (int, int64, error) {
	gz, err := gzip.NewReader(r)
	if err != nil {
		// 把 401/404 的 JSON 响应体当 gzip 解时也会落到这里
		return 0, 0, errors.New("下载内容不是有效的 tar.gz（仓库可能不存在或需要鉴权）")
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	files, total := 0, int64(0)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return files, total, fmt.Errorf("压缩包解析失败：%v", err)
		}
		if hdr.Typeflag != tar.TypeReg {
			continue // 目录/链接/设备文件一律跳过
		}
		raw := strings.TrimPrefix(hdr.Name, "./")
		if strings.Contains(raw, "..") {
			return files, total, fmt.Errorf("压缩包含非法路径 %s", hdr.Name)
		}
		name := strings.TrimPrefix(path.Clean("/"+raw), "/")
		if name == "" || strings.HasPrefix(name, "__MACOSX/") || strings.Contains(name, "/__MACOSX/") ||
			path.Base(name) == ".DS_Store" {
			continue
		}
		clean, msg := skillRelPath(name)
		if msg != "" {
			return files, total, fmt.Errorf("压缩包含非法路径 %s：%s", hdr.Name, msg)
		}
		if files++; files > maxSkillEntries {
			return files, total, errors.New("压缩包文件过多")
		}
		if hdr.Size > maxSkillFileBytes {
			return files, total, fmt.Errorf("文件过大：%s", clean)
		}
		dstPath := filepath.Join(dst, filepath.FromSlash(clean))
		if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
			return files, total, err
		}
		out, err := os.Create(dstPath)
		if err != nil {
			return files, total, err
		}
		n, copyErr := io.Copy(out, io.LimitReader(tr, maxSkillFileBytes+1))
		closeErr := out.Close()
		if copyErr != nil {
			return files, total, copyErr
		}
		if closeErr != nil {
			return files, total, closeErr
		}
		total += n
		if total > maxSkillTotalBytes {
			return files, total, errors.New("压缩包解压后过大")
		}
	}
	if files == 0 {
		return 0, 0, errors.New("压缩包里没有文件")
	}
	return files, total, nil
}

// findSkillRoots 找出解包目录里所有 SKILL.md 的所在目录，浅的排前面。
func findSkillRoots(root string) ([]string, error) {
	var dirs []string
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if d.Name() != "SKILL.md" {
			return nil
		}
		rel, relErr := filepath.Rel(root, filepath.Dir(p))
		if relErr != nil || rel == "." {
			return nil
		}
		dirs = append(dirs, filepath.ToSlash(rel))
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(dirs, func(i, j int) bool {
		di, dj := strings.Count(dirs[i], "/"), strings.Count(dirs[j], "/")
		if di != dj {
			return di < dj
		}
		return dirs[i] < dirs[j]
	})
	return dirs, nil
}

// installSkillFromGitHub 安装（或覆盖安装）一个 GitHub 上的技能目录。
// 返回技能名、文件数与来源信息。
func (s *Server) installSkillFromGitHub(ctx context.Context, repo, ref, sub string, overwrite bool) (string, int, *skillProvenance, error) {
	if ref == "" {
		ref = "main"
	}
	if !validMarketRepo(repo) {
		return "", 0, nil, fmt.Errorf("仓库名不合法：%s", repo)
	}
	if !marketSafeRef(ref) {
		return "", 0, nil, fmt.Errorf("分支/标签不合法：%s", ref)
	}
	sub, bad := marketSafePath(sub)
	if bad != "" {
		return "", 0, nil, errors.New("目录不合法：" + bad)
	}
	if err := os.MkdirAll(s.skillDir, 0o755); err != nil {
		return "", 0, nil, err
	}
	tmp, err := os.MkdirTemp(s.skillDir, ".github-*")
	if err != nil {
		return "", 0, nil, err
	}
	defer os.RemoveAll(tmp)

	// 先按 tree 只取目标目录（快、流量小）；拿不到树或没有 sub 时退回整套 tar.gz。
	done, dlErr := s.downloadSkillSubdir(ctx, repo, ref, sub, tmp)
	if dlErr != nil {
		return "", 0, nil, dlErr
	}
	if !done {
		if _, _, err := downloadGitHubTarball(ctx, repo, ref, tmp); err != nil {
			return "", 0, nil, err
		}
	}
	roots, err := findSkillRoots(tmp)
	if err != nil {
		return "", 0, nil, err
	}
	// GitHub tar 的路径形如 <owner>-<repo>-<sha>/<sub>/SKILL.md：先把顶层目录剥掉，
	// 用户填的 sub 才是他在网页上看到的路径（按 tree 下载时没有这层）。
	target := pickSkillRoot(roots, sub)
	if target == "" {
		if sub != "" {
			return "", 0, nil, fmt.Errorf("仓库 %s 的 %q 目录下没有 SKILL.md", repo, sub)
		}
		return "", 0, nil, fmt.Errorf("仓库 %s 里没有找到 SKILL.md", repo)
	}
	srcDir := filepath.Join(tmp, filepath.FromSlash(target))
	md, err := os.ReadFile(filepath.Join(srcDir, "SKILL.md"))
	if err != nil {
		return "", 0, nil, fmt.Errorf("读取 SKILL.md 失败：%v", err)
	}
	name, _ := parseSkillFrontmatter(md)
	if name == "" {
		name = path.Base(target)
	}
	if !validSkillName(name) {
		return "", 0, nil, fmt.Errorf("SKILL.md 里的 name 不合法：%q", name)
	}
	dst := filepath.Join(s.skillDir, name)
	if _, statErr := os.Stat(dst); statErr == nil {
		if !overwrite {
			return name, 0, nil, fmt.Errorf("技能 %s 已存在（更新请勾选覆盖）", name)
		}
		backup := filepath.Join(tmp, ".previous")
		if err := os.Rename(dst, backup); err != nil {
			return "", 0, nil, fmt.Errorf("替换旧技能失败：%v", err)
		}
		if err := os.Rename(srcDir, dst); err != nil {
			_ = os.Rename(backup, dst) // 失败回滚
			return "", 0, nil, fmt.Errorf("安装失败：%v", err)
		}
	} else if err := os.Rename(srcDir, dst); err != nil {
		return "", 0, nil, fmt.Errorf("安装失败：%v", err)
	}
	prov := &skillProvenance{Repo: repo, Ref: ref, Path: sub, InstalledAt: time.Now()}
	writeSkillProvenance(dst, prov)
	installed, _ := walkSkillFiles(dst)
	return name, len(installed), prov, nil
}

// pickSkillRoot 从解包结果里挑出目标技能目录。sub 为空时：整仓即技能（顶层
// SKILL.md）优先，否则取最浅的一层；sub 非空时匹配去掉仓库顶层目录后的相对路径。
func pickSkillRoot(roots []string, sub string) string {
	if len(roots) == 0 {
		return ""
	}
	if sub == "" {
		for _, dir := range roots {
			if !strings.Contains(dir, "/") {
				return dir // <repo>-<sha>/SKILL.md：整仓是一个技能
			}
		}
		return roots[0]
	}
	for _, dir := range roots {
		cands := []string{dir}
		if i := strings.Index(dir, "/"); i > 0 {
			cands = append(cands, dir[i+1:])
		}
		for _, c := range cands {
			if c == sub || strings.HasSuffix(c, "/"+sub) {
				return dir
			}
		}
	}
	return ""
}

// downloadSkillSubdir 用一次 tree 接口 + 若干 raw 下载，只取目标目录的文件。
// 返回 false 表示"没走这条路"（调用方回落到 tar.gz），错误则表示确实失败了。
func (s *Server) downloadSkillSubdir(ctx context.Context, repo, ref, sub, tmp string) (bool, error) {
	if sub == "" {
		return false, nil // 没有目录无法定向，交给 tar
	}
	treeURL := fmt.Sprintf("https://api.github.com/repos/%s/git/trees/%s?recursive=1", repo, url.PathEscape(ref))
	body, code, err := marketGet(ctx, treeURL)
	if err != nil || code != 200 {
		return false, nil // 限流/网络问题：回落 tar，错误信息由那条路径给出
	}
	var tree struct {
		Truncated bool `json:"truncated"`
		Tree      []struct {
			Path string `json:"path"`
			Type string `json:"type"`
		} `json:"tree"`
	}
	if json.Unmarshal(body, &tree) != nil || tree.Truncated {
		return false, nil
	}
	prefix := sub + "/"
	var files []string
	for _, node := range tree.Tree {
		if node.Type == "blob" && strings.HasPrefix(node.Path, prefix) {
			files = append(files, node.Path)
		}
	}
	if len(files) == 0 {
		return false, fmt.Errorf("仓库 %s 的 %q 目录不存在或为空", repo, sub)
	}
	if len(files) > maxSkillEntries {
		return false, fmt.Errorf("目标目录文件过多（%d > %d）", len(files), maxSkillEntries)
	}
	hasSkillMD := false
	for _, f := range files {
		if f == prefix+"SKILL.md" {
			hasSkillMD = true
			break
		}
	}
	if !hasSkillMD {
		return false, fmt.Errorf("仓库 %s 的 %q 目录里没有 SKILL.md", repo, sub)
	}

	var (
		mu    sync.Mutex
		total int64
		wg    sync.WaitGroup
		sem   = make(chan struct{}, 6)
		errCh error
	)
	for _, f := range files {
		rel := strings.TrimPrefix(f, prefix)
		if rel == "" {
			continue
		}
		safe, msg := skillRelPath(rel)
		if msg != "" {
			return false, fmt.Errorf("文件路径不合法 %s：%s", f, msg)
		}
		wg.Add(1)
		go func(full, rel, safe string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			content, code, err := marketGet(ctx, marketRawURL(repo, ref, full))
			if err != nil || code != 200 {
				mu.Lock()
				if errCh == nil {
					errCh = fmt.Errorf("下载 %s 失败（HTTP %d）", full, code)
				}
				mu.Unlock()
				return
			}
			if len(content) > maxSkillFileBytes {
				mu.Lock()
				if errCh == nil {
					errCh = fmt.Errorf("文件过大：%s", full)
				}
				mu.Unlock()
				return
			}
			dst := filepath.Join(tmp, filepath.FromSlash(prefix+rel))
			if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
				mu.Lock()
				errCh = err
				mu.Unlock()
				return
			}
			if err := os.WriteFile(dst, content, 0o644); err != nil {
				mu.Lock()
				errCh = err
				mu.Unlock()
				return
			}
			mu.Lock()
			total += int64(len(content))
			if total > maxSkillTotalBytes {
				errCh = errors.New("技能目录过大")
			}
			mu.Unlock()
		}(f, rel, safe)
	}
	wg.Wait()
	if errCh != nil {
		return false, errCh
	}
	return true, nil
}

// ---------- 技能启停 ----------

// skillEntryState 描述磁盘上一个技能入口的状态。
//
// 停用的实现是把入口文件改名（SKILL.md → SKILL.md.disabled）：加载器只认
// 精确的 SKILL.md / *.md，改名后既不会被 agent 读到，也不会破坏目录内容，
// 随时可以无损还原。这里不用"移动到别处"，避免相对路径引用失效。
type skillEntryState struct {
	Name    string
	Dir     string // 目录形态时的目录路径；单文件技能为空
	File    string // 单文件技能的文件路径
	Enabled bool
}

// locateSkillEntry 按技能名找到它的磁盘入口（目录形态优先）。
func (s *Server) locateSkillEntry(name string) (*skillEntryState, error) {
	dirPath := filepath.Join(s.skillDir, name)
	if st, err := os.Stat(dirPath); err == nil && st.IsDir() {
		if _, err := os.Stat(filepath.Join(dirPath, "SKILL.md")); err == nil {
			return &skillEntryState{Name: name, Dir: dirPath, Enabled: true}, nil
		}
		if _, err := os.Stat(filepath.Join(dirPath, "SKILL.md"+skillDisabledExt)); err == nil {
			return &skillEntryState{Name: name, Dir: dirPath, Enabled: false}, nil
		}
		return nil, os.ErrNotExist
	}
	// 单文件技能：skillDir 根下的 *.md / *.md.disabled，名字取自 frontmatter。
	entries, err := os.ReadDir(s.skillDir)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		fileName := e.Name()
		enabled := strings.HasSuffix(fileName, ".md") && !strings.HasSuffix(fileName, skillDisabledExt)
		if !strings.HasSuffix(strings.TrimSuffix(fileName, skillDisabledExt), ".md") {
			continue
		}
		full := filepath.Join(s.skillDir, fileName)
		raw, readErr := os.ReadFile(full)
		if readErr != nil {
			continue
		}
		mdName, _ := parseSkillFrontmatter(raw)
		if mdName == "" {
			mdName = strings.TrimSuffix(strings.TrimSuffix(fileName, skillDisabledExt), ".md")
		}
		if mdName == name {
			return &skillEntryState{Name: name, File: full, Enabled: enabled}, nil
		}
	}
	return nil, os.ErrNotExist
}

// setSkillEnabled 启用/停用一个技能。
func (s *Server) setSkillEnabled(name string, enabled bool) (*skillEntryState, error) {
	entry, err := s.locateSkillEntry(name)
	if err != nil {
		return nil, err
	}
	if entry.Enabled == enabled {
		return entry, nil
	}
	if entry.Dir != "" {
		from := filepath.Join(entry.Dir, "SKILL.md")
		to := from + skillDisabledExt
		if enabled {
			from, to = to, from
		}
		if err := os.Rename(from, to); err != nil {
			return nil, err
		}
	} else {
		to := entry.File + skillDisabledExt
		if enabled {
			to = strings.TrimSuffix(entry.File, skillDisabledExt)
		}
		if err := os.Rename(entry.File, to); err != nil {
			return nil, err
		}
	}
	entry.Enabled = enabled
	return entry, nil
}

// GET/PUT /api/skills/{name}/enabled
func (s *Server) fsSkillEnabled(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !validSkillName(name) {
		writeErr(w, 400, "invalid skill name")
		return
	}
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
	entry, err := s.setSkillEnabled(name, *body.Enabled)
	if os.IsNotExist(err) {
		writeErr(w, 404, "skill not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"name": name, "enabled": entry.Enabled})
}

// POST /api/skills/install-github
func (s *Server) fsInstallSkillFromGitHub(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Link      string `json:"link"`
		Repo      string `json:"repo"`
		Ref       string `json:"ref"`
		Path      string `json:"path"`
		Overwrite bool   `json:"overwrite"`
	}
	if err := decode(r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	link := strings.TrimSpace(body.Link)
	if link == "" && strings.TrimSpace(body.Repo) != "" {
		link = strings.TrimSpace(body.Repo)
	}
	repo, ref, sub, err := parseMarketLink(link, body.Ref, body.Path)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if ref == "" {
		ref = "main"
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	name, files, prov, err := s.installSkillFromGitHub(ctx, repo, ref, sub, body.Overwrite)
	if err != nil {
		status := 502
		if strings.Contains(err.Error(), "已存在") {
			status = 409
		} else if strings.Contains(err.Error(), "没有 SKILL.md") || strings.Contains(err.Error(), "不合法") {
			status = 400
		}
		writeErr(w, status, err.Error())
		return
	}
	writeJSON(w, 201, map[string]any{"name": name, "files": files, "source": prov})
}

// skillMetaFromFile 从 SKILL.md 解析列表页需要的元数据。
func skillMetaFromFile(raw []byte) (name, desc, license, compat string, mcps []string) {
	name, desc = parseSkillFrontmatter(raw)
	lines := strings.Split(string(raw), "\n")
	in := false
	for _, ln := range lines {
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
		case strings.HasPrefix(t, "license:"):
			license = strings.Trim(strings.TrimSpace(strings.TrimPrefix(t, "license:")), `"'`)
		case strings.HasPrefix(t, "compatibility:"):
			compat = strings.Trim(strings.TrimSpace(strings.TrimPrefix(t, "compatibility:")), `"'`)
		case strings.HasPrefix(t, "mcps:"):
			v := strings.TrimSpace(strings.TrimPrefix(t, "mcps:"))
			v = strings.Trim(v, "[]")
			for _, part := range strings.Split(v, ",") {
				p := strings.Trim(strings.TrimSpace(part), `"'`)
				if p != "" {
					mcps = append(mcps, p)
				}
			}
		}
	}
	return name, desc, license, compat, mcps
}

// scanSkillEntries 列出 skillDir 下的全部技能（含已停用），按名字排序。
// 目录形态走 SKILL.md(.disabled)，根目录的 *.md(.disabled) 视为单文件技能。
func (s *Server) scanSkillEntries() ([]skillEntryState, error) {
	entries, err := os.ReadDir(s.skillDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []skillEntryState
	for _, e := range entries {
		entryName := e.Name()
		if e.IsDir() {
			if strings.HasPrefix(entryName, ".") {
				continue // .github-* / .upload-* 等临时目录
			}
			dir := filepath.Join(s.skillDir, entryName)
			if _, err := os.Stat(filepath.Join(dir, "SKILL.md")); err == nil {
				out = append(out, skillEntryState{Name: entryName, Dir: dir, Enabled: true})
			} else if _, err := os.Stat(filepath.Join(dir, "SKILL.md"+skillDisabledExt)); err == nil {
				out = append(out, skillEntryState{Name: entryName, Dir: dir, Enabled: false})
			}
			continue
		}
		if !strings.HasSuffix(e.Name(), ".md") && !strings.HasSuffix(e.Name(), ".md"+skillDisabledExt) {
			continue
		}
		full := filepath.Join(s.skillDir, entryName)
		name := strings.TrimSuffix(strings.TrimSuffix(entryName, skillDisabledExt), ".md")
		if raw, err := os.ReadFile(full); err == nil {
			if mdName, _ := parseSkillFrontmatter(raw); mdName != "" {
				name = mdName
			}
		}
		out = append(out, skillEntryState{
			Name:    name,
			File:    full,
			Enabled: strings.HasSuffix(entryName, ".md"),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// skillEntryMetaFile 返回技能入口里的 SKILL.md 路径（停用时是 .disabled）。
func (e *skillEntryState) skillMDFile() string {
	if e.Dir != "" {
		if e.Enabled {
			return filepath.Join(e.Dir, "SKILL.md")
		}
		return filepath.Join(e.Dir, "SKILL.md"+skillDisabledExt)
	}
	return e.File
}

// skillEntryFiles 返回技能条目内的相对文件列表（停用时不含隐藏的 provenance）。
func (e *skillEntryState) skillEntryFiles() []string {
	if e.Dir == "" {
		if e.File == "" {
			return []string{}
		}
		return []string{filepath.Base(e.File)}
	}
	files, _ := walkSkillFiles(e.Dir)
	out := make([]string, 0, len(files))
	for _, f := range files {
		if strings.HasPrefix(f, ".") {
			continue
		}
		out = append(out, f)
	}
	if out == nil {
		out = []string{}
	}
	return out
}

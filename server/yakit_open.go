// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/zhongxinxuhk/vexnar/yakproject"
)

func (s *Server) openYakit(w http.ResponseWriter, r *http.Request) {
	if !s.desktopAuthorized(r) {
		writeErr(w, http.StatusForbidden, "Yakit 接口仅供本机 VEXNAR 客户端")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	var input struct {
		Workspace string `json:"workspace"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&input); err != nil {
		writeErr(w, 400, "无效的本地工作区请求")
		return
	}
	root := ""
	if input.Workspace != "" {
		if !filepath.IsAbs(input.Workspace) {
			writeErr(w, 400, "会话没有有效的本地工作区")
			return
		}
		resolved, err := filepath.EvalSymlinks(input.Workspace)
		if err != nil {
			writeErr(w, 400, "会话的本地工作区已不存在")
			return
		}
		root = resolved
		if info, err := os.Stat(root); err != nil || !info.IsDir() {
			writeErr(w, 400, "会话的本地工作区已不存在")
			return
		}
	}
	if runtime.GOOS != "darwin" {
		writeErr(w, 501, "当前 VEXNAR 原生窗口跳转支持 macOS")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := exec.CommandContext(ctx, "/usr/bin/open", "-a", "Yakit").Run(); err != nil {
		writeErr(w, 503, "无法打开 Yakit，请安装并启动官方 Yakit")
		return
	}

	result := map[string]any{"opened": true}
	if root != "" {
		socket, tokenFile := os.Getenv("VEXNAR_YAKIT_SOCKET"), os.Getenv("VEXNAR_YAKIT_TOKEN_FILE")
		if socket == "" || tokenFile == "" {
			result["project_status"] = "unpaired"
		} else {
			project, created, err := yakproject.Ensure(ctx, socket, tokenFile, root)
			if err != nil {
				result["project_status"] = "unavailable"
			} else {
				result["project_status"], result["project"], result["created"] = "linked", project, created
			}
		}
	}
	writeJSON(w, 200, result)
}

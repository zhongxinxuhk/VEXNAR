// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Project ownership lives in Go: the client reads this list, it never derives a
// project from whatever directory it happens to have open. Conversations carry
// project_id, and every project-scoped query filters by that id.
func (s *Server) registerDesktopProjectRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/desktop/projects", s.desktopListProjects)
	mux.HandleFunc("POST /api/desktop/projects", s.desktopRegisterProject)
	mux.HandleFunc("POST /api/desktop/conversations/{conversationID}/project", s.desktopBindConversationProject)
}

func (s *Server) desktopListProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := s.m.pg.ListDesktopProjects(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": projects})
}

// desktopRegisterProject resolves an absolute directory into a project row.
// Registration is idempotent for the same canonical path.
func (s *Server) desktopRegisterProject(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	var input struct {
		RootPath string `json:"root_path"`
	}
	if err := decode(r, &input); err != nil || !filepath.IsAbs(strings.TrimSpace(input.RootPath)) {
		writeErr(w, http.StatusBadRequest, "需要项目目录的绝对路径")
		return
	}
	info, err := os.Stat(strings.TrimSpace(input.RootPath))
	if err != nil || !info.IsDir() {
		writeErr(w, http.StatusBadRequest, "项目目录不可用")
		return
	}
	root := canonicalWorkspace(input.RootPath)
	if root == "" {
		writeErr(w, http.StatusBadRequest, "项目目录不可用")
		return
	}
	project, err := s.m.pg.RegisterDesktopProject(r.Context(), root, filepath.Base(root))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, project)
}

// desktopBindConversationProject moves an unassigned thread into a project.
// Threads already owned by another project are rejected: history must not be
// silently reassigned by a client that switched directories.
func (s *Server) desktopBindConversationProject(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("conversationID"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, http.StatusBadRequest, "无效的会话编号")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
	var input struct {
		ProjectID int64 `json:"project_id"`
	}
	if err := decode(r, &input); err != nil || input.ProjectID <= 0 {
		writeErr(w, http.StatusBadRequest, "需要有效的 project_id")
		return
	}
	project, err := s.m.pg.DesktopProjectByID(r.Context(), input.ProjectID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "项目不存在")
		return
	}
	current, err := s.m.pg.GetConversation(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if current == nil {
		writeErr(w, http.StatusNotFound, "会话不存在")
		return
	}
	if current.ProjectID != nil && *current.ProjectID != project.ID {
		writeErr(w, http.StatusConflict, "会话已归属其他项目")
		return
	}
	if err := s.m.pg.SetConversationProject(id, project.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	updated, err := s.m.pg.GetConversation(id)
	if err != nil || updated == nil {
		writeErr(w, http.StatusInternalServerError, "会话归属更新后读取失败")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/zhongxinxuhk/vexnar/db"
)

const desktopProjectTaskPageSize = 50

// Project ownership lives in Go: the client reads this list, it never derives a
// project from whatever directory it happens to have open. Conversations carry
// project_id, and every project-scoped query filters by that id. Tasks bound to
// a project are read through the /tasks sub-routes below.
func (s *Server) registerDesktopProjects(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/desktop/projects", s.desktopListProjects)
	mux.HandleFunc("POST /api/desktop/projects", s.desktopRegisterProject)
	mux.HandleFunc("POST /api/desktop/conversations/{conversationID}/project", s.desktopBindConversationProject)
	mux.HandleFunc("GET /api/desktop/projects/{projectID}/tasks", s.desktopListProjectTasks)
	mux.HandleFunc("GET /api/desktop/projects/{projectID}/tasks/{taskID}", s.desktopGetProjectTask)
	mux.HandleFunc("GET /api/desktop/projects/{projectID}/tasks/{taskID}/sessions", s.desktopProjectSessions)
	mux.HandleFunc("GET /api/desktop/projects/{projectID}/tasks/{taskID}/history", s.desktopProjectHistory)
	mux.HandleFunc("PUT /api/desktop/projects/{projectID}/tasks/{taskID}", s.desktopBindProjectTask)
	mux.HandleFunc("GET /api/desktop/task-projects/{taskID}", s.desktopGetTaskProject)
}

func (s *Server) desktopListProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := s.m.pg.ListDesktopProjects(r.Context())
	if err != nil {
		writeDesktopProjectError(w, err)
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
		writeDesktopProjectError(w, err)
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

func desktopProjectRouteID(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, http.StatusBadRequest, "无效的 "+name)
		return 0, false
	}
	return id, true
}

func (s *Server) desktopListProjectTasks(w http.ResponseWriter, r *http.Request) {
	projectID, ok := desktopProjectRouteID(w, r, "projectID")
	if !ok {
		return
	}
	var before int64
	if raw := r.URL.Query().Get("before"); raw != "" {
		var err error
		before, err = strconv.ParseInt(raw, 10, 64)
		if err != nil || before <= 0 {
			writeErr(w, http.StatusBadRequest, "无效的任务分页游标")
			return
		}
	}
	tasks, err := s.m.pg.ListDesktopProjectTasks(r.Context(), projectID, before, desktopProjectTaskPageSize+1)
	if err != nil {
		writeDesktopProjectError(w, err)
		return
	}
	var nextBefore *string
	if len(tasks) > desktopProjectTaskPageSize {
		tasks = tasks[:desktopProjectTaskPageSize]
		cursor := strconv.FormatInt(tasks[len(tasks)-1].ID, 10)
		nextBefore = &cursor
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks, "next_before": nextBefore})
}

func (s *Server) desktopGetProjectTask(w http.ResponseWriter, r *http.Request) {
	task, ok := s.readDesktopProjectTask(w, r)
	if ok {
		writeJSON(w, http.StatusOK, task)
	}
}

func (s *Server) readDesktopProjectTask(w http.ResponseWriter, r *http.Request) (db.DesktopProjectTask, bool) {
	projectID, ok := desktopProjectRouteID(w, r, "projectID")
	if !ok {
		return db.DesktopProjectTask{}, false
	}
	taskID, ok := desktopProjectRouteID(w, r, "taskID")
	if !ok {
		return db.DesktopProjectTask{}, false
	}
	task, err := s.m.pg.GetDesktopProjectTask(r.Context(), projectID, taskID)
	if err != nil {
		writeDesktopProjectError(w, err)
		return db.DesktopProjectTask{}, false
	}
	return task, true
}

func (s *Server) desktopBindProjectTask(w http.ResponseWriter, r *http.Request) {
	projectID, ok := desktopProjectRouteID(w, r, "projectID")
	if !ok {
		return
	}
	taskID, ok := desktopProjectRouteID(w, r, "taskID")
	if !ok {
		return
	}
	if err := s.m.pg.BindDesktopProjectTask(r.Context(), projectID, taskID); err != nil {
		writeDesktopProjectError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"project_id": strconv.FormatInt(projectID, 10), "task_id": strconv.FormatInt(taskID, 10)})
}

func (s *Server) desktopGetTaskProject(w http.ResponseWriter, r *http.Request) {
	taskID, ok := desktopProjectRouteID(w, r, "taskID")
	if !ok {
		return
	}
	projectID, err := s.m.pg.DesktopTaskProject(r.Context(), taskID)
	if err != nil {
		writeDesktopProjectError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		ProjectID *int64 `json:"project_id,string"`
	}{projectID})
}

func writeDesktopProjectError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, db.ErrDesktopProjectNotFound), errors.Is(err, db.ErrDesktopTaskNotFound):
		writeErr(w, http.StatusNotFound, err.Error())
	case errors.Is(err, db.ErrDesktopTaskBound):
		writeErr(w, http.StatusConflict, err.Error())
	default:
		writeErr(w, http.StatusInternalServerError, "读取或写入项目数据失败")
	}
}

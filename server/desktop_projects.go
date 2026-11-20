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

	"github.com/zhongxinxuhk/vexnar/db"
)

const desktopProjectTaskPageSize = 50

func (s *Server) registerDesktopProjects(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/desktop/projects", s.desktopListProjects)
	mux.HandleFunc("POST /api/desktop/projects", s.desktopRegisterProject)
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

func (s *Server) desktopRegisterProject(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	var input struct {
		RootPath string `json:"root_path"`
	}
	if err := decode(r, &input); err != nil || !filepath.IsAbs(input.RootPath) {
		writeErr(w, http.StatusBadRequest, "需要项目目录的绝对路径")
		return
	}
	root, err := filepath.EvalSymlinks(filepath.Clean(input.RootPath))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "无法解析项目目录")
		return
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
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

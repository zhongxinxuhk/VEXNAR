package server

import (
	"net/http"
	"strconv"

	"github.com/zhongxinxuhk/vexnar/db"
)

// GET /api/tasks/{id}/metrics —— 任务级效果度量（P0 / R3.5 v1）。
// 只读聚合，口径见 db/metrics.go 与 docs/P0-能力增强方案.md。
func (s *Server) taskMetrics(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid task id")
		return
	}
	if s.m == nil || s.m.pg == nil {
		writeErr(w, 503, "database unavailable")
		return
	}
	m, err := s.m.pg.TaskMetrics(r.Context(), id)
	if err != nil {
		if err == db.ErrTaskNotFound {
			writeErr(w, 404, "task not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, m)
}

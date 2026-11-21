// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/zhongxinxuhk/vexnar/db"
)

// errCommandScopeTaskMissing marks a ?task_id= that names no live task. The
// handler answers 404 instead of quietly returning every task's executions.
var errCommandScopeTaskMissing = errors.New("task not found")

// pgListCommands returns tool executions (any tool) from the activity table.
func (s *Server) pgListCommands(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page := atoiDefault(q.Get("page"), 0)
	size := atoiDefault(q.Get("size"), 50)
	keyword := q.Get("q")

	scope, err := s.commandScope(q.Get("task"), q.Get("task_id"))
	if err != nil {
		writeErr(w, commandScopeStatus(err), err.Error())
		return
	}
	records, total, err := s.m.PG().ListCommands(scope, keyword, page, size)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"commands": records, "total": total})
}

// pgToolStats returns per-tool call counts for the tool-execution history, under
// the same task/keyword filters the list takes — the summary describes the whole
// filtered set, not the page on screen.
func (s *Server) pgToolStats(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	pg := s.m.PG()
	if pg == nil {
		writeJSON(w, 200, map[string]any{"stats": []db.ToolStat{}})
		return
	}
	scope, err := s.commandScope(q.Get("task"), q.Get("task_id"))
	if err != nil {
		writeErr(w, commandScopeStatus(err), err.Error())
		return
	}
	stats, err := pg.ToolStats(scope, q.Get("q"))
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"stats": stats})
}

// commandScope resolves the requested task scope to the exploration id the
// activity table is keyed by.
//
// Two spellings exist because two identities do: activity rows carry
// exploration_id, while tasks and findings carry the task id, and the two
// sequences drift (a task created out of order gets a different exploration).
// ?task_id= is the task id the 任务/发现 surfaces and the workbench use, resolved
// here through the tasks row; ?task= stays the historical exploration id so
// existing callers and bookmarked links keep working.
func (s *Server) commandScope(task, taskID string) (*int64, error) {
	if v := strings.TrimSpace(taskID); v != "" {
		id, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid task_id %q", v)
		}
		task, err := s.m.PG().GetTask(id)
		if err != nil {
			return nil, err
		}
		if task == nil {
			return nil, errCommandScopeTaskMissing
		}
		expID := task.ExplorationID
		return &expID, nil
	}
	return commandTaskFilter(task), nil
}

// commandScopeStatus maps a scope error to a status code: a bad or unknown task
// id is the caller's mistake, anything else is ours.
func commandScopeStatus(err error) int {
	switch {
	case errors.Is(err, errCommandScopeTaskMissing):
		return http.StatusNotFound
	case strings.HasPrefix(err.Error(), "invalid task_id"):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

// commandTaskFilter parses the ?task= exploration id. Absent or unparsable → nil
// (no filter), matching the list endpoint's long-standing lenient behaviour.
func commandTaskFilter(v string) *int64 {
	if v == "" {
		return nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return nil
	}
	return &n
}

// pgListLLMRecords returns paginated LLM call records.
func (s *Server) pgListLLMRecords(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page := atoiDefault(q.Get("page"), 0)
	size := atoiDefault(q.Get("size"), 50)
	model := q.Get("model")
	session := q.Get("session")
	task := q.Get("task")

	records, total, err := s.m.PG().ListLLMRecords(model, session, task, page, size)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"records": records, "total": total})
}

// pgTokenByModel returns a task's LLM token usage grouped by model, from the
// always-on llm_usage metering ledger. Accurate even with per-agent model bindings,
// pool rotation/failover, and interrupted runs (every call is metered on success or
// error). No recording toggle required.
func (s *Server) pgTokenByModel(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("task"))
	if id == "" {
		writeErr(w, 400, "missing task")
		return
	}
	pg := s.m.PG()
	if pg == nil {
		writeJSON(w, 200, map[string]any{"models": []db.ModelTokenStat{}})
		return
	}
	models, err := pg.TokenByModel(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"models": models})
}

// pgUsageStats returns global llm_usage aggregates for the dashboard's "new" token
// view: per-profile totals (all-time) + per-(profile, day) buckets for the daily
// chart. Sourced from the always-on metering ledger, so it is accurate across
// per-agent bindings, pool rotation, and interrupted runs.
func (s *Server) pgUsageStats(w http.ResponseWriter, r *http.Request) {
	pg := s.m.PG()
	if pg == nil {
		writeJSON(w, 200, map[string]any{"by_profile": []db.ProfileUsage{}, "daily": []db.ProfileDayUsage{}})
		return
	}
	days := atoiDefault(r.URL.Query().Get("days"), 365)
	byProfile, err := pg.UsageByProfile()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	daily, err := pg.UsageDaily(days)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"by_profile": byProfile, "daily": daily})
}

// pgLLMTasks returns distinct recorded tasks with counts, for the page's task
// picker (pick a task → filter the list, then delete its conversations).
func (s *Server) pgLLMTasks(w http.ResponseWriter, r *http.Request) {
	tasks, err := s.m.PG().LLMTasks()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"tasks": tasks})
}

// pgDeleteLLMRecords removes all LLM records for one exact task_id (the same
// match the task picker uses). Empty task → 400. Returns rows deleted.
func (s *Server) pgDeleteLLMRecords(w http.ResponseWriter, r *http.Request) {
	task := strings.TrimSpace(r.URL.Query().Get("task"))
	if task == "" {
		writeErr(w, 400, "missing task")
		return
	}
	n, err := s.m.PG().DeleteLLMRecords(task)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": n})
}

// pgGetLLMRecord returns a single LLM record with full request/response bodies.
func (s *Server) pgGetLLMRecord(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	rec, err := s.m.PG().GetLLMRecord(id)
	if err != nil {
		writeErr(w, 404, "not found")
		return
	}
	writeJSON(w, 200, rec)
}

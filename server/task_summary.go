// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"net/http"
	"strings"
	"time"
)

// 任务生命周期——Go 服务端的唯一定义，与 app/vexnar-store/src/task-status.ts 逐条对齐。
//
// 数据库的 tasks.status 是存储事实，paused/queued 是执行开关，组合出来的才是任务
// 状态。此前 Go 按 resolvedTaskStatus 出 paused，TS 核心直接把原始列发出去，客户端
// 又各有一份词表（draft/archived 并不存在，timeout 无人认识），同一个任务在三个界面
// 里可以是三种状态，统计口径随之分裂。
//
// 这张表随 /api/tasks/summary 一起发布，客户端拿它做标签/颜色，不再自己维护第二份。
type TaskLifecycleEntry struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Tone     string `json:"tone"`
	Terminal bool   `json:"terminal"`
	Active   bool   `json:"active"`
	Hint     string `json:"hint"`
}

// TaskLifecycle 是唯一的状态顺序：未终结的在前，终态在后。
var TaskLifecycle = []TaskLifecycleEntry{
	{Key: "created", Label: "待启动", Tone: "muted", Hint: "已创建，引擎还没运行过"},
	{Key: "queued", Label: "排队中", Tone: "info", Active: true, Hint: "等待并发槽位"},
	{Key: "running", Label: "进行中", Tone: "success", Active: true, Hint: "引擎在跑，未暂停"},
	{Key: "paused", Label: "已暂停", Tone: "warn", Hint: "人工暂停，进度保留"},
	{Key: "done", Label: "已完成", Tone: "success", Terminal: true, Hint: "目标达成或引擎正常收尾"},
	{Key: "failed", Label: "失败", Tone: "error", Terminal: true, Hint: "中止或执行错误"},
	{Key: "timeout", Label: "已超时", Tone: "error", Terminal: true, Hint: "超出任务时限，引擎已收尾"},
}

// TaskStatusCounts 是七个状态的计数；键固定，缺省为 0，客户端不必再猜。
type TaskStatusCounts struct {
	Created int `json:"created"`
	Queued  int `json:"queued"`
	Running int `json:"running"`
	Paused  int `json:"paused"`
	Done    int `json:"done"`
	Failed  int `json:"failed"`
	Timeout int `json:"timeout"`
}

// TaskFindingCounts 把任务清单里的漏洞数收成一个对象（含分档合计）。
type TaskFindingCounts struct {
	Total    int `json:"total"`
	Critical int `json:"critical"`
	High     int `json:"high"`
	Medium   int `json:"medium"`
	Low      int `json:"low"`
}

// TaskTokenSummary 是任务清单的 Token 合计（与 TokenTotalDTO 同名同义）。
type TaskTokenSummary struct {
	InputTokens      int `json:"input_tokens"`
	OutputTokens     int `json:"output_tokens"`
	CacheReadTokens  int `json:"cache_read_tokens"`
	CacheWriteTokens int `json:"cache_write_tokens"`
	Total            int `json:"total"`
}

// TaskSummary 是 GET /api/tasks/summary 的响应：概览 KPI、任务健康度、任务面板
// 筛选计数共用这一条聚合，任何界面都不再拿清单（或更糟：当前页）自己重算。
type TaskSummary struct {
	Total          int                  `json:"total"`
	ByStatus       TaskStatusCounts     `json:"by_status"`
	Active         int                  `json:"active"`
	Paused         int                  `json:"paused"`
	Terminal       int                  `json:"terminal"`
	Done           int                  `json:"done"`
	Failed         int                  `json:"failed"`
	Timeout        int                  `json:"timeout"`
	CompletionRate float64              `json:"completion_rate"`
	GoalsTotal     int                  `json:"goals_total"`
	GoalsMet       int                  `json:"goals_met"`
	GoalRate       float64              `json:"goal_rate"`
	InFlight       int                  `json:"in_flight"`
	Findings       TaskFindingCounts    `json:"findings"`
	Tokens         TaskTokenSummary     `json:"tokens"`
	WindowDays     int                  `json:"window_days"`
	CreatedWindow  int                  `json:"created_window"`
	CreatedPrev    int                  `json:"created_prev"`
	Throughput     []int                `json:"throughput"`
	Lifecycle      []TaskLifecycleEntry `json:"lifecycle"`
	GeneratedUnix  int64                `json:"generated_unix"`
}

// taskInventory returns every live task as a DTO with its list metrics applied.
// The list endpoint filters/windows this; the summary endpoint aggregates it, so
// both read the exact same rows and the exact same status resolution.
func (s *Server) taskInventory() []TaskDTO {
	list := s.m.List()
	metrics, _ := s.m.PG().TaskListMetricsAll()
	archiveBlockers, _ := s.m.PG().TaskArchiveBlockers()
	dtos := make([]TaskDTO, 0, len(list))
	for _, t := range list {
		dto := taskDTO(t, s.resolvedTaskStatus(t))
		applyTaskArchiveBlocker(&dto, archiveBlockers)
		metric := metrics[t.ExpID]
		dto.Tokens = tokenTotalDTO(metric.Tokens)
		// prefer the live in-memory heartbeat (fresher) and fall back to the
		// persisted max activity time (survives restarts) for run-duration display.
		dto.LastActivity = metric.LastActivity
		if live := s.engine.LastActivity(t.ID); live > dto.LastActivity {
			dto.LastActivity = live
		}
		dto.GoalsTotal = metric.Goals.Total
		dto.GoalsMet = metric.Goals.Met
		dto.InFlight = metric.RunningIntents
		dto.Findings = FindingSeverityDTO{
			Critical: metric.Findings.Critical,
			High:     metric.Findings.High,
			Medium:   metric.Findings.Medium,
			Low:      metric.Findings.Low,
		}
		dtos = append(dtos, dto)
	}
	return dtos
}

// taskSummary serves GET /api/tasks/summary?days=N.
//
// 口径：
//   - total   活动清单里的任务数（未删除、未归档）
//   - active  queued + running
//   - 完成率  done / total
//   - 目标达成 goals_met / goals_total（只统计真的挂了目标的任务）
//   - 在途意图 所有任务 state=running 的意图之和
//   - 窗口     ?days= 内新建的任务数，以及按天分布（末尾是今天，UTC）
func (s *Server) taskSummary(w http.ResponseWriter, r *http.Request) {
	days := atoiDefault(r.URL.Query().Get("days"), 30)
	if days < 1 {
		days = 30
	}
	// 聚合是纯函数：测试直接喂 DTO 断言口径，不必起引擎。
	writeJSON(w, 200, summarizeTaskDTOs(s.taskInventory(), days, time.Now()))
}

// summarizeTaskDTOs 聚合一张任务清单。参数是**全量**清单：分页聚合出来的数字只
// 描述当前页，那正是任务面板筛选计数一直对不上的原因。
func summarizeTaskDTOs(dtos []TaskDTO, days int, now time.Time) TaskSummary {
	if days < 1 {
		days = 30
	}
	nowUnix := now.Unix()
	day := int64(86400)
	cutoff := nowUnix - int64(days)*day
	prevCutoff := cutoff - int64(days)*day

	summary := TaskSummary{WindowDays: days, Throughput: make([]int, days), Lifecycle: TaskLifecycle, GeneratedUnix: nowUnix}
	bucket := func(status string) *int {
		switch strings.TrimSpace(status) {
		case "created":
			return &summary.ByStatus.Created
		case "queued":
			return &summary.ByStatus.Queued
		case "running":
			return &summary.ByStatus.Running
		case "paused":
			return &summary.ByStatus.Paused
		case "done":
			return &summary.ByStatus.Done
		case "failed":
			return &summary.ByStatus.Failed
		case "timeout":
			return &summary.ByStatus.Timeout
		default:
			// 未识别的状态归到待启动，保证各档之和恒等于 total。
			return &summary.ByStatus.Created
		}
	}
	for _, dto := range dtos {
		*bucket(dto.Status)++
		summary.GoalsTotal += dto.GoalsTotal
		summary.GoalsMet += dto.GoalsMet
		summary.InFlight += dto.InFlight
		summary.Findings.Critical += dto.Findings.Critical
		summary.Findings.High += dto.Findings.High
		summary.Findings.Medium += dto.Findings.Medium
		summary.Findings.Low += dto.Findings.Low
		summary.Tokens.InputTokens += dto.Tokens.InputTokens
		summary.Tokens.OutputTokens += dto.Tokens.OutputTokens
		summary.Tokens.CacheReadTokens += dto.Tokens.CacheReadTokens
		summary.Tokens.CacheWriteTokens += dto.Tokens.CacheWriteTokens

		if dto.CreatedUnix <= 0 {
			continue
		}
		switch {
		case dto.CreatedUnix >= cutoff:
			summary.CreatedWindow++
			ago := int((nowUnix - dto.CreatedUnix) / day)
			if ago < 0 {
				ago = 0
			}
			if ago > days-1 {
				ago = days - 1
			}
			summary.Throughput[days-1-ago]++
		case dto.CreatedUnix >= prevCutoff:
			summary.CreatedPrev++
		}
	}

	summary.Total = len(dtos)
	summary.Findings.Total = summary.Findings.Critical + summary.Findings.High + summary.Findings.Medium + summary.Findings.Low
	summary.Tokens.Total = summary.Tokens.InputTokens + summary.Tokens.OutputTokens
	summary.Active = summary.ByStatus.Queued + summary.ByStatus.Running
	summary.Paused = summary.ByStatus.Paused
	summary.Done = summary.ByStatus.Done
	summary.Failed = summary.ByStatus.Failed
	summary.Timeout = summary.ByStatus.Timeout
	summary.Terminal = summary.Done + summary.Failed + summary.Timeout
	if summary.Total > 0 {
		summary.CompletionRate = float64(summary.Done) / float64(summary.Total) * 100
	}
	if summary.GoalsTotal > 0 {
		summary.GoalRate = float64(summary.GoalsMet) / float64(summary.GoalsTotal) * 100
	}
	return summary
}

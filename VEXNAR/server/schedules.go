// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/zhongxinxuhk/vexnar/db"
)

// scheduleTickInterval 控制到点扫描频率；30s 足够（时间粒度是分钟）。
const scheduleTickInterval = 30 * time.Second

// scheduleFireBatchLimit 单轮最多补跑多少条，避免长时间停机后一次性爆发。
const scheduleFireBatchLimit = 3

// reusedScheduleTitle 复用会话的固定标题；new_chat_each_run=false 时按它找会话。
func reusedScheduleTitle(name string) string { return "定时任务 · " + name }

type scheduleRequest struct {
	Name           string `json:"name"`
	Prompt         string `json:"prompt"`
	Frequency      string `json:"frequency"`
	TimeOfDay      string `json:"time_of_day"`
	RunOnDevice    *bool  `json:"run_on_device"`
	Notify         string `json:"notify"`
	NewChatEachRun *bool  `json:"new_chat_each_run"`
	Model          string `json:"model"`
	Effort         string `json:"effort"`
	AgentKey       string `json:"agent_key"`
	Enabled        *bool  `json:"enabled"`
}

// nextFireAt 计算下一次触发时间（秒级 Unix，本地时区）。
// daily = 每天同一时刻；weekly/monthly 以本次触发为锚点顺延 7 天 / 一个自然月。
func nextFireAt(frequency, timeOfDay string, now time.Time) int64 {
	hh, mm := 9, 0
	if parts := strings.SplitN(timeOfDay, ":", 2); len(parts) == 2 {
		if v, err := strconv.Atoi(strings.TrimSpace(parts[0])); err == nil {
			hh = v
		}
		if v, err := strconv.Atoi(strings.TrimSpace(parts[1])); err == nil {
			mm = v
		}
	}
	candidate := time.Date(now.Year(), now.Month(), now.Day(), hh, mm, 0, 0, now.Location())
	if candidate.Before(now) || candidate.Equal(now) {
		switch frequency {
		case "weekly":
			candidate = candidate.AddDate(0, 0, 7)
		case "monthly":
			candidate = candidate.AddDate(0, 1, 0)
		default:
			candidate = candidate.AddDate(0, 0, 1)
		}
	}
	return candidate.Unix()
}

func (s *Server) schedulesList(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	items, err := pg.ListSchedules()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"schedules": items})
}

func (s *Server) schedulesCreate(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req scheduleRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Prompt) == "" {
		writeErr(w, 400, "任务名称与说明不能为空")
		return
	}
	now := time.Now()
	item := &db.Schedule{
		Name:        req.Name,
		Prompt:      req.Prompt,
		Frequency:   req.Frequency,
		TimeOfDay:   req.TimeOfDay,
		RunOnDevice: req.RunOnDevice == nil || *req.RunOnDevice,
		Notify:      req.Notify,
		NewChatEachRun: func() bool {
			return req.NewChatEachRun != nil && *req.NewChatEachRun
		}(),
		Model:     req.Model,
		Effort:    req.Effort,
		AgentKey:  req.AgentKey,
		Enabled:   true,
		CreatedAt: now.Unix(),
		NextFireAt: nextFireAt(
			req.Frequency, req.TimeOfDay, now,
		),
	}
	created, err := pg.CreateSchedule(item)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, created)
}

func (s *Server) schedulesUpdate(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 404, "任务不存在")
		return
	}
	var req scheduleRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	patch := db.UpdateSchedulePatch{}
	if req.Name != "" {
		patch.Name = &req.Name
	}
	if req.Prompt != "" {
		patch.Prompt = &req.Prompt
	}
	if req.Frequency != "" {
		patch.Frequency = &req.Frequency
	}
	if req.TimeOfDay != "" {
		patch.TimeOfDay = &req.TimeOfDay
	}
	if req.RunOnDevice != nil {
		patch.RunOnDevice = req.RunOnDevice
	}
	if req.Notify != "" {
		patch.Notify = &req.Notify
	}
	if req.NewChatEachRun != nil {
		patch.NewChatEachRun = req.NewChatEachRun
	}
	if req.Model != "" {
		patch.Model = &req.Model
	}
	if req.Effort != "" {
		patch.Effort = &req.Effort
	}
	if req.Enabled != nil {
		patch.Enabled = req.Enabled
		patch.NextFireAt = func() *int64 {
			v := nextFireAt(currentFrequency(req.Frequency), req.TimeOfDay, time.Now())
			return &v
		}()
	}
	updated, err := pg.UpdateSchedule(id, patch)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if updated == nil {
		writeErr(w, 404, "任务不存在")
		return
	}
	writeJSON(w, 200, updated)
}

// currentFrequency 让 PATCH 只传 enabled 时也能推算 next_fire：缺省沿用 daily。
func currentFrequency(frequency string) string {
	if frequency == "weekly" || frequency == "monthly" {
		return frequency
	}
	return "daily"
}

func (s *Server) schedulesDelete(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 404, "任务不存在")
		return
	}
	if err := pg.DeleteSchedule(id); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": id})
}

// runScheduleTicker 每 30s 扫描到点任务。启动时先顺延停机期间错过的触发，
// 避免一周没开机后一次性爆发。
func (s *Server) runScheduleTicker() {
	if s.m.pg == nil {
		return
	}
	if n, err := s.m.pg.ShiftOverdueSchedules(time.Now().Unix()); err != nil {
		log.Printf("[schedules] shift overdue failed: %v", err)
	} else if n > 0 {
		log.Printf("[schedules] shifted %d overdue schedules (missed while offline)", n)
	}
	t := time.NewTicker(scheduleTickInterval)
	defer t.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-t.C:
			s.fireDueSchedules()
		}
	}
}

func (s *Server) fireDueSchedules() {
	pg := s.m.pg
	if pg == nil {
		return
	}
	now := time.Now()
	due, err := pg.DueSchedules(now.Unix(), scheduleFireBatchLimit)
	if err != nil {
		log.Printf("[schedules] due query failed: %v", err)
		return
	}
	for _, item := range due {
		s.fireSchedule(pg, item, now)
	}
}

// fireSchedule 建会话（或复用）并跑一轮对话，然后排下一次触发。
func (s *Server) fireSchedule(pg *db.DB, item *db.Schedule, now time.Time) {
	agentKey := item.AgentKey
	if agentKey == "" {
		// 回落到最近一条会话的 agent —— 定时任务通常跟随当前工作环境。
		if convs, err := pg.ListConversations(); err == nil && len(convs) > 0 {
			agentKey = convs[0].AgentKey
		}
	}
	if agentKey == "" {
		log.Printf("[schedules %d] no agent available, skip", item.ID)
		return
	}
	if a, err := pg.GetAgentByKey(agentKey); err != nil || a == nil {
		log.Printf("[schedules %d] agent %q unavailable, skip", item.ID, agentKey)
		return
	}

	var conv *db.Conversation
	if !item.NewChatEachRun {
		title := reusedScheduleTitle(item.Name)
		if convs, err := pg.ListConversations(); err == nil {
			for _, c := range convs {
				if c.AgentKey == agentKey && c.Title == title {
					conv = c
					break
				}
			}
		}
	}
	if conv == nil {
		created, err := pg.CreateConversation(agentKey, reusedScheduleTitle(item.Name), nil)
		if err != nil {
			log.Printf("[schedules %d] create conversation failed: %v", item.ID, err)
			return
		}
		conv = created
	}

	busyKey := s.convBusyKey(conv.ID)
	s.chatMu.Lock()
	busy := s.chatBusy[busyKey]
	if !busy {
		s.chatBusy[busyKey] = true
	}
	s.chatMu.Unlock()
	if busy {
		log.Printf("[schedules %d] conversation %d busy, skip this tick", item.ID, conv.ID)
		return
	}

	ua := userActivityWithAttachments(agentKey, item.Prompt, nil)
	ua.Summary = firstLine(item.Prompt, 200)
	ua.Detail = item.Prompt
	if _, err := pg.AppendConvActivity(conv.ID, ua); err != nil {
		log.Printf("[schedules %d] append user msg failed: %v", item.ID, err)
	}
	if conv.Title == "" || conv.Title == "新对话" {
		_ = pg.RenameConversation(conv.ID, firstLine(item.Name, 40))
	}
	_ = pg.TouchConversation(conv.ID)
	log.Printf("[schedules %d] firing %q on conversation %d", item.ID, item.Name, conv.ID)
	s.runConversation(conv, item.Prompt, busyKey)

	next := nextFireAt(item.Frequency, item.TimeOfDay, now)
	if err := pg.MarkScheduleFired(item.ID, now.Unix(), next); err != nil {
		log.Printf("[schedules %d] mark fired failed: %v", item.ID, err)
	}
}

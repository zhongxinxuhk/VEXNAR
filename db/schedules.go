// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import (
	"database/sql"
	"errors"
	"strings"
)

// Schedule 是桌面端「定时任务」页的一条配置。到点由 server/schedules.go 的
// ticker 触发：创建（或复用）一条会话并跑一轮 agent 对话。
type Schedule struct {
	ID             int64  `json:"id"`
	Name           string `json:"name"`
	Prompt         string `json:"prompt"`
	Frequency      string `json:"frequency"` // daily | weekly | monthly
	TimeOfDay      string `json:"time_of_day"`
	RunOnDevice    bool   `json:"run_on_device"`
	Notify         string `json:"notify"`
	NewChatEachRun bool   `json:"new_chat_each_run"`
	Model          string `json:"model"`
	Effort         string `json:"effort"`
	AgentKey       string `json:"agent_key"`
	Enabled        bool   `json:"enabled"`
	CreatedAt      int64  `json:"created_at"`
	LastFiredAt    *int64 `json:"last_fired_at,omitempty"`
	NextFireAt     int64  `json:"next_fire_at"`
}

func normalizeSchedule(s *Schedule) {
	s.Name = strings.TrimSpace(s.Name)
	s.Prompt = strings.TrimSpace(s.Prompt)
	s.AgentKey = strings.TrimSpace(s.AgentKey)
	s.Model = strings.TrimSpace(s.Model)
	switch s.Frequency {
	case "daily", "weekly", "monthly":
	default:
		s.Frequency = "daily"
	}
	switch s.Notify {
	case "all", "off":
	default:
		s.Notify = "important"
	}
	switch s.Effort {
	case "low", "medium", "high":
	default:
		s.Effort = "default"
	}
}

const scheduleColumns = `id, name, prompt, frequency, time_of_day, run_on_device, notify,
	new_chat_each_run, model, effort, agent_key, enabled, created_at, last_fired_at, next_fire_at`

func scanSchedule(row interface{ Scan(...any) error }) (*Schedule, error) {
	var s Schedule
	var lastFired *int64
	if err := row.Scan(&s.ID, &s.Name, &s.Prompt, &s.Frequency, &s.TimeOfDay,
		&s.RunOnDevice, &s.Notify, &s.NewChatEachRun, &s.Model, &s.Effort,
		&s.AgentKey, &s.Enabled, &s.CreatedAt, &lastFired, &s.NextFireAt); err != nil {
		return nil, err
	}
	s.LastFiredAt = lastFired
	return &s, nil
}

// ListSchedules returns every schedule, soonest-fire first.
func (d *DB) ListSchedules() ([]*Schedule, error) {
	rows, err := d.Query(`SELECT ` + scheduleColumns + ` FROM schedules ORDER BY next_fire_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Schedule{}
	for rows.Next() {
		s, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// GetSchedule loads one row (nil when missing).
func (d *DB) GetSchedule(id int64) (*Schedule, error) {
	s, err := scanSchedule(d.QueryRow(`SELECT `+scheduleColumns+` FROM schedules WHERE id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// CreateSchedule inserts a new schedule and returns it with its id.
func (d *DB) CreateSchedule(s *Schedule) (*Schedule, error) {
	normalizeSchedule(s)
	if s.Name == "" || s.Prompt == "" {
		return nil, errors.New("任务名称与说明不能为空")
	}
	var id int64
	err := d.QueryRow(`INSERT INTO schedules
		(name, prompt, frequency, time_of_day, run_on_device, notify, new_chat_each_run,
		 model, effort, agent_key, enabled, created_at, next_fire_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
		s.Name, s.Prompt, s.Frequency, s.TimeOfDay, s.RunOnDevice, s.Notify,
		s.NewChatEachRun, s.Model, s.Effort, s.AgentKey, s.Enabled, s.CreatedAt, s.NextFireAt,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	return d.GetSchedule(id)
}

// UpdateSchedulePatch carries optional field updates (nil = keep).
type UpdateSchedulePatch struct {
	Name           *string
	Prompt         *string
	Frequency      *string
	TimeOfDay      *string
	RunOnDevice    *bool
	Notify         *string
	NewChatEachRun *bool
	Model          *string
	Effort         *string
	Enabled        *bool
	NextFireAt     *int64
}

// UpdateSchedule applies the patch and returns the fresh row.
func (d *DB) UpdateSchedule(id int64, patch UpdateSchedulePatch) (*Schedule, error) {
	current, err := d.GetSchedule(id)
	if err != nil || current == nil {
		return current, err
	}
	if patch.Name != nil {
		current.Name = strings.TrimSpace(*patch.Name)
	}
	if patch.Prompt != nil {
		current.Prompt = strings.TrimSpace(*patch.Prompt)
	}
	if patch.Frequency != nil {
		current.Frequency = *patch.Frequency
	}
	if patch.TimeOfDay != nil {
		current.TimeOfDay = *patch.TimeOfDay
	}
	if patch.RunOnDevice != nil {
		current.RunOnDevice = *patch.RunOnDevice
	}
	if patch.Notify != nil {
		current.Notify = *patch.Notify
	}
	if patch.NewChatEachRun != nil {
		current.NewChatEachRun = *patch.NewChatEachRun
	}
	if patch.Model != nil {
		current.Model = strings.TrimSpace(*patch.Model)
	}
	if patch.Effort != nil {
		current.Effort = *patch.Effort
	}
	if patch.Enabled != nil {
		current.Enabled = *patch.Enabled
	}
	normalizeSchedule(current)
	if current.Name == "" || current.Prompt == "" {
		return nil, errors.New("任务名称与说明不能为空")
	}
	if patch.NextFireAt != nil {
		current.NextFireAt = *patch.NextFireAt
	}
	_, err = d.Exec(`UPDATE schedules SET name=$2, prompt=$3, frequency=$4, time_of_day=$5,
		run_on_device=$6, notify=$7, new_chat_each_run=$8, model=$9, effort=$10, enabled=$11, next_fire_at=$12
		WHERE id=$1`, id, current.Name, current.Prompt, current.Frequency, current.TimeOfDay,
		current.RunOnDevice, current.Notify, current.NewChatEachRun, current.Model, current.Effort,
		current.Enabled, current.NextFireAt)
	if err != nil {
		return nil, err
	}
	return d.GetSchedule(id)
}

// DeleteSchedule removes one row (no-op when missing).
func (d *DB) DeleteSchedule(id int64) error {
	_, err := d.Exec(`DELETE FROM schedules WHERE id = $1`, id)
	return err
}

// DueSchedules returns enabled schedules whose fire time has passed.
func (d *DB) DueSchedules(now int64, limit int) ([]*Schedule, error) {
	rows, err := d.Query(`SELECT `+scheduleColumns+` FROM schedules
		WHERE enabled AND next_fire_at <= $1 ORDER BY next_fire_at ASC LIMIT $2`, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Schedule{}
	for rows.Next() {
		s, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// MarkScheduleFired records the run and schedules the next occurrence.
func (d *DB) MarkScheduleFired(id, firedAt, nextFireAt int64) error {
	_, err := d.Exec(`UPDATE schedules SET last_fired_at = $2, next_fire_at = $3 WHERE id = $1`,
		id, firedAt, nextFireAt)
	return err
}

// ShiftOverdueSchedules pushes missed fires into the future without running them
// (startup safety: an app that was off for a week must not fire a week of backlog).
func (d *DB) ShiftOverdueSchedules(now int64) (int64, error) {
	res, err := d.Exec(`UPDATE schedules SET next_fire_at = $2
		WHERE enabled AND next_fire_at < $1`, now, now)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

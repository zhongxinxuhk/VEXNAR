// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/zhongxinxuhk/vexnar/db"
)

const desktopTaskHistorySize = 40

type desktopProjectBranch struct {
	Key    string `json:"key"`
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
}

func desktopHistoryCursor(w http.ResponseWriter, r *http.Request) (int64, bool) {
	raw := r.URL.Query().Get("before")
	if raw == "" {
		return 0, true
	}
	before, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || before < 1 {
		writeErr(w, http.StatusBadRequest, "无效的历史分页游标")
		return 0, false
	}
	return before, true
}

func (s *Server) desktopProjectSessions(w http.ResponseWriter, r *http.Request) {
	task, ok := s.readDesktopProjectTask(w, r)
	if !ok {
		return
	}
	before, ok := desktopHistoryCursor(w, r)
	if !ok {
		return
	}
	store := s.m.pg.Exploration(task.ExplorationID)
	mainSessions, err := store.ListMainSessions()
	if err != nil {
		writeDesktopProjectError(w, err)
		return
	}
	nodes, hasMore, err := store.ListByKindPage(db.KindIntent, before, desktopTaskHistorySize)
	if err != nil {
		writeDesktopProjectError(w, err)
		return
	}
	branches := make([]desktopProjectBranch, 0, len(nodes))
	for _, node := range nodes {
		if node.State == "deleted" {
			continue
		}
		payload := struct{ Summary string }{}
		_ = json.Unmarshal(node.Payload, &payload)
		id := strconv.FormatInt(node.ID, 10)
		branches = append(branches, desktopProjectBranch{Key: "intent:" + id, ID: id, Title: firstLine(payload.Summary, 200), Status: node.State})
	}
	var next *string
	if hasMore {
		cursor := strconv.FormatInt(nodes[len(nodes)-1].ID, 10)
		next = &cursor
	}
	segments := make([]int, 0, len(mainSessions))
	for _, session := range mainSessions {
		segments = append(segments, session.Seq)
	}
	writeJSON(w, http.StatusOK, map[string]any{"main_segments": segments, "branches": branches, "next_before": next})
}

func (s *Server) desktopProjectHistory(w http.ResponseWriter, r *http.Request) {
	task, ok := s.readDesktopProjectTask(w, r)
	if !ok {
		return
	}
	before, ok := desktopHistoryCursor(w, r)
	if !ok {
		return
	}
	key := r.URL.Query().Get("session")
	filter, valid := parseActivitySession(key)
	if !valid || (!filter.Main && filter.NodeID == nil) {
		writeErr(w, http.StatusBadRequest, "无效的会话")
		return
	}
	store := s.m.pg.Exploration(task.ExplorationID)
	if filter.Main {
		current, err := store.CurrentMainSeg()
		if err != nil {
			writeDesktopProjectError(w, err)
			return
		}
		if filter.MainSeg == nil {
			filter.MainSeg = &current
		}
		if *filter.MainSeg > current {
			writeErr(w, http.StatusNotFound, "session not found")
			return
		}
		key = "main:" + strconv.Itoa(*filter.MainSeg)
	} else {
		node, err := store.GetNode(*filter.NodeID)
		if err != nil {
			writeDesktopProjectError(w, err)
			return
		}
		// Direct source tasks may have different project ownership.
		if node == nil || node.Kind != db.KindIntent || node.State == "deleted" {
			writeErr(w, http.StatusNotFound, "session not found")
			return
		}
	}
	items, more, err := store.TranscriptPage(filter, before, desktopTaskHistorySize)
	if err != nil {
		writeDesktopProjectError(w, err)
		return
	}
	type entry struct {
		ID      int64  `json:"id,string"`
		Kind    string `json:"kind"`
		Tool    string `json:"tool,omitempty"`
		Text    string `json:"text"`
		At      string `json:"at"`
		IsError bool   `json:"is_error"`
	}
	history := make([]entry, 0, len(items))
	for _, item := range items {
		history = append(history, entry{ID: item.ID, Kind: item.Kind, Tool: item.Tool, Text: item.Summary, At: rfc3339(item.CreatedAt), IsError: item.IsError})
	}
	var next *string
	if more {
		cursor := strconv.FormatInt(items[0].ID, 10)
		next = &cursor
	}
	writeJSON(w, http.StatusOK, map[string]any{"session_key": key, "items": history, "next_before": next})
}

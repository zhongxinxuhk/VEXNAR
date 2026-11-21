// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	pgdb "github.com/zhongxinxuhk/vexnar/db"
	"github.com/zhongxinxuhk/vexnar/traffic"
)

// defaultRecordingLimit bounds concurrent per-session recording instances. Each
// one is a listener plus MITM state; idle sessions are revoked on task end and by
// the egress idle sweep, so this is a safety net rather than a normal ceiling.
const defaultRecordingLimit = 64

// recordingAddr returns the loopback recording proxy for one session, creating the
// instance on first use.
//
// Capture-on identity works like this: the tool is pointed at a listener that
// belongs to exactly one session, and that listener's upstream is resolved to the
// session's leased node on the egress gateway. Nothing about the request has to
// carry a session header, which is what makes it work for curl/sqlmap/ffuf too.
func (m *Manager) recordingAddr(taskID int64, sessionKey string) (string, error) {
	if m.traffic == nil || !m.TrafficEnabled() {
		return "", errors.New("流量捕获未开启")
	}
	m.pruneStaleRecordings()
	m.recMu.Lock()
	defer m.recMu.Unlock()
	if m.recordings == nil {
		m.recordings = map[string]*traffic.Listener{}
	}
	if l := m.recordings[sessionKey]; l != nil {
		return l.Addr(), nil
	}
	if len(m.recordings) >= defaultRecordingLimit {
		return "", fmt.Errorf("会话录制实例已达上限 %d", defaultRecordingLimit)
	}
	l, err := m.traffic.NewListener(fmt.Sprintf("task:%d", taskID), sessionKey)
	if err != nil {
		return "", err
	}
	l.SetUpstreamResolver(func(ctx context.Context) (*url.URL, error) {
		if m.egress == nil {
			return nil, errors.New("代理池未启用")
		}
		raw, err := m.egress.UpstreamURLFor(sessionKey)
		if err != nil {
			return nil, err
		}
		return url.Parse(raw)
	})
	l.Start()
	m.recordings[sessionKey] = l
	return l.Addr(), nil
}

// pruneStaleRecordings closes listeners whose task is gone or finished. Without
// this a long-lived server would fill the instance ceiling with dead tasks, since
// task deletion is the only other place that closes them.
func (m *Manager) pruneStaleRecordings() {
	prefixID := func(key string) (int64, bool) {
		if !strings.HasPrefix(key, "task-") {
			return 0, false
		}
		rest := strings.TrimPrefix(key, "task-")
		if i := strings.Index(rest, "-"); i > 0 {
			if id, err := strconv.ParseInt(rest[:i], 10, 64); err == nil {
				return id, true
			}
		}
		return 0, false
	}
	var closing []*traffic.Listener
	m.recMu.Lock()
	for key, l := range m.recordings {
		id, ok := prefixID(key)
		if !ok {
			continue
		}
		task, err := m.pg.GetTask(id)
		if err != nil || task == nil || pgdb.IsTerminal(task.Status) {
			closing = append(closing, l)
			delete(m.recordings, key)
		}
	}
	m.recMu.Unlock()
	for _, l := range closing {
		_ = l.Close()
	}
}

// closeRecording drops one session's recording instance.
func (m *Manager) closeRecording(sessionKey string) {
	m.recMu.Lock()
	l := m.recordings[sessionKey]
	delete(m.recordings, sessionKey)
	m.recMu.Unlock()
	if l != nil {
		_ = l.Close()
	}
}

// closeTaskRecordings drops every recording instance of a task. Session keys are
// sanitized ("task:<id>:<role>" → "task-<id>-<role>"), so the prefix is stable.
func (m *Manager) closeTaskRecordings(taskID int64) {
	prefix := fmt.Sprintf("task-%d-", taskID)
	m.recMu.Lock()
	var closing []*traffic.Listener
	for key, l := range m.recordings {
		if strings.HasPrefix(key, prefix) {
			closing = append(closing, l)
			delete(m.recordings, key)
		}
	}
	m.recMu.Unlock()
	for _, l := range closing {
		_ = l.Close()
	}
}

// RecordingCount reports live recording instances (diagnostics/state API).
func (m *Manager) RecordingCount() int {
	m.recMu.Lock()
	defer m.recMu.Unlock()
	return len(m.recordings)
}

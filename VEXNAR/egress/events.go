// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"sync"
	"sync/atomic"
	"time"
)

// Event is one health/pool/session change pushed to SSE subscribers.
type Event struct {
	Type    string    `json:"type"` // node_health | pools_reloaded | session_revoked
	NodeID  int64     `json:"node_id,omitempty"`
	State   string    `json:"state,omitempty"`
	PoolID  int64     `json:"pool_id,omitempty"`
	Message string    `json:"message,omitempty"`
	At      time.Time `json:"at"`
}

type eventBus struct {
	mu   sync.Mutex
	subs map[uint64]chan Event
	seq  atomic.Uint64
}

func (b *eventBus) subscribe() (<-chan Event, func()) {
	ch := make(chan Event, 32)
	b.mu.Lock()
	if b.subs == nil {
		b.subs = map[uint64]chan Event{}
	}
	id := b.seq.Add(1)
	b.subs[id] = ch
	b.mu.Unlock()
	return ch, func() {
		b.mu.Lock()
		delete(b.subs, id)
		b.mu.Unlock()
	}
}

// publish never blocks: a slow SSE consumer loses old events instead of stalling
// a health probe or a pool reload.
func (b *eventBus) publish(ev Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, ch := range b.subs {
		select {
		case ch <- ev:
		default:
		}
	}
}

// Subscribe streams health/pool events; the returned func unsubscribes.
func (m *Manager) Subscribe() (<-chan Event, func()) { return m.events.subscribe() }

func (m *Manager) publish(ev Event) {
	if ev.At.IsZero() {
		ev.At = time.Now()
	}
	m.events.publish(ev)
}

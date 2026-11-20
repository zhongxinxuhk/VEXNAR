// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"log"
	"strings"
	"sync"
	"time"

	"github.com/zhongxinxuhk/vexnar/db"
)

// liveFlushInterval bounds how often a growing answer row is rewritten. Deltas
// arrive much faster than a reader can use them; ~12 writes/s keeps the row
// current without turning one long answer into thousands of UPDATEs.
const liveFlushInterval = 80 * time.Millisecond

// convLiveText implements agent.LiveText for one chat turn: the assistant's text
// lives in a single conversation_activities row that is grown in place. That row
// IS the transcript record for the run (capture_run does not emit a second one),
// so a client that already rendered it only needs to replace its text as it
// grows — no reconciliation between a "live buffer" and the persisted row.
//
// A kind switch (thinking → text, text → thinking) seals the current row and
// starts a new one, which keeps the transcript's one-row-per-step shape.
type convLiveText struct {
	pg     *db.DB
	convID int64
	worker string

	mu       sync.Mutex
	id       int64     // row being written (0 = none)
	kind     string    // "text" | "thinking" of that row
	text     string    // accumulated text of the current run
	written  string    // what the row currently holds
	lastAt   time.Time // last successful write
	created  time.Time // timestamp reported for the live row
	last     string    // sealed text of the most recent text run
	disabled bool      // write failed once — stop hammering the DB this turn
}

func newConvLiveText(pg *db.DB, convID int64, worker string) *convLiveText {
	return &convLiveText{pg: pg, convID: convID, worker: worker}
}

// Push receives the accumulated text of the current run.
func (l *convLiveText) Push(kind, text string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.disabled {
		return
	}
	if l.id != 0 && l.kind != kind {
		l.sealLocked()
	}
	l.kind = kind
	l.text = text
	if l.id == 0 {
		l.created = time.Now()
		id, err := l.pg.AppendConvActivity(l.convID, db.Activity{
			Worker: l.worker, Kind: kind, Summary: liveSummary(text), Detail: text,
		})
		if err != nil {
			log.Printf("[conv %d] stream activity insert failed: %v", l.convID, err)
			l.disabled = true
			return
		}
		l.id, l.written, l.lastAt = id, text, time.Now()
		return
	}
	if time.Since(l.lastAt) < liveFlushInterval {
		return
	}
	l.writeLocked(text)
}

// Finish seals the row being written. The next Push starts a new row. It reports
// whether the run is persisted: false tells capture_run to emit the record itself
// instead of relying on a row that was never stored.
func (l *convLiveText) Finish() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.disabled {
		return false
	}
	// Nothing was streamed for this run (e.g. a non-streaming provider that only
	// reports the terminal message): there is no row, but also nothing to emit.
	if l.id == 0 {
		return true
	}
	l.sealLocked()
	return !l.disabled
}

// LastText is the sealed text of the most recent `text` run; capture_run compares
// it with the terminal answer so the reply is not stored twice.
func (l *convLiveText) LastText() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.last
}

// Snapshot renders the row as it currently stands, for the poll endpoint. ok is
// false once the run has been sealed (the row is then a normal transcript entry).
func (l *convLiveText) Snapshot() (db.Activity, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.id == 0 {
		return db.Activity{}, false
	}
	return db.Activity{
		ID: l.id, Worker: l.worker, Kind: l.kind,
		Summary: liveSummary(l.text), Detail: l.text, CreatedAt: l.created,
	}, true
}

func (l *convLiveText) sealLocked() {
	if l.id == 0 {
		l.kind, l.text = "", ""
		return
	}
	// Always write the last fragment: Push is throttled, so the row can be up to
	// one interval behind and the reader must not lose the tail of the answer.
	if l.text != l.written {
		l.writeLocked(l.text)
	}
	// Only a row that actually holds the text counts as the answer; a failed write
	// leaves LastText empty so capture_run keeps the text in the terminal record.
	if l.kind == "text" && !l.disabled {
		l.last = strings.TrimSpace(l.text)
	}
	l.id, l.kind, l.text, l.written = 0, "", "", ""
}

func (l *convLiveText) writeLocked(text string) {
	if err := l.pg.UpdateConvActivityText(l.convID, l.id, liveSummary(text), text); err != nil {
		log.Printf("[conv %d] stream activity update failed: %v", l.convID, err)
		l.disabled = true
		return
	}
	l.written = text
	l.lastAt = time.Now()
}

// liveSummary is the one-line preview the transcript/list columns expect.
func liveSummary(text string) string { return firstLine(strings.TrimSpace(text), 200) }

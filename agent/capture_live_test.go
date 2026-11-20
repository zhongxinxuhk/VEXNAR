// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package agent

import (
	"context"
	"strings"
	"testing"

	"github.com/Autumn-27/norma/agentcore"
	"github.com/Autumn-27/norma/llm"
	"github.com/zhongxinxuhk/vexnar/db"
)

// captureLiveSink records what a chat surface would render while the run is
// still writing, mirroring the server's row-owning implementation.
type captureLiveSink struct {
	pushes []string // every accumulated text fragment the sink was handed
	seals  int      // rows sealed (one per thinking/text run)
	last   string   // text of the last sealed answer row
	cur    string   // text of the run being written
}

func (s *captureLiveSink) Push(kind, text string) {
	if kind != "text" {
		return
	}
	s.pushes = append(s.pushes, text)
	s.cur = text
}

func (s *captureLiveSink) Finish() bool {
	s.seals++
	if s.cur != "" {
		s.last = strings.TrimSpace(s.cur)
		s.cur = ""
	}
	return true
}

func (s *captureLiveSink) LastText() string { return s.last }

func TestCaptureRunStreamsAnswerThroughLiveSink(t *testing.T) {
	provider := captureUsageProvider{stream: func(_ context.Context, yield func(llm.StreamEvent, error) bool) {
		if !yield(llm.StreamEvent{Type: llm.SEMessageStart, Usage: llm.Usage{InputTokens: 9}}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SETextDelta, Text: "你好"}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SETextDelta, Text: "，我是 Auto。"}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SEMessageDelta, Usage: llm.Usage{OutputTokens: 6}}, nil) {
			return
		}
		yield(llm.StreamEvent{Type: llm.SEMessageStop}, nil)
	}}

	sink := &captureLiveSink{}
	var activities []db.Activity
	session := agentcore.NewSession(agentcore.Options{Provider: provider, MaxTurns: 1})
	defer session.Close()
	final, _, err := captureRunSessionLive(context.Background(), session, "hi",
		func(a db.Activity) { activities = append(activities, a) }, sink)
	if err != nil {
		t.Fatalf("captureRunSessionLive error=%v", err)
	}

	const answer = "你好，我是 Auto。"
	if final != answer {
		t.Fatalf("final=%q, want %q", final, answer)
	}
	// The answer must reach the client while it is being written, not only at the end.
	if len(sink.pushes) < 2 || sink.pushes[len(sink.pushes)-1] != answer {
		t.Fatalf("streamed pushes=%q, want the growing answer", sink.pushes)
	}
	if sink.LastText() != answer {
		t.Fatalf("LastText=%q, want %q", sink.LastText(), answer)
	}
	// The sink owns the transcript row: emitting a text activity too would render
	// the same reply twice.
	for _, activity := range activities {
		if activity.Kind == "text" {
			t.Fatalf("duplicate text activity emitted: %+v", activity)
		}
	}
	// The terminal row still closes the turn and carries usage, but no text copy.
	results := 0
	for _, activity := range activities {
		if activity.Kind != "result" {
			continue
		}
		results++
		if activity.Summary != "" || activity.Detail != "" {
			t.Fatalf("result repeated the streamed answer: %+v", activity)
		}
		if activity.InputTokens == nil || *activity.InputTokens != 9 ||
			activity.OutputTokens == nil || *activity.OutputTokens != 6 {
			t.Fatalf("result usage=%+v, want input=9 output=6", activity)
		}
	}
	if results != 1 {
		t.Fatalf("result activity count=%d, activities=%+v", results, activities)
	}
}

func TestCaptureRunKeepsThinkingOutOfTheAnswerRow(t *testing.T) {
	provider := captureUsageProvider{stream: func(_ context.Context, yield func(llm.StreamEvent, error) bool) {
		if !yield(llm.StreamEvent{Type: llm.SEMessageStart}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SEThinkingDelta, Text: "先看目录"}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SETextDelta, Text: "看完了。"}, nil) {
			return
		}
		yield(llm.StreamEvent{Type: llm.SEMessageStop}, nil)
	}}

	sink := &captureLiveSink{}
	session := agentcore.NewSession(agentcore.Options{Provider: provider, MaxTurns: 1})
	defer session.Close()
	if _, _, err := captureRunSessionLive(context.Background(), session, "ls",
		func(db.Activity) {}, sink); err != nil {
		t.Fatalf("captureRunSessionLive error=%v", err)
	}
	// thinking → text is a kind switch: two rows, so two seals.
	if sink.seals != 2 {
		t.Fatalf("seals=%d, want 2 (thinking row + answer row)", sink.seals)
	}
	if sink.LastText() != "看完了。" {
		t.Fatalf("LastText=%q, want the answer only", sink.LastText())
	}
}

// A run without a sink keeps the historical behaviour: the coalesced tail is
// dropped and the answer is carried by the terminal row (worker/planner traces
// depend on it).
func TestCaptureRunWithoutSinkStillEmitsCoalescedText(t *testing.T) {
	provider := captureUsageProvider{stream: func(_ context.Context, yield func(llm.StreamEvent, error) bool) {
		if !yield(llm.StreamEvent{Type: llm.SEMessageStart}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SETextDelta, Text: "ok"}, nil) {
			return
		}
		yield(llm.StreamEvent{Type: llm.SEMessageStop}, nil)
	}}

	var activities []db.Activity
	_, _, err := captureRun(context.Background(), agentcore.Options{Provider: provider, MaxTurns: 1}, "hi",
		func(a db.Activity) { activities = append(activities, a) })
	if err != nil {
		t.Fatalf("captureRun error=%v", err)
	}
	texts := 0
	results := 0
	for _, activity := range activities {
		switch activity.Kind {
		case "text":
			texts++
		case "result":
			results++
			if activity.Detail != "ok" {
				t.Fatalf("result detail=%q, want the answer", activity.Detail)
			}
		}
	}
	if texts+results != 1 {
		t.Fatalf("text=%d result=%d, want exactly one answer record", texts, results)
	}
}

// brokenLiveSink models a storage failure: it accepts fragments but cannot store
// the row, so captureRun must fall back to emitting the record itself. Losing the
// answer because the transcript row could not be written would be worse than a
// non-streaming turn.
type brokenLiveSink struct{ seals int }

func (s *brokenLiveSink) Push(string, string) {}
func (s *brokenLiveSink) Finish() bool        { s.seals++; return false }
func (s *brokenLiveSink) LastText() string    { return "" }

func TestCaptureRunFallsBackWhenLiveSinkFails(t *testing.T) {
	provider := captureUsageProvider{stream: func(_ context.Context, yield func(llm.StreamEvent, error) bool) {
		if !yield(llm.StreamEvent{Type: llm.SEMessageStart}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SETextDelta, Text: "答案"}, nil) {
			return
		}
		yield(llm.StreamEvent{Type: llm.SEMessageStop}, nil)
	}}

	var activities []db.Activity
	session := agentcore.NewSession(agentcore.Options{Provider: provider, MaxTurns: 1})
	defer session.Close()
	final, _, err := captureRunSessionLive(context.Background(), session, "hi",
		func(a db.Activity) { activities = append(activities, a) }, &brokenLiveSink{})
	if err != nil {
		t.Fatalf("captureRunSessionLive error=%v", err)
	}
	if final != "答案" {
		t.Fatalf("final=%q", final)
	}
	var emitted string
	var result string
	for _, activity := range activities {
		switch activity.Kind {
		case "text":
			emitted = activity.Detail
		case "result":
			result = activity.Detail
		}
	}
	if emitted != "答案" || result != "答案" {
		t.Fatalf("text=%q result=%q, want the answer preserved", emitted, result)
	}
}

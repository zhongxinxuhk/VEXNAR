// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package agent

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Autumn-27/norma/agentcore"
	"github.com/Autumn-27/norma/harness"
	"github.com/Autumn-27/norma/llm"
	"github.com/zhongxinxuhk/vexnar/db"
	"github.com/zhongxinxuhk/vexnar/intercept"
	"github.com/zhongxinxuhk/vexnar/sidequestion"
)

// LiveText is the sink that persists a run's assistant text while the model is
// still writing it. The implementation owns the transcript row: the first Push
// creates it, later Pushes rewrite it in place, Finish seals it. Because that row
// IS the transcript record for the run, captureRun must not emit a second one —
// and the terminal `result` row leaves its text empty when the answer was already
// streamed (see the KindResult branch below).
//
// Worker/planner runs pass nil: they keep the coalesce-then-emit behaviour so the
// console transcript stays one row per step.
type LiveText interface {
	// Push receives the accumulated text of the current run. A kind switch starts
	// a new row (the previous one is sealed by captureRun's flush).
	Push(kind, text string)
	// Finish seals the row being written; the next Push starts a new one. It
	// reports whether the run is now a persisted transcript row: false means the
	// sink could not store it, and captureRun falls back to emitting the record
	// itself so an answer is never lost to a storage failure.
	Finish() bool
	// LastText is the sealed text of the most recent `text` run ("" if none).
	// captureRun compares it with the terminal answer to avoid storing it twice.
	LastText() string
}

// captureRun drives one agent turn-to-completion over Session.Prompt and emits a
// coalesced ActivityRecord per execution step (tool_use / tool_result / text /
// thinking / result). It is shared by every LLM agent in the system (worker,
// planner, …) so their execution is visible instead of a black box — the old
// agentcore.Run discarded every event. The emitted records carry only
// Kind/Tool/ToolUseID/IsError/Summary/Detail; the caller's emit fills in
// IntentID/Worker. Returns the final assistant text + terminal error.
//
// KindText/KindThinking arrive as streaming deltas (one event per fragment); a
// contiguous run is coalesced into a single record so the trace shows whole
// messages, not dozens of fragments. When live != nil the coalesced run is
// written incrementally through that sink instead, so a chat client can render
// the answer as it is written.
func captureRun(ctx context.Context, opts agentcore.Options, input string, emit func(db.Activity)) (string, harness.TerminalReason, error) {
	s := agentcore.NewSession(opts)
	defer s.Close() // release the session's background-task manager (temp dir + processes)
	return captureRunSession(ctx, s, input, emit)
}

// captureRunSession is captureRun over an existing session, so a caller can run
// multiple prompts on the SAME conversation (e.g. a settlement round that reuses
// the worker's accumulated context after the main run hit max_turns).
func captureRunSession(ctx context.Context, s *agentcore.Session, input string, emit func(db.Activity)) (string, harness.TerminalReason, error) {
	return captureRunSessionLive(ctx, s, input, emit, nil)
}

// captureRunSessionLive is captureRunSession with an incremental text sink.
func captureRunSessionLive(ctx context.Context, s *agentcore.Session, input string, emit func(db.Activity), live LiveText) (string, harness.TerminalReason, error) {
	ctx, auditTrace := intercept.WithTrace(ctx, input, approvalHistory(s.Messages()))
	defer auditTrace.Finish()
	var reason harness.TerminalReason
	rec := func(r db.Activity) {
		if r.Kind == "text" || r.Kind == "tool_result" {
			auditTrace.Append(db.InterceptContextEntry{Kind: r.Kind, Tool: r.Tool, ToolUseID: r.ToolUseID, Text: r.Detail, IsError: r.IsError})
		}
		if emit != nil {
			emit(r)
		}
	}
	toolNames := map[string]string{} // tool_use id -> name, to label results

	var tbuf strings.Builder
	var tkind string
	flush := func() {
		if tbuf.Len() == 0 {
			return
		}
		s := strings.TrimSpace(tbuf.String())
		k := tkind
		tbuf.Reset()
		tkind = ""
		if s == "" {
			return
		}
		if live != nil {
			// The row was already written fragment-by-fragment; seal it instead of
			// emitting a duplicate. The intercept audit still needs the finished text.
			if live.Finish() {
				if k == "text" {
					auditTrace.Append(db.InterceptContextEntry{Kind: "text", Text: s})
				}
				return
			}
			// Storage failed — fall through and emit the record the normal way.
		}
		rec(db.Activity{Kind: k, Summary: firstLine(s, 200), Detail: s})
	}
	addDelta := func(kind, text string) {
		if text == "" {
			return
		}
		if tkind != "" && tkind != kind {
			flush()
		}
		tkind = kind
		tbuf.WriteString(text)
		if live != nil {
			live.Push(kind, tbuf.String())
		}
	}
	lastTool := &runTrace{startedAt: time.Now()}
	var lastUsage *llm.Usage

	var finalText string
	var rerr error
	for ev, err := range s.Prompt(ctx, input) {
		if err != nil {
			flush()
			if ctx.Err() != nil { // engine/user cancellation, not a provider failure
				sum, detail := terminalText(ctx, &harness.Terminal{Reason: reason, Err: ctx.Err()}, lastTool)
				rec(activityWithUsage(db.Activity{Kind: "result", Summary: firstLine(sum, 400), Detail: detail}, lastUsage))
				return finalText, reason, ctx.Err()
			}
			rec(activityWithUsage(db.Activity{Kind: "result", IsError: true, Summary: "执行出错: " + err.Error(), Detail: err.Error()}, lastUsage))
			return finalText, reason, err
		}
		switch ev.Kind {
		case harness.KindToolUse:
			if ev.ToolUse == nil {
				continue
			}
			flush()
			toolNames[ev.ToolUse.ID] = ev.ToolUse.Name
			in := string(ev.ToolUse.Input)
			lastTool.start(ev.ToolUse.ID, ev.ToolUse.Name, in)
			auditTrace.Start(ev.ToolUse.ID, ev.ToolUse.Name, ev.ToolUse.Input)
			rec(db.Activity{Kind: "tool_use", Tool: ev.ToolUse.Name, ToolUseID: ev.ToolUse.ID,
				Summary: ev.ToolUse.Name + " " + firstLine(in, 200), Detail: in})
		case harness.KindToolResult:
			if ev.ToolResult == nil {
				continue
			}
			flush()
			out := blocksText(ev.ToolResult.Content)
			lastTool.done(ev.ToolResult.ToolUseID)
			auditTrace.Complete(ev.ToolResult.ToolUseID, out, ev.ToolResult.IsError)
			rec(db.Activity{Kind: "tool_result", Tool: toolNames[ev.ToolResult.ToolUseID], ToolUseID: ev.ToolResult.ToolUseID,
				IsError: ev.ToolResult.IsError, Summary: firstLine(out, 200), Detail: out})
		case harness.KindText:
			addDelta("text", ev.Text)
		case harness.KindThinking:
			addDelta("thinking", ev.Text)
		case harness.KindUsage:
			// live cumulative token usage (per model turn). Emitted as a non-rendered
			// "usage" activity carrying only the token fields; the UI uses the latest
			// one for a running session's live token count. Don't flush() here — the
			// buffered final-answer text must stay for the KindResult de-dup.
			if ev.Usage != nil {
				u := *ev.Usage
				lastUsage = &u
				rec(db.Activity{Kind: "usage",
					InputTokens: &u.InputTokens, OutputTokens: &u.OutputTokens,
					CacheReadTokens: &u.CacheReadTokens, CacheWriteTokens: &u.CacheWriteTokens})
			}
		case harness.KindResult:
			if ev.Terminal != nil {
				if ev.Terminal.Reason != harness.ReasonAbortedStreaming {
					sidequestion.Finish(ctx, ev.Terminal.Messages)
				}
				finalText = ev.Terminal.Text
				reason = ev.Terminal.Reason
				// the buffered tail text usually equals Terminal.Text (final answer);
				// drop it to avoid a duplicate record, the result row carries it.
				if tkind == "text" && strings.TrimSpace(tbuf.String()) == strings.TrimSpace(ev.Terminal.Text) {
					if live == nil {
						tbuf.Reset()
						tkind = ""
					} else if live.Finish() {
						// The sink owns that row — seal it, and keep the intercept
						// audit complete even though nothing is emitted.
						text := strings.TrimSpace(tbuf.String())
						tbuf.Reset()
						tkind = ""
						if text != "" {
							auditTrace.Append(db.InterceptContextEntry{Kind: "text", Text: text})
						}
					}
				}
				flush() // flush any trailing thinking / non-final text
				sum, detail := ev.Terminal.Text, ev.Terminal.Text
				if sum == "" || ev.Terminal.Reason == harness.ReasonAbortedTools || ev.Terminal.Reason == harness.ReasonAbortedStreaming {
					sum, detail = terminalText(ctx, ev.Terminal, lastTool)
				} else if live != nil && live.LastText() == strings.TrimSpace(ev.Terminal.Text) {
					// The answer is already a streamed transcript row — repeating it in
					// the terminal row would render the same reply twice.
					sum, detail = "", ""
				}
				u := ev.Terminal.Usage // cumulative token usage for this session
				rec(db.Activity{Kind: "result", IsError: ev.Terminal.Err != nil,
					Summary: firstLine(sum, 400), Detail: detail,
					InputTokens: &u.InputTokens, OutputTokens: &u.OutputTokens,
					CacheReadTokens: &u.CacheReadTokens, CacheWriteTokens: &u.CacheWriteTokens})
				if ev.Terminal.Err != nil {
					rerr = ev.Terminal.Err
				}
			}
		}
	}
	flush() // safety: any unflushed text if the stream ended without KindResult
	return finalText, reason, rerr
}

func activityWithUsage(activity db.Activity, usage *llm.Usage) db.Activity {
	if usage == nil {
		return activity
	}
	u := *usage
	activity.InputTokens = &u.InputTokens
	activity.OutputTokens = &u.OutputTokens
	activity.CacheReadTokens = &u.CacheReadTokens
	activity.CacheWriteTokens = &u.CacheWriteTokens
	return activity
}

// blocksText concatenates the text of a tool-result's content blocks.
func blocksText(blocks []llm.ContentBlock) string {
	var b strings.Builder
	for _, bl := range blocks {
		if bl.Type == llm.BlockText && bl.Text != "" {
			if b.Len() > 0 {
				b.WriteByte('\n')
			}
			b.WriteString(bl.Text)
		}
	}
	return b.String()
}

// firstLine returns a single-line, rune-capped preview for the summary column.
func firstLine(s string, max int) string {
	s = strings.TrimSpace(s)
	if before, _, found := strings.Cut(s, "\n"); found {
		s = before
	}
	if utf8.RuneCountInString(s) > max {
		s = string([]rune(s)[:max]) + "…"
	}
	return s
}

// Preserve the recorded session's visible messages, excluding thinking blocks.
// This is audit context; the judge receives only bounded, paired execution
// evidence selected from it, never assistant prose or thinking blocks.
func approvalHistory(messages []llm.Message) []db.InterceptContextEntry {
	var entries []db.InterceptContextEntry
	for _, message := range messages {
		for _, block := range message.Content {
			entry := db.InterceptContextEntry{Kind: string(message.Role)}
			switch block.Type {
			case llm.BlockText:
				entry.Text = block.Text
			case llm.BlockToolUse:
				entry.Kind, entry.Tool, entry.ToolUseID, entry.Text = "tool_use", block.Name, block.ID, string(block.Input)
			case llm.BlockToolResult:
				entry.Kind, entry.ToolUseID, entry.Text, entry.IsError = "tool_result", block.ToolUseID, blocksText(block.Content), block.IsError
			default:
				continue
			}
			entries = append(entries, entry)
		}
	}
	return entries
}

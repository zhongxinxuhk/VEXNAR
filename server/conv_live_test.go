// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/zhongxinxuhk/vexnar/agent"
	"github.com/zhongxinxuhk/vexnar/db"
)

func newLiveTestServer(t *testing.T) *Server {
	t.Helper()
	dsn, _, err := db.DSN()
	if err != nil {
		t.Skip("test postgres not configured")
	}
	pg, err := db.Open(dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	t.Cleanup(func() { _ = pg.Close() })
	return &Server{
		ctx:        context.Background(),
		m:          &Manager{pg: pg, dir: t.TempDir(), tasks: map[string]*Task{}},
		chatBusy:   map[string]bool{},
		chatCancel: map[string]context.CancelCauseFunc{},
		chatLive:   map[string]*convLiveText{},
	}
}

func readLivePage(t *testing.T, s *Server, convID int64, query string) map[string]any {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/conversations/%d/messages?%s", convID, query), nil)
	req.SetPathValue("id", fmt.Sprintf("%d", convID))
	rec := httptest.NewRecorder()
	s.pgConversationMessages(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var page map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil {
		t.Fatalf("decode page: %v", err)
	}
	return page
}

// The answer a running turn is still writing has to reach polling clients before
// the turn ends — that row is what `live` carries.
func TestConversationMessagesPublishesLiveAnswer(t *testing.T) {
	s := newLiveTestServer(t)
	conv, err := s.m.pg.CreateConversation("auto", fmt.Sprintf("live-%d", time.Now().UnixNano()), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.m.pg.DeleteConversation(conv.ID) })
	if _, err := s.m.pg.AppendConvActivity(conv.ID, db.Activity{
		Worker: "auto", Kind: "user", Summary: "你好", Detail: "你好",
	}); err != nil {
		t.Fatal(err)
	}

	key := s.convBusyKey(conv.ID)
	live := newConvLiveText(s.m.pg, conv.ID, "auto")
	s.chatMu.Lock()
	s.chatBusy[key] = true
	s.chatLive[key] = live
	s.chatMu.Unlock()

	live.Push("text", "你好！")
	page := readLivePage(t, s, conv.ID, "since=0&detail=1")
	if page["running"] != true {
		t.Fatalf("running=%v, want true", page["running"])
	}
	liveRow, ok := page["live"].(map[string]any)
	if !ok {
		t.Fatalf("live=%v, want the streaming row", page["live"])
	}
	if liveRow["kind"] != "text" || liveRow["detail"] != "你好！" {
		t.Fatalf("live row=%+v", liveRow)
	}
	if seq, _ := liveRow["seq"].(float64); seq <= 0 {
		t.Fatalf("live seq=%v", liveRow["seq"])
	}

	// A fragment that arrives inside the write interval must still be visible:
	// the snapshot reads memory, not the throttled row.
	live.Push("text", "你好！我是 Auto。")
	page = readLivePage(t, s, conv.ID, "since=0&detail=1")
	liveRow = page["live"].(map[string]any)
	if liveRow["detail"] != "你好！我是 Auto。" {
		t.Fatalf("live detail=%q, want the newest fragment", liveRow["detail"])
	}

	// Sealing publishes the final text and stops advertising a live row.
	live.Finish()
	page = readLivePage(t, s, conv.ID, "since=0&detail=1")
	if page["live"] != nil {
		t.Fatalf("live=%v after Finish, want nil", page["live"])
	}
	rows, _, err := s.m.pg.ConvActivityListDetail(conv.ID, 0, 20)
	if err != nil {
		t.Fatal(err)
	}
	textRows := 0
	for _, row := range rows {
		if row.Kind != "text" {
			continue
		}
		textRows++
		if row.Detail != "你好！我是 Auto。" {
			t.Fatalf("sealed row detail=%q, want the final answer", row.Detail)
		}
	}
	if textRows != 1 {
		t.Fatalf("text rows=%d, want exactly one streamed row", textRows)
	}

	// Turn over: no live row, and the transcript still holds the answer.
	s.chatMu.Lock()
	delete(s.chatBusy, key)
	delete(s.chatLive, key)
	s.chatMu.Unlock()
	page = readLivePage(t, s, conv.ID, "since=0&detail=1")
	if page["running"] != false || page["live"] != nil {
		t.Fatalf("running=%v live=%v, want a finished turn", page["running"], page["live"])
	}
	items, _ := page["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("items=%d, want the user turn + the streamed answer", len(items))
	}
}

// A thinking → answer switch has to start a second row, not rewrite the first.
func TestConvLiveTextKindSwitchSealsRows(t *testing.T) {
	s := newLiveTestServer(t)
	conv, err := s.m.pg.CreateConversation("auto", fmt.Sprintf("live-kind-%d", time.Now().UnixNano()), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.m.pg.DeleteConversation(conv.ID) })

	live := newConvLiveText(s.m.pg, conv.ID, "auto")
	live.Push("thinking", "先想一下")
	live.Push("text", "想好了。")
	live.Finish()

	if live.LastText() != "想好了。" {
		t.Fatalf("LastText=%q, want only the answer", live.LastText())
	}
	rows, _, err := s.m.pg.ConvActivityListDetail(conv.ID, 0, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows=%d, want thinking + answer", len(rows))
	}
	if rows[0].Kind != "thinking" || rows[0].Detail != "先想一下" {
		t.Fatalf("thinking row=%+v", rows[0])
	}
	if rows[1].Kind != "text" || rows[1].Detail != "想好了。" {
		t.Fatalf("answer row=%+v", rows[1])
	}
}

func TestConversationMessagesHidesReasoningInHistoryAndLiveTail(t *testing.T) {
	s := newLiveTestServer(t)
	conv, err := s.m.pg.CreateConversation("auto", "reasoning-visibility", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.m.pg.DeleteConversation(conv.ID) })

	key := s.convBusyKey(conv.ID)
	live := newConvLiveText(s.m.pg, conv.ID, "auto")
	s.chatBusy[key] = true
	s.chatLive[key] = live
	live.Push("thinking", "private reasoning")

	for _, query := range []string{"detail=1", "since=0&detail=1"} {
		original := readLivePage(t, s, conv.ID, query)
		projected := readLivePage(t, s, conv.ID, query+"&hide_reasoning=1")
		got, err := json.Marshal(projected)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(got), "private reasoning") {
			t.Fatalf("reasoning leaked for query %q", query)
		}
		if projected["cursor"] != original["cursor"] || projected["running"] != true {
			t.Fatalf("changed stream position or running state for %q", query)
		}
		for _, row := range []map[string]any{
			projected["live"].(map[string]any),
			projected["items"].([]any)[0].(map[string]any),
		} {
			if row["kind"] != "thinking" || row["seq"] == nil || row["summary"] != "" || row["detail"] != nil {
				t.Fatalf("unexpected reasoning marker: %+v", row)
			}
		}
		if original["live"].(map[string]any)["detail"] != "private reasoning" {
			t.Fatal("existing transcript request lost details")
		}
	}

	live.Push("text", "public answer")
	page := readLivePage(t, s, conv.ID, "since=0&detail=1&hide_reasoning=1")
	if page["live"].(map[string]any)["detail"] != "public answer" {
		t.Fatal("reasoning filter changed the answer stream")
	}
	live.Finish()
}

func TestConversationMessagesPaginatesBacklogAfterTurnEnds(t *testing.T) {
	s := newLiveTestServer(t)
	conv, err := s.m.pg.CreateConversation("auto", "large transcript", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.m.pg.DeleteConversation(conv.ID) })
	for i := range 1001 {
		if _, err := s.m.pg.AppendConvActivity(conv.ID, db.Activity{
			Worker: "auto", Kind: "text", Summary: fmt.Sprintf("fragment %d", i),
		}); err != nil {
			t.Fatal(err)
		}
	}

	first := readLivePage(t, s, conv.ID, "since=0")
	items := first["items"].([]any)
	if len(items) != 1000 || first["hasMore"] != true || first["running"] != false {
		t.Fatalf("first page count=%d hasMore=%v running=%v", len(items), first["hasMore"], first["running"])
	}
	if first["cursor"] != items[len(items)-1].(map[string]any)["seq"] {
		t.Fatal("cursor skipped the extra row")
	}
	last := readLivePage(t, s, conv.ID, fmt.Sprintf("since=%.0f", first["cursor"]))
	items = last["items"].([]any)
	if len(items) != 1 || last["hasMore"] != false {
		t.Fatalf("last page count=%d hasMore=%v", len(items), last["hasMore"])
	}
	if got := items[0].(map[string]any)["summary"]; got != "fragment 1000" {
		t.Fatalf("last activity summary=%q", got)
	}
}

func TestConversationMessagesPreservesToolEventTimestampPrecision(t *testing.T) {
	s := newLiveTestServer(t)
	conv, err := s.m.pg.CreateConversation("auto", "tool timestamps", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.m.pg.DeleteConversation(conv.ID) })

	events := []struct {
		kind string
		at   time.Time
	}{
		{"tool_use", time.Date(2026, 11, 20, 10, 0, 0, 125456000, time.UTC)},
		{"tool_result", time.Date(2026, 11, 20, 10, 0, 0, 500456000, time.UTC)},
	}
	for _, event := range events {
		id, err := s.m.pg.AppendConvActivity(conv.ID, db.Activity{
			Kind: event.kind, Worker: "auto", Tool: "read_file", ToolUseID: "read-1",
		})
		if err != nil {
			t.Fatal(err)
		}
		_, err = s.m.pg.Exec("UPDATE conversation_activities SET created_at=$1 WHERE conversation_id=$2 AND id=$3",
			event.at, conv.ID, id)
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, query := range []string{"detail=1", "since=0&detail=1"} {
		page := readLivePage(t, s, conv.ID, query)
		rows := page["items"].([]any)
		if len(rows) != len(events) {
			t.Fatalf("got %d events for %q", len(rows), query)
		}
		for i, row := range rows {
			activity := row.(map[string]any)
			ts, err := time.Parse(time.RFC3339Nano, activity["ts"].(string))
			if err != nil || !ts.Equal(events[i].at) || activity["worker"] != "auto" || activity["tool_use_id"] != "read-1" {
				t.Fatalf("invalid event %d for %q: %+v (parse error=%v)", i, query, activity, err)
			}
		}
	}
}

func TestConversationMessagesTraceLoadsOnlyRedactedToolDetails(t *testing.T) {
	s := newLiveTestServer(t)
	conv, err := s.m.pg.CreateConversation("auto", "trace payload", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.m.pg.DeleteConversation(conv.ID) })

	events := []db.Activity{
		{Worker: "auto", Kind: "thinking", Detail: "private thought"},
		{Worker: "auto", Kind: "tool_use", Tool: "read_file", ToolUseID: "t1",
			Summary: "sensitive summary", Detail: `{"path":"README.md","headers":{"X-API-Key":"fixture-secret"},"nested":[{"password":"fixture-password"}]}`},
		{Worker: "auto", Kind: "tool_result", Tool: "read_file", ToolUseID: "t1",
			Detail: "Authorization: Bearer fixture-bearer\n" + strings.Repeat("long output\n", 2000)},
		{Worker: "auto", Kind: "text", Detail: "public answer"},
	}
	var ids []int64
	for _, event := range events {
		id, err := s.m.pg.AppendConvActivity(conv.ID, event)
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	for _, query := range []string{"trace=1", "since=0&trace=1"} {
		page := readLivePage(t, s, conv.ID, query)
		rows := page["items"].([]any)
		for _, row := range rows[:3] {
			body := row.(map[string]any)
			if body["summary"] != "" || body["detail"] != nil {
				t.Fatalf("trace list leaked a payload for %q: %+v", query, body)
			}
		}
		if rows[3].(map[string]any)["detail"] != "public answer" {
			t.Fatal("trace list omitted the answer")
		}
	}

	fetch := func(seq int64) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/conversations/%d/messages/%d?trace=1", conv.ID, seq), nil)
		req.SetPathValue("id", fmt.Sprint(conv.ID))
		req.SetPathValue("seq", fmt.Sprint(seq))
		rec := httptest.NewRecorder()
		s.pgConversationMsgDetail(rec, req)
		return rec
	}
	for _, seq := range []int64{ids[0], ids[3], 0} {
		if rec := fetch(seq); rec.Code != http.StatusNotFound {
			t.Fatalf("non-tool activity %d returned %d", seq, rec.Code)
		}
	}
	for i, suffix := range []string{"README.md", "long output"} {
		rec := fetch(ids[i+1])
		body := rec.Body.String()
		if rec.Code != http.StatusOK || strings.Contains(body, "fixture-") ||
			!strings.Contains(body, "[REDACTED]") || !strings.Contains(body, suffix) {
			t.Fatalf("unexpected redacted tool response %d", rec.Code)
		}
	}
}

func TestConversationMessagesTraceMasksPrivateKeyAndCredentialFormats(t *testing.T) {
	body := "postgres://fixture:fixture-pass@localhost/log\n" +
		"ghp_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\n" +
		"-----BEGIN PRIVATE KEY-----\nfixture-key\n-----END PRIVATE KEY-----\nreport complete"
	safe := redactTrace(body)
	for _, secret := range []string{"fixture-pass", "ghp_", "fixture-key"} {
		if strings.Contains(safe, secret) {
			t.Fatalf("trace retained %q", secret)
		}
	}
	if !strings.Contains(safe, "postgres://fixture:[REDACTED]@localhost/log") ||
		!strings.Contains(safe, "report complete") {
		t.Fatalf("trace lost surrounding context: %q", safe)
	}
}

func TestConversationMessagesRecordsExplicitStopBeforeExecution(t *testing.T) {
	s := newLiveTestServer(t)
	conv, err := s.m.pg.CreateConversation("auto", "stop before execution", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.m.pg.DeleteConversation(conv.ID) })
	if _, err := s.m.pg.AppendConvActivity(conv.ID, db.Activity{Kind: "user", Detail: "fixture"}); err != nil {
		t.Fatal(err)
	}
	key := s.convBusyKey(conv.ID)
	ctx, cancel := s.conversationRunContext(conv.ID, key)
	cancel(agent.AbortChatStoppedByUser)
	s.runConversationTurn(ctx, cancel, conv, "fixture", key)

	page := readLivePage(t, s, conv.ID, "trace=1")
	rows := page["items"].([]any)
	if len(rows) != 2 {
		t.Fatalf("want one user and one terminal event, got %d", len(rows))
	}
	terminal := rows[1].(map[string]any)
	if terminal["kind"] != "result" || terminal["outcome"] != "cancelled" ||
		terminal["detail"] != nil || page["running"] != false {
		t.Fatalf("unexpected recorded stop: %+v", terminal)
	}
}

func TestConversationMessagesTraceFindsOlderCallAcrossHistoryPages(t *testing.T) {
	s := newLiveTestServer(t)
	conv, err := s.m.pg.CreateConversation("auto", "older tool relationship", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.m.pg.DeleteConversation(conv.ID) })
	appendEvent := func(event db.Activity) int64 {
		t.Helper()
		id, err := s.m.pg.AppendConvActivity(conv.ID, event)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	lookup := func(resultID int64) map[string]any {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet,
			fmt.Sprintf("/api/conversations/%d/messages/%d?trace=1&related_call=1", conv.ID, resultID), nil)
		req.SetPathValue("id", fmt.Sprint(conv.ID))
		req.SetPathValue("seq", fmt.Sprint(resultID))
		rec := httptest.NewRecorder()
		s.pgConversationMsgDetail(rec, req)
		var response map[string]any
		if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &response) != nil {
			t.Fatalf("invalid relationship response: status=%d", rec.Code)
		}
		if strings.Contains(rec.Body.String(), "private-test-data") {
			t.Fatal("relationship lookup disclosed tool payload")
		}
		return response
	}

	appendEvent(db.Activity{Kind: "user"})
	other := appendEvent(db.Activity{Kind: "tool_use", Worker: "other", ToolUseID: "shared"})
	start := appendEvent(db.Activity{Kind: "tool_use", Worker: "auto", Tool: "read_file",
		ToolUseID: "shared", Detail: "private-test-data"})
	result := appendEvent(db.Activity{Kind: "tool_result", Worker: "auto", ToolUseID: "shared"})
	page := readLivePage(t, s, conv.ID, "trace=1&limit=1")
	if rows := page["items"].([]any); len(rows) != 1 || rows[0].(map[string]any)["seq"] != float64(result) {
		t.Fatal("test setup did not place the call outside the visible history page")
	}
	match := lookup(result)
	call, ok := match["call"].(map[string]any)
	if match["relation"] != "linked" || !ok || call["seq"] != float64(start) || call["tool"] != "read_file" {
		t.Fatalf("wrong historical relationship: %+v", match)
	}
	otherResult := appendEvent(db.Activity{Kind: "tool_result", Worker: "", ToolUseID: "shared"})
	if call := lookup(otherResult)["call"].(map[string]any); call["seq"] != float64(other) {
		t.Fatalf("unique open call should match a legacy blank worker: %+v", call)
	}

	appendEvent(db.Activity{Kind: "result"})
	unrelated := appendEvent(db.Activity{Kind: "tool_result", Worker: "other", ToolUseID: "shared"})
	if match := lookup(unrelated); match["relation"] != "unmatched" || match["call"] != nil {
		t.Fatalf("found a call across terminal boundary: %+v", match)
	}
	for range 2 {
		appendEvent(db.Activity{Kind: "tool_use", Worker: "auto", ToolUseID: "duplicate"})
	}
	ambiguous := appendEvent(db.Activity{Kind: "tool_result", Worker: "auto", ToolUseID: "duplicate"})
	if match := lookup(ambiguous); match["relation"] != "ambiguous" || match["call"] != nil {
		t.Fatalf("ambiguous calls should not be linked: %+v", match)
	}
}

func TestConversationMessagesTraceCountsPendingApprovalsWithinConversation(t *testing.T) {
	s := newLiveTestServer(t)
	newConversation := func() int64 {
		t.Helper()
		conv, err := s.m.pg.CreateConversation("auto", "pending approval fixture", nil)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = s.m.pg.DeleteConversation(conv.ID) })
		return conv.ID
	}
	active, other := newConversation(), newConversation()
	createPending := func(id int64) int64 {
		t.Helper()
		approval, err := s.m.pg.CreateInterceptPending(0, id, "", "assistant", "read_file", []byte(`{"path":"fixture-only"}`), "fixture")
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _, _ = s.m.pg.Exec("DELETE FROM intercept_pending WHERE id=$1", approval) })
		return approval
	}
	first := createPending(active)
	createPending(other)
	s.chatBusy[s.convBusyKey(active)] = true
	for _, query := range []string{"trace=1", "trace=1&since=0"} {
		page := readLivePage(t, s, active, query)
		if page["pending_approvals"] != float64(1) {
			t.Fatalf("query %q returned pending count %v", query, page["pending_approvals"])
		}
	}
	if err := s.m.pg.DecideInterceptPending(first, "allowed"); err != nil {
		t.Fatal(err)
	}
	if count := readLivePage(t, s, active, "trace=1&since=0")["pending_approvals"]; count != float64(0) {
		t.Fatalf("approval count after decision=%v", count)
	}
	if count := readLivePage(t, s, active, "since=0")["pending_approvals"]; count != nil {
		t.Fatalf("legacy transcript includes trace-only approval count %v", count)
	}
}

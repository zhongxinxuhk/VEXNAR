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
	"testing"
	"time"

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

func readLivePage(t *testing.T, s *Server, convID int64) map[string]any {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/conversations/%d/messages?since=0&detail=1", convID), nil)
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
	page := readLivePage(t, s, conv.ID)
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
	page = readLivePage(t, s, conv.ID)
	liveRow = page["live"].(map[string]any)
	if liveRow["detail"] != "你好！我是 Auto。" {
		t.Fatalf("live detail=%q, want the newest fragment", liveRow["detail"])
	}

	// Sealing publishes the final text and stops advertising a live row.
	live.Finish()
	page = readLivePage(t, s, conv.ID)
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
	page = readLivePage(t, s, conv.ID)
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

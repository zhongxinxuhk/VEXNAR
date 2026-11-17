package server

import (
	"context"
	"testing"
	"time"

	"github.com/Autumn-27/norma/llm"
	"github.com/zhongxinxuhk/vexnar/db"
)

func stubVerifyProvider(s *Server) {
	setRetestProvider(s, retestProvider{complete: func(context.Context, llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
		return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{llm.TextBlock("本次环境无法复现")}}, "end_turn", llm.Usage{}, nil
	}})
}

// 独立验证会话必须带 purpose=verify，且同一 finding 的活跃会话会被复用。
func TestEnqueueVerificationPurposeAndDedup(t *testing.T) {
	s, fid := newRetestServer(t)
	stubVerifyProvider(s)

	r, created, code, msg := s.enqueueRetest(context.Background(), fid, "自动验证", db.RetestPurposeVerify)
	if msg != "" || code != 200 || !created {
		t.Fatalf("enqueue verify: created=%v code=%d msg=%q", created, code, msg)
	}
	if r.Purpose != db.RetestPurposeVerify {
		t.Fatalf("purpose = %q，期望 %q", r.Purpose, db.RetestPurposeVerify)
	}
	if _, again, _, msg2 := s.enqueueRetest(context.Background(), fid, "", db.RetestPurposeVerify); msg2 != "" || again {
		t.Fatalf("活跃验证应去重：created=%v msg=%q", again, msg2)
	}
	waitRetestIdle(t, s)
}

// 自动验证必须由设置项显式开启；默认关闭时不产生任何会话。
func TestAutoVerifySettingGatesEnqueue(t *testing.T) {
	s, fid := newRetestServer(t)
	stubVerifyProvider(s)
	cleanup := func() { _, _ = s.m.pg.Exec(`DELETE FROM settings WHERE key='finding_auto_verify'`) }
	cleanup()
	t.Cleanup(cleanup)

	if s.findingAutoVerifyEnabled() {
		t.Fatal("默认应为关闭")
	}
	s.enqueueFindingVerification(fid)
	if items, err := s.m.pg.ListFindingRetests(fid); err != nil || len(items) != 0 {
		t.Fatalf("关闭时不应建会话：items=%d err=%v", len(items), err)
	}

	if err := s.m.pg.SetSetting("finding_auto_verify", "true"); err != nil {
		t.Fatal(err)
	}
	s.enqueueFindingVerification(fid)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		items, err := s.m.pg.ListFindingRetests(fid)
		if err != nil {
			t.Fatal(err)
		}
		if len(items) == 1 {
			if items[0].Purpose != db.RetestPurposeVerify {
				t.Fatalf("purpose = %q", items[0].Purpose)
			}
			waitRetestIdle(t, s)
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("开启后 5s 内没有排入独立验证")
}

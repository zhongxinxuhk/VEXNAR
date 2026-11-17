package db

import (
	"context"
	"testing"
)

func openOASTTestDB(t *testing.T) *DB {
	t.Helper()
	dsn, _, err := DSN()
	if err != nil {
		t.Skip("no database configured")
	}
	d, err := Open(dsn)
	if err != nil {
		t.Skipf("database unavailable: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

func TestOASTIssueRecordPoll(t *testing.T) {
	d := openOASTTestDB(t)
	ctx := context.Background()
	s := NewOASTStore(d)

	tok, err := s.Issue(ctx, 0, 0, "unit-test")
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if len(tok.Token) != 32 {
		t.Fatalf("token 长度应为 32 位 hex，得到 %d", len(tok.Token))
	}
	t.Cleanup(func() {
		d.Exec(`DELETE FROM oast_tokens WHERE token=$1`, tok.Token) //nolint:errcheck
	})

	// 未知 token 不得落库。
	ok, err := s.Record(ctx, "00000000000000000000000000000000", OASTHit{Method: "GET", Path: "/x"})
	if err != nil {
		t.Fatalf("record unknown: %v", err)
	}
	if ok {
		t.Fatal("未知 token 不应被接受")
	}

	// 已知 token：记录两次，含超长 body（应截断）。
	long := make([]byte, oastBodyLimit+100)
	for i := range long {
		long[i] = 'a'
	}
	for i := 0; i < 2; i++ {
		ok, err := s.Record(ctx, tok.Token, OASTHit{
			Method: "GET", Host: "vexnar.test", Path: "/probe", Query: "a=1",
			RemoteAddr: "1.2.3.4:5678",
			Headers:    map[string]string{"user-agent": "curl/8"},
			Body:       string(long),
		})
		if err != nil || !ok {
			t.Fatalf("record #%d: ok=%v err=%v", i, ok, err)
		}
	}

	got, err := s.Lookup(ctx, tok.Token)
	if err != nil || got == nil {
		t.Fatalf("lookup: %v", err)
	}
	if got.HitCount != 2 || got.LastHitAt == nil {
		t.Fatalf("计数/时间未更新: %+v", got)
	}

	hits, err := s.Poll(ctx, 0, tok.Token, 0, 10)
	if err != nil {
		t.Fatalf("poll: %v", err)
	}
	if len(hits) != 2 {
		t.Fatalf("命中数 = %d，期望 2", len(hits))
	}
	if len(hits[0].Body) != oastBodyLimit {
		t.Fatalf("body 应截断到 %d，得到 %d", oastBodyLimit, len(hits[0].Body))
	}
	if hits[0].Headers["user-agent"] != "curl/8" {
		t.Fatalf("头未保留: %+v", hits[0].Headers)
	}

	// 增量轮询：after_id 取第一条，应只剩一条。
	rest, err := s.Poll(ctx, 0, tok.Token, hits[0].ID, 10)
	if err != nil {
		t.Fatalf("poll after: %v", err)
	}
	if len(rest) != 1 || rest[0].ID <= hits[0].ID {
		t.Fatalf("增量轮询不正确: %+v", rest)
	}
}

func TestOASTHeaderSanitizeDropsCredentials(t *testing.T) {
	out := SanitizeOASTHeaders(map[string][]string{
		"Authorization": {"Bearer secret"},
		"Cookie":        {"sid=1"},
		"User-Agent":    {"curl/8"},
	})
	if _, bad := out["authorization"]; bad {
		t.Fatal("Authorization 不应落库")
	}
	if _, bad := out["cookie"]; bad {
		t.Fatal("Cookie 不应落库")
	}
	if out["user-agent"] != "curl/8" {
		t.Fatalf("白名单头丢失: %+v", out)
	}
}

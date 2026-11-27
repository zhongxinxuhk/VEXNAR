// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"net/http/httptest"
	"testing"

	"github.com/zhongxinxuhk/vexnar/db"
)

// OAST 公网入口的端到端行为：已签发 token 记录命中，未知 token 404 且不落库。
func TestOASTHandler(t *testing.T) {
	dsn, _, err := db.DSN()
	if err != nil {
		t.Skip("no database configured")
	}
	pg, err := db.Open(dsn)
	if err != nil {
		t.Skipf("database unavailable: %v", err)
	}
	defer pg.Close()

	s := &Server{m: &Manager{pg: pg}}
	tok, err := db.NewOASTStore(pg).Issue(t.Context(), 0, 0, "handler-test")
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	defer pg.Exec(`DELETE FROM oast_tokens WHERE token=$1`, tok.Token) //nolint:errcheck

	h := s.oastHandler()

	req := httptest.NewRequest("GET", "/oast/"+tok.Token+"/probe?x=1", nil)
	req.Header.Set("User-Agent", "vexnar-test")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("known token status = %d，期望 200", rec.Code)
	}

	hits, err := db.NewOASTStore(pg).Poll(t.Context(), 0, tok.Token, 0, 10)
	if err != nil || len(hits) != 1 {
		t.Fatalf("hits = %d err=%v，期望 1", len(hits), err)
	}
	if hits[0].Path != "/probe" || hits[0].Query != "x=1" || hits[0].Headers["user-agent"] != "vexnar-test" {
		t.Fatalf("命中字段不正确: %+v", hits[0])
	}

	unknown := httptest.NewRequest("GET", "/oast/deadbeefdeadbeefdeadbeefdeadbeef/x", nil)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, unknown)
	if rec2.Code != 404 {
		t.Fatalf("unknown token status = %d，期望 404", rec2.Code)
	}
}

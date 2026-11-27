// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestYakHistoryRequiresLocalClient(t *testing.T) {
	t.Setenv("VEXNAR_YAK_HISTORY_CONFIG", "")
	s := &Server{desktopToken: "test-history-token"}
	for _, tc := range []struct {
		remote, token, body string
		want                int
	}{
		{"192.0.2.1:3000", s.desktopToken, `{"action":"sources"}`, 403},
		{"127.0.0.1:3000", "wrong", `{"action":"sources"}`, 403},
		{"127.0.0.1:3000", s.desktopToken, `{"action":"execute"}`, 400},
		{"127.0.0.1:3000", s.desktopToken, `{"action":"sources"}`, 200},
		{"127.0.0.1:3000", s.desktopToken, `{"action":"list","workspace":"/unbound","agent":true}`, 409},
	} {
		r := httptest.NewRequest("POST", "/api/yak/history", strings.NewReader(tc.body))
		r.RemoteAddr = tc.remote
		r.Header.Set(desktopTokenHeader, tc.token)
		w := httptest.NewRecorder()
		s.readYakHistory(w, r)
		if w.Code != tc.want {
			t.Fatalf("%s %s: status %d, want %d", tc.remote, tc.body, w.Code, tc.want)
		}
	}
}

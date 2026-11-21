// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenYakitRequiresTrustedLocalWorkspace(t *testing.T) {
	s := &Server{desktopToken: "launch-token"}

	for _, tc := range []struct {
		name, remote, token, body string
		want                      int
	}{
		{"remote client", "192.0.2.8:8080", "launch-token", `{}`, 403},
		{"unauthenticated", "127.0.0.1:8080", "", `{}`, 403},
		{"relative workspace", "127.0.0.1:8080", "launch-token", `{"workspace":"relative"}`, 400},
		{"malformed body", "127.0.0.1:8080", "launch-token", `{`, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/api/yakit/open", strings.NewReader(tc.body))
			r.RemoteAddr = tc.remote
			r.Header.Set(desktopTokenHeader, tc.token)
			w := httptest.NewRecorder()
			s.openYakit(w, r)
			if w.Code != tc.want {
				t.Fatalf("status %d, want %d", w.Code, tc.want)
			}
		})
	}
}

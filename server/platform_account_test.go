// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

func TestVexnarPlatformAccountAndGateway(t *testing.T) {
	var modelCalls atomic.Int32
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/user/self":
			if r.Header.Get("New-Api-User") != "42" ||
				(r.Header.Get("Cookie") != "session=fixture" && r.Header.Get("Authorization") != "Bearer platform-login") {
				w.WriteHeader(401)
				return
			}
			fmt.Fprint(w, `{"success":true,"data":{"id":42,"username":"fixture"}}`)
		case "/api/token/":
			fmt.Fprint(w, `{"success":true}`)
		case "/api/token/search":
			fmt.Fprintf(w, `{"success":true,"data":{"items":[{"id":17,"name":%q}]}}`, r.URL.Query().Get("keyword"))
		case "/api/token/17/key":
			fmt.Fprint(w, `{"success":true,"data":{"key":"platform-secret"}}`)
		case "/v1/models":
			modelCalls.Add(1)
			if key := r.Header.Get("Authorization"); key != "Bearer sk-platform-secret" && key != "Bearer custom-secret" {
				t.Errorf("unexpected model authorization %q", key)
			}
			fmt.Fprint(w, `{"data":[{"id":"fixture-model"}]}`)
		case "/v1/chat/completions":
			if r.Header.Get("Authorization") != "Bearer custom-secret" || r.Header.Get(desktopTokenHeader) != "" {
				t.Error("the proxy must send only the selected upstream credential")
			}
			w.Header().Set("Content-Type", "text/event-stream")
			fmt.Fprint(w, "data: [DONE]\n\n")
		default:
			http.NotFound(w, r)
		}
	}))
	defer relay.Close()

	st := newPlatformStore(t.TempDir())
	st.platform, st.models = relay.URL, relay.URL+"/v1"
	s := &Server{desktopToken: "host-token", platform: st}
	h := s.Handler()
	request := func(method, path, body, token, addr string, code int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, platformRoutes+path, strings.NewReader(body))
		r.RemoteAddr = addr
		r.Header.Set(desktopTokenHeader, token)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != code {
			t.Fatalf("%s %s: got %d, want %d. %s", method, path, w.Code, code, w.Body)
		}
		return w
	}
	local := "127.0.0.1:12345"
	call := func(method, path, body string, code int) *httptest.ResponseRecorder {
		return request(method, path, body, "host-token", local, code)
	}
	provider := fmt.Sprintf(`{"kind":"custom","name":"Example","base_url":%q,"api_key":"custom-secret"}`, relay.URL+"/v1")
	request("GET", "/account", "", "", local, 401)
	request("GET", "/account", "", "host-token", "192.0.2.50:12345", 401)
	call("POST", "/providers", provider, 401)
	call("POST", "/providers", `{"kind":"deepseek","api_key":"custom-secret"}`, 401)
	call("POST", "/account", `{"user_id":42,"api_key":"sk-platform-secret"}`, 400)
	call("POST", "/account", `{"user_id":43,"cookie":"session=fixture"}`, 401)
	if modelCalls.Load() != 0 {
		t.Fatal("model requests crossed the unauthenticated boundary")
	}
	login := call("POST", "/account", `{"user_id":42,"authorization":"Bearer platform-login"}`, 200)
	if strings.Contains(login.Body.String(), "secret") || !strings.Contains(login.Body.String(), "fixture-model") {
		t.Fatalf("invalid login catalog: %s", login.Body.String())
	}
	info, err := os.Stat(st.path)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("credentials file permissions: %v, %v", info, err)
	}

	result := call("POST", "/providers", provider, 200)
	var status struct {
		SignedIn  bool
		Providers []struct{ ID string }
	}
	if err := json.Unmarshal(result.Body.Bytes(), &status); err != nil || len(status.Providers) != 2 {
		t.Fatalf("invalid provider catalog: %s", result.Body.String())
	}
	// Reopen against the saved state, as after a Go service restart.
	s.platform = &platformStore{path: st.path, platform: st.platform, models: st.models}
	chat := "/openai/" + status.Providers[1].ID + "/v1/chat/completions"
	if got := call("POST", chat, `{"model":"fixture-model","messages":[]}`, 200).Body.String(); got != "data: [DONE]\n\n" {
		t.Fatalf("invalid streaming response %q", got)
	}
	call("DELETE", "/account", "", 200)
	call("POST", chat, `{}`, 401)
	call("POST", "/providers", provider, 401)
	call("POST", "/account", `{"user_id":42,"cookie":"session=fixture"}`, 200)
}

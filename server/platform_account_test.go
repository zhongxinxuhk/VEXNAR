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
		case "/api/status":
			fmt.Fprint(w, `{"success":true,"data":{"password_login_enabled":true}}`)
		case "/api/user/login":
			var input map[string]string
			if json.NewDecoder(r.Body).Decode(&input) != nil || input["username"] != "fixture" || input["password"] != "local-password" {
				fmt.Fprint(w, `{"success":false}`)
				return
			}
			fmt.Fprint(w, `{"success":true,"data":{"flow_token":"fixture-flow"}}`)
		case "/api/user/login/verify":
			var input map[string]string
			if json.NewDecoder(r.Body).Decode(&input) != nil || input["flow_token"] != "fixture-flow" ||
				input["method"] != "2fa" || input["code"] != "123456" {
				fmt.Fprint(w, `{"success":false}`)
				return
			}
			fmt.Fprint(w, `{"success":true,"data":{"user":{"id":42},"access_token":"platform-login"}}`)
		case "/api/user/token":
			if r.Header.Get("New-Api-User") != "42" {
				t.Error("missing verified management identity")
			}
			fmt.Fprint(w, `{"success":true,"data":"management-secret"}`)
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
		case "/v1/responses":
			if r.Header.Get("Authorization") != "Bearer sk-platform-secret" || r.Header.Get(desktopTokenHeader) != "" {
				t.Error("Responses request did not isolate the model credential")
			}
			w.Header().Set("Content-Type", "text/event-stream")
			fmt.Fprint(w, "event: response.completed\ndata: {}\n\n")
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
	call("POST", "/login/password", `{"username":"fixture","password":"wrong"}`, 401)
	pending := call("POST", "/login/password", `{"username":"fixture","password":"local-password"}`, 202)
	var challenge struct{ Challenge string }
	if json.Unmarshal(pending.Body.Bytes(), &challenge) != nil || challenge.Challenge == "" ||
		strings.Contains(pending.Body.String(), "fixture-flow") {
		t.Fatal("native login must return only the opaque challenge handle")
	}
	call("POST", "/login/verify", `{"challenge":"wrong","code":"123456"}`, 409)
	call("POST", "/login/verify", fmt.Sprintf(`{"challenge":%q,"code":"000000"}`, challenge.Challenge), 401)
	login := call("POST", "/login/verify", fmt.Sprintf(`{"challenge":%q,"code":"123456"}`, challenge.Challenge), 200)
	if body := login.Body.String(); strings.Contains(body, "secret") || !strings.Contains(body, "fixture-model") ||
		!strings.Contains(body, `"access_token_ready":true`) || !strings.Contains(body, `"format":"openai-responses"`) ||
		!strings.Contains(body, `"ready":true`) {
		t.Fatalf("invalid login catalog: %s", body)
	}
	call("POST", "/login/verify", fmt.Sprintf(`{"challenge":%q,"code":"123456"}`, challenge.Challenge), 409)
	call("POST", "/openai/vexnar/v1/chat/completions", "{}", 409)
	if got := call("POST", "/openai/vexnar/v1/responses", `{"model":"fixture-model","input":"hello"}`, 200); !strings.Contains(got.Body.String(), "response.completed") {
		t.Fatalf("invalid Responses streaming response: %s", got.Body)
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
	stored, err := st.read()
	if err != nil {
		t.Fatal(err)
	}
	stored.CredentialVersion = 0
	stored.AccessToken = ""
	if err := st.save(stored); err != nil {
		t.Fatal(err)
	}
	if migration := call("GET", "/account", "", 200).Body.String(); !strings.Contains(migration, `"reauth_required":true`) ||
		!strings.Contains(migration, `"ready":false`) {
		t.Fatalf("expected the previous binding to require reauthorization: %s", migration)
	}
	call("POST", "/openai/vexnar/v1/responses", "{}", 401)
	reauth := call("POST", "/account", `{"user_id":42,"authorization":"Bearer platform-login"}`, 200)
	if !strings.Contains(reauth.Body.String(), status.Providers[1].ID) {
		t.Fatal("reauthorizing the same account must retain its custom model")
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

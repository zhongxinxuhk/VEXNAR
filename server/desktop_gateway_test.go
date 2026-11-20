// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zhongxinxuhk/vexnar/agent"
)

func TestDesktopAuthorizedRequiresTokenAndLoopback(t *testing.T) {
	s := &Server{desktopToken: "secret-token"}
	req := httptest.NewRequest(http.MethodGet, "/api/desktop/llm", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	if s.desktopAuthorized(req) {
		t.Fatal("missing token must not authorize")
	}
	req.Header.Set(desktopTokenHeader, "wrong-token")
	if s.desktopAuthorized(req) {
		t.Fatal("wrong token must not authorize")
	}
	req.Header.Set(desktopTokenHeader, "secret-token")
	if !s.desktopAuthorized(req) {
		t.Fatal("valid loopback token should authorize")
	}
	req.RemoteAddr = "192.0.2.10:1234"
	if s.desktopAuthorized(req) {
		t.Fatal("non-loopback request must not authorize")
	}
}

func TestDesktopGatewayForwardsModelsAndChat(t *testing.T) {
	var seenAuth string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		switch r.URL.Path {
		case "/v1/models":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"data":[{"id":"model-a"}]}`)
		case "/v1/chat/completions":
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n")
			_, _ = io.WriteString(w, "data: [DONE]\n\n")
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	s := &Server{
		llmOn:        true,
		desktopToken: "secret-token",
		llmCfg:       agent.ConfigFrom("openai", "model-a", upstream.URL+"/v1", "upstream-key", ""),
	}

	modelsReq := httptest.NewRequest(http.MethodGet, "/api/desktop/llm/models", nil)
	modelsReq.RemoteAddr = "127.0.0.1:1234"
	modelsReq.Header.Set(desktopTokenHeader, "secret-token")
	modelsRec := httptest.NewRecorder()
	s.desktopListModels(modelsRec, modelsReq)
	if modelsRec.Code != http.StatusOK || !strings.Contains(modelsRec.Body.String(), "model-a") {
		t.Fatalf("models status=%d body=%s", modelsRec.Code, modelsRec.Body.String())
	}
	if seenAuth != "Bearer upstream-key" {
		t.Fatalf("upstream auth=%q", seenAuth)
	}

	chatReq := httptest.NewRequest(
		http.MethodPost,
		"/api/desktop/openai/v1/chat/completions",
		strings.NewReader(`{"model":"model-a","stream":true,"messages":[{"role":"user","content":"hi"}]}`),
	)
	chatReq.RemoteAddr = "127.0.0.1:1234"
	chatReq.Header.Set(desktopTokenHeader, "secret-token")
	chatReq.Header.Set("Content-Type", "application/json")
	chatRec := httptest.NewRecorder()
	s.desktopChatProxy(chatRec, chatReq)
	if chatRec.Code != http.StatusOK || !strings.Contains(chatRec.Body.String(), "\"ok\"") {
		t.Fatalf("chat status=%d body=%s", chatRec.Code, chatRec.Body.String())
	}
	if seenAuth != "Bearer upstream-key" {
		t.Fatalf("proxy auth=%q", seenAuth)
	}
}

func TestDesktopConfigurePersistsAndProxies(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer m.Close()
	td := t.TempDir()
	s := New(context.Background(), m, td, td, td)
	s.desktopToken = "secret-token"
	h := s.Handler()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/models" {
			_, _ = io.WriteString(w, `{"data":[{"id":"persisted-model"}]}`)
			return
		}
		if r.URL.Path == "/v1/chat/completions" {
			_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"persisted\"}}]}\n\n")
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/desktop/llm/configure", strings.NewReader(
		`{"provider":"openai","model":"persisted-model","base_url":"`+upstream.URL+`/v1","api_key":"upstream-key"}`,
	))
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set(desktopTokenHeader, "secret-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("configure status=%d body=%s", rec.Code, rec.Body.String())
	}

	modelsReq := httptest.NewRequest(http.MethodGet, "/api/desktop/llm/models", nil)
	modelsReq.RemoteAddr = "127.0.0.1:1234"
	modelsReq.Header.Set(desktopTokenHeader, "secret-token")
	modelsRec := httptest.NewRecorder()
	h.ServeHTTP(modelsRec, modelsReq)
	if modelsRec.Code != http.StatusOK || !strings.Contains(modelsRec.Body.String(), "persisted-model") {
		t.Fatalf("models status=%d body=%s", modelsRec.Code, modelsRec.Body.String())
	}
}

func TestDesktopPreferencesRejectInvalidModes(t *testing.T) {
	for _, mode := range []string{"", "allow-all", "FULL"} {
		if validDesktopAccess(mode) {
			t.Fatalf("invalid mode accepted: %s", mode)
		}
		s := &Server{}
		req := httptest.NewRequest(http.MethodPut, "/api/desktop/preferences", strings.NewReader(`{"access_mode":"`+mode+`"}`))
		rec := httptest.NewRecorder()
		s.desktopPutPreferences(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status=%d", rec.Code)
		}
	}
	for _, mode := range []string{"request", "balanced", "full"} {
		if !validDesktopAccess(mode) {
			t.Fatalf("valid mode rejected: %s", mode)
		}
	}
}

func TestDesktopGatewayPreservesImageContentAndStripsApproval(t *testing.T) {
	seen := make(chan string, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(desktopApprovalHeader) != "" || r.Header.Get(desktopTokenHeader) != "" {
			t.Error("private desktop headers reached upstream")
		}
		body, _ := io.ReadAll(r.Body)
		seen <- string(body)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer upstream.Close()
	s := &Server{llmOn: true, llmCfg: agent.ConfigFrom("openai", "vision", upstream.URL+"/v1", "fixture-key", "")}
	body := `{"model":"vision","messages":[{"role":"user","content":[{"type":"text","text":"describe"},{"type":"image_url","image_url":{"url":"data:image/png;base64,aGVsbG8="}}]}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/desktop/openai/v1/chat/completions", strings.NewReader(body))
	req.Header.Set(desktopApprovalHeader, "1")
	req.Header.Set(desktopTokenHeader, "local-token")
	rec := httptest.NewRecorder()
	s.desktopChatProxy(rec, req)
	if rec.Code != 200 {
		t.Fatal(rec.Code, rec.Body.String())
	}
	if got := <-seen; got != body {
		t.Fatal("gateway changed multimodal body")
	}
}

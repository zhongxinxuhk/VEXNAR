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

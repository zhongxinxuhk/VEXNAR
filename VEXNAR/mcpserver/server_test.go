// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package mcpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testToken = "test-token"

func testServer() *Server {
	return &Server{
		Token:   testToken,
		Version: "v-test",
		Tools: []Tool{
			{
				Name:        "echo",
				Description: "Echo the message back.",
				InputSchema: map[string]any{
					"type":       "object",
					"properties": map[string]any{"message": map[string]any{"type": "string"}},
				},
				Call: func(_ context.Context, args json.RawMessage) (Result, error) {
					var in struct {
						Message string `json:"message"`
					}
					_ = json.Unmarshal(args, &in)
					return TextResult(in.Message), nil
				},
			},
			{
				Name:        "boom",
				Description: "Panics on purpose.",
				Call: func(context.Context, json.RawMessage) (Result, error) {
					panic("boom")
				},
			},
		},
	}
}

func post(t *testing.T, s *Server, token, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(body))
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	var payload map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &payload)
	return rec, payload
}

func TestInitialize(t *testing.T) {
	rec, payload := post(t, testServer(), testToken, `{"jsonrpc":"2.0","id":1,"method":"initialize"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	result, ok := payload["result"].(map[string]any)
	if !ok {
		t.Fatalf("missing result: %v", payload)
	}
	if result["protocolVersion"] != ProtocolVersion {
		t.Fatalf("protocolVersion = %v", result["protocolVersion"])
	}
	info, _ := result["serverInfo"].(map[string]any)
	if info["name"] != "vexnar" || info["version"] != "v-test" {
		t.Fatalf("serverInfo = %v", info)
	}
}

func TestNotificationAcceptedWithoutBody(t *testing.T) {
	rec, _ := post(t, testServer(), testToken, `{"jsonrpc":"2.0","method":"notifications/initialized"}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", rec.Code)
	}
	if strings.TrimSpace(rec.Body.String()) != "" {
		t.Fatalf("notification body = %q, want empty", rec.Body.String())
	}
}

func TestToolsList(t *testing.T) {
	_, payload := post(t, testServer(), testToken, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
	result, _ := payload["result"].(map[string]any)
	tools, _ := result["tools"].([]any)
	if len(tools) != 2 {
		t.Fatalf("tools = %v", result["tools"])
	}
	first, _ := tools[0].(map[string]any)
	if first["name"] != "echo" {
		t.Fatalf("first tool = %v", first)
	}
	if _, ok := first["inputSchema"].(map[string]any); !ok {
		t.Fatalf("inputSchema missing: %v", first)
	}
}

func TestToolsCall(t *testing.T) {
	_, payload := post(t, testServer(), testToken,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"echo","arguments":{"message":"hi"}}}`)
	result, _ := payload["result"].(map[string]any)
	if result["isError"] != false {
		t.Fatalf("isError = %v", result["isError"])
	}
	content, _ := result["content"].([]any)
	if len(content) != 1 {
		t.Fatalf("content = %v", result["content"])
	}
	block, _ := content[0].(map[string]any)
	if block["type"] != "text" || block["text"] != "hi" {
		t.Fatalf("block = %v", block)
	}
}

func TestToolsCallUnknown(t *testing.T) {
	rec, payload := post(t, testServer(), testToken, `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"nope"}}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	errObj, _ := payload["error"].(map[string]any)
	if errObj["code"] != float64(-32602) {
		t.Fatalf("error = %v", payload)
	}
}

func TestToolPanicBecomesErrorResult(t *testing.T) {
	rec, payload := post(t, testServer(), testToken, `{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"boom"}}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	result, _ := payload["result"].(map[string]any)
	if result["isError"] != true {
		t.Fatalf("panic result = %v", payload)
	}
}

func TestUnauthorized(t *testing.T) {
	rec, payload := post(t, testServer(), "", `{"jsonrpc":"2.0","id":6,"method":"tools/list"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if _, ok := payload["error"].(map[string]any); !ok {
		t.Fatalf("payload = %v", payload)
	}
}

func TestDisabledWithoutToken(t *testing.T) {
	s := testServer()
	s.Token = ""
	rec, _ := post(t, s, "", `{"jsonrpc":"2.0","id":7,"method":"tools/list"}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestRejectsRemoteCaller(t *testing.T) {
	s := testServer()
	req := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(`{"jsonrpc":"2.0","id":8,"method":"tools/list"}`))
	req.RemoteAddr = "203.0.113.9:5000"
	req.Header.Set("Authorization", "Bearer "+testToken)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}

	s.AllowRemote = true
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("allow-remote status = %d, want 200", rec.Code)
	}
}

func TestGetMethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set("Authorization", "Bearer "+testToken)
	rec := httptest.NewRecorder()
	testServer().Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestParseError(t *testing.T) {
	rec, payload := post(t, testServer(), testToken, `{`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", rec.Code)
	}
	errObj, _ := payload["error"].(map[string]any)
	if errObj["code"] != float64(-32700) {
		t.Fatalf("payload = %v", payload)
	}
}

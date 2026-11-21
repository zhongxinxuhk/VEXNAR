// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

// Package mcpserver implements the transport half of an MCP server: a
// Streamable HTTP endpoint speaking JSON-RPC 2.0 for initialize, tools/list and
// tools/call. Tools are supplied by the caller, so the package stays free of
// domain dependencies and can be tested without PostgreSQL.
//
// Wire contract: POST /mcp with `Accept: application/json` (or event-stream).
// The server answers unary JSON-RPC responses; it does not initiate messages,
// so GET returns 405 and no SSE stream is opened.
package mcpserver

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
)

// ProtocolVersion is the MCP revision this server implements.
const ProtocolVersion = "2025-06-18"

// Tool is one callable capability exposed over MCP.
type Tool struct {
	Name        string
	Title       string
	Description string
	InputSchema map[string]any
	// Call receives the raw JSON arguments and returns the tool result. A tool
	// execution failure belongs in Result.IsError; returning error is reserved
	// for transport-level faults.
	Call func(ctx context.Context, args json.RawMessage) (Result, error)
}

// Content is one MCP content block.
type Content struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// Result is a tool outcome as MCP models it.
type Result struct {
	Content           []Content
	StructuredContent any
	IsError           bool
}

// TextResult wraps plain text.
func TextResult(text string) Result {
	return Result{Content: []Content{{Type: "text", Text: text}}}
}

// ErrorResult wraps a tool-level failure that the model should read and retry.
func ErrorResult(text string) Result {
	return Result{Content: []Content{{Type: "text", Text: text}}, IsError: true}
}

// Server is the HTTP handler for one MCP endpoint.
type Server struct {
	// Token guards every request. Empty disables the endpoint entirely.
	Token string
	// AllowRemote permits non-loopback callers. Loopback is the default because
	// the agent client normally runs on the same machine.
	AllowRemote bool
	// Version and Name are reported by initialize.
	Version string
	Name    string
	Tools   []Tool
	Logger  *log.Logger
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

// Handler returns the endpoint handler.
func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(s.serve)
}

func (s *Server) serve(w http.ResponseWriter, r *http.Request) {
	if s.Token == "" {
		http.NotFound(w, r)
		return
	}
	if !s.authorized(r) {
		w.Header().Set("WWW-Authenticate", `Bearer realm="vexnar-mcp"`)
		writeJSON(w, http.StatusUnauthorized, rpcResponse{
			JSONRPC: "2.0", ID: json.RawMessage("null"),
			Error: &rpcError{Code: -32001, Message: "unauthorized"},
		})
		return
	}
	if !s.AllowRemote && !isLoopback(r.RemoteAddr) {
		writeJSON(w, http.StatusForbidden, rpcResponse{
			JSONRPC: "2.0", ID: json.RawMessage("null"),
			Error: &rpcError{Code: -32001, Message: "loopback only"},
		})
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: -32700, Message: "read body"}})
		return
	}
	var req rpcRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: -32700, Message: "parse error"}})
		return
	}
	if strings.TrimSpace(req.Method) == "" {
		writeJSON(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: req.ID, Error: &rpcError{Code: -32600, Message: "invalid request"}})
		return
	}

	// A notification (no id) is acknowledged without a JSON-RPC body.
	if len(req.ID) == 0 {
		w.WriteHeader(http.StatusAccepted)
		return
	}

	resp := s.dispatch(r.Context(), req)
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) dispatch(ctx context.Context, req rpcRequest) rpcResponse {
	resp := rpcResponse{JSONRPC: "2.0", ID: req.ID}
	switch req.Method {
	case "initialize":
		resp.Result = map[string]any{
			"protocolVersion": ProtocolVersion,
			"capabilities": map[string]any{
				"tools": map[string]any{"listChanged": false},
			},
			"serverInfo": map[string]any{
				"name":    s.name(),
				"version": s.Version,
			},
		}
	case "ping":
		resp.Result = map[string]any{}
	case "tools/list":
		list := make([]map[string]any, 0, len(s.Tools))
		for _, tool := range s.Tools {
			entry := map[string]any{
				"name":        tool.Name,
				"description": tool.Description,
				"inputSchema": schemaOrEmpty(tool.InputSchema),
			}
			if tool.Title != "" {
				entry["title"] = tool.Title
			}
			list = append(list, entry)
		}
		resp.Result = map[string]any{"tools": list}
	case "tools/call":
		var params struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &params); err != nil || params.Name == "" {
			resp.Error = &rpcError{Code: -32602, Message: "invalid params: name required"}
			return resp
		}
		tool, ok := s.tool(params.Name)
		if !ok {
			resp.Error = &rpcError{Code: -32602, Message: "unknown tool: " + params.Name}
			return resp
		}
		start := time.Now()
		result, err := s.call(ctx, tool, params.Arguments)
		if err != nil {
			resp.Error = &rpcError{Code: -32603, Message: err.Error()}
			return resp
		}
		s.logCall(tool.Name, start, result.IsError)
		payload := map[string]any{
			"content": result.Content,
			"isError": result.IsError,
		}
		if result.StructuredContent != nil {
			payload["structuredContent"] = result.StructuredContent
		}
		resp.Result = payload
	default:
		resp.Error = &rpcError{Code: -32601, Message: "method not found: " + req.Method}
	}
	return resp
}

func (s *Server) call(ctx context.Context, tool Tool, raw json.RawMessage) (result Result, err error) {
	defer func() {
		if r := recover(); r != nil {
			// A panicking tool is a tool-level failure, not a protocol fault:
			// the model gets an isError result it can read and retry.
			err = nil
			result = ErrorResult("tool panicked")
			s.logf("[mcp] tool %s panicked: %v", tool.Name, r)
		}
	}()
	if len(raw) == 0 || string(raw) == "null" {
		raw = json.RawMessage("{}")
	}
	return tool.Call(ctx, raw)
}

func (s *Server) tool(name string) (Tool, bool) {
	for _, tool := range s.Tools {
		if tool.Name == name {
			return tool, true
		}
	}
	return Tool{}, false
}

func (s *Server) name() string {
	if s.Name == "" {
		return "vexnar"
	}
	return s.Name
}

func (s *Server) authorized(r *http.Request) bool {
	if s.Token == "" {
		return false
	}
	got := ""
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		got = strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	if got == "" {
		got = strings.TrimSpace(r.Header.Get("X-VEXNAR-MCP-Token"))
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(s.Token)) == 1
}

func (s *Server) logCall(tool string, start time.Time, isError bool) {
	if s.Logger == nil {
		return
	}
	s.Logger.Printf("[mcp] tool=%s error=%t elapsed=%s", tool, isError, time.Since(start).Round(time.Millisecond))
}

func (s *Server) logf(format string, args ...any) {
	if s.Logger != nil {
		s.Logger.Printf(format, args...)
	}
}

func isLoopback(remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		host = remote
	}
	if host == "" {
		return false
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return ip.IsLoopback()
}

func schemaOrEmpty(schema map[string]any) map[string]any {
	if schema == nil {
		return map[string]any{"type": "object", "properties": map[string]any{}}
	}
	return schema
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

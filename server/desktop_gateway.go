// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"crypto/subtle"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/zhongxinxuhk/vexnar/agent"
)

const desktopTokenHeader = "X-VEXNAR-Desktop-Token"

// Upstream wire paths. The profile stores only the API root; the provider (and
// this gateway) append the endpoint path.
const (
	llmPathChatCompletions = "/chat/completions"
	llmPathResponses       = "/responses"
)

// desktopManagedProfileName is the llm_profiles row the signed-in desktop app
// owns. Naming it after the provider makes the source obvious on the web page
// and in the app, which both read the same row from PostgreSQL.
const desktopManagedProfileName = "newapi"

// normalizeLLMBaseURL keeps only the API root for the given provider so the
// value stored in PostgreSQL is exactly what the operator should type —
// https://api.sec.hn.cn/v1, never .../v1/responses.
func normalizeLLMBaseURL(provider, raw string) string {
	return agent.NormalizeBaseURL(provider, raw)
}

// desktopAuthorized accepts only the random per-launch token issued by the
// Electron supervisor, and only from loopback. An empty configured token
// disables the entire /api/desktop namespace.
func (s *Server) desktopAuthorized(r *http.Request) bool {
	if s.desktopToken == "" || len(r.Header.Get(desktopTokenHeader)) != len(s.desktopToken) {
		return false
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || (host != "127.0.0.1" && host != "::1") {
		return false
	}
	return subtle.ConstantTimeCompare(
		[]byte(r.Header.Get(desktopTokenHeader)),
		[]byte(s.desktopToken),
	) == 1
}

// validReasoningEffort reports whether v is one of the levels the providers
// understand. Empty means "do not send the field", which stays a valid choice.
func validReasoningEffort(v string) bool {
	switch v {
	case "", "low", "medium", "high", "xhigh", "max":
		return true
	}
	return false
}

func (s *Server) desktopLLMStatus() map[string]any {
	s.cfgMu.Lock()
	defer s.cfgMu.Unlock()
	return map[string]any{
		"configured":       s.llmOn,
		"provider":         s.llmCfg.Provider(),
		"format":           s.llmCfg.Provider(),
		"model":            s.llmCfg.Model,
		"base_url":         s.llmCfg.BaseURL,
		"key_set":          s.llmCfg.APIKey != "",
		"reasoning_effort": s.llmCfg.ReasoningEffort,
		"thinking_type":    s.llmCfg.ThinkingType,
	}
}

func (s *Server) desktopGetLLM(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, s.desktopLLMStatus())
}

// desktopGetLLMKey lets the Electron main process copy the managed key to the
// clipboard without ever sending it to the renderer.
func (s *Server) desktopGetLLMKey(w http.ResponseWriter, _ *http.Request) {
	s.cfgMu.Lock()
	key := s.llmCfg.APIKey
	s.cfgMu.Unlock()
	if key == "" {
		writeErr(w, 409, "尚未配置模型 API Key")
		return
	}
	writeJSON(w, 200, map[string]any{"api_key": key})
}

// desktopConfigureLLM sets the provider used by both the desktop agent gateway
// and the pentest backend. Empty fields keep the current value, which lets the
// renderer switch models without ever receiving the upstream API key.
func (s *Server) desktopConfigureLLM(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider string `json:"provider"`
		Model    string `json:"model"`
		BaseURL  string `json:"base_url"`
		APIKey   string `json:"api_key"`
		// 思考强度/开关只在显式传入时覆盖；否则沿用激活配置里的值，避免切换
		// 模型（syncModel 只发 model）时把操作员调好的强度悄悄清空。
		ReasoningEffort *string `json:"reasoning_effort"`
		ThinkingType    *string `json:"thinking_type"`
	}
	if err := decode(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}

	s.cfgMu.Lock()
	current := s.llmCfg
	s.cfgMu.Unlock()

	provider := strings.TrimSpace(req.Provider)
	if provider == "" {
		if current.Provider() == "openai" || current.Provider() == "openai-responses" {
			// 只切换模型/强度时沿用当前协议。
			provider = current.Provider()
		} else {
			// Responses 是平台的默认协议：只有 /v1/responses 提供完整的推理与
			// 工具能力；Chat Completions 作为旧端点兼容分支保留，需显式选择。
			provider = "openai-responses"
		}
	}
	switch provider {
	case "openai", "openai-responses":
	default:
		writeErr(w, 400, "桌面网关只支持 openai / openai-responses 协议")
		return
	}

	// 只接受 API 根地址：协议路径由 provider 自己拼接，存成 .../v1/responses
	// 会让后续请求变成 .../v1/responses/responses。
	baseURL := ""
	if raw := strings.TrimSpace(req.BaseURL); raw != "" {
		baseURL = normalizeLLMBaseURL(provider, raw)
	}
	if baseURL == "" {
		baseURL = current.BaseURL
	}
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = current.Model
	}
	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		apiKey = current.APIKey
	}
	if baseURL == "" || model == "" || apiKey == "" {
		writeErr(w, 400, "base_url、model 和 api_key 不能为空")
		return
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		writeErr(w, 400, "base_url 无效")
		return
	}

	cfg := agent.ConfigFrom(provider, model, baseURL, apiKey, "")
	cfg.Stream = true
	if req.ReasoningEffort != nil {
		effort := strings.TrimSpace(*req.ReasoningEffort)
		if !validReasoningEffort(effort) {
			writeErr(w, 400, "reasoning_effort 必须是 low / medium / high / xhigh / max 或空")
			return
		}
		cfg.ReasoningEffort = effort
	} else {
		cfg.ReasoningEffort = current.ReasoningEffort
	}
	if req.ThinkingType != nil {
		thinking := strings.TrimSpace(*req.ThinkingType)
		switch thinking {
		case "", "disabled", "enabled":
			cfg.ThinkingType = thinking
		default:
			writeErr(w, 400, "thinking_type 必须是 disabled / enabled 或空")
			return
		}
	} else {
		cfg.ThinkingType = current.ThinkingType
	}
	if _, err := cfg.NewProvider(); err != nil {
		writeErr(w, 400, "provider init failed: "+err.Error())
		return
	}
	if err := s.saveLLMConfig(cfg, desktopManagedProfileName); err != nil {
		writeErr(w, 500, "持久化模型配置失败: "+err.Error())
		return
	}
	s.invalidateProfileAgents()
	if err := s.applyLLM(cfg); err != nil {
		writeErr(w, 500, "应用模型配置失败: "+err.Error())
		return
	}
	writeJSON(w, 200, s.desktopLLMStatus())
}

// desktopClearLLM is called on logout: it drops the in-memory provider and the
// persisted upstream key so a logged-out desktop cannot keep making model calls.
func (s *Server) desktopClearLLM(w http.ResponseWriter, _ *http.Request) {
	s.cfgMu.Lock()
	s.llmCfg = agent.Config{}
	s.llmOn = false
	s.cfgMu.Unlock()
	if s.m != nil && s.m.pg != nil {
		if err := s.m.pg.ClearActiveProfileAPIKey(); err != nil {
			writeErr(w, 500, "清除模型凭据失败: "+err.Error())
			return
		}
	}
	s.invalidateProfileAgents()
	writeJSON(w, 200, s.desktopLLMStatus())
}

func (s *Server) desktopListModels(w http.ResponseWriter, r *http.Request) {
	s.cfgMu.Lock()
	cfg := s.llmCfg
	on := s.llmOn
	s.cfgMu.Unlock()
	if !on || cfg.BaseURL == "" || cfg.APIKey == "" {
		writeErr(w, 409, "模型服务尚未配置")
		return
	}
	base := strings.TrimRight(cfg.BaseURL, "/")
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, base+"/models", nil)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		writeErr(w, 502, "读取模型列表失败: "+err.Error())
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// desktopChatProxy forwards to the Chat Completions endpoint of a profile that
// declares the "openai" wire format.
func (s *Server) desktopChatProxy(w http.ResponseWriter, r *http.Request) {
	s.desktopProtocolProxy(w, r, llmPathChatCompletions, "openai")
}

// desktopResponsesProxy forwards to the Responses endpoint. This is the default
// path for a NewAPI-managed profile: the platform exposes its full reasoning and
// tool surface only on /v1/responses.
func (s *Server) desktopResponsesProxy(w http.ResponseWriter, r *http.Request) {
	s.desktopProtocolProxy(w, r, llmPathResponses, "openai-responses")
}

// desktopProtocolProxy is the single OpenAI-compatible streaming gateway. The
// desktop agent runtime talks to this endpoint; only the Go process sees the
// upstream base URL and API key. The requested route must match the profile's
// wire format — silently forwarding a Responses body to /chat/completions (or the
// reverse) produces an opaque 400 from the upstream.
func (s *Server) desktopProtocolProxy(w http.ResponseWriter, r *http.Request, upstreamPath, wantFormat string) {
	if s.desktopAccessMode() == "request" && r.Header.Get(desktopApprovalHeader) != "1" {
		writeErr(w, 403, "当前访问模式要求先批准模型联网请求")
		return
	}
	s.cfgMu.Lock()
	cfg := s.llmCfg
	on := s.llmOn
	s.cfgMu.Unlock()
	if !on || cfg.BaseURL == "" || cfg.APIKey == "" {
		writeErr(w, 409, "模型服务尚未配置")
		return
	}
	if got := cfg.Provider(); got != wantFormat {
		writeErr(w, 409, "当前激活配置的协议是 "+got+"，请改用对应的网关端点")
		return
	}
	proxyDesktopLLM(w, r, cfg.BaseURL, cfg.APIKey, upstreamPath)
}

func proxyDesktopLLM(w http.ResponseWriter, r *http.Request, baseURL, apiKey, upstreamPath string) {
	base := strings.TrimRight(baseURL, "/")
	target, err := url.Parse(base + upstreamPath)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		// The reverse proxy joins the request path onto the target path by
		// default; this gateway always forwards to the fixed upstream route.
		req.URL.Path = target.Path
		req.URL.RawQuery = target.RawQuery
		req.Host = target.Host
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Del(desktopTokenHeader)
		req.Header.Del(desktopApprovalHeader)
	}
	proxy.FlushInterval = -1
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		writeErr(w, 502, "上游模型请求失败: "+err.Error())
	}
	proxy.ServeHTTP(w, r)
}

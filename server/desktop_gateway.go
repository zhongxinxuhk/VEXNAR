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

func (s *Server) desktopLLMStatus() map[string]any {
	s.cfgMu.Lock()
	defer s.cfgMu.Unlock()
	return map[string]any{
		"configured": s.llmOn,
		"provider":   s.llmCfg.Provider(),
		"model":      s.llmCfg.Model,
		"base_url":   s.llmCfg.BaseURL,
		"key_set":    s.llmCfg.APIKey != "",
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
	}
	if err := decode(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	provider := strings.TrimSpace(req.Provider)
	if provider == "" {
		provider = "openai"
	}
	if provider != "openai" {
		writeErr(w, 400, "桌面网关当前只支持 OpenAI 兼容协议")
		return
	}

	s.cfgMu.Lock()
	current := s.llmCfg
	s.cfgMu.Unlock()

	baseURL := strings.TrimSpace(req.BaseURL)
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
	if _, err := cfg.NewProvider(); err != nil {
		writeErr(w, 400, "provider init failed: "+err.Error())
		return
	}
	if err := s.saveLLMConfig(cfg); err != nil {
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

// desktopChatProxy is an OpenAI-compatible streaming gateway. The desktop
// agent runtime talks to this endpoint; only the Go process sees the upstream
// base URL and API key.
func (s *Server) desktopChatProxy(w http.ResponseWriter, r *http.Request) {
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
	if cfg.Provider() != "openai" {
		writeErr(w, 400, "桌面推理网关需要 OpenAI 兼容模型")
		return
	}
	base := strings.TrimRight(cfg.BaseURL, "/")
	target, err := url.Parse(base + "/chat/completions")
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
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
		req.Header.Del(desktopTokenHeader)
		req.Header.Del(desktopApprovalHeader)
	}
	proxy.FlushInterval = -1
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		writeErr(w, 502, "上游模型请求失败: "+err.Error())
	}
	proxy.ServeHTTP(w, r)
}

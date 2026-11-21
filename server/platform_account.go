// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const platformRoutes = "/api/desktop/vexnar"

const platformSessionDuration = 30 * 24 * time.Hour

type platformModel struct {
	ID   string `json:"id"`
	Name string `json:"name,omitempty"`
}

type platformProvider struct {
	ID     string          `json:"id"`
	Name   string          `json:"name"`
	Base   string          `json:"base"`
	Key    string          `json:"key"`
	Models []platformModel `json:"models"`
}

type platformAccount struct {
	UserID    int64              `json:"user_id"`
	Username  string             `json:"username"`
	Expires   time.Time          `json:"expires_at"`
	Providers []platformProvider `json:"providers"`
}

func (account platformAccount) signedIn() bool {
	return account.UserID > 0 && time.Now().Before(account.Expires)
}

type platformStore struct {
	mu       sync.Mutex
	path     string
	platform string
	models   string
}

func newPlatformStore(dataDir string) *platformStore {
	platform := os.Getenv("VEXNAR_NEWAPI_PLATFORM")
	if platform == "" {
		platform = "https://platform.sec.hn.cn"
	}
	models := os.Getenv("VEXNAR_NEWAPI_API")
	if models == "" {
		models = "https://api.sec.hn.cn"
	}
	return &platformStore{
		path: filepath.Join(dataDir, "vexnar-platform.json"), platform: strings.TrimRight(platform, "/"),
		models: strings.TrimSuffix(strings.TrimRight(models, "/"), "/v1") + "/v1",
	}
}

func (st *platformStore) read() (account platformAccount, err error) {
	data, err := os.ReadFile(st.path)
	if errors.Is(err, os.ErrNotExist) {
		return account, nil
	}
	if err == nil {
		err = json.Unmarshal(data, &account)
	}
	return account, err
}

// Readers see either the complete previous state or the complete replacement.
func (st *platformStore) save(account platformAccount) error {
	dir := filepath.Dir(st.path)
	tmp, err := os.CreateTemp(dir, ".vexnar-platform-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	writeErr := json.NewEncoder(tmp).Encode(account)
	closeErr := tmp.Close()
	if err := errors.Join(writeErr, closeErr); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), st.path)
}

var platformHTTP = &http.Client{
	Timeout: 15 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

func platformRequest(ctx context.Context, method, endpoint string, headers http.Header, input, output any) bool {
	var body io.Reader
	if input != nil {
		encoded, err := json.Marshal(input)
		if err != nil {
			return false
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return false
	}
	req.Header = headers.Clone()
	req.Header.Set("Accept", "application/json")
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := platformHTTP.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	return res.StatusCode/100 == 2 && json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(output) == nil
}

func readPlatformModels(ctx context.Context, base, key string) []platformModel {
	var result struct {
		Data []platformModel `json:"data"`
	}
	headers := http.Header{"Authorization": {"Bearer " + key}}
	if !platformRequest(ctx, http.MethodGet, base+"/models", headers, nil, &result) {
		return nil
	}
	models := make([]platformModel, 0, len(result.Data))
	seen := map[string]bool{}
	for _, model := range result.Data {
		if strings.TrimSpace(model.ID) != "" && !seen[model.ID] {
			seen[model.ID] = true
			models = append(models, model)
		}
	}
	return models
}

func platformID() string {
	return rand.Text()
}

func (st *platformStore) verifiedProvider(ctx context.Context, cookie, authorization string, userID int64) (platformAccount, int, string) {
	var result struct {
		Success bool `json:"success"`
		Data    struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
		} `json:"data"`
	}
	headers := make(http.Header)
	headers.Set("Cookie", cookie)
	headers.Set("Authorization", authorization)
	headers.Set("New-Api-User", strconv.FormatInt(userID, 10))
	call := func(method, path string, input, output any) bool {
		return platformRequest(ctx, method, st.platform+path, headers, input, output)
	}
	if !call(http.MethodGet, "/api/user/self", nil, &result) ||
		!result.Success || result.Data.ID != userID || result.Data.Username == "" {
		return platformAccount{}, 401, "HXSEC AI Platform 登录尚未完成或已失效"
	}
	account := platformAccount{UserID: userID, Username: result.Data.Username, Expires: time.Now().Add(platformSessionDuration)}
	name := "VEXNAR-" + platformID()
	var created struct{ Success bool }
	payload := map[string]any{"name": name, "unlimited_quota": true, "remain_quota": 0, "expired_time": account.Expires.Unix()}
	if !call(http.MethodPost, "/api/token/", payload, &created) || !created.Success {
		return account, 200, ""
	}
	var list struct {
		Success bool
		Data    struct {
			Items []struct {
				ID   int64
				Name string
			}
		}
	}
	if !call(http.MethodGet, "/api/token/search?keyword="+url.QueryEscape(name), nil, &list) || !list.Success {
		return account, 200, ""
	}
	for _, item := range list.Data.Items {
		if item.ID <= 0 || item.Name != name {
			continue
		}
		tokenPath := "/api/token/" + strconv.FormatInt(item.ID, 10)
		var token struct {
			Success bool
			Data    struct{ Key string }
		}
		if call(http.MethodPost, tokenPath+"/key", nil, &token) && token.Success && token.Data.Key != "" {
			key := token.Data.Key
			if !strings.HasPrefix(key, "sk-") {
				key = "sk-" + key
			}
			if models := readPlatformModels(ctx, st.models, key); len(models) > 0 {
				account.Providers = []platformProvider{{ID: "vexnar", Name: "HXSEC AI Platform", Base: st.models, Key: key, Models: models}}
				return account, 200, ""
			}
		}
		var deleted struct{ Success bool }
		call(http.MethodDelete, tokenPath, nil, &deleted)
		return account, 200, ""
	}
	return account, 200, ""
}

func sendPlatformAccount(w http.ResponseWriter, account platformAccount) {
	type publicProvider struct {
		ID     string          `json:"id"`
		Name   string          `json:"name"`
		Models []platformModel `json:"models"`
	}
	providers := []publicProvider{}
	signedIn := account.signedIn()
	username := ""
	if signedIn {
		username = account.Username
		for _, provider := range account.Providers {
			providers = append(providers, publicProvider{provider.ID, provider.Name, provider.Models})
		}
	}
	writeJSON(w, 200, map[string]any{"signed_in": signedIn, "username": username, "providers": providers})
}

func (s *Server) platformLogin(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Cookie        string `json:"cookie"`
		Authorization string `json:"authorization"`
		UserID        int64  `json:"user_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if decode(r, &request) != nil || request.UserID <= 0 || (request.Cookie == "" && !strings.HasPrefix(request.Authorization, "Bearer ")) {
		writeErr(w, 400, "无效的平台登录会话")
		return
	}
	st := s.platform
	st.mu.Lock()
	defer st.mu.Unlock()
	previous, err := st.read()
	if err != nil {
		writeErr(w, 500, "读取 VEXNAR 账号失败")
		return
	}
	if previous.signedIn() {
		writeErr(w, 409, "请先退出当前 VEXNAR 账号")
		return
	}
	account, status, message := st.verifiedProvider(r.Context(), request.Cookie, request.Authorization, request.UserID)
	if status != 200 {
		writeErr(w, status, message)
		return
	}
	if previous.UserID == account.UserID {
		for _, provider := range previous.Providers {
			if provider.ID != "vexnar" {
				account.Providers = append(account.Providers, provider)
			}
		}
	}
	if err := st.save(account); err != nil {
		writeErr(w, 500, "保存 VEXNAR 账号失败")
		return
	}
	sendPlatformAccount(w, account)
}

func (s *Server) platformStatus(w http.ResponseWriter, _ *http.Request) {
	account, err := s.platform.read()
	if err != nil {
		writeErr(w, 500, "读取 VEXNAR 账号失败")
		return
	}
	sendPlatformAccount(w, account)
}

func (s *Server) platformLogout(w http.ResponseWriter, _ *http.Request) {
	st := s.platform
	st.mu.Lock()
	defer st.mu.Unlock()
	if err := os.Remove(st.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		writeErr(w, 500, "退出 VEXNAR 账号失败")
		return
	}
	sendPlatformAccount(w, platformAccount{})
}

func (s *Server) platformAddProvider(w http.ResponseWriter, r *http.Request) {
	st := s.platform
	previous, err := st.read()
	if err != nil {
		writeErr(w, 500, "读取 VEXNAR 账号失败")
		return
	}
	if !previous.signedIn() {
		writeErr(w, 401, "请先登录 VEXNAR 账号")
		return
	}
	var request struct {
		Kind string `json:"kind"`
		Name string `json:"name"`
		Base string `json:"base_url"`
		Key  string `json:"api_key"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if decode(r, &request) != nil || strings.TrimSpace(request.Key) == "" {
		writeErr(w, 400, "请输入 API Key")
		return
	}
	provider := platformProvider{Key: strings.TrimSpace(request.Key)}
	switch request.Kind {
	case "platform":
		provider.ID, provider.Name, provider.Base = "vexnar", "HXSEC AI Platform", st.models
	case "deepseek":
		provider.ID, provider.Name, provider.Base = "deepseek", "DeepSeek", "https://api.deepseek.com/v1"
	case "custom":
		provider.ID = "custom-" + strings.ToLower(platformID())
		provider.Name = strings.TrimSpace(request.Name)
		provider.Base = normalizeLLMBaseURL("openai", request.Base)
		base, err := url.Parse(provider.Base)
		if err != nil || (base.Scheme != "https" && base.Scheme != "http") ||
			base.Hostname() == "" || base.User != nil || base.Fragment != "" || base.RawQuery != "" || provider.Name == "" {
			writeErr(w, 400, "请输入名称和有效的 OpenAI 兼容 API 根地址")
			return
		}
	default:
		writeErr(w, 400, "未知的模型提供方")
		return
	}
	provider.Models = readPlatformModels(r.Context(), provider.Base, provider.Key)
	if len(provider.Models) == 0 {
		writeErr(w, 422, "无法读取模型列表，请检查 API 地址和 API Key")
		return
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	account, err := st.read()
	if err != nil {
		writeErr(w, 500, "读取 VEXNAR 账号失败")
		return
	}
	if !account.signedIn() || account.UserID != previous.UserID || !account.Expires.Equal(previous.Expires) {
		writeErr(w, 401, "VEXNAR 登录状态已变化，请重试")
		return
	}
	for i, existing := range account.Providers {
		if existing.ID == provider.ID {
			account.Providers = append(account.Providers[:i], account.Providers[i+1:]...)
			break
		}
	}
	account.Providers = append(account.Providers, provider)
	if err := st.save(account); err != nil {
		writeErr(w, 500, "保存模型提供方失败")
		return
	}
	sendPlatformAccount(w, account)
}

func (s *Server) platformRemoveProvider(w http.ResponseWriter, r *http.Request) {
	st := s.platform
	st.mu.Lock()
	defer st.mu.Unlock()
	account, err := st.read()
	if err != nil {
		writeErr(w, 500, "读取 VEXNAR 账号失败")
		return
	}
	if !account.signedIn() {
		writeErr(w, 401, "请先登录 VEXNAR 账号")
		return
	}
	id := r.PathValue("provider")
	for i, provider := range account.Providers {
		if provider.ID == id && id != "vexnar" {
			account.Providers = append(account.Providers[:i], account.Providers[i+1:]...)
			if err := st.save(account); err != nil {
				writeErr(w, 500, "移除模型提供方失败")
				return
			}
			sendPlatformAccount(w, account)
			return
		}
	}
	writeErr(w, 404, "模型提供方不可移除或不存在")
}

func (s *Server) platformChat(w http.ResponseWriter, r *http.Request) {
	if s.desktopAccessMode() == "request" && r.Header.Get(desktopApprovalHeader) != "1" {
		writeErr(w, 403, "当前访问模式要求先批准模型联网请求")
		return
	}
	account, err := s.platform.read()
	if err != nil {
		writeErr(w, 500, "读取 VEXNAR 账号失败")
		return
	}
	if !account.signedIn() {
		writeErr(w, 401, "请先登录 VEXNAR 账号")
		return
	}
	for _, provider := range account.Providers {
		if provider.ID == r.PathValue("provider") {
			proxyDesktopLLM(w, r, provider.Base, provider.Key, llmPathChatCompletions)
			return
		}
	}
	writeErr(w, 404, "模型提供方不存在")
}

func (s *Server) registerPlatformRoutes(mux *http.ServeMux) {
	register := func(pattern string, handler http.HandlerFunc) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			if s.platform == nil {
				writeErr(w, 503, "VEXNAR 账号服务不可用")
				return
			}
			handler(w, r)
		})
	}
	register("GET "+platformRoutes+"/account", s.platformStatus)
	register("POST "+platformRoutes+"/account", s.platformLogin)
	register("DELETE "+platformRoutes+"/account", s.platformLogout)
	register("POST "+platformRoutes+"/providers", s.platformAddProvider)
	register("DELETE "+platformRoutes+"/providers/{provider}", s.platformRemoveProvider)
	register("POST "+platformRoutes+"/openai/{provider}/v1/chat/completions", s.platformChat)
}

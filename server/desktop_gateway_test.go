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
	"github.com/zhongxinxuhk/vexnar/db"
)

// clearLLMProfiles starts a profile test from an empty table. Tests share one
// PostgreSQL database, so a leftover row from an earlier run can both collide on
// the unique name and legitimately block the managed rename.
func clearLLMProfiles(t *testing.T, m *Manager) {
	t.Helper()
	if m == nil || m.pg == nil {
		return
	}
	existing, _ := m.pg.ListProfiles()
	for _, p := range existing {
		if p.IsDefault {
			_, _ = m.pg.Exec(`UPDATE llm_profiles SET is_default=false WHERE id=$1`, p.ID)
		}
		_ = m.pg.DeleteProfile(p.ID)
	}
}

// resetLLMState clears both the persisted profiles and the in-memory config a
// freshly constructed test Server may have loaded from the shared database, so
// "provider omitted → Responses" is tested from a truly unconfigured state.
func resetLLMState(t *testing.T, m *Manager, s *Server) {
	t.Helper()
	clearLLMProfiles(t, m)
	s.cfgMu.Lock()
	s.llmCfg = agent.Config{}
	s.llmOn = false
	s.cfgMu.Unlock()
}

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
	resetLLMState(t, m, s)
	h := s.Handler()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/models" {
			_, _ = io.WriteString(w, `{"data":[{"id":"persisted-model"}]}`)
			return
		}
		if r.URL.Path == "/v1/responses" {
			_, _ = io.WriteString(w, "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"persisted\"}\n\n")
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()

	// No provider field: the gateway must default to Responses and normalize the
	// stored base URL back to the API root.
	req := httptest.NewRequest(http.MethodPost, "/api/desktop/llm/configure", strings.NewReader(
		`{"model":"persisted-model","base_url":"`+upstream.URL+`/v1/responses","api_key":"upstream-key"}`,
	))
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set(desktopTokenHeader, "secret-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("configure status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"format":"openai-responses"`) {
		t.Fatalf("configure did not report the responses format: %s", rec.Body.String())
	}

	profile, err := m.pg.ActiveProfile()
	if err != nil || profile == nil {
		t.Fatalf("active profile: %v", err)
	}
	if profile.Format != "openai-responses" {
		t.Fatalf("stored format=%q, want openai-responses", profile.Format)
	}
	if profile.BaseURL != upstream.URL+"/v1" {
		t.Fatalf("stored base_url=%q, want API root only", profile.BaseURL)
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

// A profile declares one wire format; the gateway must refuse the other path
// instead of forwarding a mismatched body upstream for an opaque 400.
func TestDesktopGatewayRejectsMismatchedWireFormat(t *testing.T) {
	s := &Server{
		llmOn:  true,
		llmCfg: agent.ConfigFrom("openai-responses", "gpt-5-codex", "https://api.sec.hn.cn/v1/responses", "key", ""),
	}
	req := httptest.NewRequest(http.MethodPost, "/api/desktop/openai/v1/chat/completions", strings.NewReader(`{"messages":[]}`))
	rec := httptest.NewRecorder()
	s.desktopChatProxy(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("chat path on a responses profile: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "openai-responses") {
		t.Fatalf("error should name the active format: %s", rec.Body.String())
	}
}

func TestDesktopResponsesProxyForwardsToResponsesPath(t *testing.T) {
	var seenPath, seenAuth string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPath, seenAuth = r.URL.Path, r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"ok\"}\n\n")
	}))
	defer upstream.Close()

	s := &Server{
		llmOn:        true,
		desktopToken: "secret-token",
		llmCfg:       agent.ConfigFrom("openai-responses", "gpt-5-codex", upstream.URL+"/v1/responses", "upstream-key", ""),
	}
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/desktop/openai/v1/responses",
		strings.NewReader(`{"model":"gpt-5-codex","stream":true,"input":[]}`),
	)
	req.Header.Set(desktopTokenHeader, "secret-token")
	req.Header.Set(desktopApprovalHeader, "1")
	rec := httptest.NewRecorder()
	s.desktopResponsesProxy(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "\"ok\"") {
		t.Fatalf("responses status=%d body=%s", rec.Code, rec.Body.String())
	}
	if seenPath != "/v1/responses" {
		t.Fatalf("upstream path=%q, want /v1/responses (no doubled suffix)", seenPath)
	}
	if seenAuth != "Bearer upstream-key" {
		t.Fatalf("upstream auth=%q", seenAuth)
	}
}

// The managed desktop config must own exactly one row. It updates/claims the
// row named after the provider, activates it, and leaves an operator-curated
// profile untouched — otherwise signing in through the app would overwrite a
// profile the operator configured in the web console, or create a duplicate
// "default" row that the other client then displays instead.
func TestSaveManagedConfigClaimsOwnRow(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer m.Close()
	td := t.TempDir()
	s := New(context.Background(), m, td, td, td)
	clearLLMProfiles(t, m)

	// Operator profile, active before the app logs in.
	operator := &db.LLMProfile{
		Name: "p-active", Format: "openai", Model: "old-model", BaseURL: "https://old.example/v1",
		APIKey: "sk-old-key", Streaming: true, Priority: 7,
	}
	id, err := m.pg.SaveProfile(operator)
	if err != nil {
		t.Fatalf("seed profile: %v", err)
	}
	if err := m.pg.SetActiveProfile(id); err != nil {
		t.Fatalf("activate: %v", err)
	}

	cfg := agent.ConfigFrom("openai-responses", "gpt-5-codex", "https://api.sec.hn.cn/v1/responses", "sk-new-key", "")
	if err := s.saveLLMConfig(cfg, desktopManagedProfileName); err != nil {
		t.Fatalf("save: %v", err)
	}

	profs, err := m.pg.ListProfiles()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(profs) != 2 {
		t.Fatalf("profiles=%d, want the operator row plus one managed row", len(profs))
	}
	kept, err := m.pg.ProfileByID(id)
	if err != nil || kept == nil {
		t.Fatalf("operator row: %v", err)
	}
	if kept.Name != "p-active" || kept.Format != "openai" || kept.Model != "old-model" || kept.Priority != 7 || kept.IsDefault {
		t.Fatalf("operator row was modified: %+v", kept)
	}
	active, err := m.pg.ActiveProfile()
	if err != nil || active == nil {
		t.Fatalf("active: %v", err)
	}
	if active.Name != desktopManagedProfileName {
		t.Fatalf("active name=%q, want %q", active.Name, desktopManagedProfileName)
	}
	if active.Format != "openai-responses" || active.BaseURL != "https://api.sec.hn.cn/v1" {
		t.Fatalf("format=%q base_url=%q", active.Format, active.BaseURL)
	}

	// A model switch (the app's model picker) reuses the same managed row.
	cfg = agent.ConfigFrom("openai-responses", "gpt-5-mini", "https://api.sec.hn.cn/v1", "sk-new-key", "")
	if err := s.saveLLMConfig(cfg, desktopManagedProfileName); err != nil {
		t.Fatalf("update: %v", err)
	}
	profs, err = m.pg.ListProfiles()
	if err != nil || len(profs) != 2 {
		t.Fatalf("profiles after update=%d err=%v", len(profs), err)
	}
	active, err = m.pg.ActiveProfile()
	if err != nil || active == nil || active.ID <= 0 {
		t.Fatalf("active after update: %v", err)
	}
	if active.Name != desktopManagedProfileName || active.Model != "gpt-5-mini" {
		t.Fatalf("managed row after update: name=%q model=%q", active.Name, active.Model)
	}
}

// Older app builds wrote the managed config to a row literally named "default".
// The first managed save must migrate that row in place (same id, renamed) rather
// than leaving the legacy row behind and creating a second managed row.
func TestSaveManagedConfigMigratesLegacyDefaultRow(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer m.Close()
	td := t.TempDir()
	s := New(context.Background(), m, td, td, td)
	clearLLMProfiles(t, m)

	legacy := &db.LLMProfile{
		Name: "default", Format: "openai", Model: "gpt-5-codex",
		BaseURL: "https://api.sec.hn.cn/v1", APIKey: "sk-legacy", Streaming: true, Priority: 3,
	}
	id, err := m.pg.SaveProfile(legacy)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := m.pg.SetActiveProfile(id); err != nil {
		t.Fatalf("activate: %v", err)
	}

	cfg := agent.ConfigFrom("openai-responses", "gpt-5-codex", "https://api.sec.hn.cn/v1", "sk-legacy", "")
	if err := s.saveLLMConfig(cfg, desktopManagedProfileName); err != nil {
		t.Fatalf("save: %v", err)
	}
	profs, err := m.pg.ListProfiles()
	if err != nil || len(profs) != 1 {
		t.Fatalf("profiles=%d err=%v, want one migrated row", len(profs), err)
	}
	active, err := m.pg.ActiveProfile()
	if err != nil || active == nil {
		t.Fatalf("active: %v", err)
	}
	if active.ID != id || active.Name != desktopManagedProfileName {
		t.Fatalf("legacy row id=%d name=%q, want id %d renamed to %q", active.ID, active.Name, id, desktopManagedProfileName)
	}
	if active.Priority != 3 {
		t.Fatalf("priority=%d: managed save reset unrelated profile fields", active.Priority)
	}
}

// The legacy /api/llm endpoint keeps writing the ACTIVE row and its name, so a
// web quick-config save does not silently rename the operator's profile.
func TestSaveLegacyConfigKeepsActiveRow(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer m.Close()
	td := t.TempDir()
	s := New(context.Background(), m, td, td, td)
	clearLLMProfiles(t, m)

	id, err := m.pg.SaveProfile(&db.LLMProfile{
		Name: "p-legacy", Format: "openai", Model: "old", BaseURL: "https://old.example/v1",
		APIKey: "sk-1", Streaming: true,
	})
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := m.pg.SetActiveProfile(id); err != nil {
		t.Fatalf("activate: %v", err)
	}
	cfg := agent.ConfigFrom("openai", "new-model", "https://old.example/v1", "sk-1", "")
	if err := s.saveLLMConfig(cfg, ""); err != nil {
		t.Fatalf("save: %v", err)
	}
	profs, err := m.pg.ListProfiles()
	if err != nil || len(profs) != 1 {
		t.Fatalf("profiles=%d err=%v, want the active row updated in place", len(profs), err)
	}
	active, err := m.pg.ActiveProfile()
	if err != nil || active == nil || active.ID != id || active.Name != "p-legacy" || active.Model != "new-model" {
		t.Fatalf("active after legacy save: %+v err=%v", active, err)
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

// NormalizeBaseURL is the single gatekeeper for "the UI may paste a full endpoint
// URL; the database stores only the API root". One table-driven test covers all
// three wire formats plus the now-standard NewAPI endpoint.
func TestNormalizeLLMBaseURL(t *testing.T) {
	cases := []struct{ provider, in, want string }{
		{"openai-responses", "https://api.sec.hn.cn/v1", "https://api.sec.hn.cn/v1"},
		{"openai-responses", "https://api.sec.hn.cn/v1/responses", "https://api.sec.hn.cn/v1"},
		{"openai-responses", "https://api.sec.hn.cn/v1/responses/", "https://api.sec.hn.cn/v1"},
		{"openai", "https://api.sec.hn.cn/v1/chat/completions", "https://api.sec.hn.cn/v1"},
		{"openai", " https://api.sec.hn.cn/v1/ ", "https://api.sec.hn.cn/v1"},
		{"anthropic", "https://api.anthropic.com/v1/messages", "https://api.anthropic.com"},
		// A full endpoint is stripped even when the format selector disagrees: a
		// wrong dropdown choice must not produce a doubled wire path.
		{"openai", "https://api.openai.com/v1/responses", "https://api.openai.com/v1"},
		{"anthropic", "https://api.sec.hn.cn/v1/chat/completions", "https://api.sec.hn.cn/v1"},
		{"openai-responses", "https://api.sec.hn.cn/v1/v1/messages", "https://api.sec.hn.cn/v1"},
	}
	for _, tc := range cases {
		if got := agent.NormalizeBaseURL(tc.provider, tc.in); got != tc.want {
			t.Fatalf("NormalizeBaseURL(%q, %q) = %q, want %q", tc.provider, tc.in, got, tc.want)
		}
	}
}

// Reasoning effort must survive model-only saves: the composer's slider writes
// it once, then every model switch keeps it. The status payload reports the
// stored value so the app renders exactly what the web page shows.
func TestDesktopConfigurePersistsEffortAndKeepsIt(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer m.Close()
	td := t.TempDir()
	s := New(context.Background(), m, td, td, td)
	s.desktopToken = "secret-token"
	h := s.Handler()

	resetLLMState(t, m, s)

	post := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/desktop/llm/configure", strings.NewReader(body))
		req.RemoteAddr = "127.0.0.1:1234"
		req.Header.Set(desktopTokenHeader, "secret-token")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	rec := post(`{"model":"gpt-5-codex","base_url":"https://api.sec.hn.cn/v1/responses","api_key":"sk-key","reasoning_effort":"high"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("configure status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"reasoning_effort":"high"`) {
		t.Fatalf("status did not report the effort: %s", rec.Body.String())
	}
	profile, err := m.pg.ActiveProfile()
	if err != nil || profile == nil {
		t.Fatalf("active profile: %v", err)
	}
	if profile.Name != desktopManagedProfileName {
		t.Fatalf("managed row name=%q, want %q", profile.Name, desktopManagedProfileName)
	}
	if profile.ReasoningEffort != "high" {
		t.Fatalf("stored effort=%q, want high", profile.ReasoningEffort)
	}
	if profile.BaseURL != "https://api.sec.hn.cn/v1" {
		t.Fatalf("stored base_url=%q, want root", profile.BaseURL)
	}

	// Model-only update (what the composer's model picker does): protocol, root
	// URL and effort must all survive.
	rec = post(`{"model":"gpt-5-mini"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("model update status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"format":"openai-responses"`) ||
		!strings.Contains(rec.Body.String(), `"reasoning_effort":"high"`) {
		t.Fatalf("model update changed protocol/effort: %s", rec.Body.String())
	}
	active, err := m.pg.ActiveProfile()
	if err != nil || active == nil {
		t.Fatalf("active: %v", err)
	}
	if active.Format != "openai-responses" || active.ReasoningEffort != "high" || active.Model != "gpt-5-mini" {
		t.Fatalf("stored format=%q effort=%q model=%q", active.Format, active.ReasoningEffort, active.Model)
	}

	// Unknown levels are rejected instead of being stored and silently ignored.
	if rec = post(`{"reasoning_effort":"turbo"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid effort status=%d body=%s", rec.Code, rec.Body.String())
	}
}

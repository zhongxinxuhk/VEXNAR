// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"net/http"
	"strings"
	"time"
)

type platformChallenge struct {
	id      string
	token   string
	cookie  string
	expires time.Time
}

type platformAuthReply struct {
	Success bool
	Data    struct {
		ID          int64
		User        struct{ ID int64 }
		AccessToken string `json:"access_token"`
		FlowToken   string `json:"flow_token"`
		Require2FA  bool   `json:"require_2fa"`
	}
}

func (reply platformAuthReply) proof(cookies []*http.Cookie) platformProof {
	proof := platformProof{UserID: reply.Data.User.ID}
	if proof.UserID == 0 {
		proof.UserID = reply.Data.ID
	}
	if reply.Data.AccessToken != "" {
		proof.Authorization = "Bearer " + reply.Data.AccessToken
	}
	for _, cookie := range cookies {
		if cookie.Value != "" && cookie.MaxAge >= 0 {
			if proof.Cookie != "" {
				proof.Cookie += "; "
			}
			proof.Cookie += cookie.Name + "=" + cookie.Value
		}
	}
	return proof
}

func (s *Server) platformPassword(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if decode(r, &request) != nil || strings.TrimSpace(request.Username) == "" || request.Password == "" {
		writeErr(w, 400, "请输入平台账号和密码")
		return
	}
	st := s.platform
	var settings struct {
		Success bool
		Data    struct {
			PasswordEnabled bool `json:"password_login_enabled"`
			Encrypted       bool `json:"password_login_encryption_enabled"`
			Turnstile       bool `json:"turnstile_check"`
		}
	}
	if !platformRequest(r.Context(), http.MethodGet, st.platform+"/api/status", nil, nil, &settings) || !settings.Success {
		writeErr(w, 502, "无法读取平台登录配置")
		return
	}
	if !settings.Data.PasswordEnabled || settings.Data.Encrypted || settings.Data.Turnstile {
		writeErr(w, 409, "请在平台验证窗口完成登录")
		return
	}
	previous, err := st.read()
	if err != nil {
		writeErr(w, 500, "读取 VEXNAR 账号失败")
		return
	}
	if previous.ready() {
		writeErr(w, 409, "请先退出当前 VEXNAR 账号")
		return
	}
	var reply platformAuthReply
	status, cookies := platformExchange(r.Context(), http.MethodPost, st.platform+"/api/user/login", nil, request, &reply)
	if status == 429 {
		writeErr(w, 429, "平台登录过于频繁，请稍后重试")
		return
	}
	if status == 0 || status >= 500 {
		writeErr(w, 502, "平台登录暂不可用")
		return
	}
	if !reply.Success {
		writeErr(w, 401, "平台登录失败，请检查账号、密码和验证要求")
		return
	}
	proof := reply.proof(cookies)
	if reply.Data.FlowToken != "" || reply.Data.Require2FA {
		challenge := &platformChallenge{
			id: platformID(), token: reply.Data.FlowToken, cookie: proof.Cookie,
			expires: time.Now().Add(5 * time.Minute),
		}
		st.mu.Lock()
		st.pending = challenge
		st.mu.Unlock()
		writeJSON(w, 202, map[string]string{"challenge": challenge.id})
		return
	}
	if proof.UserID <= 0 || (proof.Authorization == "" && proof.Cookie == "") {
		writeErr(w, 409, "请在平台验证窗口完成登录")
		return
	}
	s.completePlatformLogin(w, r, proof)
}

func (s *Server) platformVerify(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Challenge string `json:"challenge"`
		Code      string `json:"code"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	if decode(r, &request) != nil || request.Challenge == "" || strings.TrimSpace(request.Code) == "" {
		writeErr(w, 400, "请输入平台验证码")
		return
	}
	st := s.platform
	st.mu.Lock()
	challenge := st.pending
	st.mu.Unlock()
	if challenge == nil || challenge.id != request.Challenge || time.Now().After(challenge.expires) {
		writeErr(w, 409, "验证已失效，请重新登录")
		return
	}
	endpoint := "/api/user/login/verify"
	payload := map[string]string{"flow_token": challenge.token, "method": "2fa", "code": strings.TrimSpace(request.Code)}
	if challenge.token == "" {
		endpoint = "/api/user/login/2fa"
		delete(payload, "flow_token")
		delete(payload, "method")
	}
	headers := http.Header{}
	if challenge.cookie != "" {
		headers.Set("Cookie", challenge.cookie)
	}
	var reply platformAuthReply
	status, cookies := platformExchange(r.Context(), http.MethodPost, st.platform+endpoint, headers, payload, &reply)
	if status == 0 || status >= 500 {
		writeErr(w, 502, "无法连接平台验证服务")
		return
	}
	proof := reply.proof(cookies)
	if proof.Cookie == "" {
		proof.Cookie = challenge.cookie
	}
	if !reply.Success || proof.UserID <= 0 || (proof.Authorization == "" && proof.Cookie == "") {
		writeErr(w, 401, "验证码未通过，请重试或在平台窗口验证")
		return
	}
	s.completePlatformLogin(w, r, proof)
}

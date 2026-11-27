// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/zhongxinxuhk/vexnar/db"
)

// 本文件是 OAST 的服务端入口（P0 / R1.1）。
//
// 三个面：
//  1. 公网回调：GET|POST /oast/{token}[/...]，**不走 JWT**（token 本身是能力凭据），
//     只做「已知 token → 追加一条命中」，未知 token 一律 404 且不落库。
//  2. 基址解析：VEXNAR_OAST_BASE 环境变量 → settings.oast_public_base → 本机默认。
//  3. 工具装配：agent.NewOASTTools(store, taskID, base)，由 task_llm.go 注入 planner/worker。

const oastSettingBase = "oast_public_base"
const oastDefaultBase = "http://127.0.0.1:8787"
const oastMaxBody = 64 << 10

// oastStore 惰性构造（没有 PostgreSQL 的纯前端/单元测试环境返回 nil）。
func (s *Server) oastStore() *db.OASTStore {
	if s == nil || s.m == nil || s.m.pg == nil {
		return nil
	}
	return db.NewOASTStore(s.m.pg)
}

// oastBaseURL 解析 agent 看到的回调基址。部署在公网/反代后面时必须显式配置，
// 否则签名出来的 URL 指向 127.0.0.1，目标根本连不回来。
func (s *Server) oastBaseURL() string {
	if v := strings.TrimSpace(os.Getenv("VEXNAR_OAST_BASE")); v != "" {
		return strings.TrimRight(v, "/")
	}
	if s != nil && s.m != nil && s.m.pg != nil {
		if v, ok, err := s.m.pg.GetSetting(oastSettingBase); err == nil && ok && strings.TrimSpace(v) != "" {
			return strings.TrimRight(strings.TrimSpace(v), "/")
		}
	}
	return oastDefaultBase
}

// oastHandler 处理 /oast/{token} 及其子路径的回调。
func (s *Server) oastHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		store := s.oastStore()
		if store == nil {
			http.NotFound(w, r)
			return
		}
		rest := strings.TrimPrefix(r.URL.Path, "/oast/")
		token := rest
		path := "/"
		if i := strings.IndexByte(rest, '/'); i >= 0 {
			token, path = rest[:i], rest[i:]
		}
		token = strings.TrimSpace(token)
		if token == "" {
			http.NotFound(w, r)
			return
		}

		body, _ := io.ReadAll(io.LimitReader(r.Body, oastMaxBody))
		remote := r.RemoteAddr
		if xff := r.Header.Get("X-Forwarded-For"); strings.TrimSpace(xff) != "" {
			remote = strings.TrimSpace(strings.Split(xff, ",")[0])
		}
		ok, err := store.Record(r.Context(), token, db.OASTHit{
			Method:     r.Method,
			Host:       r.Host,
			Path:       path,
			Query:      r.URL.RawQuery,
			RemoteAddr: remote,
			Headers:    db.SanitizeOASTHeaders(r.Header),
			Body:       string(body),
		})
		if err != nil {
			http.Error(w, "record failed", http.StatusInternalServerError)
			return
		}
		if !ok {
			http.NotFound(w, r) // 未知 token：不泄露任何信息
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
}

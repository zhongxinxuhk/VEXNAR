// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// 本文件是 OAST（带外回连）的持久层。
//
// 设计约束：
//  1. 写入方是公网无鉴权端点（/oast/{token}），只能做「按已签发 token 追加一行」，
//     不能列出、不能修改别的 token 的记录；未知 token 一律拒绝，避免变成任意写库。
//  2. 读取方（工具/API）必须经 JWT，且默认按 task_id 收口。
//  3. 只落白名单请求头——Authorization/Cookie 这类凭据绝不进库，回调内容同样可能
//     被攻击者控制，落库前统一截断。

// OASTToken 是一次签发记录。
type OASTToken struct {
	Token         string
	TaskID        int64
	ExplorationID int64
	Note          string
	HitCount      int
	LastHitAt     *time.Time
	CreatedAt     time.Time
}

// OASTHit 是一次回连命中。
type OASTHit struct {
	ID         int64
	Token      string
	Method     string
	Host       string
	Path       string
	Query      string
	RemoteAddr string
	Headers    map[string]string
	Body       string
	CreatedAt  time.Time
}

// OASTStore 是 oast_tokens / oast_hits 的访问入口。
type OASTStore struct{ db *DB }

// NewOASTStore 构造 OAST 存储。
func NewOASTStore(d *DB) *OASTStore { return &OASTStore{db: d} }

// oastBodyLimit 限制落库的回调正文长度（攻击者可控，防止把库写爆）。
const oastBodyLimit = 4096

// oastHeader 白名单。只保留判断"请求确实来自目标"所需的元信息。
var oastHeaderAllow = map[string]bool{
	"user-agent":      true,
	"content-type":    true,
	"x-forwarded-for": true,
	"x-real-ip":       true,
}

// SanitizeOASTHeaders 过滤并截断请求头，返回可安全落库的 map。
func SanitizeOASTHeaders(h map[string][]string) map[string]string {
	out := make(map[string]string, len(h))
	for k, vs := range h {
		lk := lowerASCII(k)
		if !oastHeaderAllow[lk] || len(vs) == 0 {
			continue
		}
		v := vs[0]
		if len(v) > 512 {
			v = v[:512]
		}
		out[lk] = v
	}
	return out
}

func lowerASCII(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 'a' - 'A'
		}
	}
	return string(b)
}

// Issue 为一个任务签发新的回调 token。
func (s *OASTStore) Issue(ctx context.Context, taskID, explorationID int64, note string) (*OASTToken, error) {
	var token string
	for attempt := 0; ; attempt++ {
		buf := make([]byte, 16)
		if _, err := rand.Read(buf); err != nil {
			return nil, fmt.Errorf("生成 OAST token: %w", err)
		}
		token = hex.EncodeToString(buf)
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO oast_tokens(token, task_id, exploration_id, note) VALUES ($1,$2,$3,$4)`,
			token, nullInt64(taskID), nullInt64(explorationID), note)
		if err == nil {
			break
		}
		if attempt >= 3 {
			return nil, fmt.Errorf("签发 OAST token: %w", err)
		}
	}
	return &OASTToken{Token: token, TaskID: taskID, ExplorationID: explorationID, Note: note, CreatedAt: time.Now()}, nil
}

func nullInt64(v int64) any {
	if v <= 0 {
		return nil
	}
	return v
}

// Record 记录一次回连。返回 false 表示 token 不存在（调用方应回 404，且不落库）。
func (s *OASTStore) Record(ctx context.Context, token string, hit OASTHit) (bool, error) {
	if token == "" {
		return false, errors.New("empty oast token")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback() //nolint:errcheck

	var one int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM oast_tokens WHERE token=$1 FOR UPDATE`, token).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	if len(hit.Body) > oastBodyLimit {
		hit.Body = hit.Body[:oastBodyLimit]
	}
	raw, err := json.Marshal(hit.Headers)
	if err != nil {
		raw = []byte("{}")
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO oast_hits(token, method, host, path, query, remote_addr, headers, body)
		 VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
		token, hit.Method, hit.Host, hit.Path, hit.Query, hit.RemoteAddr, string(raw), hit.Body); err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE oast_tokens SET hit_count = hit_count + 1, last_hit_at = now() WHERE token=$1`, token); err != nil {
		return false, err
	}
	return true, tx.Commit()
}

// Lookup 按 token 取签发信息（不存在返回 nil, nil）。
func (s *OASTStore) Lookup(ctx context.Context, token string) (*OASTToken, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT token, COALESCE(task_id,0), COALESCE(exploration_id,0), note, hit_count, last_hit_at, created_at
		 FROM oast_tokens WHERE token=$1`, token)
	var t OASTToken
	var last sql.NullTime
	if err := row.Scan(&t.Token, &t.TaskID, &t.ExplorationID, &t.Note, &t.HitCount, &last, &t.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if last.Valid {
		t.LastHitAt = &last.Time
	}
	return &t, nil
}

// Tokens 列出一个任务已签发的 token（最新在前）。taskID<=0 表示全部。
func (s *OASTStore) Tokens(ctx context.Context, taskID int64) ([]*OASTToken, error) {
	q := `SELECT token, COALESCE(task_id,0), COALESCE(exploration_id,0), note, hit_count, last_hit_at, created_at
	      FROM oast_tokens`
	args := []any{}
	if taskID > 0 {
		q += ` WHERE task_id=$1`
		args = append(args, taskID)
	}
	q += ` ORDER BY created_at DESC LIMIT 50`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*OASTToken
	for rows.Next() {
		var t OASTToken
		var last sql.NullTime
		if err := rows.Scan(&t.Token, &t.TaskID, &t.ExplorationID, &t.Note, &t.HitCount, &last, &t.CreatedAt); err != nil {
			return nil, err
		}
		if last.Valid {
			t.LastHitAt = &last.Time
		}
		out = append(out, &t)
	}
	return out, rows.Err()
}

// Poll 增量读取命中：token 非空时按 token 过滤，否则按 taskID 过滤；
// afterID>0 表示只取比它更新的记录。返回按 id 升序。
func (s *OASTStore) Poll(ctx context.Context, taskID int64, token string, afterID int64, limit int) ([]*OASTHit, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	q := `SELECT h.id, h.token, h.method, h.host, h.path, h.query, h.remote_addr, h.headers, h.body, h.created_at
	      FROM oast_hits h`
	args := []any{}
	where := []string{}
	if token != "" {
		args = append(args, token)
		where = append(where, fmt.Sprintf("h.token=$%d", len(args)))
	} else if taskID > 0 {
		args = append(args, taskID)
		where = append(where, fmt.Sprintf("h.token IN (SELECT token FROM oast_tokens WHERE task_id=$%d)", len(args)))
	} else {
		return nil, errors.New("oast poll: token 或 taskID 必须提供一个")
	}
	if afterID > 0 {
		args = append(args, afterID)
		where = append(where, fmt.Sprintf("h.id>$%d", len(args)))
	}
	if len(where) > 0 {
		q += " WHERE " + joinAnd(where)
	}
	args = append(args, limit)
	q += fmt.Sprintf(" ORDER BY h.id ASC LIMIT $%d", len(args))

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*OASTHit{}
	for rows.Next() {
		var h OASTHit
		var raw []byte
		if err := rows.Scan(&h.ID, &h.Token, &h.Method, &h.Host, &h.Path, &h.Query, &h.RemoteAddr, &raw, &h.Body, &h.CreatedAt); err != nil {
			return nil, err
		}
		h.Headers = map[string]string{}
		_ = json.Unmarshal(raw, &h.Headers)
		out = append(out, &h)
	}
	return out, rows.Err()
}

func joinAnd(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += " AND "
		}
		out += p
	}
	return out
}

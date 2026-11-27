// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Credential 是可复用的身份材料（R2.1）。列表接口永远不带明文，
// 只有按 ID 取用时才返回 secret，避免 planner 的上下文里堆满口令。
type Credential struct {
	ID              int64      `json:"id,string"`
	TaskID          int64      `json:"task_id,string"`
	AssetID         *int64     `json:"asset_id,omitempty"`
	Kind            string     `json:"kind"`
	Username        string     `json:"username"`
	Secret          string     `json:"secret,omitempty"`
	SecretSet       bool       `json:"secret_set"`
	Scope           string     `json:"scope"`
	Source          string     `json:"source"`
	SourceFindingID *int64     `json:"source_finding_id,omitempty"`
	Status          string     `json:"status"`
	Notes           string     `json:"notes"`
	ExpiresAt       *time.Time `json:"expires_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type CredentialInput struct {
	TaskID           int64
	AssetID          *int64
	Kind             string
	Username         string
	Secret           string
	Scope            string
	Source           string
	SourceFindingID  *int64
	Notes            string
	ExpiresInSeconds int64
}

var credentialKinds = map[string]bool{"password": true, "hash": true, "token": true, "key": true, "basic": true}

const credentialCols = `id, task_id, asset_id, kind, username, secret, scope, source, source_finding_id,
	status, notes, expires_at, created_at, updated_at`

func scanCredential(row interface{ Scan(...any) error }) (*Credential, error) {
	c := &Credential{}
	err := row.Scan(&c.ID, &c.TaskID, &c.AssetID, &c.Kind, &c.Username, &c.Secret, &c.Scope, &c.Source,
		&c.SourceFindingID, &c.Status, &c.Notes, &c.ExpiresAt, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err == nil {
		c.SecretSet = c.Secret != ""
	}
	return c, err
}

// RecordCredential 登记一份凭据：同一 (task, kind, asset, scope, username) 幂等更新。
func (d *DB) RecordCredential(ctx context.Context, in CredentialInput) (*Credential, bool, error) {
	if in.TaskID <= 0 {
		return nil, false, errors.New("task_id 无效")
	}
	in.Kind = strings.ToLower(strings.TrimSpace(in.Kind))
	if in.Kind == "" {
		in.Kind = "password"
	}
	if !credentialKinds[in.Kind] {
		return nil, false, fmt.Errorf("未知凭据类型 %q（password/hash/token/key/basic）", in.Kind)
	}
	in.Secret = strings.TrimSpace(in.Secret)
	if in.Secret == "" {
		return nil, false, errors.New("凭据不能为空")
	}
	if len(in.Secret) > 8192 {
		return nil, false, errors.New("凭据过长（上限 8KB）")
	}
	in.Username = strings.TrimSpace(in.Username)
	in.Scope = strings.TrimSpace(in.Scope)
	in.Source = strings.TrimSpace(in.Source)
	in.Notes = strings.TrimSpace(in.Notes)
	var id int64
	var created bool
	err := d.QueryRowContext(ctx, `
		INSERT INTO credentials(task_id, asset_id, kind, username, secret, scope, source, source_finding_id, notes, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
		    CASE WHEN $10 > 0 THEN now() + make_interval(secs => $10) ELSE NULL END)
		ON CONFLICT (task_id, kind, (COALESCE(asset_id, 0)), (COALESCE(NULLIF(scope, ''), '-')), username)
		DO UPDATE SET secret=EXCLUDED.secret, source=EXCLUDED.source, notes=EXCLUDED.notes,
		    source_finding_id=EXCLUDED.source_finding_id, status='active',
		    expires_at=EXCLUDED.expires_at, updated_at=now()
		RETURNING id, (xmax = 0)`,
		in.TaskID, in.AssetID, in.Kind, in.Username, in.Secret, in.Scope, in.Source,
		in.SourceFindingID, in.Notes, in.ExpiresInSeconds).Scan(&id, &created)
	if err != nil {
		return nil, false, err
	}
	c, err := scanCredential(d.QueryRowContext(ctx, `SELECT `+credentialCols+` FROM credentials WHERE id=$1`, id))
	return c, created, err
}

// ListCredentials 返回任务内有效凭据的元数据（不含 secret）。
func (d *DB) ListCredentials(ctx context.Context, taskID int64, assetID *int64) ([]Credential, error) {
	q := `SELECT id, task_id, asset_id, kind, username, ''::text AS secret, scope, source, source_finding_id,
	             status, notes, (secret <> '') AS secret_set, expires_at, created_at, updated_at
	      FROM credentials
	      WHERE task_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at > now())`
	args := []any{taskID}
	if assetID != nil {
		q += ` AND (asset_id=$2 OR asset_id IS NULL)`
		args = append(args, *assetID)
	}
	q += ` ORDER BY kind, id`
	rows, err := d.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Credential{}
	for rows.Next() {
		var c Credential
		if err := rows.Scan(&c.ID, &c.TaskID, &c.AssetID, &c.Kind, &c.Username, &c.Secret, &c.Scope, &c.Source,
			&c.SourceFindingID, &c.Status, &c.Notes, &c.SecretSet, &c.ExpiresAt, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// GetCredential 按 ID 取用（返回明文）。必须限定任务：跨任务不可见。
func (d *DB) GetCredential(ctx context.Context, taskID, id int64) (*Credential, error) {
	return scanCredential(d.QueryRowContext(ctx,
		`SELECT `+credentialCols+` FROM credentials
		 WHERE id=$1 AND task_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at > now())`, id, taskID))
}

// RevokeCredential 标记凭据失效（不删除，保留来源追溯）。
func (d *DB) RevokeCredential(ctx context.Context, taskID, id int64) error {
	res, err := d.ExecContext(ctx, `UPDATE credentials SET status='revoked', updated_at=now()
		WHERE id=$1 AND task_id=$2`, id, taskID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// Session 是已经建立、可能过期的登录态；headers 直接是可回放的请求头。
type Session struct {
	ID              int64           `json:"id,string"`
	TaskID          int64           `json:"task_id,string"`
	AssetID         *int64          `json:"asset_id,omitempty"`
	Label           string          `json:"label"`
	Kind            string          `json:"kind"`
	Headers         json.RawMessage `json:"headers,omitempty"`
	HeadersSet      bool            `json:"headers_set"`
	Identity        string          `json:"identity"`
	Source          string          `json:"source"`
	SourceFindingID *int64          `json:"source_finding_id,omitempty"`
	Status          string          `json:"status"`
	Notes           string          `json:"notes"`
	ExpiresAt       *time.Time      `json:"expires_at,omitempty"`
	LastUsedAt      *time.Time      `json:"last_used_at,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type SessionInput struct {
	TaskID           int64
	AssetID          *int64
	Label            string
	Kind             string
	Headers          json.RawMessage
	Identity         string
	Source           string
	SourceFindingID  *int64
	Notes            string
	ExpiresInSeconds int64
}

var sessionKinds = map[string]bool{"cookie": true, "bearer": true, "basic": true, "custom": true}

const sessionCols = `id, task_id, asset_id, label, kind, headers, identity, source, source_finding_id,
	status, notes, expires_at, last_used_at, created_at, updated_at`

func scanSession(row interface{ Scan(...any) error }) (*Session, error) {
	s := &Session{}
	err := row.Scan(&s.ID, &s.TaskID, &s.AssetID, &s.Label, &s.Kind, &s.Headers, &s.Identity, &s.Source,
		&s.SourceFindingID, &s.Status, &s.Notes, &s.ExpiresAt, &s.LastUsedAt, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err == nil {
		s.HeadersSet = len(s.Headers) > 2 && string(s.Headers) != "{}"
	}
	return s, err
}

// RecordSession 登记登录态；同一 (task, asset, label) 幂等更新。
func (d *DB) RecordSession(ctx context.Context, in SessionInput) (*Session, bool, error) {
	if in.TaskID <= 0 {
		return nil, false, errors.New("task_id 无效")
	}
	in.Kind = strings.ToLower(strings.TrimSpace(in.Kind))
	if in.Kind == "" {
		in.Kind = "cookie"
	}
	if !sessionKinds[in.Kind] {
		return nil, false, fmt.Errorf("未知会话类型 %q（cookie/bearer/basic/custom）", in.Kind)
	}
	in.Label = strings.TrimSpace(in.Label)
	if in.Label == "" {
		return nil, false, errors.New("label 不能为空：用它区分同一资产的不同账号/角色")
	}
	if len(in.Headers) == 0 || string(in.Headers) == "{}" || string(in.Headers) == "null" {
		return nil, false, errors.New("headers 不能为空：至少提供 Cookie 或 Authorization")
	}
	if len(in.Headers) > 16384 {
		return nil, false, errors.New("headers 过长（上限 16KB）")
	}
	var id int64
	var created bool
	err := d.QueryRowContext(ctx, `
		INSERT INTO sessions(task_id, asset_id, label, kind, headers, identity, source, source_finding_id, notes, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
		    CASE WHEN $10 > 0 THEN now() + make_interval(secs => $10) ELSE NULL END)
		ON CONFLICT (task_id, (COALESCE(asset_id, 0)), label)
		DO UPDATE SET kind=EXCLUDED.kind, headers=EXCLUDED.headers, identity=EXCLUDED.identity,
		    source=EXCLUDED.source, source_finding_id=EXCLUDED.source_finding_id, notes=EXCLUDED.notes,
		    status='active', expires_at=EXCLUDED.expires_at, updated_at=now()
		RETURNING id, (xmax = 0)`,
		in.TaskID, in.AssetID, in.Label, in.Kind, in.Headers, in.Identity, in.Source,
		in.SourceFindingID, in.Notes, in.ExpiresInSeconds).Scan(&id, &created)
	if err != nil {
		return nil, false, err
	}
	s, err := scanSession(d.QueryRowContext(ctx, `SELECT `+sessionCols+` FROM sessions WHERE id=$1`, id))
	return s, created, err
}

// ListSessions 返回有效会话的元数据（不含 headers）。
func (d *DB) ListSessions(ctx context.Context, taskID int64, assetID *int64) ([]Session, error) {
	q := `SELECT id, task_id, asset_id, label, kind, '{}'::jsonb AS headers, identity, source,
	             source_finding_id, status, notes, (headers <> '{}'::jsonb) AS headers_set,
	             expires_at, last_used_at, created_at, updated_at
	      FROM sessions
	      WHERE task_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at > now())`
	args := []any{taskID}
	if assetID != nil {
		q += ` AND (asset_id=$2 OR asset_id IS NULL)`
		args = append(args, *assetID)
	}
	q += ` ORDER BY id`
	rows, err := d.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.TaskID, &s.AssetID, &s.Label, &s.Kind, &s.Headers, &s.Identity, &s.Source,
			&s.SourceFindingID, &s.Status, &s.Notes, &s.HeadersSet, &s.ExpiresAt, &s.LastUsedAt,
			&s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// GetSession 取用会话头（明文），并刷新 last_used_at。
// 先更新再读取，返回的行里就能看到本次使用时间。
func (d *DB) GetSession(ctx context.Context, taskID, id int64) (*Session, error) {
	if _, err := d.ExecContext(ctx, `UPDATE sessions SET last_used_at=now(), updated_at=now()
		WHERE id=$1 AND task_id=$2 AND status='active'
		  AND (expires_at IS NULL OR expires_at > now())`, id, taskID); err != nil {
		return nil, err
	}
	return scanSession(d.QueryRowContext(ctx,
		`SELECT `+sessionCols+` FROM sessions
		 WHERE id=$1 AND task_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at > now())`, id, taskID))
}

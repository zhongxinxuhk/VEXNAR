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

	"github.com/zhongxinxuhk/vexnar/capability"
)

// Capability 是一项「已经能做什么」的断言（R2.2）。
//
// 与 finding 的区别：finding 是「已证实的问题」，capability 是「可利用的位置与强度」。
// 两者通过 finding_capabilities 关联，origin=derived 的行额外带推导规则，
// 便于回答「这项能力是从哪个漏洞、按哪条规则推出来的」。
type Capability struct {
	ID              int64           `json:"id,string"`
	TaskID          int64           `json:"task_id,string"`
	Kind            string          `json:"kind"`
	AssetID         *int64          `json:"asset_id,omitempty"`
	Scope           string          `json:"scope"`
	Strength        string          `json:"strength"`
	Status          string          `json:"status"`
	Origin          string          `json:"origin"`
	Confidence      float64         `json:"confidence"`
	DerivationRule  string          `json:"derivation_rule,omitempty"`
	SourceFindingID *int64          `json:"source_finding_id,omitempty"`
	Evidence        string          `json:"evidence"`
	Attrs           json.RawMessage `json:"attrs,omitempty"`
	ExpiresAt       *time.Time      `json:"expires_at,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// CapabilityInput 是显式登记（worker 给出证据）的入参。
type CapabilityInput struct {
	TaskID           int64
	Kind             string
	AssetID          *int64
	Scope            string
	Strength         string
	Confidence       float64
	Evidence         string
	FindingID        *int64
	ExpiresInSeconds int64
	Attrs            json.RawMessage
}

const capabilityCols = `id, task_id, kind, asset_id, scope, strength, status, origin, confidence,
	derivation_rule, source_finding_id, evidence, attrs, expires_at, created_at, updated_at`

func scanCapability(row interface{ Scan(...any) error }) (*Capability, error) {
	c := &Capability{}
	err := row.Scan(&c.ID, &c.TaskID, &c.Kind, &c.AssetID, &c.Scope, &c.Strength, &c.Status,
		&c.Origin, &c.Confidence, &c.DerivationRule, &c.SourceFindingID, &c.Evidence, &c.Attrs,
		&c.ExpiresAt, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return c, err
}

// RecordCapability 显式登记一项能力：同一 (task, kind, asset, scope) 幂等 upsert。
// 已存在的 derived 行会被升级为 explicit（显式证据优先于自动推导）。
// 返回 created 表示本次是否新建了行。
func (d *DB) RecordCapability(ctx context.Context, in CapabilityInput) (*Capability, bool, error) {
	if in.TaskID <= 0 {
		return nil, false, errors.New("task_id 无效")
	}
	in.Kind = capability.NormalizeKind(in.Kind)
	if _, ok := capability.ByKey(in.Kind); !ok {
		return nil, false, fmt.Errorf("未知能力类型 %q", in.Kind)
	}
	in.Evidence = strings.TrimSpace(in.Evidence)
	if in.Evidence == "" {
		return nil, false, errors.New("record_capability 需要本次实测证据；没有证据的能力断言会把 planner 带偏")
	}
	if in.Confidence <= 0 {
		in.Confidence = 1
	}
	if in.Confidence > 1 {
		in.Confidence = 1
	}
	if len(in.Attrs) == 0 {
		in.Attrs = json.RawMessage(`{}`)
	}
	var capID int64
	var created bool
	err := d.QueryRowContext(ctx, `
		INSERT INTO capabilities(task_id, kind, asset_id, scope, strength, status, origin, confidence,
		    source_finding_id, evidence, attrs, expires_at)
		VALUES ($1,$2,$3,$4,$5,'active','explicit',$6,$7,$8,$9,
		    CASE WHEN $10 > 0 THEN now() + make_interval(secs => $10) ELSE NULL END)
		ON CONFLICT (task_id, kind, (COALESCE(asset_id, 0)), (COALESCE(NULLIF(scope, ''), '-')))
		DO UPDATE SET
		    strength = EXCLUDED.strength,
		    confidence = EXCLUDED.confidence,
		    evidence = EXCLUDED.evidence,
		    attrs = EXCLUDED.attrs,
		    status = 'active',
		    origin = 'explicit',
		    derivation_rule = '',
		    expires_at = EXCLUDED.expires_at,
		    updated_at = now()
		RETURNING id, (xmax = 0)`,
		in.TaskID, in.Kind, in.AssetID, in.Scope, in.Strength, in.Confidence,
		in.FindingID, in.Evidence, in.Attrs, in.ExpiresInSeconds).Scan(&capID, &created)
	if err != nil {
		return nil, false, err
	}
	if in.FindingID != nil && *in.FindingID > 0 {
		if _, err := d.ExecContext(ctx,
			`INSERT INTO finding_capabilities(finding_id, capability_id, relation, rule)
			 VALUES ($1,$2,'provides','') ON CONFLICT DO NOTHING`, *in.FindingID, capID); err != nil {
			return nil, false, err
		}
	}
	c, err := scanCapability(d.QueryRowContext(ctx, `SELECT `+capabilityCols+` FROM capabilities WHERE id=$1`, capID))
	return c, created, err
}

// ListCapabilities 返回任务内仍然有效的能力（active 且未过期）。
// assetID 非空时只返回该资产上的（asset_id 为空的能力视为任务级，仍然返回）。
func (d *DB) ListCapabilities(ctx context.Context, taskID int64, assetID *int64, kind string) ([]Capability, error) {
	q := `SELECT ` + capabilityCols + ` FROM capabilities
		WHERE task_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at > now())`
	args := []any{taskID}
	if assetID != nil {
		q += ` AND (asset_id=$2 OR asset_id IS NULL)`
		args = append(args, *assetID)
	}
	if kind = capability.NormalizeKind(kind); kind != "" {
		q += fmt.Sprintf(` AND kind=$%d`, len(args)+1)
		args = append(args, kind)
	}
	q += ` ORDER BY kind, id`
	rows, err := d.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Capability{}
	for rows.Next() {
		c, err := scanCapability(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

// deriveCapabilitiesTx 按确认漏洞的类目自动推导能力，并写清推导链。
// 幂等：重复确认只刷新已有 derived 行；不覆盖人工登记的 explicit 行。
func deriveCapabilitiesTx(ctx context.Context, tx *sql.Tx, findingID, taskID int64, vulnClass string, assetIDs []int64) error {
	if taskID <= 0 || findingID <= 0 {
		return nil
	}
	rules := capability.Derive(vulnClass)
	if len(rules) == 0 {
		return nil
	}
	assets := assetIDs
	if len(assets) == 0 {
		assets = []int64{0} // 0 = 任务级能力（无具体资产）
	}
	for _, r := range rules {
		for _, aid := range assets {
			var assetPtr *int64
			if aid > 0 {
				v := aid
				assetPtr = &v
			}
			var capID int64
			err := tx.QueryRowContext(ctx, `
				INSERT INTO capabilities(task_id, kind, asset_id, scope, strength, status, origin, confidence,
				    derivation_rule, source_finding_id, evidence)
				VALUES ($1,$2,$3,'',$4,'active','derived',$5,$6,$7,$8)
				ON CONFLICT (task_id, kind, (COALESCE(asset_id, 0)), (COALESCE(NULLIF(scope, ''), '-')))
				DO UPDATE SET
				    status = CASE WHEN capabilities.origin='explicit' THEN capabilities.status ELSE 'active' END,
				    strength = CASE WHEN capabilities.origin='explicit' THEN capabilities.strength ELSE EXCLUDED.strength END,
				    confidence = CASE WHEN capabilities.origin='explicit' THEN capabilities.confidence ELSE EXCLUDED.confidence END,
				    evidence = CASE WHEN capabilities.origin='explicit' THEN capabilities.evidence ELSE EXCLUDED.evidence END,
				    derivation_rule = CASE WHEN capabilities.origin='explicit' THEN capabilities.derivation_rule ELSE EXCLUDED.derivation_rule END,
				    updated_at = now()
				RETURNING id`,
				taskID, r.Kind, assetPtr, r.Strength, r.Confidence, r.Rule, findingID,
				fmt.Sprintf("由已确认漏洞 #%d 自动推导（%s）：%s", findingID, r.Rule, r.Rationale)).Scan(&capID)
			if err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO finding_capabilities(finding_id, capability_id, relation, rule)
				 VALUES ($1,$2,'provides',$3) ON CONFLICT DO NOTHING`, findingID, capID, r.Rule); err != nil {
				return err
			}
		}
	}
	return nil
}

// revokeDerivedCapabilitiesTx 在漏洞被修复/判误报/忽略时撤销其推导出的能力。
// 只撤销「没有其它已确认漏洞继续支撑」的行；人工登记的能力不动。
func revokeDerivedCapabilitiesTx(ctx context.Context, tx *sql.Tx, findingID int64) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE capabilities c SET status='revoked', updated_at=now()
		WHERE c.origin='derived' AND c.status='active'
		  AND EXISTS (SELECT 1 FROM finding_capabilities fc
		              WHERE fc.capability_id=c.id AND fc.finding_id=$1)
		  AND NOT EXISTS (
		      SELECT 1 FROM finding_capabilities fc
		      JOIN findings f ON f.id=fc.finding_id
		      WHERE fc.capability_id=c.id AND f.id<>$1 AND f.status='confirmed')`, findingID)
	return err
}

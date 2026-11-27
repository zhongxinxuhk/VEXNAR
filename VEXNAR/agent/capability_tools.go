// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package agent

import (
	"context"
	"encoding/json"

	actool "github.com/Autumn-27/norma/tool"
	"github.com/zhongxinxuhk/vexnar/capability"
	"github.com/zhongxinxuhk/vexnar/db"
)

// list_capabilities：planner 看「已经能做什么、还缺什么」（R2.2）。
//
// 能力按任务隔离，只返回 active 且未过期的行。缺口只算一层前置
// （多跳规划属于链路引擎 R2.3），避免把工具变成隐式规划器。
func (t *ToolSet) listCapabilities() actool.CoreTool {
	return t.readExpTool("list_capabilities",
		"查本任务已获得的能力（capability：网络可达/登录态/文件读写/命令执行/数据库读取/后台访问/有效令牌），以及距离这些能力还缺哪些前置。规划利用链时先看这里，不要凭记忆假设某个凭据或会话还在；能力带来源漏洞与推导规则，可追溯到证据。参数：asset_id(可选，只看该资产+任务级能力)、kind(可选，按能力过滤)、include_gaps(默认 true)。",
		obj(map[string]any{
			"asset_id":     map[string]any{"type": "integer", "description": "可选。只看该资产上的能力（任务级能力仍会返回）"},
			"kind":         map[string]any{"type": "string", "description": "可选。按能力 Key 过滤，如 net_reachable / cmd_exec"},
			"include_gaps": map[string]any{"type": "boolean", "description": "可选，默认 true。是否返回缺口与前置提示"},
		}),
		func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
			var in struct {
				AssetID     int64  `json:"asset_id"`
				Kind        string `json:"kind"`
				IncludeGaps *bool  `json:"include_gaps"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if t.ts == nil || t.taskID <= 0 {
				return actool.Errorf("list_capabilities 需要任务上下文"), nil
			}
			var assetPtr *int64
			if in.AssetID > 0 {
				assetPtr = &in.AssetID
			}
			held, err := t.ts.DB().ListCapabilities(ctx, t.taskID, assetPtr, in.Kind)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			kinds := make([]string, 0, len(held))
			seen := map[string]bool{}
			for _, c := range held {
				if !seen[c.Kind] {
					seen[c.Kind] = true
					kinds = append(kinds, c.Kind)
				}
			}
			out := map[string]any{"held": held, "held_count": len(held), "kinds": kinds}
			includeGaps := in.IncludeGaps == nil || *in.IncludeGaps
			if includeGaps {
				out["gaps"] = capability.Gaps(kinds)
			}
			out["catalog"] = capability.All()
			return jsonResult(out)
		})
}

// record_capability：worker 在利用成功后显式登记能力，必须带本次实测证据。
// 同一 (task, kind, asset, scope) 幂等；重复登记只刷新证据与置信度。
func (t *ToolSet) recordCapability() actool.CoreTool {
	return t.writeExpTool("record_capability",
		"登记一项已获得的能力（利用成功后调用，不要用于猜测）。必须给出本次实测证据；同一资产同一作用域重复登记会更新证据而不是新增。能力会出现在 list_capabilities 里，供后续意图复用登录态/文件读写/命令执行等。参数：kind(必填，见能力目录)、evidence(必填)、asset_id/scope/strength(可选)、confidence(0~1，默认 1)、finding_id(可选，关联来源漏洞)、expires_in_seconds(可选，令牌/会话类建议填)、attrs(可选，kind 专属属性)。",
		obj(map[string]any{
			"kind":               map[string]any{"type": "string", "enum": capability.Keys(), "description": "能力类型"},
			"evidence":           map[string]any{"type": "string", "description": "本次实测证据：请求/响应、命令输出、登录后的页面特征等"},
			"asset_id":           map[string]any{"type": "integer", "description": "可选。能力落在哪个资产上；省略=任务级"},
			"scope":              map[string]any{"type": "string", "description": "可选。作用域：URL 前缀/账号/库表，用于区分同资产多份能力"},
			"strength":           map[string]any{"type": "string", "description": "可选。强度：read/write/exec/admin/token/outbound 等"},
			"confidence":         map[string]any{"type": "number", "description": "可选，0~1，默认 1"},
			"finding_id":         map[string]any{"type": "integer", "description": "可选。来源漏洞 ID（不确定就省略）"},
			"expires_in_seconds": map[string]any{"type": "integer", "description": "可选。令牌/会话类能力的有效期"},
			"attrs":              map[string]any{"type": "object", "description": "可选。kind 专属属性，如 {\"role\":\"admin\"} 或 {\"db\":\"app\"}"},
		}, "kind", "evidence"),
		func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
			var in struct {
				Kind             string          `json:"kind"`
				Evidence         string          `json:"evidence"`
				AssetID          int64           `json:"asset_id"`
				Scope            string          `json:"scope"`
				Strength         string          `json:"strength"`
				Confidence       float64         `json:"confidence"`
				FindingID        int64           `json:"finding_id"`
				ExpiresInSeconds int64           `json:"expires_in_seconds"`
				Attrs            json.RawMessage `json:"attrs"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if t.ts == nil || t.taskID <= 0 {
				return actool.Errorf("record_capability 需要任务上下文"), nil
			}
			var assetPtr, findingPtr *int64
			if in.AssetID > 0 {
				v := in.AssetID
				assetPtr = &v
			}
			if in.FindingID > 0 {
				v := in.FindingID
				findingPtr = &v
			}
			c, created, err := t.ts.DB().RecordCapability(ctx, db.CapabilityInput{
				TaskID: t.taskID, Kind: in.Kind, AssetID: assetPtr, Scope: in.Scope,
				Strength: in.Strength, Confidence: in.Confidence, Evidence: in.Evidence,
				FindingID: findingPtr, ExpiresInSeconds: in.ExpiresInSeconds, Attrs: in.Attrs,
			})
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return jsonResult(map[string]any{"capability": c, "created": created})
		})
}

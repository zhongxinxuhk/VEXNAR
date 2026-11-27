// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package agent

import (
	"context"
	"encoding/json"
	"strings"

	actool "github.com/Autumn-27/norma/tool"
	"github.com/zhongxinxuhk/vexnar/db"
	"github.com/zhongxinxuhk/vexnar/vulnclass"
)

// list_vuln_classes 是「漏洞类目基线」的查询入口（P0 / R1.2）。
//
// 它回答 planner 最常缺的那一问：**这个资产还有哪些漏洞类目没测、每类怎么测、
// 什么算测到**。返回的是提示性知识 + 本任务的覆盖情况，不替代真实触发。
//
// 覆盖判定：把本任务已确认漏洞的 vulnclass 归一（大小写/中文别名）后按类目聚合；
// 传 asset_id 时只看锚定到该资产的发现。自定义类目（归一不了）原样列出，不丢弃。
func (t *ToolSet) listVulnClasses() actool.CoreTool {
	return t.readExpTool("list_vuln_classes",
		"查【漏洞类目基线】：每类的前置条件、探测步骤、成功判据(oracle)、payload 种子、终止条件，并用本任务已确认漏洞标出 covered。规划时用它判断某资产还剩哪些类目没测（比凭记忆铺方向更不易漏测）。参数：asset_type(可选，按资产类型过滤)、asset_id(可选，只看该资产上的覆盖)、only_uncovered(可选，只返回未覆盖类目)。注意：这是方向性知识，确认漏洞仍必须真实触发（report_finding 的红线不变）。",
		obj(map[string]any{
			"asset_type":     map[string]any{"type": "string", "description": "资产类型：root_domain|subdomain|ip|app|service|endpoint；留空=全部"},
			"asset_id":       map[string]any{"type": "integer", "description": "可选。只看锚定到该资产的覆盖情况，并过滤返回结果的 findings"},
			"only_uncovered": map[string]any{"type": "boolean", "description": "可选。true=只返回尚未被任何 finding 覆盖的类目"},
		}),
		func(_ context.Context, raw json.RawMessage) (actool.Result, error) {
			var in struct {
				AssetType     string `json:"asset_type"`
				AssetID       int64  `json:"asset_id"`
				OnlyUncovered bool   `json:"only_uncovered"`
			}
			_ = json.Unmarshal(raw, &in)

			classes := vulnclass.ForAssetType(in.AssetType)

			covered := map[string][]int64{}
			if t.ts != nil {
				nodes, _ := t.ts.ListByKindWithSources(db.KindFinding, 500)
				for _, n := range nodes {
					if n.Inherited {
						continue
					}
					var p map[string]any
					if json.Unmarshal(n.Payload, &p) != nil {
						continue
					}
					vc, _ := p["vulnclass"].(string)
					key, _ := vulnclass.Normalize(vc)
					if key == "" {
						continue
					}
					fid := n.ID
					if n.FindingID > 0 {
						fid = n.FindingID
					}
					if in.AssetID > 0 && !payloadHasAsset(p, in.AssetID) {
						continue
					}
					covered[key] = append(covered[key], fid)
				}
			}

			out := make([]map[string]any, 0, len(classes))
			for _, c := range classes {
				ids := covered[c.Key]
				if in.OnlyUncovered && len(ids) > 0 {
					continue
				}
				m := map[string]any{
					"key": c.Key, "name": c.Name, "severity": c.Severity, "cwe": c.CWE,
					"applies_to": c.AppliesTo, "prereq": c.Prereq,
					"probe": c.Probe, "oracles": c.Oracles, "payloads": c.Payloads,
					"stop": c.Stop, "covered": len(ids) > 0,
				}
				if len(ids) > 0 {
					m["finding_ids"] = ids
				}
				out = append(out, m)
			}
			return jsonResult(map[string]any{
				"asset_type": in.AssetType,
				"asset_id":   in.AssetID,
				"classes":    out,
				"note":       "covered=true 表示本任务已有该类目的确认漏洞；不代表其它接口/参数也测过。自定义类目请原样使用 vulnclass 值上报。",
			})
		})
}

func payloadHasAsset(p map[string]any, id int64) bool {
	raw, ok := p["asset_ids"]
	if !ok {
		return false
	}
	arr, ok := raw.([]any)
	if !ok {
		return false
	}
	for _, v := range arr {
		switch n := v.(type) {
		case float64:
			if int64(n) == id {
				return true
			}
		case int64:
			if n == id {
				return true
			}
		case string:
			if strings.TrimSpace(n) == itoa(id) {
				return true
			}
		}
	}
	return false
}

func itoa(v int64) string {
	b, _ := json.Marshal(v)
	return string(b)
}

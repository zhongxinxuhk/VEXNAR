// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	actool "github.com/Autumn-27/norma/tool"
	"github.com/zhongxinxuhk/vexnar/egress"
)

// Egress tools expose the proxy pool's adversarial mode to the model.
//
// Why a dedicated tool instead of letting the model curl: fanout needs the same
// request replayed over several nodes and the responses classified as
// pass/block. A shell loop cannot classify a Cloudflare challenge, cannot cancel
// losers, and cannot respect the per-task budget. The tool can, and it reports
// per-node verdicts so the model reasons about exit IPs instead of guessing.
func NewEgressTools(m *egress.Manager, taskID int64, sessionKey string) []actool.CoreTool {
	if m == nil || strings.TrimSpace(sessionKey) == "" {
		return nil
	}
	return []actool.CoreTool{
		readTool("egress_status",
			"查看当前任务的代理出口状态：绑定的池、模式、当前节点、出口 IP、最近失败，以及对抗模式本小时剩余次数。目标反复 403/429 时先看这里，再决定是否换模式。",
			obj(map[string]any{}),
			func(ctx context.Context, _ json.RawMessage) (actool.Result, error) {
				snap, ok := m.SessionSnapshot(sessionKey)
				if !ok {
					return jsonResult(map[string]any{
						"bound": false,
						"note":  "当前任务没有代理池会话（未绑定池且未设置默认池），目标流量走全局代理或直连。",
					})
				}
				return jsonResult(map[string]any{
					"bound":            true,
					"session":          snap,
					"fanout_remaining": m.FanoutRemaining(ctx, taskID),
				})
			}),
		readTool("fanout_fetch",
			"对抗模式请求：把同一个 GET/HEAD 请求同时从 K 个不同出口节点（尽量不同出口 IP）发出，取第一个未被 WAF 拦截的响应，其余立即取消。适合目标对单 IP 返回 403/429/Cloudflare 挑战时。返回 status/blocked/winner_node/attempts（每条含节点、出口 IP、状态、判定）与 body 片段。POST 默认只发一路（除非 idempotent=true）。",
			obj(map[string]any{
				"url":        map[string]any{"type": "string", "description": "目标完整 URL"},
				"method":     map[string]any{"type": "string", "description": "默认 GET；POST/PUT 默认不并发（需 idempotent=true 才允许 K>1）"},
				"headers":    map[string]any{"type": "object", "description": "可选，请求头键值"},
				"body":       map[string]any{"type": "string", "description": "可选，请求体（method 非 GET 时）"},
				"k":          map[string]any{"type": "number", "description": "并发路数，默认取任务绑定/池的 fanout_k（上限 8）"},
				"timeout_ms": map[string]any{"type": "number", "description": "每路超时，默认 30000"},
				"idempotent": map[string]any{"type": "boolean", "description": "非 GET 请求是否允许并发重放"},
			}, "url"),
			func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
				var in struct {
					URL        string            `json:"url"`
					Method     string            `json:"method"`
					Headers    map[string]string `json:"headers"`
					Body       string            `json:"body"`
					K          int               `json:"k"`
					TimeoutMS  int               `json:"timeout_ms"`
					Idempotent bool              `json:"idempotent"`
				}
				if err := json.Unmarshal(raw, &in); err != nil {
					return actool.Errorf("参数解析失败: " + err.Error()), nil
				}
				if strings.TrimSpace(in.URL) == "" {
					return actool.Errorf("url 不能为空"), nil
				}
				method := strings.ToUpper(strings.TrimSpace(in.Method))
				if method == "" {
					method = http.MethodGet
				}
				timeout := time.Duration(in.TimeoutMS) * time.Millisecond
				res, err := m.Fanout(ctx, sessionKey, method, in.URL, egress.FanoutOptions{
					K:          in.K,
					Timeout:    timeout,
					Headers:    in.Headers,
					Body:       []byte(in.Body),
					Idempotent: in.Idempotent,
				})
				if err != nil {
					return actool.Errorf("对抗请求失败: " + err.Error()), nil
				}
				out := map[string]any{
					"status":      res.Status,
					"blocked":     res.Blocked,
					"winner_node": res.Winner,
					"attempts":    res.Attempts,
					"body":        res.BodyText,
				}
				if res.Blocked {
					out["hint"] = "所有出口都被判定为拦截。可提高 k、改用其它池（不同出口段），或先降低请求频率再试。"
				}
				return jsonResult(out)
			}),
	}
}

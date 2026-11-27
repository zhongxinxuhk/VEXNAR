// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	actool "github.com/Autumn-27/norma/tool"
	"github.com/zhongxinxuhk/vexnar/db"
)

// OAST（带外回连）工具：盲 SSRF / 盲 XXE / 盲命令注入这类"没有回显"的漏洞，
// 唯一可靠的判真手段是让目标主动连一个我们控制的地址。
//
// 使用约定写在工具描述里（而不是塞进系统提示）：
//  1. 先 oast_issue 拿 URL；
//  2. 把 URL 原样嵌进 payload（SSRF 的 url 参数、XXE 的外部实体、命令注入的 curl/wget）；
//  3. 触发后 oast_poll 看有没有命中，命中即 evidence。
//
// taskID 在构造时绑定（每任务一套 agent），token 只能签发给本任务，poll 默认也
// 只收本任务。

// NewOASTTools 构造 oast_issue / oast_poll。store 为 nil 或 baseURL 为空时返回 nil
// （未启用 OAST 的部署不暴露这两个工具，模型也就不会假装能用）。
func NewOASTTools(store *db.OASTStore, taskID int64, baseURL func() string) []actool.CoreTool {
	if store == nil || baseURL == nil {
		return nil
	}
	base := func() string { return strings.TrimRight(strings.TrimSpace(baseURL()), "/") }
	if base() == "" {
		return nil
	}
	return []actool.CoreTool{
		readTool("oast_issue",
			"签发一个【带外回连】地址（OAST）。盲 SSRF/盲 XXE/盲命令注入/盲 SQLi 没有回显时，把返回的 url 原样嵌进 payload，再调 oast_poll 看目标有没有连回来。每次探测用一个新 token（便于定位是哪个 payload 触发的）。返回 {token,url,host,usage}。",
			obj(map[string]any{
				"note": map[string]any{"type": "string", "description": "可选。这条 token 用来测什么（如：ssrf-upload-avatar），便于 poll 时对照"},
			}),
			func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
				var in struct {
					Note string `json:"note"`
				}
				_ = json.Unmarshal(raw, &in)
				tok, err := store.Issue(ctx, taskID, 0, strings.TrimSpace(in.Note))
				if err != nil {
					return actool.Errorf("签发 OAST token 失败: " + err.Error()), nil
				}
				url := base() + "/oast/" + tok.Token
				return jsonResult(map[string]any{
					"token": tok.Token,
					"url":   url,
					"host":  strings.TrimPrefix(strings.TrimPrefix(url, "http://"), "https://"),
					"usage": "把 url 原样嵌入 payload；触发后调用 oast_poll(token) 判定。命中记录含 method/host/path/query/remote_addr/时间。",
				})
			}),
		readTool("oast_poll",
			"查询带外回连命中。不传 token 时返回本任务全部 token 的最近命中；传 token 只看该 token；after_id 做增量（传上次返回的最大 id）。命中即漏洞被判真的证据：把 method/host/path/query/remote_addr 写进 finding/traffic 证据。",
			obj(map[string]any{
				"token":    map[string]any{"type": "string", "description": "可选。只看某个 token 的命中"},
				"after_id": map[string]any{"type": "integer", "description": "可选。只取 id 大于它的新命中（增量轮询）"},
				"limit":    map[string]any{"type": "integer", "description": "可选。默认 20，上限 100"},
			}),
			func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
				var in struct {
					Token   string `json:"token"`
					AfterID int64  `json:"after_id"`
					Limit   int    `json:"limit"`
				}
				_ = json.Unmarshal(raw, &in)
				token := strings.TrimSpace(in.Token)
				if token != "" {
					// token 必须属于本任务：否则任何知道别人 token 的 agent 都能读其命中。
					t, err := store.Lookup(ctx, token)
					if err != nil {
						return actool.Errorf("查询 OAST token 失败: " + err.Error()), nil
					}
					if t == nil || (taskID > 0 && t.TaskID != taskID) {
						return actool.Errorf(fmt.Sprintf("token %s 不存在或不属于本任务", token)), nil
					}
				}
				hits, err := store.Poll(ctx, taskID, token, in.AfterID, in.Limit)
				if err != nil {
					return actool.Errorf("查询 OAST 命中失败: " + err.Error()), nil
				}
				out := make([]map[string]any, 0, len(hits))
				var maxID int64
				for _, h := range hits {
					if h.ID > maxID {
						maxID = h.ID
					}
					body := h.Body
					if len(body) > 400 {
						body = body[:400]
					}
					out = append(out, map[string]any{
						"id": h.ID, "token": h.Token, "method": h.Method, "host": h.Host,
						"path": h.Path, "query": h.Query, "remote_addr": h.RemoteAddr,
						"headers": h.Headers, "body": body, "at": h.CreatedAt.Format("2006-01-02 15:04:05"),
					})
				}
				return jsonResult(map[string]any{
					"hits": out, "count": len(out), "max_id": maxID,
					"next_after_id": maxID,
					"note":          "count=0 不代表漏洞不存在：确认请求真的带上了 token，并给目标留出出网/解析时间后重试。",
				})
			}),
	}
}

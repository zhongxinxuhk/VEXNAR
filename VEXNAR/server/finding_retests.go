// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	actool "github.com/Autumn-27/norma/tool"
	"github.com/zhongxinxuhk/vexnar/agent"
	"github.com/zhongxinxuhk/vexnar/db"
	"github.com/zhongxinxuhk/vexnar/intercept"
)

func (s *Server) listActiveFindingRetests(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	items, err := pg.ListActiveFindingRetests(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"retests": items})
}

func (s *Server) listFindingRetests(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok || id <= 0 {
		writeErr(w, 400, "bad finding id")
		return
	}
	f, err := pg.GetFinding(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if f == nil {
		writeErr(w, 404, "finding not found")
		return
	}
	items, err := pg.ListFindingRetests(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"retests": items})
}

func (s *Server) startFindingRetest(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok || id <= 0 {
		writeErr(w, 400, "bad finding id")
		return
	}
	var req struct {
		Notes string `json:"notes"`
	}
	if !decodeConversationRequest(w, r, &req) {
		return
	}
	req.Notes = strings.TrimSpace(req.Notes)
	if utf8.RuneCountInString(req.Notes) > 4000 {
		writeErr(w, 400, "复测补充说明最多 4000 个字符")
		return
	}
	retest, created, code, msg := s.enqueueRetest(r.Context(), id, req.Notes, db.RetestPurposeRetest)
	if msg != "" {
		writeErr(w, code, msg)
		return
	}
	if created {
		code = http.StatusAccepted
	}
	writeJSON(w, code, map[string]any{"retest": retest, "created": created})
}

// enqueueRetest 是人工复测与报告后独立验证的共用入口。一个 finding 同时只能有
// 一条活跃会话（DB 部分唯一索引），已有则复用并返回 created=false。
func (s *Server) enqueueRetest(ctx context.Context, findingID int64, notes, purpose string) (*db.FindingRetest, bool, int, string) {
	if s.m == nil || s.m.pg == nil {
		return nil, false, http.StatusInternalServerError, "数据库不可用"
	}
	pg := s.m.pg
	f, err := pg.GetFinding(findingID)
	if err != nil {
		return nil, false, http.StatusInternalServerError, err.Error()
	}
	if f == nil {
		return nil, false, http.StatusNotFound, "finding not found"
	}
	a, err := pg.GetAgentByKey(db.FindingRetestAgentKey)
	if err != nil {
		return nil, false, http.StatusInternalServerError, err.Error()
	}
	if a == nil || !a.Enabled {
		return nil, false, http.StatusConflict, "漏洞复测 Agent 不存在或未启用，请在 Agent 管理中配置 retester"
	}
	for _, key := range []string{"get_finding_retest_context", "record_finding_retest_result"} {
		t, err := pg.GetTool(key)
		if err != nil {
			return nil, false, http.StatusInternalServerError, err.Error()
		}
		if t == nil || !t.Enabled || !slices.Contains(t.Agents, a.Key) {
			return nil, false, http.StatusConflict, "请为复测 Agent 启用并绑定工具：" + key
		}
	}
	if s.resolveChatAgent(&db.Conversation{AgentKey: a.Key}) == nil {
		return nil, false, http.StatusServiceUnavailable, s.chatUnavailableReason()
	}
	if s.ctx != nil && s.ctx.Err() != nil {
		return nil, false, http.StatusServiceUnavailable, "服务正在停止"
	}
	var retest *db.FindingRetest
	var conv *db.Conversation
	var created bool
	if purpose == db.RetestPurposeVerify {
		retest, conv, created, err = pg.CreateFindingVerification(ctx, findingID, notes)
	} else {
		retest, conv, created, err = pg.CreateFindingRetest(ctx, findingID, notes)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, http.StatusNotFound, "finding not found"
	}
	if err != nil {
		return nil, false, http.StatusInternalServerError, err.Error()
	}
	if created {
		busyKey := s.convBusyKey(conv.ID)
		s.chatMu.Lock()
		s.chatBusy[busyKey] = true
		s.chatMu.Unlock()
		s.runConversation(conv, retest.InitialMessage(), busyKey)
	}
	return retest, created, http.StatusOK, ""
}

// settingFindingAutoVerify：报告后自动开独立验证。默认关闭，PUT /api/settings 可改。
const settingFindingAutoVerify = "finding_auto_verify"

// findingAutoVerifyEnabled 读平台设置；默认关闭，显式设置为 true 才自动开验证会话
// （每次验证都是一次真实 LLM 运行，不能被默认值悄悄放大成本）。
func (s *Server) findingAutoVerifyEnabled() bool {
	if s.m == nil || s.m.pg == nil {
		return false
	}
	v, ok, err := s.m.pg.GetSetting(settingFindingAutoVerify)
	if err != nil || !ok {
		return false
	}
	return strings.TrimSpace(v) == "true"
}

// enqueueFindingVerification 由 report_finding 落库后触发：不阻塞工具调用，
// 在后台排一条独立验证会话。验证失败/无法确认不会改漏洞状态。
func (s *Server) enqueueFindingVerification(findingID int64) {
	if findingID <= 0 || !s.findingAutoVerifyEnabled() {
		return
	}
	go func() {
		retest, created, code, msg := s.enqueueRetest(context.Background(), findingID, "由系统在漏洞上报后自动发起：请独立复现，不依赖原证据结论。", db.RetestPurposeVerify)
		if msg != "" {
			log.Printf("[verify %d] 未排入（%d）：%s", findingID, code, msg)
			return
		}
		if created {
			log.Printf("[verify %d] 已排入独立验证 #%d", findingID, retest.ID)
		}
	}()
}

// Both tools derive the finding from server-owned conversation context. Tool
// arguments cannot redirect a result into a different finding or conversation.
func (s *Server) findingRetestTools() []actool.CoreTool {
	return []actool.CoreTool{
		roTool("get_finding_retest_context", "读取当前复测会话关联的漏洞证据快照、复测状态、补充说明与当前任务约束。无参数，只能读取本会话。",
			objSchema(map[string]any{}), func(ctx context.Context, _ json.RawMessage) (actool.Result, error) {
				r, err := s.m.pg.FindingRetestForConversation(ctx, intercept.ConvIDFromContext(ctx))
				if err != nil {
					return actool.Errorf(err.Error()), nil
				}
				if r == nil {
					return actool.Errorf("当前会话未关联复测记录，请从漏洞详情发起复测"), nil
				}
				var constraints []db.Constraint
				f, err := s.m.pg.GetFinding(r.FindingID)
				if err != nil {
					return actool.Errorf(err.Error()), nil
				}
				if f != nil && f.TaskID != nil {
					if task, ok := s.m.Task(strconv.FormatInt(*f.TaskID, 10)); ok {
						constraints, err = task.Store.ListConstraints()
						if err != nil {
							return actool.Errorf(err.Error()), nil
						}
					}
				}
				return jsonResult(map[string]any{"retest": r, "current_constraints": constraints})
			}),
		wrTool("record_finding_retest_result", "为当前复测会话保存唯一结论；原漏洞证据与报告保持不变。会话成功结束且结论为 fixed 时，系统自动将漏洞状态改为已修复；独立验证会话（verify）的 reproduced/false_positive 会把仍待处理的漏洞改成已确认/误报；其他结论保留原状态。必须提供本次实际检查的证据，无法确认时写明阻塞原因。",
			objSchema(map[string]any{
				"verdict":  map[string]any{"type": "string", "enum": []string{"reproduced", "fixed", "inconclusive", "false_positive"}},
				"summary":  strParam("本次复测结论摘要"),
				"evidence": strParam("Markdown：本次实际步骤、观察、对照、结论依据；无法确认则列出已检查内容和阻塞原因"),
			}, "verdict", "summary", "evidence"), func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
				var a struct {
					Verdict  string `json:"verdict"`
					Summary  string `json:"summary"`
					Evidence string `json:"evidence"`
				}
				if err := json.Unmarshal(in, &a); err != nil {
					return actool.Errorf(err.Error()), nil
				}
				if err := s.m.pg.RecordFindingRetestResult(ctx, intercept.ConvIDFromContext(ctx), a.Verdict, a.Summary, a.Evidence); err != nil {
					return actool.Errorf(err.Error()), nil
				}
				return jsonResult(map[string]any{"saved": true, "verdict": a.Verdict})
			}),
	}
}

// Seed the editable agent atomically, without an automatic discovery trigger.
// Once seeded, user edits/deletion survive restarts; a pre-existing key is kept.
func (s *Server) seedFindingRetester() error {
	for _, t := range s.findingRetestTools() {
		schema, _ := json.Marshal(t.InputSchema())
		bindings, _ := json.Marshal([]string{db.FindingRetestAgentKey})
		if err := s.m.pg.SeedTool(t.Name(), t.Description(), schema, bindings); err != nil {
			return err
		}
	}
	const flag = "finding_retester_seed_v1"
	tx, err := s.m.pg.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Lock this migration, including concurrent server initialization.
	if _, err = tx.Exec(`SELECT pg_advisory_xact_lock(7337741010)`); err != nil {
		return err
	}
	var done string
	err = tx.QueryRow(`SELECT value FROM settings WHERE key=$1`, flag).Scan(&done)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if done == "true" {
		return nil
	}
	var id int64
	err = tx.QueryRow(`INSERT INTO agents(key,name,description,role,builtin,enabled)
	VALUES ($1,'漏洞复测','从漏洞详情手动启动，读取原证据并保存独立复测结论。','assistant',false,true)
	ON CONFLICT (key) DO NOTHING RETURNING id`, db.FindingRetestAgentKey).Scan(&id)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if id > 0 {
		var pid int64
		if err = tx.QueryRow(`INSERT INTO agent_prompts(agent_id,version,template_text,note,updated_by)
		VALUES ($1,1,$2,'内置默认','system') RETURNING id`, id, agent.RetesterDefaultPrompt).Scan(&pid); err != nil {
			return err
		}
		if _, err = tx.Exec(`UPDATE agents SET current_prompt_id=$1 WHERE id=$2`, pid, id); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(`INSERT INTO settings(key,value) VALUES ($1,'true') ON CONFLICT(key) DO UPDATE SET value='true'`, flag); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Server) finishRetest(id int64, status, reason string) {
	if err := s.m.pg.FinishFindingRetest(id, status, reason); err != nil {
		// Surface failure to the conversation runner rather than inventing a result.
		log.Printf("[retest %d] finish: %v", id, err)
	}
}

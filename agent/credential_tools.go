package agent

import (
	"context"
	"encoding/json"

	actool "github.com/Autumn-27/norma/tool"
	"github.com/zhongxinxuhk/vexnar/db"
)

// R2.1：凭据/会话成为任务级一等资产。一个 worker 登录后登记，同任务其它
// worker 可直接复用——不再靠 planner 在意图描述里复述 cookie。
//
// 关键约束：
//   - 列表只给元数据（是否可取明文），避免每轮上下文堆满口令；
//   - 取明文必须显式调用 get_*，并限定任务（跨任务取不到）；
//   - 明文不得写进漏洞报告/证据，工具返回值里带提醒。

func (t *ToolSet) listCredentials() actool.CoreTool {
	return t.readExpTool("list_credentials",
		"查本任务已获得的凭据与会话（元数据，不含明文）。做需要登录态的利用前先看这里，不要凭记忆假设某个账号还能用。返回：凭据（类型/用户名/作用域/来源/是否可取明文）与会话（label/身份/是否带请求头/过期时间）。要实际使用请调用 get_credential / get_session。",
		obj(map[string]any{
			"asset_id": map[string]any{"type": "integer", "description": "可选。只看该资产上的凭据/会话（任务级条目仍返回）"},
		}),
		func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
			var in struct {
				AssetID int64 `json:"asset_id"`
			}
			_ = json.Unmarshal(raw, &in)
			if t.ts == nil || t.taskID <= 0 {
				return actool.Errorf("list_credentials 需要任务上下文"), nil
			}
			var assetPtr *int64
			if in.AssetID > 0 {
				v := in.AssetID
				assetPtr = &v
			}
			creds, err := t.ts.DB().ListCredentials(ctx, t.taskID, assetPtr)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			sessions, err := t.ts.DB().ListSessions(ctx, t.taskID, assetPtr)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return jsonResult(map[string]any{
				"credentials": creds, "sessions": sessions,
				"note": "明文需要用 get_credential/get_session 单独取；不要把明文写进漏洞报告或证据。",
			})
		})
}

func (t *ToolSet) getCredential() actool.CoreTool {
	return t.readExpTool("get_credential",
		"按 ID 取一份凭据的明文（仅限本任务）。只在确实要发起登录/认证时调用；拿到后直接用于请求，不要复述到报告或证据里。会话请用 get_session。",
		obj(map[string]any{
			"id": map[string]any{"type": "integer", "description": "list_credentials 返回的凭据 ID"},
		}, "id"),
		func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
			var in struct {
				ID int64 `json:"id"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if t.ts == nil || t.taskID <= 0 {
				return actool.Errorf("get_credential 需要任务上下文"), nil
			}
			c, err := t.ts.DB().GetCredential(ctx, t.taskID, in.ID)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if c == nil {
				return actool.Errorf("凭据不存在、已过期或不属于本任务"), nil
			}
			return jsonResult(map[string]any{"credential": c, "note": "明文仅用于本次认证，不要写入报告/证据。"})
		})
}

func (t *ToolSet) recordCredential() actool.CoreTool {
	return t.writeExpTool("record_credential",
		"登记一份可复用凭据（登录成功后、读到配置/备份中的口令、拿到 API key 时调用）。同一 task+类型+资产+作用域+用户名 会更新而不是新增。必须给出 secret 与来源说明；不要登记猜测值。",
		obj(map[string]any{
			"kind":               map[string]any{"type": "string", "enum": []string{"password", "hash", "token", "key", "basic"}, "description": "凭据类型，默认 password"},
			"secret":             map[string]any{"type": "string", "description": "凭据本体（口令/哈希/令牌/密钥）"},
			"username":           map[string]any{"type": "string", "description": "可选。用户名/账号"},
			"asset_id":           map[string]any{"type": "integer", "description": "可选。凭据适用的资产"},
			"scope":              map[string]any{"type": "string", "description": "可选。作用域：登录入口/域名/设备"},
			"source":             map[string]any{"type": "string", "description": "可选。来源：brute/leak/manual/finding"},
			"source_finding_id":  map[string]any{"type": "integer", "description": "可选。来源漏洞 ID"},
			"notes":              map[string]any{"type": "string", "description": "可选。备注（权限范围、验证方式）"},
			"expires_in_seconds": map[string]any{"type": "integer", "description": "可选。有效期"},
		}, "kind", "secret"),
		func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
			var in struct {
				Kind             string `json:"kind"`
				Secret           string `json:"secret"`
				Username         string `json:"username"`
				AssetID          int64  `json:"asset_id"`
				Scope            string `json:"scope"`
				Source           string `json:"source"`
				SourceFindingID  int64  `json:"source_finding_id"`
				Notes            string `json:"notes"`
				ExpiresInSeconds int64  `json:"expires_in_seconds"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if t.ts == nil || t.taskID <= 0 {
				return actool.Errorf("record_credential 需要任务上下文"), nil
			}
			inp := db.CredentialInput{TaskID: t.taskID, Kind: in.Kind, Secret: in.Secret, Username: in.Username,
				Scope: in.Scope, Source: in.Source, Notes: in.Notes, ExpiresInSeconds: in.ExpiresInSeconds}
			if in.AssetID > 0 {
				v := in.AssetID
				inp.AssetID = &v
			}
			if in.SourceFindingID > 0 {
				v := in.SourceFindingID
				inp.SourceFindingID = &v
			}
			c, created, err := t.ts.DB().RecordCredential(ctx, inp)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			// 返回值不回显明文，避免它在对话里再复制一遍。
			c.Secret = ""
			return jsonResult(map[string]any{"credential": c, "created": created})
		})
}

func (t *ToolSet) listSessions() actool.CoreTool {
	return t.readExpTool("list_sessions",
		"查本任务已登记的登录态（元数据，不含请求头）。做已认证测试前先看这里；要复用请调用 get_session 取请求头。",
		obj(map[string]any{
			"asset_id": map[string]any{"type": "integer", "description": "可选。只看该资产上的会话"},
		}),
		func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
			var in struct {
				AssetID int64 `json:"asset_id"`
			}
			_ = json.Unmarshal(raw, &in)
			if t.ts == nil || t.taskID <= 0 {
				return actool.Errorf("list_sessions 需要任务上下文"), nil
			}
			var assetPtr *int64
			if in.AssetID > 0 {
				v := in.AssetID
				assetPtr = &v
			}
			items, err := t.ts.DB().ListSessions(ctx, t.taskID, assetPtr)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return jsonResult(map[string]any{"sessions": items})
		})
}

func (t *ToolSet) getSession() actool.CoreTool {
	return t.readExpTool("get_session",
		"按 ID 取一份会话的请求头（Cookie/Authorization，仅限本任务）。拿到后直接放进请求，不要复述到报告/证据。",
		obj(map[string]any{
			"id": map[string]any{"type": "integer", "description": "list_sessions 返回的会话 ID"},
		}, "id"),
		func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
			var in struct {
				ID int64 `json:"id"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if t.ts == nil || t.taskID <= 0 {
				return actool.Errorf("get_session 需要任务上下文"), nil
			}
			s, err := t.ts.DB().GetSession(ctx, t.taskID, in.ID)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if s == nil {
				return actool.Errorf("会话不存在、已过期或不属于本任务"), nil
			}
			return jsonResult(map[string]any{"session": s, "note": "请求头仅用于本次测试，不要写入报告/证据。"})
		})
}

func (t *ToolSet) recordSession() actool.CoreTool {
	return t.writeExpTool("record_session",
		"登记一份可复用登录态（登录成功后立即调用）：headers 传可直接回放的请求头，如 {\"Cookie\":\"SESSION=...\"} 或 {\"Authorization\":\"Bearer ...\"}。同一 task+资产+label 会更新。令牌/会话类请填 expires_in_seconds，过期后系统自动不再返回。",
		obj(map[string]any{
			"label":              map[string]any{"type": "string", "description": "会话标识：账号/角色/入口，例如 admin@/login"},
			"kind":               map[string]any{"type": "string", "enum": []string{"cookie", "bearer", "basic", "custom"}, "description": "会话类型，默认 cookie"},
			"headers":            map[string]any{"type": "object", "description": "可直接回放的请求头"},
			"identity":           map[string]any{"type": "string", "description": "可选。登录身份/角色"},
			"asset_id":           map[string]any{"type": "integer", "description": "可选。会话对应的资产"},
			"source":             map[string]any{"type": "string", "description": "可选。来源说明"},
			"source_finding_id":  map[string]any{"type": "integer", "description": "可选。来源漏洞 ID"},
			"notes":              map[string]any{"type": "string", "description": "可选。备注"},
			"expires_in_seconds": map[string]any{"type": "integer", "description": "可选。有效期"},
		}, "label", "headers"),
		func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
			var in struct {
				Label            string          `json:"label"`
				Kind             string          `json:"kind"`
				Headers          json.RawMessage `json:"headers"`
				Identity         string          `json:"identity"`
				AssetID          int64           `json:"asset_id"`
				Source           string          `json:"source"`
				SourceFindingID  int64           `json:"source_finding_id"`
				Notes            string          `json:"notes"`
				ExpiresInSeconds int64           `json:"expires_in_seconds"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if t.ts == nil || t.taskID <= 0 {
				return actool.Errorf("record_session 需要任务上下文"), nil
			}
			inp := db.SessionInput{TaskID: t.taskID, Label: in.Label, Kind: in.Kind, Headers: in.Headers,
				Identity: in.Identity, Source: in.Source, Notes: in.Notes, ExpiresInSeconds: in.ExpiresInSeconds}
			if in.AssetID > 0 {
				v := in.AssetID
				inp.AssetID = &v
			}
			if in.SourceFindingID > 0 {
				v := in.SourceFindingID
				inp.SourceFindingID = &v
			}
			s, created, err := t.ts.DB().RecordSession(ctx, inp)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			s.Headers = nil // 不回显请求头
			return jsonResult(map[string]any{"session": s, "created": created})
		})
}

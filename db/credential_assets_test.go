package db

import (
	"context"
	"testing"
)

// R2.1：凭据与会话是任务级可复用资产。
func TestR21CredentialUpsertAndScoping(t *testing.T) {
	d, taskA := capabilityTestTask(t)
	_, taskB := capabilityTestTask(t)
	ctx := context.Background()

	first, created, err := d.RecordCredential(ctx, CredentialInput{
		TaskID: taskA, Kind: "password", Username: "admin", Secret: "P@ssw0rd!", Scope: "/login",
	})
	if err != nil || !created {
		t.Fatalf("record: created=%v err=%v", created, err)
	}
	second, created2, err := d.RecordCredential(ctx, CredentialInput{
		TaskID: taskA, Kind: "password", Username: "admin", Secret: "N3wP@ss", Scope: "/login",
	})
	if err != nil || created2 {
		t.Fatalf("重复登记应更新: created=%v err=%v", created2, err)
	}
	if first.ID != second.ID || second.Secret != "N3wP@ss" {
		t.Fatalf("未复用同一行或值未更新: %+v", second)
	}

	list, err := d.ListCredentials(ctx, taskA, nil)
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %+v err=%v", list, err)
	}
	if list[0].Secret != "" || !list[0].SecretSet {
		t.Fatalf("列表不得带明文，且应标记可取: %+v", list[0])
	}

	if got, err := d.GetCredential(ctx, taskA, first.ID); err != nil || got == nil || got.Secret != "N3wP@ss" {
		t.Fatalf("按任务取用失败: %+v err=%v", got, err)
	}
	if got, err := d.GetCredential(ctx, taskB, first.ID); err != nil || got != nil {
		t.Fatalf("跨任务必须取不到: %+v err=%v", got, err)
	}
}

func TestR21SessionReuseAndExpiry(t *testing.T) {
	d, taskID := capabilityTestTask(t)
	ctx := context.Background()

	s, created, err := d.RecordSession(ctx, SessionInput{
		TaskID: taskID, Label: "admin@/login", Kind: "cookie",
		Headers: []byte(`{"Cookie":"SESSION=abc123"}`), Identity: "admin",
	})
	if err != nil || !created {
		t.Fatalf("record session: created=%v err=%v", created, err)
	}
	list, err := d.ListSessions(ctx, taskID, nil)
	if err != nil || len(list) != 1 || !list[0].HeadersSet || string(list[0].Headers) != "{}" {
		t.Fatalf("会话列表应带标记且不带请求头: %+v err=%v", list, err)
	}
	got, err := d.GetSession(ctx, taskID, s.ID)
	if err != nil || got == nil || len(got.Headers) == 0 {
		t.Fatalf("取会话头失败: %+v err=%v", got, err)
	}
	if got.LastUsedAt == nil {
		t.Fatalf("取用后应刷新 last_used_at: %+v", got)
	}

	if _, err := d.Exec(`UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id=$1`, s.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := d.ListSessions(ctx, taskID, nil); len(list) != 0 {
		t.Fatalf("过期会话不应返回: %+v", list)
	}
	if got, _ := d.GetSession(ctx, taskID, s.ID); got != nil {
		t.Fatalf("过期会话不应可取: %+v", got)
	}
}

func TestR21Validation(t *testing.T) {
	d, taskID := capabilityTestTask(t)
	ctx := context.Background()

	if _, _, err := d.RecordCredential(ctx, CredentialInput{TaskID: taskID, Kind: "password"}); err == nil {
		t.Fatal("空凭据应被拒绝")
	}
	if _, _, err := d.RecordCredential(ctx, CredentialInput{TaskID: taskID, Kind: "telepathy", Secret: "x"}); err == nil {
		t.Fatal("未知类型应被拒绝")
	}
	if _, _, err := d.RecordSession(ctx, SessionInput{TaskID: taskID, Label: "a"}); err == nil {
		t.Fatal("空请求头应被拒绝")
	}
	if _, _, err := d.RecordSession(ctx, SessionInput{TaskID: taskID, Headers: []byte(`{"Cookie":"x"}`)}); err == nil {
		t.Fatal("缺少 label 应被拒绝")
	}
}

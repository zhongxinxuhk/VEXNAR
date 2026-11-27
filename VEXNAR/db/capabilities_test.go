// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// capabilityTestTask 建一个独立任务，返回连接与 taskID；清理靠 tasks 级联。
func capabilityTestTask(t *testing.T) (*DB, int64) {
	t.Helper()
	d := openOASTTestDB(t)
	ctx := context.Background()
	var expID, taskID int64
	if err := d.QueryRowContext(ctx,
		`INSERT INTO explorations(description,goal) VALUES ('cap-test','g') RETURNING id`).Scan(&expID); err != nil {
		t.Fatalf("seed exploration: %v", err)
	}
	if err := d.QueryRowContext(ctx,
		`INSERT INTO tasks(description,goal,exploration_id) VALUES ('cap-test','g',$1) RETURNING id`, expID).Scan(&taskID); err != nil {
		t.Fatalf("seed task: %v", err)
	}
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM tasks WHERE id=$1`, taskID)
		_, _ = d.Exec(`DELETE FROM explorations WHERE id=$1`, expID)
	})
	return d, taskID
}

func TestRecordCapabilityIdempotent(t *testing.T) {
	d, taskID := capabilityTestTask(t)
	ctx := context.Background()

	first, created, err := d.RecordCapability(ctx, CapabilityInput{
		TaskID: taskID, Kind: "NET_Reachable", Evidence: "SSRF 回调命中 oast", Scope: "",
	})
	if err != nil || !created {
		t.Fatalf("record: created=%v err=%v", created, err)
	}
	second, created2, err := d.RecordCapability(ctx, CapabilityInput{
		TaskID: taskID, Kind: "net_reachable", Evidence: "再次验证：内网 10.0.0.5:8080 可访问", Scope: "",
	})
	if err != nil || created2 {
		t.Fatalf("重复登记应更新而非新增: created=%v err=%v", created2, err)
	}
	if first.ID != second.ID || !strings.Contains(second.Evidence, "10.0.0.5") {
		t.Fatalf("未复用同一行或证据未更新: %+v", second)
	}
	if _, _, err := d.RecordCapability(ctx, CapabilityInput{TaskID: taskID, Kind: "net_reachable"}); err == nil {
		t.Fatal("空证据应被拒绝")
	}
	if _, _, err := d.RecordCapability(ctx, CapabilityInput{TaskID: taskID, Kind: "no_such_kind", Evidence: "x"}); err == nil {
		t.Fatal("未知能力应被拒绝")
	}
}

func TestListCapabilitiesExpiryAndTaskIsolation(t *testing.T) {
	d, taskA := capabilityTestTask(t)
	_, taskB := capabilityTestTask(t)
	ctx := context.Background()

	ca, _, err := d.RecordCapability(ctx, CapabilityInput{TaskID: taskA, Kind: "file_read", Evidence: "LFI 读取 /etc/passwd"})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := d.RecordCapability(ctx, CapabilityInput{TaskID: taskB, Kind: "cmd_exec", Evidence: "RCE 回显 id"}); err != nil {
		t.Fatal(err)
	}
	items, err := d.ListCapabilities(ctx, taskA, nil, "")
	if err != nil || len(items) != 1 || items[0].Kind != "file_read" {
		t.Fatalf("任务隔离失败: %+v err=%v", items, err)
	}

	if _, err := d.Exec(`UPDATE capabilities SET expires_at = now() - interval '1 minute' WHERE id=$1`, ca.ID); err != nil {
		t.Fatal(err)
	}
	items, err = d.ListCapabilities(ctx, taskA, nil, "")
	if err != nil || len(items) != 0 {
		t.Fatalf("过期能力不应返回: %+v err=%v", items, err)
	}
}

func TestCapabilitiesDerivedFromConfirmedFinding(t *testing.T) {
	d, taskID := capabilityTestTask(t)
	ctx := context.Background()

	var fid int64
	if err := d.QueryRowContext(ctx,
		`INSERT INTO findings(task_id, vulnclass, name, severity, summary, evidence, status)
		 VALUES ($1,'sqli','SQL 注入','high','s','e','pending') RETURNING id`, taskID).Scan(&fid); err != nil {
		t.Fatalf("seed finding: %v", err)
	}

	if _, _, _, err := d.SetFindingStatusWithNotify(ctx, fid, FindingConfirmed); err != nil {
		t.Fatalf("confirm: %v", err)
	}
	items, err := d.ListCapabilities(ctx, taskID, nil, "db_read")
	if err != nil || len(items) != 1 {
		t.Fatalf("确认后应推导出 db_read: %+v err=%v", items, err)
	}
	c := items[0]
	if c.Origin != "derived" || !strings.Contains(c.DerivationRule, "sqli") || c.SourceFindingID == nil || *c.SourceFindingID != fid {
		t.Fatalf("推导链不完整: %+v", c)
	}
	var links int
	if err := d.QueryRowContext(ctx,
		`SELECT count(*) FROM finding_capabilities WHERE finding_id=$1 AND capability_id=$2`, fid, c.ID).Scan(&links); err != nil || links != 1 {
		t.Fatalf("来源关联缺失: links=%d err=%v", links, err)
	}

	// 修复后撤销推导能力。
	if _, _, _, err := d.SetFindingStatusWithNotify(ctx, fid, FindingFixed); err != nil {
		t.Fatal(err)
	}
	if items, _ := d.ListCapabilities(ctx, taskID, nil, "db_read"); len(items) != 0 {
		t.Fatalf("修复后能力应被撤销: %+v", items)
	}

	// 人工显式登记优先于自动推导：再次确认不应把 origin 降级。
	if _, _, err := d.RecordCapability(ctx, CapabilityInput{TaskID: taskID, Kind: "db_read", Evidence: "手工验证：可读 app.users"}); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := d.SetFindingStatusWithNotify(ctx, fid, FindingConfirmed); err != nil {
		t.Fatal(err)
	}
	items, _ = d.ListCapabilities(ctx, taskID, nil, "db_read")
	if len(items) != 1 || items[0].Origin != "explicit" || items[0].DerivationRule != "" {
		t.Fatalf("显式能力被推导覆盖: %+v", items)
	}
}

func TestCapabilityErrorsAreTyped(t *testing.T) {
	d, _ := capabilityTestTask(t)
	_, _, err := d.RecordCapability(context.Background(), CapabilityInput{TaskID: 0, Kind: "cmd_exec", Evidence: "x"})
	if err == nil || errors.Is(err, nil) {
		t.Fatal("task_id=0 应报错")
	}
}

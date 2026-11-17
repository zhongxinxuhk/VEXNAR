package db

import (
	"context"
	"testing"
)

func TestTaskMetrics(t *testing.T) {
	d := openOASTTestDB(t)
	ctx := context.Background()

	var expID int64
	if err := d.QueryRowContext(ctx,
		`INSERT INTO explorations(description, goal) VALUES ('metrics-test','g') RETURNING id`).Scan(&expID); err != nil {
		t.Fatalf("seed exploration: %v", err)
	}
	var taskID int64
	if err := d.QueryRowContext(ctx,
		`INSERT INTO tasks(description, goal, exploration_id) VALUES ('metrics-test','g',$1) RETURNING id`,
		expID).Scan(&taskID); err != nil {
		t.Fatalf("seed task: %v", err)
	}
	t.Cleanup(func() {
		d.Exec(`DELETE FROM findings WHERE task_id=$1`, taskID) //nolint:errcheck
		d.Exec(`DELETE FROM tasks WHERE id=$1`, taskID)         //nolint:errcheck
		d.Exec(`DELETE FROM explorations WHERE id=$1`, expID)   //nolint:errcheck
	})

	for _, f := range []struct{ vc, sev string }{{"sqli", "critical"}, {"sqli", "high"}, {"xss", "medium"}} {
		if _, err := d.ExecContext(ctx,
			`INSERT INTO findings(task_id, vulnclass, name, severity, summary, evidence)
			 VALUES ($1,$2,$2,$3,'s','e')`, taskID, f.vc, f.sev); err != nil {
			t.Fatalf("seed finding: %v", err)
		}
	}

	// 两个 done 意图：一个产出 fact（有效），一个没有下游（无效）。
	var withYield, noYield int64
	if err := d.QueryRowContext(ctx,
		`INSERT INTO exploration_nodes(exploration_id, kind, payload, state) VALUES ($1,'intent','{"summary":"a"}','done') RETURNING id`,
		expID).Scan(&withYield); err != nil {
		t.Fatalf("seed intent: %v", err)
	}
	if err := d.QueryRowContext(ctx,
		`INSERT INTO exploration_nodes(exploration_id, kind, payload, state) VALUES ($1,'intent','{"summary":"b"}','done') RETURNING id`,
		expID).Scan(&noYield); err != nil {
		t.Fatalf("seed intent: %v", err)
	}
	var factID int64
	if err := d.QueryRowContext(ctx,
		`INSERT INTO exploration_nodes(exploration_id, kind, payload, state) VALUES ($1,'fact','{"summary":"f"}','confirmed') RETURNING id`,
		expID).Scan(&factID); err != nil {
		t.Fatalf("seed fact: %v", err)
	}
	if _, err := d.ExecContext(ctx,
		`INSERT INTO exploration_edges(exploration_id, src_id, dst_id, rel) VALUES ($1,$2,$3,'yields')`,
		expID, withYield, factID); err != nil {
		t.Fatalf("seed edge: %v", err)
	}

	m, err := d.TaskMetrics(ctx, taskID)
	if err != nil {
		t.Fatalf("TaskMetrics: %v", err)
	}
	if m.FindingsTotal != 3 {
		t.Errorf("findings_total = %d，期望 3", m.FindingsTotal)
	}
	if m.FindingsBySeverity["critical"] != 1 || m.FindingsByVulnclass["sqli"] != 2 {
		t.Errorf("分组不正确: %+v / %+v", m.FindingsBySeverity, m.FindingsByVulnclass)
	}
	if m.MTTDSeconds == nil || *m.MTTDSeconds < 0 {
		t.Errorf("MTTD 应有非负值，得到 %v", m.MTTDSeconds)
	}
	if m.Intents["done"] != 2 || m.DoneIntents != 2 {
		t.Errorf("意图统计不正确: %+v", m.Intents)
	}
	if m.NoYieldDone != 1 {
		t.Errorf("no_yield_done = %d，期望 1", m.NoYieldDone)
	}
	if m.YieldRate != 0.5 {
		t.Errorf("yield_rate = %v，期望 0.5", m.YieldRate)
	}
}

func TestTaskMetricsNotFound(t *testing.T) {
	d := openOASTTestDB(t)
	if _, err := d.TaskMetrics(context.Background(), 1<<60); err != ErrTaskNotFound {
		t.Fatalf("期望 ErrTaskNotFound，得到 %v", err)
	}
}

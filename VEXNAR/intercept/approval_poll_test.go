// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package intercept

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/zhongxinxuhk/vexnar/db"
)

// The desktop app and the web console can run as separate Go processes over the
// same PostgreSQL database. A decision written by one process never reaches the
// other process's in-memory channel, so HandleAsk must also observe the row.
func TestHandleAskObservesDecisionFromAnotherProcess(t *testing.T) {
	dsn, _, err := db.DSN()
	if err != nil {
		t.Skip("no test database configured")
	}
	d, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })

	taskID := fmt.Sprintf("approval-cross-process-%d", time.Now().UnixNano())
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, taskID) })

	ic := New(d)
	ctx := WithTaskContext(t.Context(), taskID, "test-agent", func(activity db.Activity) {
		if activity.Kind != "intercept_request" {
			return
		}
		var detail struct {
			ID int64 `json:"pending_id"`
		}
		if err := json.Unmarshal([]byte(activity.Detail), &detail); err != nil {
			t.Errorf("decode pending id: %v", err)
			return
		}
		// Simulate the web console (a different process) settling the row
		// directly against the shared database.
		go func() {
			time.Sleep(200 * time.Millisecond)
			if _, err := d.ResolveIntercept(detail.ID, "allowed", "allow", "decided by another process"); err != nil {
				t.Errorf("resolve intercept: %v", err)
			}
		}()
	})

	start := time.Now()
	allowed := ic.HandleAsk(ctx, 0, Decision{
		Action:         "ask",
		Message:        "cross-process approval",
		TimeoutEnabled: true,
		TimeoutSeconds: 5,
		TimeoutAction:  "deny",
	}, "Bash", []byte(`{"command":"ls"}`))
	if !allowed {
		t.Fatalf("HandleAsk returned false; the out-of-process decision was not observed")
	}
	if elapsed := time.Since(start); elapsed > 4*time.Second {
		t.Fatalf("cross-process decision took %s, expected a sub-second poll", elapsed)
	}

	rows, err := d.ListTaskIntercepts(taskID)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Status != "allowed" {
		t.Fatalf("unexpected pending rows: %+v", rows)
	}
}

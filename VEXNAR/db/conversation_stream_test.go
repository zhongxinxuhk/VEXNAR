// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import (
	"fmt"
	"testing"
	"time"
)

// A streamed answer grows in the row it was inserted into: clients that already
// rendered that seq only need to replace the text, never append a second row.
func TestUpdateConvActivityTextGrowsInPlace(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()

	suffix := time.Now().UnixNano()
	conv, err := d.CreateConversation("auto", fmt.Sprintf("stream-%d", suffix), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteConversation(conv.ID) })

	id, err := d.AppendConvActivity(conv.ID, Activity{Worker: "auto", Kind: "text", Summary: "你", Detail: "你"})
	if err != nil {
		t.Fatal(err)
	}
	if err := d.UpdateConvActivityText(conv.ID, id, "你好，我是 Auto。", "你好，我是 Auto。\n\n需要我做什么？"); err != nil {
		t.Fatal(err)
	}

	rows, _, err := d.ConvActivityListDetail(conv.ID, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("rows=%d, want the single grown row", len(rows))
	}
	if rows[0].ID != id {
		t.Fatalf("row id=%d, want %d", rows[0].ID, id)
	}
	if rows[0].Detail != "你好，我是 Auto。\n\n需要我做什么？" {
		t.Fatalf("detail=%q, want the full text", rows[0].Detail)
	}
	if rows[0].Summary != "你好，我是 Auto。" {
		t.Fatalf("summary=%q, want the rewritten preview", rows[0].Summary)
	}

	// A row belongs to its conversation: the same id under another thread is a no-op.
	other, err := d.CreateConversation("auto", fmt.Sprintf("stream-other-%d", suffix), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteConversation(other.ID) })
	if err := d.UpdateConvActivityText(other.ID, id, "hijacked", "hijacked"); err != nil {
		t.Fatal(err)
	}
	grown, _, err := d.ConvActivityListDetail(conv.ID, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if grown[0].Detail != "你好，我是 Auto。\n\n需要我做什么？" {
		t.Fatalf("cross-conversation update leaked: %q", grown[0].Detail)
	}
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// The desktop app asks the messages endpoint for detail=1 so a full assistant
// answer renders immediately. These two DB readers are the distinction behind
// that flag: the default payload stays summary-only (web lazy-loads details),
// the Detail variants must round-trip the full text unchanged.
func TestConversationActivityDetailVariants(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()

	suffix := time.Now().UnixNano()
	conv, err := d.CreateConversation("auto", fmt.Sprintf("detail-%d", suffix), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteConversation(conv.ID) })

	long := strings.Repeat("完整回答的行内容。", 80) // > the 200-rune summary cut
	steps := []Activity{
		{Worker: "auto", Kind: "user", Summary: "问题", Detail: `{"text":"问题全文"}`},
		{Worker: "auto", Kind: "text", Summary: firstN(long, 200), Detail: long},
		{Worker: "auto", Kind: "tool_use", Tool: "Bash", ToolUseID: "tool-1", Summary: "Bash pwd", Detail: `{"command":"pwd"}`},
		{Worker: "auto", Kind: "tool_result", Tool: "Bash", ToolUseID: "tool-1", Summary: "/tmp", Detail: "/tmp\n"},
	}
	for _, step := range steps {
		if _, err := d.AppendConvActivity(conv.ID, step); err != nil {
			t.Fatal(err)
		}
	}

	summaryOnly, cursor, err := d.ConvActivityList(conv.ID, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(summaryOnly) != len(steps) || cursor == 0 {
		t.Fatalf("summary list len=%d cursor=%d", len(summaryOnly), cursor)
	}
	for _, a := range summaryOnly {
		if a.Detail != "" {
			t.Fatalf("summary list leaked detail for kind %q", a.Kind)
		}
	}

	full, _, err := d.ConvActivityListDetail(conv.ID, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(full) != len(steps) {
		t.Fatalf("detail list len=%d", len(full))
	}
	for i, a := range full {
		if a.Detail != steps[i].Detail {
			t.Fatalf("step %d detail=%q, want %q", i, a.Detail, steps[i].Detail)
		}
	}

	page, hasMore, err := d.ConvActivityPageDetail(conv.ID, 0, 2)
	if err != nil {
		t.Fatal(err)
	}
	if !hasMore || len(page) != 2 {
		t.Fatalf("page len=%d hasMore=%v", len(page), hasMore)
	}
	if page[0].Kind != "tool_use" || page[1].Kind != "tool_result" {
		t.Fatalf("page kinds=%q,%q want the newest two steps in ascending order", page[0].Kind, page[1].Kind)
	}
	if page[0].Detail != steps[2].Detail || page[1].Detail != steps[3].Detail {
		t.Fatalf("page detail not included: %q,%q", page[0].Detail, page[1].Detail)
	}
}

func firstN(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

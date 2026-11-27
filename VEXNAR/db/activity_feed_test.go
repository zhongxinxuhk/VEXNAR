// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import "testing"

// TestActivityFeedWide covers the cross-task feed added for the console overview's
// activity card: no task scope, newest page first, oldest-last inside the page,
// snapshot cursor = newest id, and backward paging without overlap.
func TestActivityFeedWide(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()

	// Two tasks, so a per-task reader could never answer this shape.
	var expIDs []int64
	for _, name := range []string{"feed-A", "feed-B"} {
		expID, err := d.CreateExploration("test", name)
		if err != nil {
			t.Fatal(err)
		}
		expIDs = append(expIDs, expID)
		t.Cleanup(func() { d.Exec(`DELETE FROM explorations WHERE id=$1`, expID) })
	}

	esA, esB := d.Exploration(expIDs[0]), d.Exploration(expIDs[1])
	for i := range 5 {
		if _, err := esA.AppendActivity(Activity{Worker: "mainagent", Kind: "text", Summary: "a"}); err != nil {
			t.Fatal(err)
		}
		if i == 2 {
			if _, err := esB.AppendActivity(Activity{Worker: "mainagent", Kind: "text", Summary: "b"}); err != nil {
				t.Fatal(err)
			}
		}
	}

	items, snapshot, hasMore, err := d.ActivityFeed(0, 4)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 4 {
		t.Fatalf("page size = %d, want 4", len(items))
	}
	if !hasMore {
		t.Fatal("hasMore = false, want true (six rows exist)")
	}
	if snapshot < items[len(items)-1].ID {
		t.Fatalf("snapshot %d < newest page id %d", snapshot, items[len(items)-1].ID)
	}
	for i := 1; i < len(items); i++ {
		if items[i-1].ID >= items[i].ID {
			t.Fatalf("page not oldest-last: %d then %d", items[i-1].ID, items[i].ID)
		}
	}

	// Backward paging: strictly older than the page we just read, no overlap.
	older, _, _, err := d.ActivityFeed(items[0].ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range older {
		if row.ID >= items[0].ID {
			t.Fatalf("older page leaked id %d (boundary %d)", row.ID, items[0].ID)
		}
	}
	if len(older) == 0 {
		t.Fatal("older page empty, want the remaining rows")
	}

	// Both tasks must be visible: the feed is not scoped to one exploration, so
	// task A's rows and task B's single row both appear in the pages we read.
	seen := map[string]bool{}
	for _, row := range append(items, older...) {
		seen[row.Summary] = true
	}
	if !seen["a"] || !seen["b"] {
		t.Fatalf("feed did not span both tasks: %v", seen)
	}
	_ = expIDs
}

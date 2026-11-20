// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Project ownership must come from the database row, not from whatever directory
// a client has open: a thread belongs to exactly one project_id, unassigned
// threads stay out of every project list, and binding never silently reassigns.
func TestConversationProjectScope(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()
	ctx := context.Background()

	suffix := time.Now().UnixNano()
	rootA := filepath.Join(t.TempDir(), fmt.Sprintf("project-a-%d", suffix))
	rootB := filepath.Join(t.TempDir(), fmt.Sprintf("project-b-%d", suffix))
	for _, root := range []string{rootA, rootB} {
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	a, err := d.RegisterDesktopProject(ctx, rootA, "project-a")
	if err != nil {
		t.Fatal(err)
	}
	b, err := d.RegisterDesktopProject(ctx, rootB, "project-b")
	if err != nil {
		t.Fatal(err)
	}
	// Re-registering the same canonical path is idempotent and keeps the id.
	again, err := d.RegisterDesktopProject(ctx, rootA, "renamed")
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != a.ID || again.Name != a.Name {
		t.Fatalf("re-register changed project: %+v vs %+v", again, a)
	}
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM desktop_projects WHERE id = ANY($1)`, fmt.Sprintf("{%d,%d}", a.ID, b.ID))
	})

	inA, err := d.CreateConversationInProject("auto", fmt.Sprintf("a-%d", suffix), nil, &a.ID, rootA)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteConversation(inA.ID) })
	inB, err := d.CreateConversationInProject("auto", fmt.Sprintf("b-%d", suffix), nil, &b.ID, rootB)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteConversation(inB.ID) })
	loose, err := d.CreateConversation("auto", fmt.Sprintf("loose-%d", suffix), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteConversation(loose.ID) })

	if inA.ProjectID == nil || *inA.ProjectID != a.ID || inA.Workspace != rootA {
		t.Fatalf("project A conversation not bound: %+v", inA)
	}
	if loose.ProjectID != nil {
		t.Fatalf("unassigned conversation got a project: %+v", loose.ProjectID)
	}

	listA, err := d.ListConversationsByProject(a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(listA) != 1 || listA[0].ID != inA.ID {
		t.Fatalf("project A list = %+v", listA)
	}
	listB, err := d.ListConversationsByProject(b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(listB) != 1 || listB[0].ID != inB.ID {
		t.Fatalf("project B list = %+v", listB)
	}
	looseList, err := d.ListUnassignedConversations()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range looseList {
		if c.ID == loose.ID {
			found = true
		}
		if c.ID == inA.ID {
			t.Fatalf("bound conversation leaked into unassigned list")
		}
	}
	if !found {
		t.Fatalf("unassigned conversation missing from loose list")
	}

	// Binding moves the thread exactly once, and only from "unassigned".
	if err := d.SetConversationProject(loose.ID, b.ID); err != nil {
		t.Fatal(err)
	}
	moved, err := d.GetConversation(loose.ID)
	if err != nil || moved == nil {
		t.Fatalf("reload after bind: %v", err)
	}
	if moved.ProjectID == nil || *moved.ProjectID != b.ID {
		t.Fatalf("bind did not persist: %+v", moved.ProjectID)
	}
	if _, err := d.DesktopProjectByRoot(ctx, rootB); err != nil {
		t.Fatalf("lookup by root: %v", err)
	}
	if missing, err := d.DesktopProjectByRoot(ctx, filepath.Join(rootB, "nope")); err != nil || missing != nil {
		t.Fatalf("unknown root should be nil,nil: %+v %v", missing, err)
	}
}

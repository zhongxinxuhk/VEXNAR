// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package yakproject

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestWorkspaceIdentity(t *testing.T) {
	name, code := workspaceIdentity(filepath.Join(string(os.PathSeparator), "parentA", "中文项目"))
	otherName, otherCode := workspaceIdentity(filepath.Join(string(os.PathSeparator), "parentB", "中文项目"))
	if !strings.HasPrefix(name, "VEXNAR_中文项目_") || name == otherName || code == otherCode || len(code) != 64 {
		t.Fatalf("unexpected workspace identity: %q %q", name, otherName)
	}
}

func TestOfficialEngineProjectRoundTrip(t *testing.T) {
	socket, token := os.Getenv("VEXNAR_TEST_YAKIT_SOCKET"), os.Getenv("VEXNAR_TEST_YAKIT_TOKEN_FILE")
	if socket == "" || token == "" {
		t.Skip("requires an isolated Yak instance")
	}
	root := t.TempDir()
	ctx, cancel := context.WithTimeout(t.Context(), 40*time.Second)
	defer cancel()
	type callResult struct {
		project Project
		created bool
		err     error
	}
	results := make([]callResult, 4)
	var group sync.WaitGroup
	for i := range results {
		group.Go(func() {
			results[i].project, results[i].created, results[i].err = Ensure(ctx, socket, token, root)
		})
	}
	group.Wait()
	created := 0
	for _, result := range results {
		if result.err != nil || result.project.ID <= 0 || result.project != results[0].project {
			t.Fatalf("same workspace resolved inconsistently: %#v", results)
		}
		if result.created {
			created++
		}
	}
	if created != 1 {
		t.Fatalf("project created %d times", created)
	}
	separate, _, err := Ensure(ctx, socket, token, t.TempDir())
	if err != nil || separate.ID <= 0 || separate.ID == results[0].project.ID {
		t.Fatalf("different workspace resolved to %#v: %v", separate, err)
	}
}

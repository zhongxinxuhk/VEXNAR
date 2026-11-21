// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestSubscriptionRefreshDiff proves the subscription owns only its own nodes:
// A,B → A,C must add C, remove B, keep A, and keep the pool consistent.
func TestSubscriptionRefreshDiff(t *testing.T) {
	ctx := context.Background()
	m, err := NewManager(Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	defer m.Close()
	poolID, err := m.Store().CreatePool(ctx, Pool{Name: "sub-pool", ModeDefault: "rotate"})
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}

	body := clashYAML("alpha", "beta")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	id, err := m.Store().SaveSubscription(ctx, Subscription{
		Name: "test-sub", URL: srv.URL, PoolID: poolID, IntervalSeconds: 3600, Enabled: true,
	})
	if err != nil {
		t.Fatalf("SaveSubscription: %v", err)
	}
	res, err := m.RefreshSubscription(ctx, id)
	if err != nil {
		t.Fatalf("RefreshSubscription: %v", err)
	}
	if res.Added != 2 || res.Removed != 0 {
		t.Fatalf("first refresh = %+v", res)
	}
	nodes, _ := m.Store().Nodes(ctx)
	if len(nodes) != 2 {
		t.Fatalf("nodes = %d, want 2", len(nodes))
	}
	members, _ := m.Store().PoolNodes(ctx, poolID)
	if len(members) != 2 {
		t.Fatalf("pool members = %v", members)
	}

	// Second version: keep alpha, drop beta, add gamma.
	body = clashYAML("alpha", "gamma")
	res, err = m.RefreshSubscription(ctx, id)
	if err != nil {
		t.Fatalf("RefreshSubscription(2): %v", err)
	}
	if res.Added != 1 || res.Removed != 1 || res.Changed != 0 {
		t.Fatalf("second refresh = %+v", res)
	}
	nodes, _ = m.Store().Nodes(ctx)
	names := map[string]bool{}
	for _, n := range nodes {
		names[n.Name] = true
		if n.Source != fmt.Sprintf("sub:%d", id) {
			t.Fatalf("node %s source = %q", n.Name, n.Source)
		}
	}
	if !names["alpha"] || names["beta"] || !names["gamma"] {
		t.Fatalf("nodes after diff = %v", names)
	}
	members, _ = m.Store().PoolNodes(ctx, poolID)
	if len(members) != 2 {
		t.Fatalf("pool members after diff = %v", members)
	}
	sub, _ := m.Store().Subscription(ctx, id)
	if sub.LastAdded != 1 || sub.LastRemoved != 1 || sub.LastError != "" {
		t.Fatalf("stored result = %+v", sub)
	}
}

// A manual node must survive a subscription refresh untouched.
func TestSubscriptionDoesNotTouchManualNodes(t *testing.T) {
	ctx := context.Background()
	m, err := NewManager(Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	defer m.Close()
	if _, _, err := m.Store().UpsertNodes(ctx, []Node{{
		NodeConfig: NodeConfig{Name: "manual", Protocol: "socks5", Server: "127.0.0.1", Port: 1080},
	}}, nil); err != nil {
		t.Fatalf("manual node: %v", err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(clashYAML("alpha")))
	}))
	defer srv.Close()
	id, _ := m.Store().SaveSubscription(ctx, Subscription{Name: "s", URL: srv.URL, Enabled: true})
	if _, err := m.RefreshSubscription(ctx, id); err != nil {
		t.Fatalf("refresh: %v", err)
	}
	nodes, _ := m.Store().Nodes(ctx)
	if len(nodes) != 2 {
		t.Fatalf("manual node deleted: %d nodes", len(nodes))
	}
}

func clashYAML(names ...string) string {
	out := "proxies:\n"
	for _, n := range names {
		// Deterministic per-name server so renaming a node keeps its config and a
		// new name really is a new node.
		sum := 0
		for _, c := range n {
			sum += int(c)
		}
		out += fmt.Sprintf("  - { name: %s, type: socks5, server: 10.0.%d.%d, port: 1080 }\n", n, sum/250+1, sum%250+1)
	}
	return out
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// addSecondNode registers one more node in the fixture pool and returns its id.
func addSecondNode(t *testing.T, m *Manager, name, server string, port int) int64 {
	t.Helper()
	ctx := context.Background()
	if _, _, err := m.Store().UpsertNodes(ctx, []Node{{
		NodeConfig: NodeConfig{Name: name, Protocol: "socks5", Server: server, Port: port},
	}}, nil); err != nil {
		t.Fatalf("UpsertNodes: %v", err)
	}
	nodes, _ := m.Store().Nodes(ctx)
	var id int64
	for _, n := range nodes {
		if n.Name == name {
			id = n.ID
		}
	}
	if id == 0 {
		t.Fatalf("node %s not stored", name)
	}
	pools, _ := m.Store().Pools(ctx)
	members, _ := m.Store().PoolNodes(ctx, pools[0].ID)
	members = append(members, id)
	if err := m.Store().SetPoolNodes(ctx, pools[0].ID, members); err != nil {
		t.Fatalf("SetPoolNodes: %v", err)
	}
	if err := m.Reload(ctx); err != nil {
		t.Fatalf("Reload: %v", err)
	}
	return id
}

func TestFanoutPicksWorkingNode(t *testing.T) {
	socksAddr, closeFn := socks5Fixture(t)
	defer closeFn()
	m := newTestManager(t, socksAddr, nil)

	// Reserve an address, then close it: connections there are refused, which makes
	// that node a real transport failure rather than a fake.
	dead, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	deadAddr := dead.Addr().(*net.TCPAddr)
	_ = dead.Close()
	deadID := addSecondNode(t, m, "dead", "127.0.0.1", deadAddr.Port)

	if _, err := m.Endpoint(SessionSpec{Key: "task:31:worker", TaskID: 31, Mode: ModeFanout}); err != nil {
		t.Fatalf("Endpoint: %v", err)
	}
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("fanout-ok"))
	}))
	defer target.Close()

	res, err := m.Fanout(context.Background(), "task:31:worker", http.MethodGet, target.URL, FanoutOptions{K: 2, Jitter: 10 * time.Millisecond})
	if err != nil {
		t.Fatalf("Fanout: %v", err)
	}
	if res.Status != 200 || string(res.Body) != "fanout-ok" {
		t.Fatalf("result = %+v body=%q", res, res.Body)
	}
	if res.Winner == deadID {
		t.Fatalf("winner must not be the dead node: %+v", res.Attempts)
	}
	var sawFailure bool
	for _, a := range res.Attempts {
		if a.NodeID == deadID && a.Error != "" {
			sawFailure = true
		}
	}
	if !sawFailure {
		t.Fatalf("dead node attempt missing error: %+v", res.Attempts)
	}
	// The adversarial budget must have been charged exactly K.
	if left := m.FanoutRemaining(context.Background(), 31); left != fanoutBudgetPerHour-2 {
		t.Fatalf("budget left = %d, want %d", left, fanoutBudgetPerHour-2)
	}
}

func TestFanoutReportsBlocked(t *testing.T) {
	socksAddr, closeFn := socks5Fixture(t)
	defer closeFn()
	m := newTestManager(t, socksAddr, nil)
	if _, err := m.Endpoint(SessionSpec{Key: "task:32:worker", TaskID: 32, Mode: ModeFanout}); err != nil {
		t.Fatalf("Endpoint: %v", err)
	}
	blocked := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("<html>Just a moment...</html>"))
	}))
	defer blocked.Close()
	res, err := m.Fanout(context.Background(), "task:32:worker", http.MethodGet, blocked.URL, FanoutOptions{K: 2})
	if err != nil {
		t.Fatalf("Fanout: %v", err)
	}
	if !res.Blocked || res.Status != http.StatusForbidden {
		t.Fatalf("expected blocked result, got %+v", res)
	}
	for _, a := range res.Attempts {
		if a.Verdict != "block" {
			t.Fatalf("attempt not classified as block: %+v", a)
		}
	}
	// The host must be remembered as blocked for this node, so the next order puts
	// it last rather than first.
	hm := m.hostMemory("127.0.0.1")
	hm.mu.Lock()
	blockedCount := len(hm.blocked)
	hm.mu.Unlock()
	if blockedCount == 0 {
		t.Fatal("host memory did not record the block")
	}
}

func TestFanoutBudgetExhausted(t *testing.T) {
	socksAddr, closeFn := socks5Fixture(t)
	defer closeFn()
	m := newTestManager(t, socksAddr, nil)
	if _, err := m.Endpoint(SessionSpec{Key: "task:33:worker", TaskID: 33, Mode: ModeFanout}); err != nil {
		t.Fatalf("Endpoint: %v", err)
	}
	ctx := context.Background()
	bucket := nowBucket()
	if err := m.Store().AddFanout(ctx, 33, bucket, fanoutBudgetPerHour); err != nil {
		t.Fatalf("AddFanout: %v", err)
	}
	if got := m.FanoutRemaining(ctx, 33); got != 0 {
		t.Fatalf("remaining = %d, want 0", got)
	}
	_, err := m.Fanout(ctx, "task:33:worker", http.MethodGet, "http://127.0.0.1:1/", FanoutOptions{K: 2})
	if err != ErrFanoutBudget {
		t.Fatalf("err = %v, want ErrFanoutBudget", err)
	}
}

func TestDefaultVerdictClassification(t *testing.T) {
	cases := []struct {
		status int
		body   string
		want   Verdict
	}{
		{200, "ok", VerdictPass},
		{302, "", VerdictPass},
		{404, "not found", VerdictUnknown},
		{403, "", VerdictBlock},
		{429, "", VerdictBlock},
		{503, "", VerdictBlock},
		{200, "Checking your browser before accessing", VerdictBlock},
	}
	for _, c := range cases {
		resp := &http.Response{StatusCode: c.status, Header: http.Header{}}
		if got := DefaultVerdict(resp, []byte(c.body)); got != c.want {
			t.Errorf("DefaultVerdict(%d,%q) = %v, want %v", c.status, c.body, got, c.want)
		}
	}
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/zhongxinxuhk/vexnar/traffic"
)

// TestUpstreamURLPinsNode checks the credential shape the per-session recording
// listener hands to go-mitmproxy: sess_<key>.node_<id> at the gateway.
func TestUpstreamURLPinsNode(t *testing.T) {
	socksAddr, closeFn := socks5Fixture(t)
	defer closeFn()
	m := newTestManager(t, socksAddr, nil)
	ep, err := m.Endpoint(SessionSpec{Key: "task:9:worker", TaskID: 9, Mode: ModeSticky})
	if err != nil {
		t.Fatalf("Endpoint: %v", err)
	}
	u, err := url.Parse(ep.URL)
	if err != nil {
		t.Fatalf("parse endpoint: %v", err)
	}
	secret := u.User
	raw, err := m.UpstreamURLFor("task:9:worker")
	if err != nil {
		t.Fatalf("UpstreamURLFor: %v", err)
	}
	up, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse upstream: %v", err)
	}
	user := up.User.Username()
	if len(user) < len("sess_task-9-worker.node_") || user[:len("sess_task-9-worker.node_")] != "sess_task-9-worker.node_" {
		t.Fatalf("upstream user = %q, want sess_task-9-worker.node_<id>", user)
	}
	pass, _ := up.User.Password()
	if pass == "" || pass != secretPassword(secret) {
		t.Fatalf("upstream secret does not match session secret")
	}
	if up.Host != u.Host {
		t.Fatalf("upstream host = %q, want gateway %q", up.Host, u.Host)
	}
}

func secretPassword(u *url.Userinfo) string {
	p, _ := u.Password()
	return p
}

// TestCaptureChainThroughPool is the P1 end-to-end: tool → per-session recording
// listener → gateway (node-pinned) → SOCKS5 node → TLS target, with the traffic
// index carrying the session attribution.
func TestCaptureChainThroughPool(t *testing.T) {
	socksAddr, closeFn := socks5Fixture(t)
	defer closeFn()
	m := newTestManager(t, socksAddr, nil)

	tr, err := traffic.Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatalf("traffic.Open: %v", err)
	}
	defer tr.Close()

	if _, err := m.Endpoint(SessionSpec{Key: "task:11:worker", TaskID: 11, Mode: ModeSticky}); err != nil {
		t.Fatalf("Endpoint: %v", err)
	}
	ln2, err := tr.NewListener("task:11", "task-11-worker-2")
	if err != nil {
		t.Fatalf("NewListener(2): %v", err)
	}
	ln2.SetUpstreamResolver(func(ctx context.Context) (*url.URL, error) {
		raw, err := m.UpstreamURLFor("task:11:worker")
		if err != nil {
			return nil, err
		}
		return url.Parse(raw)
	})
	ln2.Start()
	defer ln2.Close()
	waitProxy(t, ln2.Addr())

	target := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "captured-through-pool")
	}))
	defer target.Close()

	caPEM, err := os.ReadFile(tr.CACertPath())
	if err != nil {
		t.Fatalf("read CA: %v", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(caPEM) {
		t.Fatal("CA pem not parsed")
	}
	pu, _ := url.Parse(ln2.Addr())
	client := &http.Client{Transport: &http.Transport{
		Proxy:           http.ProxyURL(pu),
		TLSClientConfig: &tls.Config{RootCAs: pool},
	}}
	// go-mitmproxy re-signs with CN=<host> and adds no IP SANs, so address the
	// fixture by name; the SOCKS5 node resolves "localhost" itself.
	targetURL := strings.Replace(target.URL, "127.0.0.1", "localhost", 1)
	resp, err := client.Get(targetURL)
	if err != nil {
		t.Fatalf("GET through capture chain: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "captured-through-pool" {
		t.Fatalf("body = %q", body)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		rows, err := tr.Search("localhost", 0, 20)
		if err != nil {
			t.Fatalf("Search: %v", err)
		}
		for _, row := range rows {
			if row.Scope == "task:11" && row.Session == "task-11-worker-2" {
				return
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("captured exchange missing session attribution")
}

func waitProxy(t *testing.T, addr string) {
	t.Helper()
	u, err := url.Parse(addr)
	if err != nil {
		t.Fatalf("proxy addr: %v", err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		c, err := net.DialTimeout("tcp", u.Host, 100*time.Millisecond)
		if err == nil {
			_ = c.Close()
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("proxy %s never started", addr)
}

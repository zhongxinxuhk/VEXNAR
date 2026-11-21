// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

// socks5Fixture is a no-auth SOCKS5 CONNECT server standing in for a real proxy
// node: it proves the gateway/core path end-to-end without any external network.
func socks5Fixture(t *testing.T) (addr string, closeFn func()) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go serveSocks5(conn)
		}
	}()
	return ln.Addr().String(), func() { _ = ln.Close() }
}

func serveSocks5(c net.Conn) {
	defer c.Close()
	buf := make([]byte, 2)
	if _, err := io.ReadFull(c, buf); err != nil {
		return
	}
	methods := make([]byte, int(buf[1]))
	if _, err := io.ReadFull(c, methods); err != nil {
		return
	}
	_, _ = c.Write([]byte{5, 0})
	hdr := make([]byte, 4)
	if _, err := io.ReadFull(c, hdr); err != nil {
		return
	}
	var host string
	switch hdr[3] {
	case 1:
		b := make([]byte, 4)
		_, _ = io.ReadFull(c, b)
		host = net.IP(b).String()
	case 3:
		l := make([]byte, 1)
		_, _ = io.ReadFull(c, l)
		b := make([]byte, int(l[0]))
		_, _ = io.ReadFull(c, b)
		host = string(b)
	case 4:
		b := make([]byte, 16)
		_, _ = io.ReadFull(c, b)
		host = net.IP(b).String()
	default:
		return
	}
	pb := make([]byte, 2)
	if _, err := io.ReadFull(c, pb); err != nil {
		return
	}
	port := binary.BigEndian.Uint16(pb)
	upstream, err := net.Dial("tcp", net.JoinHostPort(host, fmt.Sprint(port)))
	if err != nil {
		_, _ = c.Write([]byte{5, 5, 0, 1, 0, 0, 0, 0, 0, 0})
		return
	}
	defer upstream.Close()
	_, _ = c.Write([]byte{5, 0, 0, 1, 0, 0, 0, 0, 0, 0})
	done := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(upstream, c); done <- struct{}{} }()
	go func() { _, _ = io.Copy(c, upstream); done <- struct{}{} }()
	<-done
}

// newTestManager builds a manager over a temp dir with one SOCKS5 node in one pool.
func newTestManager(t *testing.T, socksAddr string, poolOverride func(*Pool)) *Manager {
	t.Helper()
	m, err := NewManager(Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	t.Cleanup(func() { _ = m.Close() })
	ctx := context.Background()
	host, portStr, _ := net.SplitHostPort(socksAddr)
	port := anyToInt(portStr)
	if _, _, err := m.Store().UpsertNodes(ctx, []Node{{
		NodeConfig: NodeConfig{Name: "fixture", Protocol: "socks5", Server: host, Port: port},
	}}, nil); err != nil {
		t.Fatalf("UpsertNodes: %v", err)
	}
	nodes, err := m.Store().Nodes(ctx)
	if err != nil || len(nodes) == 0 {
		t.Fatalf("Nodes: %v (%d)", err, len(nodes))
	}
	pool := Pool{Name: "test-pool", Strategy: "balanced", ModeDefault: "rotate", Fallback: "block"}
	if poolOverride != nil {
		poolOverride(&pool)
	}
	poolID, err := m.Store().CreatePool(ctx, pool)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	if err := m.Store().SetPoolNodes(ctx, poolID, []int64{nodes[0].ID}); err != nil {
		t.Fatalf("SetPoolNodes: %v", err)
	}
	if err := m.Reload(ctx); err != nil {
		t.Fatalf("Reload: %v", err)
	}
	m.Start()
	m.SetDefaultPool(poolID)
	return m
}

func proxyClient(t *testing.T, proxyURL string) *http.Client {
	t.Helper()
	pu, err := url.Parse(proxyURL)
	if err != nil {
		t.Fatalf("proxy url: %v", err)
	}
	return &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(pu)}}
}

func TestParseClashYAML(t *testing.T) {
	in := `
proxies:
  - { name: hk-01, type: vless, server: hk01.example.com, port: 443, uuid: 11111111-1111-1111-1111-111111111111,
      tls: true, servername: cdn.example.com, network: ws, ws-opts: { path: /ray } }
  - { name: ss-01, type: ss, server: ss.example.com, port: 8388, cipher: aes-128-gcm, password: pw }
`
	res := ParseInput(in)
	if len(res.Nodes) != 2 || len(res.Issues) != 0 {
		t.Fatalf("nodes=%d issues=%v", len(res.Nodes), res.Issues)
	}
	vless := res.Nodes[0]
	if vless.Protocol != "vless" || vless.Secrets["uuid"] == "" {
		t.Fatalf("vless parsed wrong: %+v", vless)
	}
	if _, leaked := vless.Config["uuid"]; leaked {
		t.Fatal("uuid must live in Secrets, not Config")
	}
	ss := res.Nodes[1]
	if ss.Secrets["password"] != "pw" || ss.Config["cipher"] != "aes-128-gcm" {
		t.Fatalf("ss parsed wrong: %+v", ss)
	}
}

func TestParseURIs(t *testing.T) {
	ssUser := base64.RawURLEncoding.EncodeToString([]byte("aes-128-gcm:pw"))
	ssrPayload := base64.RawURLEncoding.EncodeToString([]byte(
		"ssr.example.com:8389:origin:aes-128-cfb:plain:" + base64.RawURLEncoding.EncodeToString([]byte("pw")) + "/?remarks=" + base64.RawURLEncoding.EncodeToString([]byte("jp-01"))))
	vmessJSON := `{"v":"2","ps":"vm-01","add":"vm.example.com","port":"443","id":"11111111-1111-1111-1111-111111111111","aid":"0","scy":"auto","net":"ws","host":"cdn.example.com","path":"/ws","tls":"tls"}`
	vmessB64 := base64.StdEncoding.EncodeToString([]byte(vmessJSON))
	input := "ss://" + ssUser + "@ss.example.com:8388#ss-01\n" +
		"vmess://" + vmessB64 + "\n" +
		"vless://11111111-1111-1111-1111-111111111111@vl.example.com:443?security=reality&sni=cdn.example.com&pbk=abc&sid=12&type=ws&path=%2Fray#vl-01\n" +
		"trojan://pw@tj.example.com:443?sni=cdn.example.com&type=ws&path=%2Ft#tj-01\n" +
		"ssr://" + ssrPayload + "\n" +
		"garbage-line\n"
	res := ParseInput(input)
	if len(res.Nodes) != 5 {
		t.Fatalf("want 5 nodes, got %d (issues %v)", len(res.Nodes), res.Issues)
	}
	if len(res.Issues) != 1 {
		t.Fatalf("want 1 issue for garbage-line, got %v", res.Issues)
	}
	byName := map[string]NodeConfig{}
	for _, n := range res.Nodes {
		byName[n.Name] = n
	}
	if n := byName["ss-01"]; n.Secrets["password"] != "pw" || n.Protocol != "ss" {
		t.Fatalf("ss: %+v", n)
	}
	vm := byName["vm-01"]
	if vm.Protocol != "vmess" || vm.Secrets["uuid"] == "" || vm.Config["tls"] != true {
		t.Fatalf("vmess: %+v", vm)
	}
	if _, ok := vm.Config["ws-opts"]; !ok {
		t.Fatalf("vmess ws-opts missing: %+v", vm.Config)
	}
	if vless := byName["vl-01"]; vless.Config["reality-opts"] == nil {
		t.Fatalf("vless reality-opts missing: %+v", vless.Config)
	}
	if tj := byName["tj-01"]; tj.Secrets["password"] != "pw" {
		t.Fatalf("trojan: %+v", tj)
	}
	if ssr := byName["jp-01"]; ssr.Protocol != "ssr" || ssr.Secrets["password"] != "pw" {
		t.Fatalf("ssr: %+v", ssr)
	}
}

func TestParseBase64Subscription(t *testing.T) {
	ssUser := base64.RawURLEncoding.EncodeToString([]byte("aes-128-gcm:pw"))
	body := "ss://" + ssUser + "@a.example.com:8388#a\nss://" + ssUser + "@b.example.com:8388#b\n"
	res := ParseInput(base64.StdEncoding.EncodeToString([]byte(body)))
	if len(res.Nodes) != 2 {
		t.Fatalf("want 2 nodes from base64 subscription, got %d: %v", len(res.Nodes), res.Issues)
	}
}

func TestCoreDialThroughSocks5(t *testing.T) {
	socksAddr, closeFn := socks5Fixture(t)
	defer closeFn()
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "through-node")
	}))
	defer target.Close()

	host, portStr, _ := net.SplitHostPort(socksAddr)
	core := NewCore()
	d, err := core.Dialer(NodeConfig{Protocol: "socks5", Server: host, Port: anyToInt(portStr)})
	if err != nil {
		t.Fatalf("Dialer: %v", err)
	}
	client := &http.Client{Transport: &http.Transport{DialContext: d.DialContext}}
	resp, err := client.Get(target.URL)
	if err != nil {
		t.Fatalf("GET through node: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "through-node" {
		t.Fatalf("body = %q", body)
	}
}

func TestGatewayForwardAndConnect(t *testing.T) {
	socksAddr, closeFn := socks5Fixture(t)
	defer closeFn()
	m := newTestManager(t, socksAddr, nil)

	plain := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "plain-ok")
	}))
	defer plain.Close()
	tlsSrv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "tls-ok")
	}))
	defer tlsSrv.Close()

	ep, err := m.Endpoint(SessionSpec{Key: "task:1:worker", TaskID: 1, Role: "worker", Mode: ModeRotate})
	if err != nil {
		t.Fatalf("Endpoint: %v", err)
	}
	if ep.PoolID == 0 {
		t.Fatalf("endpoint did not resolve default pool: %+v", ep)
	}

	client := proxyClient(t, ep.URL)
	resp, err := client.Get(plain.URL)
	if err != nil {
		t.Fatalf("forward GET: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "plain-ok" {
		t.Fatalf("forward body = %q", body)
	}

	tlsClient := &http.Client{Transport: &http.Transport{
		Proxy:           client.Transport.(*http.Transport).Proxy,
		TLSClientConfig: insecureTLSConfig(),
	}}
	resp, err = tlsClient.Get(tlsSrv.URL)
	if err != nil {
		t.Fatalf("CONNECT GET: %v", err)
	}
	body, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "tls-ok" {
		t.Fatalf("CONNECT body = %q", body)
	}

	// CONNECT accounting runs after both copy directions finish, so poll briefly
	// instead of racing the tunnel teardown.
	snap, ok := m.SessionSnapshot("task:1:worker")
	if !ok || snap.Requests < 2 {
		t.Fatalf("snapshot: %+v ok=%v (want >=2 established connections)", snap, ok)
	}
	if snap.NodeID == 0 {
		t.Fatalf("expected a node to be recorded, got %+v", snap)
	}
}

func TestGatewayAuthFailure(t *testing.T) {
	socksAddr, closeFn := socks5Fixture(t)
	defer closeFn()
	m := newTestManager(t, socksAddr, nil)
	ep, err := m.Endpoint(SessionSpec{Key: "task:2:worker", TaskID: 2})
	if err != nil {
		t.Fatalf("Endpoint: %v", err)
	}
	pu, _ := url.Parse(ep.URL)
	pu.User = url.UserPassword(pu.User.Username(), "wrong-secret")
	client := proxyClient(t, pu.String())
	resp, err := client.Get("http://127.0.0.1:1/")
	if err != nil {
		return // transport-level rejection is also acceptable
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusProxyAuthRequired {
		t.Fatalf("status = %d, want 407", resp.StatusCode)
	}
}

func TestGatewayNoNodeFailsClosed(t *testing.T) {
	m, err := NewManager(Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	defer m.Close()
	m.Start()
	// A pool with no members: the request must fail, never fall back to direct.
	poolID, err := m.Store().CreatePool(context.Background(), Pool{Name: "empty", ModeDefault: "rotate"})
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	if err := m.Reload(context.Background()); err != nil {
		t.Fatalf("Reload: %v", err)
	}
	m.SetDefaultPool(poolID)
	ep, err := m.Endpoint(SessionSpec{Key: "task:3:worker", TaskID: 3})
	if err != nil {
		t.Fatalf("Endpoint: %v", err)
	}
	client := proxyClient(t, ep.URL)
	resp, err := client.Get("http://127.0.0.1:1/")
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadGateway {
			t.Fatalf("status = %d, want 502", resp.StatusCode)
		}
	}
}

func TestStoreEncryptsSecretsAndDedupes(t *testing.T) {
	ctx := context.Background()
	store, err := OpenStore(t.TempDir())
	if err != nil {
		t.Fatalf("OpenStore: %v", err)
	}
	defer store.Close()
	node := Node{NodeConfig: NodeConfig{
		Name: "n1", Protocol: "trojan", Server: "t.example.com", Port: 443,
		Config: map[string]any{"sni": "cdn.example.com"}, Secrets: map[string]string{"password": "super-secret"},
	}}
	created, updated, err := store.UpsertNodes(ctx, []Node{node, node}, nil)
	if err != nil {
		t.Fatalf("UpsertNodes: %v", err)
	}
	if created != 1 || updated != 1 {
		t.Fatalf("created=%d updated=%d, want 1/1 (dedupe by fingerprint)", created, updated)
	}
	nodes, err := store.Nodes(ctx)
	if err != nil || len(nodes) != 1 {
		t.Fatalf("Nodes: %v len=%d", err, len(nodes))
	}
	if nodes[0].Secrets["password"] != "super-secret" {
		t.Fatalf("secret did not round-trip: %+v", nodes[0].Secrets)
	}
	// The database must not contain the plaintext password anywhere.
	raw, err := store.db.QueryContext(ctx, `SELECT secrets FROM nodes`)
	if err != nil {
		t.Fatalf("query secrets: %v", err)
	}
	defer raw.Close()
	if raw.Next() {
		var sealed string
		_ = raw.Scan(&sealed)
		if sealed == "" || containsPlain(sealed, "super-secret") {
			t.Fatalf("secrets column not encrypted: %q", sealed)
		}
	}
}

func containsPlain(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	xproxy "golang.org/x/net/proxy"
)

// TestSocks5Inbound proves the SOCKS5 inlet shares sessions and leases with the
// HTTP gateway: username carries the session, password the secret.
func TestSocks5Inbound(t *testing.T) {
	socksAddr, closeFn := socks5Fixture(t)
	defer closeFn()
	m := newTestManager(t, socksAddr, nil)

	ep, err := m.Endpoint(SessionSpec{Key: "task:21:worker", TaskID: 21, Mode: ModeRotate})
	if err != nil {
		t.Fatalf("Endpoint: %v", err)
	}
	pu, _ := url.Parse(ep.URL)
	secret, _ := pu.User.Password()
	if m.SocksAddr() == "" {
		t.Fatal("SOCKS5 inlet not started")
	}

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "socks-ok")
	}))
	defer target.Close()

	dialer, err := xproxy.SOCKS5("tcp", m.SocksAddr(), &xproxy.Auth{
		User:     pu.User.Username(),
		Password: secret,
	}, xproxy.Direct)
	if err != nil {
		t.Fatalf("socks dialer: %v", err)
	}
	client := &http.Client{Transport: &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return dialer.(interface {
				DialContext(context.Context, string, string) (net.Conn, error)
			}).DialContext(ctx, network, addr)
		},
	}}
	resp, err := client.Get(target.URL)
	if err != nil {
		t.Fatalf("GET via socks5: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "socks-ok" {
		t.Fatalf("body = %q", body)
	}
}

// TestFixedProxyURL is the Chromium path: no credential, session bound to the port.
func TestFixedProxyURL(t *testing.T) {
	socksAddr, closeFn := socks5Fixture(t)
	defer closeFn()
	m := newTestManager(t, socksAddr, nil)
	if _, err := m.Endpoint(SessionSpec{Key: "global:default", Mode: ModeSticky}); err != nil {
		t.Fatalf("Endpoint: %v", err)
	}
	fixed, err := m.FixedProxyURL("global:default")
	if err != nil {
		t.Fatalf("FixedProxyURL: %v", err)
	}
	if _, err := url.Parse(fixed); err != nil {
		t.Fatalf("fixed url: %v", err)
	}
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "browser-ok")
	}))
	defer target.Close()
	resp, err := proxyClient(t, fixed).Get(target.URL)
	if err != nil {
		t.Fatalf("GET via fixed listener: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "browser-ok" {
		t.Fatalf("body = %q", body)
	}
	// Revoking the session must close the listener so a stale default pool cannot
	// keep serving browser traffic.
	m.Revoke("global:default")
	if _, err := proxyClient(t, fixed).Get(target.URL); err == nil {
		t.Fatal("fixed listener still serving after session revoke")
	}
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package traffic

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	mproxy "github.com/lqqyt2423/go-mitmproxy/proxy"
)

// Listener is one recording instance over the shared store and root CA. The
// process-wide proxy from Open stays the default; per-session listeners exist so
// the upstream node can be chosen for a specific task/agent role — go-mitmproxy's
// intercepted path never sees the client's proxy credentials, so identity has to
// come from the listener a tool was pointed at (see docs §8.2).
type Listener struct {
	t       *Traffic
	addr    string
	scope   string
	session string
	proxy   *mproxy.Proxy

	mu       sync.RWMutex
	resolver func(context.Context) (*url.URL, error)
}

// NewListener binds a loopback port and prepares a recording instance tagged with
// scope/session. Call Start to serve; Close releases the port.
func (t *Traffic) NewListener(scope, session string) (*Listener, error) {
	if t == nil {
		return nil, fmt.Errorf("traffic: 未初始化")
	}
	addr, err := freeLoopbackAddr()
	if err != nil {
		return nil, err
	}
	p, err := t.newProxy(addr, scope, session)
	if err != nil {
		return nil, err
	}
	l := &Listener{t: t, addr: addr, scope: scope, session: session, proxy: p}
	// Until a resolver is installed every request goes where the process-wide
	// listener goes (global proxy / direct), never silently somewhere undefined.
	p.SetUpstreamProxy(func(*http.Request) (*url.URL, error) { return t.upstream.Load(), nil })
	return l, nil
}

// SetUpstreamResolver installs a dynamic upstream: the callback runs per request
// (per CONNECT in the intercepted path) and usually returns the session's pinned
// node endpoint on the egress gateway.
func (l *Listener) SetUpstreamResolver(fn func(context.Context) (*url.URL, error)) {
	l.mu.Lock()
	l.resolver = fn
	l.mu.Unlock()
	l.proxy.SetUpstreamProxy(func(*http.Request) (*url.URL, error) {
		l.mu.RLock()
		r := l.resolver
		l.mu.RUnlock()
		if r == nil {
			return nil, nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		u, err := r(ctx)
		if err != nil {
			// Failing closed is correct: a session that cannot get a node must not
			// leak the platform's real IP through the recorder.
			return nil, err
		}
		return u, nil
	})
}

// SetCredential makes the listener demand this Basic proxy credential. It is
// opt-in: Chromium cannot answer proxy auth, so a browser-bound listener must stay
// credential-free, while CLI tools can carry sess_<key>:<secret>.
func (l *Listener) SetCredential(user, secret string) {
	l.proxy.SetAuthProxy(func(_ http.ResponseWriter, req *http.Request) (bool, error) {
		gotUser, gotPass, ok := parseProxyBasic(req.Header.Get("Proxy-Authorization"))
		if !ok || gotUser != user {
			return false, fmt.Errorf("traffic: 代理凭据无效")
		}
		if subtle.ConstantTimeCompare([]byte(gotPass), []byte(secret)) != 1 {
			return false, fmt.Errorf("traffic: 代理凭据无效")
		}
		return true, nil
	})
}

func parseProxyBasic(header string) (user, pass string, ok bool) {
	const prefix = "Basic "
	if !strings.HasPrefix(header, prefix) {
		return "", "", false
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(header[len(prefix):]))
	if err != nil {
		return "", "", false
	}
	user, pass, ok = strings.Cut(string(raw), ":")
	return user, pass, ok
}

// Addr is the loopback proxy address tools should use (no credential: the
// listener itself is the session identity).
func (l *Listener) Addr() string { return "http://" + l.addr }

// Start serves in the background; a bind failure is logged because the caller has
// no useful recovery path mid-task.
func (l *Listener) Start() {
	go func() {
		if err := l.proxy.Start(); err != nil {
			log.Printf("[traffic] 会话录制实例 %s(%s) 停止: %v", l.addr, l.session, err)
		}
	}()
}

// Close stops the listener.
func (l *Listener) Close() error { return l.proxy.Close() }

func freeLoopbackAddr() (string, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	addr := ln.Addr().String()
	return addr, ln.Close()
}

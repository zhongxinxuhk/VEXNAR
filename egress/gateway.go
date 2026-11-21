// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// errBadCredential is returned for unknown sessions or wrong secrets.
var errBadCredential = errors.New("egress: 代理凭据无效")

// Gateway is the single loopback egress point. Every target connection — bash,
// WebFetch, the http tool, asset probes — arrives here with a session credential,
// and leaves through a leased node.
type Gateway struct {
	mgr *Manager
	ln  net.Listener
	srv *http.Server

	trMu sync.Mutex
	trs  map[*NodeDialer]*http.Transport
}

// route is the per-request view of a session: the stored session plus optional
// per-connection overrides (`sess_x.rotate`, `sess_x.node_12`).
type route struct {
	sess *session
	mode Mode // "" = use the session's own mode
	pin  *int64
}

// NewGateway binds the loopback listener immediately so callers can inject the
// URL into agent environments before the first request arrives.
func NewGateway(m *Manager) (*Gateway, error) {
	ln, err := net.Listen("tcp", m.gatewayAddr)
	if err != nil {
		return nil, fmt.Errorf("egress: 监听网关失败: %w", err)
	}
	g := &Gateway{mgr: m, ln: ln, trs: map[*NodeDialer]*http.Transport{}}
	g.srv = &http.Server{
		Handler:           g,
		ReadHeaderTimeout: 15 * time.Second,
		// No overall read/write timeout: CONNECT tunnels carry long scans.
	}
	return g, nil
}

// Addr is the loopback host:port tools must use.
func (g *Gateway) Addr() string { return g.ln.Addr().String() }

// Serve blocks until the listener closes.
func (g *Gateway) Serve() error { return g.srv.Serve(g.ln) }

// Close stops accepting and drops idle connections.
func (g *Gateway) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return g.srv.Shutdown(ctx)
}

// ProxyURL builds the credential URL for a session and gateway address.
func ProxyURL(gateway, user, secret string) string {
	return fmt.Sprintf("http://%s:%s@%s", user, secret, gateway)
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rt, err := g.auth(r)
	if err != nil {
		writeProxyError(w, http.StatusProxyAuthRequired, "EGRESS_BAD_CREDENTIAL", "代理认证失败")
		return
	}
	if r.Method == http.MethodConnect {
		g.handleConnect(w, r, rt)
		return
	}
	g.handleForward(w, r, rt)
}

// auth parses Proxy-Authorization and optional routing suffixes:
//
//	sess_<key>              → session policy (sticky/rotate from the binding)
//	sess_<key>.rotate       → override mode for this connection
//	sess_<key>.node_<id>    → pin one node (fanout distribution, debugging)
func (g *Gateway) auth(r *http.Request) (*route, error) {
	user, pass, ok := basicAuth(r.Header.Get("Proxy-Authorization"))
	if !ok {
		return nil, errBadCredential
	}
	rt := &route{}
	base := user
	if i := strings.LastIndex(user, "."); i >= 0 {
		suffix := user[i+1:]
		switch {
		case strings.HasPrefix(suffix, "node_"):
			if id, err := strconv.ParseInt(strings.TrimPrefix(suffix, "node_"), 10, 64); err == nil {
				rt.pin = &id
			}
			base = user[:i]
		case suffix == "rotate", suffix == "sticky", suffix == "fanout":
			rt.mode = Mode(suffix)
			base = user[:i]
		}
	}
	s, err := g.mgr.authenticate(base, pass)
	if err != nil {
		return nil, err
	}
	rt.sess = s
	return rt, nil
}

func (g *Gateway) handleConnect(w http.ResponseWriter, r *http.Request, rt *route) {
	target := r.Host
	if _, _, err := net.SplitHostPort(target); err != nil {
		target = net.JoinHostPort(target, "443")
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	st, release, direct, err := g.mgr.acquire(ctx, rt)
	if err != nil {
		g.fail(w, rt, err)
		return
	}
	var upstream net.Conn
	if direct {
		d := &net.Dialer{Timeout: 20 * time.Second}
		upstream, err = d.DialContext(ctx, "tcp", target)
	} else {
		upstream, err = st.dialer.DialContext(ctx, "tcp", target)
	}
	if err != nil {
		release(0, 0, 0, err)
		g.fail(w, rt, fmt.Errorf("EGRESS_DIAL_FAILED: %w", err))
		return
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		upstream.Close()
		release(0, 0, 0, errors.New("连接不可劫持"))
		writeProxyError(w, http.StatusInternalServerError, "EGRESS_NO_HIJACK", "连接不可劫持")
		return
	}
	client, _, err := hj.Hijack()
	if err != nil {
		upstream.Close()
		release(0, 0, 0, err)
		return
	}
	if _, err := client.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
		client.Close()
		upstream.Close()
		release(0, 0, 0, err)
		return
	}
	var upBytes, downBytes int64
	done := make(chan struct{}, 2)
	go func() {
		n, _ := io.Copy(upstream, client)
		upBytes = n
		if c, ok := upstream.(interface{ CloseWrite() error }); ok {
			_ = c.CloseWrite()
		}
		done <- struct{}{}
	}()
	go func() {
		n, _ := io.Copy(client, upstream)
		downBytes = n
		if c, ok := client.(interface{ CloseWrite() error }); ok {
			_ = c.CloseWrite()
		}
		done <- struct{}{}
	}()
	<-done
	<-done
	client.Close()
	upstream.Close()
	release(http.StatusOK, downBytes, upBytes, nil)
}

func (g *Gateway) handleForward(w http.ResponseWriter, r *http.Request, rt *route) {
	if !r.URL.IsAbs() || r.URL.Host == "" {
		writeProxyError(w, http.StatusBadRequest, "EGRESS_NOT_PROXY_REQUEST", "这不是一个代理请求")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()

	st, release, direct, err := g.mgr.acquire(ctx, rt)
	if err != nil {
		g.fail(w, rt, err)
		return
	}
	outReq := r.Clone(ctx)
	outReq.RequestURI = ""
	outReq.Header.Del("Proxy-Authorization")
	removeHopHeaders(outReq.Header)

	var tr *http.Transport
	if direct {
		tr = &http.Transport{Proxy: nil, ForceAttemptHTTP2: false, TLSHandshakeTimeout: 15 * time.Second}
	} else {
		tr = g.transportFor(st.dialer)
	}
	resp, err := tr.RoundTrip(outReq)
	if err != nil {
		release(0, 0, 0, err)
		g.fail(w, rt, fmt.Errorf("EGRESS_DIAL_FAILED: %w", err))
		return
	}
	defer resp.Body.Close()
	removeHopHeaders(resp.Header)
	for k, vals := range resp.Header {
		for _, v := range vals {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	n, copyErr := io.Copy(w, resp.Body)
	release(resp.StatusCode, n, r.ContentLength, copyErr)
}

func (g *Gateway) transportFor(d *NodeDialer) *http.Transport {
	g.trMu.Lock()
	defer g.trMu.Unlock()
	if tr := g.trs[d]; tr != nil {
		return tr
	}
	tr := &http.Transport{
		Proxy:               nil,
		DialContext:         d.DialContext,
		ForceAttemptHTTP2:   false,
		DisableCompression:  true,
		MaxIdleConnsPerHost: 4,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 15 * time.Second,
		TLSClientConfig:     nil,
	}
	if len(g.trs) > 64 {
		g.trs = map[*NodeDialer]*http.Transport{}
	}
	g.trs[d] = tr
	return tr
}

// fail maps an acquire/dial error to the proxy status the tool sees.
func (g *Gateway) fail(w http.ResponseWriter, rt *route, err error) {
	switch {
	case errors.Is(err, ErrNoPool):
		writeProxyError(w, http.StatusBadGateway, "EGRESS_NO_POOL", "会话没有可用的代理池")
	case errors.Is(err, ErrNoNode):
		writeProxyError(w, http.StatusBadGateway, "EGRESS_NO_NODE", "池内没有可用节点（全部冷却或未启用）")
	case errors.Is(err, ErrPoolFull):
		writeProxyError(w, http.StatusTooManyRequests, "EGRESS_BUSY", "池或会话并发已满")
	case errors.Is(err, context.DeadlineExceeded):
		writeProxyError(w, http.StatusGatewayTimeout, "EGRESS_TIMEOUT", "获取出口节点超时")
	default:
		writeProxyError(w, http.StatusBadGateway, "EGRESS_DIAL_FAILED", truncate(err.Error(), 200))
	}
}

// ---------- helpers ----------

func basicAuth(header string) (user, pass string, ok bool) {
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

func writeProxyError(w http.ResponseWriter, status int, code, msg string) {
	if status == http.StatusProxyAuthRequired {
		w.Header().Set("Proxy-Authenticate", `Basic realm="vexnar-egress"`)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, fmt.Sprintf(`{"code":%q,"error":%q}`, code, msg))
}

func removeHopHeaders(h http.Header) {
	for _, k := range []string{
		"Connection", "Proxy-Connection", "Keep-Alive", "Proxy-Authenticate",
		"Proxy-Authorization", "Te", "Trailer", "Transfer-Encoding", "Upgrade",
	} {
		h.Del(k)
	}
}

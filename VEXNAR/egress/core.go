// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/metacubex/mihomo/adapter"
	C "github.com/metacubex/mihomo/constant"
	mlog "github.com/metacubex/mihomo/log"
)

// dialerCacheLimit bounds how many parsed nodes stay warm. Parsing is cheap, but
// providers that open TLS/SMUX state (vmess/vless/tuic) keep per-node pools, so an
// unbounded cache would leak goroutines on a large imported subscription.
const dialerCacheLimit = 256

// NodeConfig is one dialable proxy node. Config holds the clash/mihomo `proxies`
// entry minus the secret fields; Secrets holds password/uuid/psk/private-key so the
// store can encrypt them separately and the API can never echo them back.
type NodeConfig struct {
	ID       int64             `json:"id,omitempty"`
	Name     string            `json:"name"`
	Protocol string            `json:"protocol"`
	Server   string            `json:"server"`
	Port     int               `json:"port"`
	Config   map[string]any    `json:"config,omitempty"`
	Secrets  map[string]string `json:"-"`
}

// ClashMap rebuilds the exact map mihomo's parser expects. Exported for tests and
// for the import preview so a user can see what will be handed to the core.
func (n NodeConfig) ClashMap() map[string]any {
	m := make(map[string]any, len(n.Config)+len(n.Secrets)+4)
	for k, v := range n.Config {
		m[k] = v
	}
	for k, v := range n.Secrets {
		m[k] = v
	}
	m["name"] = displayName(n) // mihomo requires a non-empty name
	m["type"] = n.Protocol
	m["server"] = n.Server
	m["port"] = n.Port
	return m
}

// Fingerprint identifies a node by its routing-relevant shape, ignoring the display
// name and weight. Import uses it to dedupe the same node arriving twice.
func (n NodeConfig) Fingerprint() string {
	flat := map[string]string{}
	for k, v := range n.Config {
		flat[k] = fmt.Sprint(v)
	}
	for k, v := range n.Secrets {
		flat[","+k] = v // prefix keeps a secret key from colliding with a config key
	}
	keys := make([]string, 0, len(flat))
	for k := range flat {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	h := sha256.New()
	fmt.Fprintf(h, "%s|%s|%d|", n.Protocol, n.Server, n.Port)
	for _, k := range keys {
		fmt.Fprintf(h, "%s=%s\x00", k, flat[k])
	}
	return hex.EncodeToString(h.Sum(nil))
}

// Core turns node configs into dialers. It deliberately owns NO listener, NO rule
// engine and NO global proxy state: egress gateways do the listening and leasing.
type Core struct {
	mu    sync.Mutex
	cache map[string]*coreEntry
}

type coreEntry struct {
	fp   string
	dial *NodeDialer
	used time.Time
}

// NewCore prepares the embedded protocol core. mihomo logs to stdout by default,
// which would interleave with the server log for every dial failure; errors still
// surface through the returned error, so silence the library.
func NewCore() *Core {
	mlog.SetLevel(mlog.SILENT)
	return &Core{cache: map[string]*coreEntry{}}
}

// NodeDialer dials a target through exactly one node.
type NodeDialer struct {
	nodeID int64
	proxy  C.Proxy
}

// NodeID reports which node this dialer belongs to (0 for an unpersisted config).
func (d *NodeDialer) NodeID() int64 { return d.nodeID }

// Dialer returns a cached dialer for the node config.
func (c *Core) Dialer(n NodeConfig) (*NodeDialer, error) {
	if err := n.validate(); err != nil {
		return nil, err
	}
	fp := n.Fingerprint()
	c.mu.Lock()
	if e := c.cache[fp]; e != nil {
		e.used = time.Now()
		c.mu.Unlock()
		return e.dial, nil
	}
	c.mu.Unlock()

	proxy, err := adapter.ParseProxy(n.ClashMap())
	if err != nil {
		return nil, fmt.Errorf("节点 %s(%s) 配置无效: %w", displayName(n), n.Protocol, err)
	}
	d := &NodeDialer{nodeID: n.ID, proxy: proxy}

	c.mu.Lock()
	// Double-check: two concurrent Dialer calls may have raced the parse.
	if e := c.cache[fp]; e != nil {
		e.used = time.Now()
		c.mu.Unlock()
		return e.dial, nil
	}
	c.cache[fp] = &coreEntry{fp: fp, dial: d, used: time.Now()}
	if len(c.cache) > dialerCacheLimit {
		c.evictLocked()
	}
	c.mu.Unlock()
	return d, nil
}

func (c *Core) evictLocked() {
	var oldestKey string
	var oldest time.Time
	for k, e := range c.cache {
		if oldestKey == "" || e.used.Before(oldest) {
			oldestKey, oldest = k, e.used
		}
	}
	if oldestKey != "" {
		delete(c.cache, oldestKey)
	}
}

// Forget drops the cached dialer for a node config (after an edit/delete).
func (c *Core) Forget(n NodeConfig) {
	c.mu.Lock()
	delete(c.cache, n.Fingerprint())
	c.mu.Unlock()
}

// DialContext implements proxy.ContextDialer. Only TCP is promised: the gateway
// relays HTTP/TLS streams, and UDP (QUIC/DNS) is left to the node's own stack.
func (d *NodeDialer) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	switch strings.ToLower(network) {
	case "tcp", "tcp4", "tcp6":
	default:
		return nil, fmt.Errorf("egress: 不支持的拨号协议 %q（仅支持 TCP）", network)
	}
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, fmt.Errorf("egress: 目标地址 %q 无效: %w", addr, err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		return nil, fmt.Errorf("egress: 目标端口 %q 无效", portStr)
	}
	md := &C.Metadata{NetWork: C.TCP, Host: host, DstPort: uint16(port)}
	// A literal IP goes in DstIP so the node does not attempt a remote resolve; a
	// hostname stays in Host and is resolved AT THE NODE, which is also the DNS leak
	// guard: the platform never looks the target up locally.
	if ip, perr := netip.ParseAddr(host); perr == nil {
		md.DstIP = ip
	}
	return d.proxy.DialContext(ctx, md)
}

// probeClient returns an HTTP client whose every connection leaves through d.
func (d *NodeDialer) probeClient(timeout time.Duration, insecure bool) *http.Client {
	tr := &http.Transport{
		Proxy:               nil,
		DialContext:         d.DialContext,
		ForceAttemptHTTP2:   false,
		DisableCompression:  true,
		TLSHandshakeTimeout: timeout,
	}
	if insecure {
		tr.TLSClientConfig = insecureTLSConfig()
	}
	return &http.Client{Transport: tr, Timeout: timeout}
}

func (n NodeConfig) validate() error {
	if strings.TrimSpace(n.Server) == "" {
		return fmt.Errorf("节点缺少 server")
	}
	if n.Port < 1 || n.Port > 65535 {
		return fmt.Errorf("节点 %s 端口 %d 超出范围", displayName(n), n.Port)
	}
	if strings.TrimSpace(n.Protocol) == "" {
		return fmt.Errorf("节点缺少协议类型")
	}
	switch n.Protocol {
	case "ss", "ssr", "vmess", "vless", "trojan", "socks5", "http",
		"hysteria2", "tuic", "anytls", "snell", "wireguard":
		return nil
	default:
		return fmt.Errorf("不支持的协议 %q", n.Protocol)
	}
}

func displayName(n NodeConfig) string {
	if n.Name != "" {
		return n.Name
	}
	return fmt.Sprintf("%s:%d", n.Server, n.Port)
}

// ProbeResult is one node health sample.
type ProbeResult struct {
	Latency   time.Duration
	EgressIP  string
	CheckedAt time.Time
}

// Probe checks reachability through the node and optionally discovers its egress IP.
// probeURL must be a 204-style endpoint (a 2xx/3xx counts as up); ipURL may be empty.
func (d *NodeDialer) Probe(ctx context.Context, probeURL, ipURL string, timeout time.Duration) (ProbeResult, error) {
	res := ProbeResult{CheckedAt: time.Now()}
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	client := d.probeClient(timeout, true)
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, probeURL, nil)
	if err != nil {
		return res, fmt.Errorf("探测 URL 无效: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return res, err
	}
	_, _ = ioCopyDiscard(resp.Body)
	resp.Body.Close()
	res.Latency = time.Since(start)
	if resp.StatusCode >= 400 {
		return res, fmt.Errorf("探测返回 HTTP %d", resp.StatusCode)
	}
	if strings.TrimSpace(ipURL) == "" {
		return res, nil
	}
	if ip, err := d.EgressIP(ctx, ipURL, timeout); err == nil {
		res.EgressIP = ip
	}
	return res, nil
}

// EgressIP asks an external echo service which IP the node exits from.
func (d *NodeDialer) EgressIP(ctx context.Context, ipURL string, timeout time.Duration) (string, error) {
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	client := d.probeClient(timeout, true)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ipURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := readLimited(resp.Body, 512)
	if err != nil {
		return "", err
	}
	ip := strings.TrimSpace(string(body))
	if net.ParseIP(ip) == nil {
		return "", fmt.Errorf("出口 IP 探测返回了非 IP: %q", truncate(ip, 64))
	}
	return ip, nil
}

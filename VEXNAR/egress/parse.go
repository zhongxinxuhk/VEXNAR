// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// secretKeys are stripped out of the clash map and stored encrypted at rest.
// `username` is deliberately NOT here: it is part of the routing identity and is
// useful in the UI, while `password`/`uuid`/`psk` never leave the backend.
var secretKeys = map[string]bool{
	"password":    true,
	"uuid":        true,
	"psk":         true,
	"private-key": true,
	"auth-str":    true,
	"token":       true,
}

// ParseIssue reports one unusable line/entry while the rest of the input still parses.
type ParseIssue struct {
	Raw   string `json:"raw"`
	Error string `json:"error"`
}

// ParseResult is a preview that has not touched the database yet.
type ParseResult struct {
	Nodes  []NodeConfig `json:"nodes"`
	Issues []ParseIssue `json:"issues"`
}

// ParseInput accepts a clash/mihomo YAML fragment, a base64 subscription body, or a
// newline-separated URI list — the three shapes users actually paste.
func ParseInput(text string) ParseResult {
	var out ParseResult
	text = strings.TrimSpace(text)
	if text == "" {
		out.Issues = append(out.Issues, ParseIssue{Error: "输入为空"})
		return out
	}
	if strings.Contains(text, "proxies:") {
		nodes, issues := parseClashYAML(text)
		out.Nodes, out.Issues = nodes, issues
		return out
	}
	if decoded, ok := decodeBase64Loose(text); ok && strings.Contains(decoded, "://") {
		text = decoded
	}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
			continue
		}
		node, err := parseURI(line)
		if err != nil {
			out.Issues = append(out.Issues, ParseIssue{Raw: truncate(line, 120), Error: err.Error()})
			continue
		}
		out.Nodes = append(out.Nodes, node)
	}
	if len(out.Nodes) == 0 && len(out.Issues) == 0 {
		out.Issues = append(out.Issues, ParseIssue{Error: "没有识别到可用的节点（支持 clash YAML、base64 订阅、ss/vmess/vless/trojan/socks5 URI）"})
	}
	return out
}

func parseClashYAML(text string) ([]NodeConfig, []ParseIssue) {
	var doc struct {
		Proxies []map[string]any `yaml:"proxies"`
	}
	if err := yaml.Unmarshal([]byte(text), &doc); err != nil {
		return nil, []ParseIssue{{Error: "解析 clash YAML 失败: " + err.Error()}}
	}
	if len(doc.Proxies) == 0 {
		return nil, []ParseIssue{{Error: "clash YAML 中没有 proxies 列表"}}
	}
	var out []NodeConfig
	var issues []ParseIssue
	for _, m := range doc.Proxies {
		node, err := nodeFromClashMap(m)
		if err != nil {
			raw, _ := json.Marshal(m)
			issues = append(issues, ParseIssue{Raw: truncate(string(raw), 120), Error: err.Error()})
			continue
		}
		out = append(out, node)
	}
	return out, issues
}

// nodeFromClashMap splits a clash proxies entry into (routing config, secrets).
func nodeFromClashMap(m map[string]any) (NodeConfig, error) {
	n := NodeConfig{Config: map[string]any{}, Secrets: map[string]string{}}
	if v, ok := m["name"].(string); ok {
		n.Name = strings.TrimSpace(v)
	}
	if v, ok := m["type"].(string); ok {
		n.Protocol = strings.ToLower(strings.TrimSpace(v))
	}
	if v, ok := m["server"].(string); ok {
		n.Server = strings.TrimSpace(v)
	}
	switch v := m["port"].(type) {
	case int:
		n.Port = v
	case int64:
		n.Port = int(v)
	case float64:
		n.Port = int(v)
	case string:
		if p, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			n.Port = p
		}
	}
	for k, v := range m {
		switch k {
		case "name", "type", "server", "port":
			continue
		}
		if secretKeys[k] {
			n.Secrets[k] = fmt.Sprint(v)
			continue
		}
		n.Config[k] = v
	}
	if err := n.validate(); err != nil {
		return NodeConfig{}, err
	}
	if n.Name == "" {
		n.Name = fmt.Sprintf("%s-%s-%d", n.Protocol, n.Server, n.Port)
	}
	return n, nil
}

// parseURI maps one share link to a node. Field mapping follows appendix A of
// docs/代理池与内置代理核心设计方案.md.
func parseURI(raw string) (NodeConfig, error) {
	raw = strings.TrimSpace(raw)
	if !strings.Contains(raw, "://") {
		return NodeConfig{}, fmt.Errorf("不是可识别的代理链接")
	}
	scheme := strings.ToLower(raw[:strings.Index(raw, "://")])
	switch scheme {
	case "ss":
		return parseSS(raw)
	case "ssr":
		return parseSSR(raw)
	case "vmess":
		return parseVmess(raw)
	case "vless":
		return parseVLESS(raw)
	case "trojan":
		return parseTrojan(raw)
	case "socks5", "socks5h", "socks":
		return parseSocks(raw, "socks5")
	case "http", "https":
		return parseSocks(raw, "http")
	case "hysteria2", "hy2":
		return parseHysteria2(raw)
	case "tuic":
		return parseTUIC(raw)
	case "anytls":
		return parseAnyTLS(raw)
	default:
		return NodeConfig{}, fmt.Errorf("不支持的协议 %q", scheme)
	}
}

func parseSS(raw string) (NodeConfig, error) {
	body := raw[len("ss://"):]
	name := ""
	if i := strings.Index(body, "#"); i >= 0 {
		name, _ = url.PathUnescape(body[i+1:])
		body = body[:i]
	}
	if i := strings.Index(body, "?"); i >= 0 {
		body = body[:i] // plugin params are parsed below from the full link
	}
	query := map[string]string{}
	if i := strings.Index(raw, "?"); i >= 0 {
		frag := raw[i+1:]
		if j := strings.Index(frag, "#"); j >= 0 {
			frag = frag[:j]
		}
		if v, err := url.ParseQuery(frag); err == nil {
			for k := range v {
				query[k] = v.Get(k)
			}
		}
	}
	var userinfo, hostport string
	if i := strings.LastIndex(body, "@"); i >= 0 {
		userinfo, hostport = body[:i], body[i+1:]
	} else {
		decoded, ok := decodeBase64Loose(body)
		if !ok {
			return NodeConfig{}, fmt.Errorf("ss 链接缺少 @ 且不是合法 base64")
		}
		j := strings.LastIndex(decoded, "@")
		if j < 0 {
			return NodeConfig{}, fmt.Errorf("ss base64 内容缺少 @")
		}
		userinfo, hostport = decoded[:j], decoded[j+1:]
	}
	if decoded, ok := decodeBase64Loose(userinfo); ok && strings.Contains(decoded, ":") {
		userinfo = decoded
	}
	method, password, ok := strings.Cut(userinfo, ":")
	if !ok || method == "" {
		return NodeConfig{}, fmt.Errorf("ss 链接缺少 method:password")
	}
	server, port, err := splitHostPort(hostport)
	if err != nil {
		return NodeConfig{}, err
	}
	n := NodeConfig{
		Name:     firstNonEmpty(name, "ss-"+server),
		Protocol: "ss",
		Server:   server,
		Port:     port,
		Config:   map[string]any{"cipher": method, "udp": true},
		Secrets:  map[string]string{"password": password},
	}
	if plugin := query["plugin"]; plugin != "" {
		parts := strings.Split(plugin, ";")
		n.Config["plugin"] = parts[0]
		opts := map[string]any{}
		for _, kv := range parts[1:] {
			k, v, _ := strings.Cut(kv, "=")
			switch k {
			case "obfs":
				opts["mode"] = v
			case "obfs-host", "host":
				if parts[0] == "obfs" {
					opts["host"] = v
				} else {
					opts["host"] = v
				}
			case "path":
				opts["path"] = v
			case "tls":
				opts["tls"] = v == "true" || v == "1"
			}
		}
		if len(opts) > 0 {
			n.Config["plugin-opts"] = opts
		}
	}
	return n, n.validate()
}

func parseSSR(raw string) (NodeConfig, error) {
	body := raw[len("ssr://"):]
	decoded, ok := decodeBase64Loose(body)
	if !ok {
		return NodeConfig{}, fmt.Errorf("ssr 链接不是合法 base64")
	}
	// host:port:protocol:method:obfs:base64(password)/?params
	main, paramsRaw, _ := strings.Cut(decoded, "/?")
	parts := strings.Split(main, ":")
	if len(parts) < 6 {
		return NodeConfig{}, fmt.Errorf("ssr 内容字段不足（需要 host:port:protocol:method:obfs:password）")
	}
	host := strings.Join(parts[:len(parts)-5], ":")
	port, err := strconv.Atoi(parts[len(parts)-5])
	if err != nil {
		return NodeConfig{}, fmt.Errorf("ssr 端口无效: %q", parts[len(parts)-5])
	}
	protocol, method, obfs := parts[len(parts)-4], parts[len(parts)-3], parts[len(parts)-2]
	password, _ := decodeBase64Loose(parts[len(parts)-1])
	if password == "" {
		password = parts[len(parts)-1]
	}
	params, _ := url.ParseQuery(paramsRaw)
	decodeParam := func(k string) string {
		v := params.Get(k)
		if v == "" {
			return ""
		}
		if d, ok := decodeBase64Loose(v); ok {
			return d
		}
		return v
	}
	name := decodeParam("remarks")
	n := NodeConfig{
		Name:     firstNonEmpty(name, "ssr-"+host),
		Protocol: "ssr",
		Server:   host,
		Port:     port,
		Config: map[string]any{
			"cipher":   method,
			"protocol": firstNonEmpty(protocol, "origin"),
			"obfs":     firstNonEmpty(obfs, "plain"),
			"udp":      true,
		},
		Secrets: map[string]string{"password": password},
	}
	if v := decodeParam("protoparam"); v != "" {
		n.Config["protocol-param"] = v
	}
	if v := decodeParam("obfsparam"); v != "" {
		n.Config["obfs-param"] = v
	}
	return n, n.validate()
}

func parseVmess(raw string) (NodeConfig, error) {
	body := raw[len("vmess://"):]
	decoded, ok := decodeBase64Loose(body)
	if !ok {
		return NodeConfig{}, fmt.Errorf("vmess 链接不是合法 base64")
	}
	var v struct {
		PS   string `json:"ps"`
		Add  string `json:"add"`
		Port any    `json:"port"`
		ID   string `json:"id"`
		Aid  any    `json:"aid"`
		Scy  string `json:"scy"`
		Net  string `json:"net"`
		Type string `json:"type"`
		Host string `json:"host"`
		Path string `json:"path"`
		TLS  string `json:"tls"`
		SNI  string `json:"sni"`
		ALPN string `json:"alpn"`
		FP   string `json:"fp"`
	}
	if err := json.Unmarshal([]byte(decoded), &v); err != nil {
		return NodeConfig{}, fmt.Errorf("vmess JSON 无效: %w", err)
	}
	port := anyToInt(v.Port)
	alterID := anyToInt(v.Aid)
	net := firstNonEmpty(v.Net, "tcp")
	cfg := map[string]any{
		"alterId": alterID,
		"cipher":  firstNonEmpty(v.Scy, "auto"),
		"udp":     true,
		"network": net,
	}
	if strings.EqualFold(v.TLS, "tls") || strings.EqualFold(v.TLS, "reality") {
		cfg["tls"] = true
		if v.SNI != "" {
			cfg["servername"] = v.SNI
		}
	}
	if v.FP != "" {
		cfg["client-fingerprint"] = v.FP
	}
	if v.ALPN != "" {
		cfg["alpn"] = splitList(v.ALPN)
	}
	switch net {
	case "ws":
		opts := map[string]any{}
		if v.Path != "" {
			opts["path"] = v.Path
		}
		if v.Host != "" {
			opts["headers"] = map[string]any{"Host": v.Host}
		}
		if len(opts) > 0 {
			cfg["ws-opts"] = opts
		}
	case "grpc":
		if v.Path != "" {
			cfg["grpc-opts"] = map[string]any{"grpc-service-name": v.Path}
		}
	case "h2":
		opts := map[string]any{}
		if v.Path != "" {
			opts["path"] = v.Path
		}
		if v.Host != "" {
			opts["host"] = splitList(v.Host)
		}
		if len(opts) > 0 {
			cfg["h2-opts"] = opts
		}
	}
	n := NodeConfig{
		Name:     firstNonEmpty(v.PS, "vmess-"+v.Add),
		Protocol: "vmess",
		Server:   v.Add,
		Port:     port,
		Config:   cfg,
		Secrets:  map[string]string{"uuid": v.ID},
	}
	return n, n.validate()
}

func parseVLESS(raw string) (NodeConfig, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return NodeConfig{}, fmt.Errorf("vless 链接无效: %w", err)
	}
	if u.User == nil || u.User.Username() == "" {
		return NodeConfig{}, fmt.Errorf("vless 链接缺少 uuid")
	}
	server, port, err := splitHostPort(u.Host)
	if err != nil {
		return NodeConfig{}, err
	}
	q := u.Query()
	security := strings.ToLower(q.Get("security"))
	network := firstNonEmpty(q.Get("type"), "tcp")
	cfg := map[string]any{"udp": true, "network": network}
	if security == "tls" || security == "reality" || security == "xtls" {
		cfg["tls"] = true
	}
	if sni := firstNonEmpty(q.Get("sni"), q.Get("host")); sni != "" {
		cfg["servername"] = sni
	}
	if fp := q.Get("fp"); fp != "" {
		cfg["client-fingerprint"] = fp
	}
	if flow := q.Get("flow"); flow != "" {
		cfg["flow"] = flow
	}
	if security == "reality" {
		ro := map[string]any{}
		if pbk := q.Get("pbk"); pbk != "" {
			ro["public-key"] = pbk
		}
		if sid := q.Get("sid"); sid != "" {
			ro["short-id"] = sid
		}
		if len(ro) > 0 {
			cfg["reality-opts"] = ro
		}
	}
	if alpn := q.Get("alpn"); alpn != "" {
		cfg["alpn"] = splitList(alpn)
	}
	switch network {
	case "ws":
		opts := map[string]any{}
		if p := q.Get("path"); p != "" {
			opts["path"] = p
		}
		if h := q.Get("host"); h != "" {
			opts["headers"] = map[string]any{"Host": h}
		}
		if len(opts) > 0 {
			cfg["ws-opts"] = opts
		}
	case "grpc":
		if s := firstNonEmpty(q.Get("serviceName"), q.Get("path")); s != "" {
			cfg["grpc-opts"] = map[string]any{"grpc-service-name": s}
		}
	}
	n := NodeConfig{
		Name:     firstNonEmpty(u.Fragment, "vless-"+server),
		Protocol: "vless",
		Server:   server,
		Port:     port,
		Config:   cfg,
		Secrets:  map[string]string{"uuid": u.User.Username()},
	}
	return n, n.validate()
}

func parseTrojan(raw string) (NodeConfig, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return NodeConfig{}, fmt.Errorf("trojan 链接无效: %w", err)
	}
	if u.User == nil || u.User.Username() == "" {
		return NodeConfig{}, fmt.Errorf("trojan 链接缺少密码")
	}
	server, port, err := splitHostPort(u.Host)
	if err != nil {
		return NodeConfig{}, err
	}
	q := u.Query()
	network := firstNonEmpty(q.Get("type"), "tcp")
	cfg := map[string]any{"udp": true}
	if sni := firstNonEmpty(q.Get("sni"), q.Get("peer")); sni != "" {
		cfg["sni"] = sni
	}
	if alpn := q.Get("alpn"); alpn != "" {
		cfg["alpn"] = splitList(alpn)
	}
	if v := q.Get("allowInsecure"); v == "1" || strings.EqualFold(v, "true") {
		cfg["skip-cert-verify"] = true
	}
	if network != "tcp" {
		cfg["network"] = network
	}
	if network == "ws" {
		opts := map[string]any{}
		if p := q.Get("path"); p != "" {
			opts["path"] = p
		}
		if h := q.Get("host"); h != "" {
			opts["headers"] = map[string]any{"Host": h}
		}
		if len(opts) > 0 {
			cfg["ws-opts"] = opts
		}
	}
	n := NodeConfig{
		Name:     firstNonEmpty(u.Fragment, "trojan-"+server),
		Protocol: "trojan",
		Server:   server,
		Port:     port,
		Config:   cfg,
		Secrets:  map[string]string{"password": u.User.Username()},
	}
	return n, n.validate()
}

func parseSocks(raw, protocol string) (NodeConfig, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return NodeConfig{}, fmt.Errorf("%s 链接无效: %w", protocol, err)
	}
	server, port, err := splitHostPort(u.Host)
	if err != nil {
		return NodeConfig{}, err
	}
	cfg := map[string]any{"udp": true}
	if protocol == "http" && strings.EqualFold(u.Scheme, "https") {
		cfg["tls"] = true
	}
	n := NodeConfig{
		Name:     firstNonEmpty(u.Fragment, protocol+"-"+server),
		Protocol: protocol,
		Server:   server,
		Port:     port,
		Config:   cfg,
		Secrets:  map[string]string{},
	}
	if u.User != nil {
		n.Config["username"] = u.User.Username()
		if pw, ok := u.User.Password(); ok {
			n.Secrets["password"] = pw
		}
	}
	return n, n.validate()
}

func parseHysteria2(raw string) (NodeConfig, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return NodeConfig{}, fmt.Errorf("hysteria2 链接无效: %w", err)
	}
	server, port, err := splitHostPort(u.Host)
	if err != nil {
		return NodeConfig{}, err
	}
	q := u.Query()
	cfg := map[string]any{}
	if sni := q.Get("sni"); sni != "" {
		cfg["sni"] = sni
	}
	if v := q.Get("insecure"); v == "1" || strings.EqualFold(v, "true") {
		cfg["skip-cert-verify"] = true
	}
	if o := q.Get("obfs"); o != "" {
		cfg["obfs"] = o
		if p := q.Get("obfs-password"); p != "" {
			cfg["obfs-password"] = p
		}
	}
	password := ""
	if u.User != nil {
		password = u.User.Username()
		if pw, ok := u.User.Password(); ok {
			password = pw
		}
	}
	n := NodeConfig{
		Name:     firstNonEmpty(u.Fragment, "hy2-"+server),
		Protocol: "hysteria2",
		Server:   server,
		Port:     port,
		Config:   cfg,
		Secrets:  map[string]string{"password": password},
	}
	return n, n.validate()
}

func parseTUIC(raw string) (NodeConfig, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return NodeConfig{}, fmt.Errorf("tuic 链接无效: %w", err)
	}
	server, port, err := splitHostPort(u.Host)
	if err != nil {
		return NodeConfig{}, err
	}
	q := u.Query()
	cfg := map[string]any{"udp": true}
	for _, k := range []string{"sni", "congestion_control", "udp_relay_mode"} {
		if v := q.Get(k); v != "" {
			cfg[strings.ReplaceAll(k, "_", "-")] = v
		}
	}
	if v := q.Get("allow_insecure"); v == "1" || strings.EqualFold(v, "true") {
		cfg["skip-cert-verify"] = true
	}
	uuid, password := "", ""
	if u.User != nil {
		uuid = u.User.Username()
		if pw, ok := u.User.Password(); ok {
			password = pw
		}
	}
	n := NodeConfig{
		Name:     firstNonEmpty(u.Fragment, "tuic-"+server),
		Protocol: "tuic",
		Server:   server,
		Port:     port,
		Config:   cfg,
		Secrets:  map[string]string{"uuid": uuid, "password": password},
	}
	return n, n.validate()
}

func parseAnyTLS(raw string) (NodeConfig, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return NodeConfig{}, fmt.Errorf("anytls 链接无效: %w", err)
	}
	server, port, err := splitHostPort(u.Host)
	if err != nil {
		return NodeConfig{}, err
	}
	cfg := map[string]any{"udp": true}
	if q := u.Query(); q.Get("sni") != "" {
		cfg["sni"] = q.Get("sni")
	}
	password := ""
	if u.User != nil {
		password = u.User.Username()
		if pw, ok := u.User.Password(); ok {
			password = pw
		}
	}
	n := NodeConfig{
		Name:     firstNonEmpty(u.Fragment, "anytls-"+server),
		Protocol: "anytls",
		Server:   server,
		Port:     port,
		Config:   cfg,
		Secrets:  map[string]string{"password": password},
	}
	return n, n.validate()
}

// ---------- helpers ----------

func splitHostPort(hostport string) (string, int, error) {
	host, portStr, err := net.SplitHostPort(hostport)
	if err != nil {
		return "", 0, fmt.Errorf("地址 %q 无效: %w", hostport, err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		return "", 0, fmt.Errorf("端口 %q 无效", portStr)
	}
	return host, port, nil
}

func decodeBase64Loose(s string) (string, bool) {
	s = strings.TrimSpace(s)
	s = strings.TrimRight(s, "=")
	if s == "" {
		return "", false
	}
	encs := []*base64.Encoding{
		base64.RawURLEncoding, base64.RawStdEncoding,
		base64.URLEncoding, base64.StdEncoding,
	}
	for _, enc := range encs {
		if b, err := enc.DecodeString(s); err == nil {
			// RawStdEncoding happily decodes plain text with no padding; require
			// the result to look like text so a random hostname is not "decoded".
			if isPrintable(b) {
				return string(b), true
			}
		}
	}
	return "", false
}

func isPrintable(b []byte) bool {
	for _, c := range b {
		if c == 0 {
			return false
		}
		if c < 0x20 && c != '\n' && c != '\r' && c != '\t' {
			return false
		}
	}
	return true
}

func anyToInt(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(t))
		return n
	default:
		return 0
	}
}

func splitList(s string) []string {
	parts := strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == '|' })
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

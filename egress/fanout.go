// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

// Fanout is the adversarial mode: the same request leaves through K distinct
// nodes (ideally K distinct egress IPs) at once, the first non-blocked response
// wins, and the rest are cancelled. It handles per-IP rate limits and WAF blocks
// that a single rotating node keeps hitting.

// Verdict is the classifier's read on one attempt.
type Verdict int

const (
	VerdictUnknown Verdict = iota
	VerdictPass
	VerdictBlock
)

func (v Verdict) String() string {
	switch v {
	case VerdictPass:
		return "pass"
	case VerdictBlock:
		return "block"
	default:
		return "unknown"
	}
}

// FanoutOptions tunes one fanout request.
type FanoutOptions struct {
	K          int               `json:"k"`
	Timeout    time.Duration     `json:"-"`
	Jitter     time.Duration     `json:"-"`
	Headers    map[string]string `json:"headers,omitempty"`
	Body       []byte            `json:"-"`
	Idempotent bool              `json:"idempotent,omitempty"`
}

// FanoutAttempt is one path's outcome, returned to the agent so it can reason
// about "which exit IP got blocked" instead of guessing.
type FanoutAttempt struct {
	NodeID   int64  `json:"node_id"`
	NodeName string `json:"node_name,omitempty"`
	EgressIP string `json:"egress_ip,omitempty"`
	Status   int    `json:"status,omitempty"`
	Verdict  string `json:"verdict"`
	Millis   int64  `json:"ms,omitempty"`
	Bytes    int64  `json:"bytes,omitempty"`
	Error    string `json:"error,omitempty"`
}

// FanoutResult is the winning response plus every attempt.
type FanoutResult struct {
	Status   int               `json:"status"`
	Header   map[string]string `json:"header,omitempty"`
	Body     []byte            `json:"-"`
	BodyText string            `json:"body,omitempty"`
	Winner   int64             `json:"winner_node,omitempty"`
	Blocked  bool              `json:"blocked"` // every attempt looked blocked
	Attempts []FanoutAttempt   `json:"attempts"`
}

// ErrFanoutBudget means the task spent its adversarial budget for this hour.
var ErrFanoutBudget = errors.New("egress: 对抗模式预算已用完（本小时）")

const (
	fanoutBudgetPerHour = 600
	fanoutBodyCap       = 2 << 20
	fanoutDefaultK      = 3
	fanoutDefaultTries  = 8
)

// Fanout executes one request across up to K nodes.
func (m *Manager) Fanout(ctx context.Context, sessionKey, method, rawURL string, opts FanoutOptions) (*FanoutResult, error) {
	s, ok := m.sessionByKey(sessionKey)
	if !ok {
		return nil, ErrSessionRevoked
	}
	rt := &route{sess: s}
	target, err := url.Parse(rawURL)
	if err != nil || target.Host == "" {
		return nil, fmt.Errorf("egress: URL 无效: %w", err)
	}
	if method == "" {
		method = http.MethodGet
	}
	method = strings.ToUpper(method)
	idempotent := opts.Idempotent || method == http.MethodGet || method == http.MethodHead ||
		method == http.MethodOptions || method == http.MethodTrace

	ps, err := m.resolvePool(s)
	if err != nil {
		return nil, err
	}
	cands := m.candidates(ps)
	if len(cands) == 0 {
		return nil, ErrNoNode
	}
	cands = m.rankForHost(target.Hostname(), cands)

	k := opts.K
	if k <= 0 {
		s.mu.Lock()
		k = s.spec.FanoutK
		s.mu.Unlock()
	}
	if k <= 0 {
		k = ps.pool.FanoutK
	}
	if k <= 0 {
		k = fanoutDefaultK
	}
	if k > fanoutDefaultTries {
		k = fanoutDefaultTries
	}
	if !idempotent {
		// A POST/PUT must not be replayed: one attempt, unless the caller takes
		// responsibility by setting Idempotent.
		k = 1
	}
	if k > len(cands) {
		k = len(cands)
	}

	// Budget: spend only what is actually available.
	taskID := s.spec.TaskID
	allowed, err := m.consumeFanout(ctx, taskID, k)
	if err != nil {
		return nil, err
	}
	if allowed <= 0 {
		return nil, ErrFanoutBudget
	}
	if allowed < k {
		k = allowed
	}

	tctx, cancel := context.WithCancel(ctx)
	defer cancel()
	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	results := make(chan fanoutOutcome, k)
	var wg sync.WaitGroup

	for i := 0; i < k; i++ {
		node := cands[i%len(cands)]
		wg.Add(1)
		go func(node *nodeState, idx int) {
			defer wg.Done()
			att := FanoutAttempt{NodeID: node.node.ID, NodeName: node.node.Name, EgressIP: node.node.EgressIP}
			jitter := opts.Jitter
			if jitter <= 0 {
				jitter = 300 * time.Millisecond
			}
			if jitter > 0 {
				select {
				case <-time.After(time.Duration(float64(jitter) * (float64(idx) / float64(maxInt(k, 1))))):
				case <-tctx.Done():
					att.Verdict = VerdictUnknown.String()
					att.Error = "cancelled"
					results <- fanoutOutcome{attempt: att}
					return
				}
			}
			start := time.Now()
			body, status, verdict, err := m.attempt(tctx, rt, node, method, target, opts.Headers, opts.Body, timeout)
			att.Millis = time.Since(start).Milliseconds()
			att.Status = status
			att.Bytes = int64(len(body))
			att.Verdict = verdict.String()
			if err != nil {
				att.Error = truncate(err.Error(), 200)
			}
			results <- fanoutOutcome{attempt: att, body: body, verdict: verdict}
		}(node, i)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	res := &FanoutResult{}
	var fallback *fanoutOutcome
	for o := range results {
		res.Attempts = append(res.Attempts, o.attempt)
		if o.verdict == VerdictPass && res.Winner == 0 {
			res.Winner = o.attempt.NodeID
			res.Status = o.attempt.Status
			res.Body = o.body
			cancel() // stop the rest as soon as one path got through
			continue
		}
		if fallback == nil || scoreOutcome(o) > scoreOutcome(*fallback) {
			copied := o
			fallback = &copied
		}
	}
	if res.Winner == 0 && fallback != nil {
		res.Status = fallback.attempt.Status
		res.Body = fallback.body
		res.Winner = fallback.attempt.NodeID
		res.Blocked = true
	}
	m.rememberHost(target.Hostname(), res.Winner, res.Attempts)
	sort.Slice(res.Attempts, func(i, j int) bool { return res.Attempts[i].NodeID < res.Attempts[j].NodeID })
	if len(res.Body) > 0 {
		res.BodyText = truncate(string(res.Body), 64<<10)
	}
	return res, nil
}

type fanoutOutcome struct {
	attempt FanoutAttempt
	body    []byte
	verdict Verdict
}

func scoreOutcome(o fanoutOutcome) int {
	// A response with a real HTTP status beats a transport failure; among blocks a
	// 403 ("the target answered") is more useful than a timeout.
	score := 0
	if o.attempt.Error == "" {
		score += 3
	}
	if o.attempt.Status > 0 {
		score += 2
	}
	return score
}

// attempt runs one path and classifies it.
func (m *Manager) attempt(ctx context.Context, rt *route, node *nodeState, method string, target *url.URL, headers map[string]string, body []byte, timeout time.Duration) ([]byte, int, Verdict, error) {
	actx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	st, release, direct, err := m.acquire(actx, &route{sess: rt.sess, mode: ModeRotate, pin: &node.node.ID})
	if err != nil {
		return nil, 0, VerdictUnknown, err
	}
	if direct {
		release(0, 0, 0, errors.New("节点不可用"))
		return nil, 0, VerdictUnknown, errors.New("egress: 节点不可用")
	}

	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(actx, method, target.String(), reader)
	if err != nil {
		return nil, 0, VerdictUnknown, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; VEXNAR/egress)")
	}
	tr := &http.Transport{
		Proxy:               nil,
		DialContext:         st.dialer.DialContext,
		ForceAttemptHTTP2:   false,
		TLSHandshakeTimeout: 10 * time.Second,
		DisableCompression:  false,
	}
	client := &http.Client{Transport: tr, Timeout: timeout, CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse // a redirect is a real answer; do not chase it per node
	}}
	resp, err := client.Do(req)
	if err != nil {
		release(0, 0, 0, err)
		return nil, 0, VerdictUnknown, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, fanoutBodyCap))
	verdict := DefaultVerdict(resp, data)
	release(resp.StatusCode, int64(len(data)), 0, nil)
	return data, resp.StatusCode, verdict, nil
}

// DefaultVerdict classifies a response as blocked / passed / unknown. It errs on
// the side of "block" only for signals that really are an edge refusing us; a 404
// or 401 is the origin answering, i.e. a pass.
func DefaultVerdict(resp *http.Response, body []byte) Verdict {
	if resp == nil {
		return VerdictUnknown
	}
	switch resp.StatusCode {
	case http.StatusForbidden, http.StatusTooManyRequests, http.StatusServiceUnavailable:
		return VerdictBlock
	}
	if resp.Header.Get("cf-mitigated") != "" {
		return VerdictBlock
	}
	if strings.EqualFold(resp.Header.Get("Server"), "cloudflare") &&
		(resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusServiceUnavailable) {
		return VerdictBlock
	}
	lower := strings.ToLower(string(body))
	if len(lower) > 4096 {
		lower = lower[:4096]
	}
	for _, marker := range []string{
		"just a moment", "attention required", "access denied", "cf-challenge",
		"captcha-delivery", "checking your browser", "request blocked",
	} {
		if strings.Contains(lower, marker) {
			return VerdictBlock
		}
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		return VerdictPass
	}
	return VerdictUnknown
}

// ---------- per-host node memory ----------

type hostMemory struct {
	mu      sync.Mutex
	prefer  map[int64]time.Time
	blocked map[int64]time.Time
}

func (m *Manager) hostMemory(host string) *hostMemory {
	m.hostMu.Lock()
	defer m.hostMu.Unlock()
	if m.hosts == nil {
		m.hosts = map[string]*hostMemory{}
	}
	hm := m.hosts[host]
	if hm == nil {
		hm = &hostMemory{prefer: map[int64]time.Time{}, blocked: map[int64]time.Time{}}
		m.hosts[host] = hm
	}
	return hm
}

// rankForHost puts nodes that recently passed this host first and drops blocked
// ones. Memory is advisory: if everything is blocked, the original list is used.
func (m *Manager) rankForHost(host string, cands []*nodeState) []*nodeState {
	if host == "" {
		return cands
	}
	hm := m.hostMemory(host)
	now := time.Now()
	hm.mu.Lock()
	defer hm.mu.Unlock()
	score := func(id int64) int {
		if t, ok := hm.prefer[id]; ok && now.Before(t) {
			return -1
		}
		if t, ok := hm.blocked[id]; ok && now.Before(t) {
			return 1
		}
		return 0
	}
	ranked := append([]*nodeState(nil), cands...)
	sort.SliceStable(ranked, func(i, j int) bool {
		return score(ranked[i].node.ID) < score(ranked[j].node.ID)
	})
	usable := ranked[:0]
	for _, st := range ranked {
		if score(st.node.ID) != 1 {
			usable = append(usable, st)
		}
	}
	if len(usable) == 0 {
		return ranked
	}
	return usable
}

// rememberHost records which node won and which were blocked, so the next request
// to the same host starts from a better order.
func (m *Manager) rememberHost(host string, winner int64, attempts []FanoutAttempt) {
	if host == "" || len(attempts) == 0 {
		return
	}
	hm := m.hostMemory(host)
	now := time.Now()
	hm.mu.Lock()
	defer hm.mu.Unlock()
	for _, a := range attempts {
		switch a.Verdict {
		case VerdictBlock.String():
			hm.blocked[a.NodeID] = now.Add(30 * time.Minute)
		case VerdictPass.String():
			if a.NodeID == winner {
				hm.prefer[a.NodeID] = now.Add(time.Hour)
			}
		}
	}
}

// ---------- budget ----------

// consumeFanout spends up to want from the task's hourly adversarial budget and
// returns how many attempts are actually allowed.
func (m *Manager) consumeFanout(ctx context.Context, taskID int64, want int) (int, error) {
	if want <= 0 {
		return 0, nil
	}
	if taskID <= 0 {
		return want, nil // unscoped/manual session: no budget bookkeeping
	}
	bucket := nowBucket()
	used, err := m.store.FanoutUsed(ctx, taskID, bucket)
	if err != nil {
		return 0, err
	}
	remaining := fanoutBudgetPerHour - int(used)
	if remaining <= 0 {
		return 0, nil
	}
	allowed := want
	if allowed > remaining {
		allowed = remaining
	}
	if err := m.store.AddFanout(ctx, taskID, bucket, int64(allowed)); err != nil {
		return 0, err
	}
	return allowed, nil
}

// nowBucket is the hour bucket used by the adversarial budget.
func nowBucket() int64 { return time.Now().Truncate(time.Hour).Unix() }

// FanoutRemaining reports the task's left-over adversarial attempts this hour.
func (m *Manager) FanoutRemaining(ctx context.Context, taskID int64) int {
	if taskID <= 0 {
		return fanoutBudgetPerHour
	}
	bucket := nowBucket()
	used, err := m.store.FanoutUsed(ctx, taskID, bucket)
	if err != nil {
		return 0
	}
	left := fanoutBudgetPerHour - int(used)
	if left < 0 {
		return 0
	}
	return left
}

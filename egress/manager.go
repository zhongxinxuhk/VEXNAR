// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	mathrand "math/rand/v2"
	"net"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Mode is the per-connection node selection policy.
type Mode string

const (
	ModeSticky Mode = "sticky" // one node per session, until failure/TTL
	ModeRotate Mode = "rotate" // a different node per connection
	ModeFanout Mode = "fanout" // adversarial: K nodes racing (P3; currently behaves as rotate)
)

// Fallback decides what happens when no node is usable.
type Fallback string

const (
	FallbackBlock  Fallback = "block"  // fail closed (default): never leak the real IP
	FallbackDirect Fallback = "direct" // explicit opt-in only
)

// ErrNoPool means the session has no pool: neither its own, nor a task binding,
// nor a server default. Callers must treat it as "egress unavailable", not direct.
var ErrNoPool = errors.New("egress: 会话没有可用的代理池")

// ErrNoNode means the pool exists but has no usable node right now.
var ErrNoNode = errors.New("egress: 池内没有可用节点")

// ErrSessionRevoked is returned after a task ends/deletes its session.
var ErrSessionRevoked = errors.New("egress: 会话已撤销")

// ErrPoolFull means the pool or session concurrency budget is exhausted.
var ErrPoolFull = errors.New("egress: 池或会话并发已满")

// SessionSpec describes one egress consumer. Key is stable per (task, role).
type SessionSpec struct {
	Key      string   `json:"key"`
	TaskID   int64    `json:"task_id,omitempty"`
	Role     string   `json:"role,omitempty"`
	PoolID   int64    `json:"pool_id,omitempty"`
	Mode     Mode     `json:"mode,omitempty"`
	FanoutK  int      `json:"fanout_k,omitempty"`
	Fallback Fallback `json:"fallback,omitempty"`
	MaxConns int      `json:"max_conns,omitempty"`
	Tags     []string `json:"tags,omitempty"`
}

// Endpoint is what a tool (bash/WebFetch/browser) receives.
type Endpoint struct {
	URL      string `json:"url"`     // http://sess_<key>:<secret>@127.0.0.1:<port>
	Session  string `json:"session"` // sanitized session key
	PoolID   int64  `json:"pool_id"` // 0 = unresolved yet
	PoolName string `json:"pool_name"`
	Mode     Mode   `json:"mode"`
}

// Snapshot is the live view surfaced to API/UI/prompts.
type Snapshot struct {
	Session   string    `json:"session"`
	TaskID    int64     `json:"task_id"`
	Role      string    `json:"role"`
	PoolID    int64     `json:"pool_id"`
	PoolName  string    `json:"pool_name"`
	Mode      Mode      `json:"mode"`
	Fallback  Fallback  `json:"fallback"`
	NodeID    int64     `json:"node_id,omitempty"`
	NodeName  string    `json:"node_name,omitempty"`
	NodeIP    string    `json:"node_ip,omitempty"`
	ExpiresAt time.Time `json:"expires_at,omitempty"`
	Requests  int64     `json:"requests"`
	Failures  int64     `json:"failures"`
	LastError string    `json:"last_error,omitempty"`
	Recent    []Attempt `json:"recent,omitempty"`
}

// Attempt is one connection outcome, kept for diagnostics and prompt feedback.
type Attempt struct {
	At       time.Time `json:"at"`
	NodeID   int64     `json:"node_id"`
	Target   string    `json:"target"`
	OK       bool      `json:"ok"`
	Status   int       `json:"status,omitempty"`
	BytesIn  int64     `json:"bytes_in,omitempty"`
	BytesOut int64     `json:"bytes_out,omitempty"`
	Millis   int64     `json:"ms,omitempty"`
	Error    string    `json:"error,omitempty"`
}

// Options configures the runtime.
type Options struct {
	DataDir     string // <dataDir>/egress holds egress.db + .key
	GatewayAddr string // default 127.0.0.1:0
	DefaultPool int64  // server-level default pool id (0 = none)
}

// Manager owns the store, the protocol core, node state and the loopback gateway.
type Manager struct {
	store       *Store
	core        *Core
	gateway     *Gateway
	dataDir     string
	gatewayAddr string

	mu          sync.RWMutex
	pools       map[int64]*poolState
	nodes       map[int64]*nodeState
	bindings    map[int64]Binding
	order       []int64
	defaultPool int64

	sessMu   sync.RWMutex
	sessions map[string]*session // sanitized key → session
	byUser   map[string]*session // proxy username → session

	fixedMu sync.Mutex
	fixed   map[string]*fixedEntry // session-bound no-auth listeners

	events eventBus

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
	closed atomic.Bool

	// usage aggregation: request counters are hot, SQLite writes are batched.
	usageMu sync.Mutex
	usage   map[usageKey]*usageDelta
}

type usageKey struct {
	taskID, nodeID int64
}

type usageDelta struct {
	requests, failures, bytesIn, bytesOut int64
}

type poolState struct {
	pool  Pool
	nodes []*nodeState
	sem   chan struct{}
}

type nodeState struct {
	node   Node
	dialer *NodeDialer
	sem    chan struct{}

	mu        sync.Mutex
	health    Health
	latencyEW time.Duration
	requests  int64
	failures  int64
	inflight  int64
	lastUsed  time.Time
}

type session struct {
	spec   SessionSpec
	secret string
	sem    chan struct{}

	mu       sync.Mutex
	lease    *Lease
	lastSeen time.Time
	lastNode int64
	requests int64
	failures int64
	lastErr  string
	recent   []Attempt

	pins map[int64]bool // "preferred" nodes learned from successful fanout
}

// Lease pins a session to a node for the sticky duration.
type Lease struct {
	Key     string    `json:"key"`
	PoolID  int64     `json:"pool_id"`
	NodeID  int64     `json:"node_id"`
	Expires time.Time `json:"expires"`
}

// NewManager builds the runtime and loads a snapshot from the store.
func NewManager(opts Options) (*Manager, error) {
	store, err := OpenStore(opts.DataDir)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	m := &Manager{
		store:       store,
		core:        NewCore(),
		dataDir:     opts.DataDir,
		gatewayAddr: firstNonEmpty(opts.GatewayAddr, "127.0.0.1:0"),
		pools:       map[int64]*poolState{},
		nodes:       map[int64]*nodeState{},
		bindings:    map[int64]Binding{},
		defaultPool: opts.DefaultPool,
		sessions:    map[string]*session{},
		byUser:      map[string]*session{},
		fixed:       map[string]*fixedEntry{},
		usage:       map[usageKey]*usageDelta{},
		ctx:         ctx,
		cancel:      cancel,
	}
	if err := m.Reload(ctx); err != nil {
		_ = store.Close()
		cancel()
		return nil, err
	}
	gw, err := NewGateway(m)
	if err != nil {
		_ = store.Close()
		cancel()
		return nil, err
	}
	m.gateway = gw
	return m, nil
}

// Start launches the gateway and the health/usage loops.
func (m *Manager) Start() {
	if m == nil || m.closed.Load() {
		return
	}
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		if err := m.gateway.Serve(); err != nil && !errors.Is(err, net.ErrClosed) {
			m.logf("gateway stopped: %v", err)
		}
	}()
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		m.loop()
	}()
	m.logf("egress gateway listening on %s (db %s)", m.gateway.Addr(), m.store.Path())
}

// Close stops the gateway and flushes counters.
func (m *Manager) Close() error {
	if m == nil || !m.closed.CompareAndSwap(false, true) {
		return nil
	}
	m.cancel()
	m.closeFixedListeners()
	if m.gateway != nil {
		_ = m.gateway.Close()
	}
	m.wg.Wait()
	m.flushUsage(context.Background())
	return m.store.Close()
}

// Store exposes the persistence layer to the server API.
func (m *Manager) Store() *Store { return m.store }

// GatewayAddr returns the loopback gateway address.
func (m *Manager) GatewayAddr() string {
	if m.gateway == nil {
		return ""
	}
	return m.gateway.Addr()
}

// Core exposes the protocol core (used by tests and diagnostics).
func (m *Manager) Core() *Core { return m.core }

// DefaultPool returns the server-level default pool.
func (m *Manager) DefaultPool() int64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.defaultPool
}

// SetDefaultPool changes the fallback pool used when a task has no binding.
func (m *Manager) SetDefaultPool(id int64) {
	m.mu.Lock()
	m.defaultPool = id
	m.mu.Unlock()
}

// Reload rebuilds the in-memory pool snapshot from SQLite. Callers must invoke it
// after any node/pool mutation so the gateway sees the change immediately.
func (m *Manager) Reload(ctx context.Context) error {
	nodes, err := m.store.Nodes(ctx)
	if err != nil {
		return err
	}
	pools, err := m.store.Pools(ctx)
	if err != nil {
		return err
	}
	bindings, err := m.store.Bindings(ctx)
	if err != nil {
		return err
	}
	health, err := m.store.Health(ctx)
	if err != nil {
		return err
	}

	nodeStates := make(map[int64]*nodeState, len(nodes))
	byPool := map[int64][]int64{}
	for _, p := range pools {
		ids, err := m.store.PoolNodes(ctx, p.ID)
		if err != nil {
			return err
		}
		byPool[p.ID] = ids
	}
	// Only nodes that belong to at least one pool are dialable; standalone nodes
	// stay in the library for inspection but consume no dialer cache.
	member := map[int64]bool{}
	for _, ids := range byPool {
		for _, id := range ids {
			member[id] = true
		}
	}
	for _, n := range nodes {
		st := &nodeState{
			node:   n,
			health: defaultHealth(n.ID, health[n.ID]),
			sem:    make(chan struct{}, maxInt(n.MaxConns, 1)),
		}
		if member[n.ID] && n.Enabled {
			d, err := m.core.Dialer(n.NodeConfig)
			if err == nil {
				st.dialer = d
			}
		}
		nodeStates[n.ID] = st
	}

	nextPools := make(map[int64]*poolState, len(pools))
	for _, p := range pools {
		ps := &poolState{pool: p, sem: make(chan struct{}, maxInt(p.MaxConns, 1))}
		for _, id := range byPool[p.ID] {
			if st := nodeStates[id]; st != nil {
				ps.nodes = append(ps.nodes, st)
			}
		}
		nextPools[p.ID] = ps
	}

	m.mu.Lock()
	m.nodes = nodeStates
	m.pools = nextPools
	m.bindings = bindings
	m.order = nil
	for _, p := range pools {
		m.order = append(m.order, p.ID)
	}
	m.mu.Unlock()
	m.publish(Event{Type: "pools_reloaded", At: time.Now()})
	return nil
}

// ---------- sessions ----------

// Endpoint registers (idempotently) a session and returns the proxy URL tools use.
func (m *Manager) Endpoint(spec SessionSpec) (Endpoint, error) {
	if m == nil {
		return Endpoint{}, ErrNoPool
	}
	if strings.TrimSpace(spec.Key) == "" {
		return Endpoint{}, errors.New("egress: 会话键为空")
	}
	user := sanitizeKey(spec.Key)

	m.sessMu.Lock()
	defer m.sessMu.Unlock()
	if s := m.sessions[user]; s != nil {
		// Refresh policy on re-registration (pool/mode may have changed).
		s.mu.Lock()
		s.spec.Mode = firstMode(spec.Mode, s.spec.Mode)
		s.spec.Fallback = firstFallback(spec.Fallback, s.spec.Fallback)
		if spec.PoolID > 0 {
			if s.spec.PoolID != spec.PoolID {
				s.lease = nil // pool changed → drop the old lease
			}
			s.spec.PoolID = spec.PoolID
		}
		if spec.MaxConns > 0 {
			s.spec.MaxConns = spec.MaxConns
		}
		s.mu.Unlock()
		m.byUser["sess_"+user] = s
		return m.endpointLocked(s), nil
	}
	secret, err := randomToken(24)
	if err != nil {
		return Endpoint{}, err
	}
	normalized := normalizeSpec(spec)
	s := &session{
		spec:     normalized,
		secret:   secret,
		sem:      make(chan struct{}, normalized.MaxConns),
		pins:     map[int64]bool{},
		lastSeen: time.Now(),
	}
	m.sessions[user] = s
	m.byUser["sess_"+user] = s
	return m.endpointLocked(s), nil
}

func (m *Manager) endpointLocked(s *session) Endpoint {
	s.mu.Lock()
	mode := s.spec.Mode
	poolID := s.spec.PoolID
	s.mu.Unlock()
	if poolID == 0 {
		poolID, _ = m.poolFor(s)
	}
	name := ""
	if ps := m.poolState(poolID); ps != nil {
		name = ps.pool.Name
	}
	return Endpoint{
		URL:      fmt.Sprintf("http://sess_%s:%s@%s", sanitizeKey(s.spec.Key), s.secret, m.gateway.Addr()),
		Session:  sanitizeKey(s.spec.Key),
		PoolID:   poolID,
		PoolName: name,
		Mode:     mode,
	}
}

// Revoke drops one session (task ended, conversation closed).
func (m *Manager) Revoke(key string) {
	user := sanitizeKey(key)
	m.sessMu.Lock()
	if s := m.sessions[user]; s != nil {
		delete(m.sessions, user)
		delete(m.byUser, "sess_"+user)
	}
	m.sessMu.Unlock()
	m.closeFixed(user)
	m.publish(Event{Type: "session_revoked", Message: user})
}

// RevokeTask drops every session of a task (`task:<id>:*`).
func (m *Manager) RevokeTask(taskID int64) {
	prefix := fmt.Sprintf("task-%d-", taskID)
	m.sessMu.Lock()
	var revoked []string
	for user, s := range m.sessions {
		if s.spec.TaskID == taskID || strings.HasPrefix(user, prefix) {
			delete(m.sessions, user)
			delete(m.byUser, "sess_"+user)
			revoked = append(revoked, user)
		}
	}
	m.sessMu.Unlock()
	for _, user := range revoked {
		m.closeFixed(user)
	}
	m.publish(Event{Type: "session_revoked", Message: fmt.Sprintf("task:%d", taskID)})
}

// SessionSnapshot returns the live state for API/prompt display.
func (m *Manager) SessionSnapshot(key string) (Snapshot, bool) {
	user := sanitizeKey(key)
	m.sessMu.RLock()
	s := m.sessions[user]
	m.sessMu.RUnlock()
	if s == nil {
		return Snapshot{}, false
	}
	s.mu.Lock()
	snap := Snapshot{
		Session:   user,
		TaskID:    s.spec.TaskID,
		Role:      s.spec.Role,
		PoolID:    s.spec.PoolID,
		Mode:      s.spec.Mode,
		Fallback:  s.spec.Fallback,
		Requests:  s.requests,
		Failures:  s.failures,
		LastError: s.lastErr,
		Recent:    append([]Attempt(nil), s.recent...),
	}
	if s.lease != nil {
		snap.NodeID = s.lease.NodeID
		snap.ExpiresAt = s.lease.Expires
	} else {
		// rotate/fanout have no lease; show the node that served the last start.
		snap.NodeID = s.lastNode
	}
	s.mu.Unlock()

	if snap.PoolID == 0 {
		snap.PoolID, _ = m.poolFor(s)
	}
	if ps := m.poolState(snap.PoolID); ps != nil {
		snap.PoolName = ps.pool.Name
	}
	if st := m.nodeState(snap.NodeID); st != nil {
		snap.NodeName = st.node.Name
		snap.NodeIP = st.node.EgressIP
	}
	return snap, true
}

// UpstreamURLFor returns a node-pinned gateway URL for one session. Per-session
// recording listeners use it as their upstream: go-mitmproxy resolves it per
// CONNECT, so a sticky session keeps its node and a rotating one spreads.
func (m *Manager) UpstreamURLFor(key string) (string, error) {
	user := sanitizeKey(key)
	m.sessMu.RLock()
	s := m.sessions[user]
	m.sessMu.RUnlock()
	if s == nil {
		return "", ErrSessionRevoked
	}
	ps, err := m.resolvePool(s)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	mode := s.spec.Mode
	lease := s.lease
	s.mu.Unlock()
	st, err := m.choose(context.Background(), ps, s, mode, lease, nil)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("http://sess_%s.node_%d:%s@%s", user, st.node.ID, s.secret, m.gateway.Addr()), nil
}

// Sessions lists live sessions.
func (m *Manager) Sessions() []Snapshot {
	m.sessMu.RLock()
	keys := make([]string, 0, len(m.sessions))
	for k := range m.sessions {
		keys = append(keys, k)
	}
	m.sessMu.RUnlock()
	sort.Strings(keys)
	out := make([]Snapshot, 0, len(keys))
	for _, k := range keys {
		if snap, ok := m.SessionSnapshot(k); ok {
			out = append(out, snap)
		}
	}
	return out
}

// ---------- selection ----------

// authenticate resolves a proxy-user to a session and verifies the secret.
func (m *Manager) authenticate(user, pass string) (*session, error) {
	m.sessMu.RLock()
	s := m.byUser[user]
	m.sessMu.RUnlock()
	if s == nil {
		return nil, errBadCredential
	}
	if subtle.ConstantTimeCompare([]byte(s.secret), []byte(pass)) != 1 {
		return nil, errBadCredential
	}
	s.mu.Lock()
	s.lastSeen = time.Now()
	s.mu.Unlock()
	return s, nil
}

// acquire reserves capacity on one node for one connection. `direct` is true only
// when the session explicitly opted into fallback=direct AND no node is usable;
// the caller then dials the target itself (and the platform's real IP is exposed).
func (m *Manager) acquire(ctx context.Context, rt *route) (*nodeState, func(status int, bytesIn, bytesOut int64, err error), bool, error) {
	s := rt.sess
	ps, err := m.resolvePool(s)
	if err != nil {
		if errors.Is(err, ErrNoPool) && m.fallbackOf(s) == FallbackDirect {
			m.logf("会话 %s 没有可用池，按 fallback=direct 直连（将暴露平台真实出口）", sanitizeKey(s.spec.Key))
			return nil, noopRelease, true, nil
		}
		return nil, nil, false, err
	}
	if err := m.take(ps.sem, ctx); err != nil {
		return nil, nil, false, ErrPoolFull
	}
	// Per-session budget: prevents one agent from starving the pool.
	if err := m.take(s.sem, ctx); err != nil {
		m.give(ps.sem)
		return nil, nil, false, ErrPoolFull
	}

	mode := rt.mode
	s.mu.Lock()
	if mode == "" {
		mode = s.spec.Mode
	}
	lease := s.lease
	s.mu.Unlock()

	st, err := m.choose(ctx, ps, s, mode, lease, rt.pin)
	if err != nil {
		m.give(s.sem)
		m.give(ps.sem)
		if errors.Is(err, ErrNoNode) && m.fallbackOf(s) == FallbackDirect {
			m.logf("会话 %s 无可用节点，按 fallback=direct 直连（将暴露平台真实出口）", sanitizeKey(s.spec.Key))
			return nil, noopRelease, true, nil
		}
		return nil, nil, false, err
	}
	if err := m.take(st.sem, ctx); err != nil {
		m.give(s.sem)
		m.give(ps.sem)
		return nil, nil, false, ErrPoolFull
	}
	atomic.AddInt64(&st.inflight, 1)
	start := time.Now()
	// Count the connection when it is established, not when a long-lived CONNECT
	// tunnel finally closes: otherwise a scanner's session looks idle for hours.
	m.noteStart(s, st)

	var once sync.Once
	release := func(status int, bytesIn, bytesOut int64, callErr error) {
		once.Do(func() {
			atomic.AddInt64(&st.inflight, -1)
			m.give(st.sem)
			m.give(s.sem)
			m.give(ps.sem)
			ok := callErr == nil && status > 0 && status < 500
			latency := time.Since(start)
			m.report(st, ok, latency, callErr)
			m.noteFinish(s, st, ok, status, bytesIn, bytesOut, latency, callErr)
		})
	}
	return st, release, false, nil
}

func noopRelease(int, int64, int64, error) {}

func (m *Manager) resolvePool(s *session) (*poolState, error) {
	poolID, _ := m.poolFor(s)
	ps := m.poolState(poolID)
	if ps == nil {
		return nil, ErrNoPool
	}
	return ps, nil
}

// fallbackOf resolves the session's effective fallback policy.
func (m *Manager) fallbackOf(s *session) Fallback {
	_, fb := m.poolFor(s)
	return fb
}

// poolFor resolves the session's pool: explicit → task binding → default.
func (m *Manager) poolFor(s *session) (int64, Fallback) {
	s.mu.Lock()
	poolID, fb := s.spec.PoolID, s.spec.Fallback
	taskID := s.spec.TaskID
	s.mu.Unlock()
	if poolID > 0 {
		return poolID, firstFallback(fb, FallbackBlock)
	}
	m.mu.RLock()
	binding, hasBinding := m.bindings[taskID]
	def := m.defaultPool
	m.mu.RUnlock()
	if hasBinding {
		s.mu.Lock()
		if s.spec.Fallback == "" {
			fb = Fallback(binding.Fallback)
		}
		s.mu.Unlock()
		return binding.PoolID, firstFallback(fb, FallbackBlock)
	}
	return def, firstFallback(fb, FallbackBlock)
}

func (m *Manager) choose(ctx context.Context, ps *poolState, s *session, mode Mode, lease *Lease, pin *int64) (*nodeState, error) {
	candidates := m.candidates(ps)
	if len(candidates) == 0 {
		return nil, ErrNoNode
	}
	if pin != nil {
		for _, st := range candidates {
			if st.node.ID == *pin {
				return st, nil
			}
		}
		return nil, fmt.Errorf("egress: 指定节点 %d 不在池内或不可用", *pin)
	}
	if mode == ModeSticky && lease != nil && time.Now().Before(lease.Expires) {
		for _, st := range candidates {
			if st.node.ID == lease.NodeID {
				return st, nil
			}
		}
		// Leased node dropped out of the candidate set (failure/cooldown): re-lease.
	}
	st := pickWeighted(candidates, ps.pool.Strategy)
	if st == nil {
		return nil, ErrNoNode
	}
	if mode == ModeSticky || ps.pool.Strategy == "sticky" {
		s.mu.Lock()
		s.lease = &Lease{
			Key:     sanitizeKey(s.spec.Key),
			PoolID:  ps.pool.ID,
			NodeID:  st.node.ID,
			Expires: time.Now().Add(time.Duration(ps.pool.StickyTTL) * time.Second),
		}
		s.mu.Unlock()
	}
	return st, nil
}

// candidates returns nodes that are enabled, have a dialer and are not cooling.
func (m *Manager) candidates(ps *poolState) []*nodeState {
	now := time.Now()
	out := make([]*nodeState, 0, len(ps.nodes))
	for _, st := range ps.nodes {
		if !st.node.Enabled || st.dialer == nil {
			continue
		}
		st.mu.Lock()
		state, until := st.health.State, st.health.CooldownUntil
		st.mu.Unlock()
		if state == "cooldown" && now.Before(until) {
			continue
		}
		out = append(out, st)
	}
	return out
}

// pickWeighted selects by strategy. `failover` uses catalogue order, everything
// else scores latency/success/weight and jitters so concurrent sessions spread.
func pickWeighted(candidates []*nodeState, strategy string) *nodeState {
	if len(candidates) == 0 {
		return nil
	}
	if strategy == "failover" {
		return candidates[0]
	}
	weights := make([]float64, len(candidates))
	var total float64
	for i, st := range candidates {
		st.mu.Lock()
		score := nodeScore(st)
		st.mu.Unlock()
		weights[i] = score
		total += score
	}
	if total <= 0 {
		return candidates[mathrand.IntN(len(candidates))]
	}
	r := mathrand.Float64() * total
	for i, w := range weights {
		if r < w {
			return candidates[i]
		}
		r -= w
	}
	return candidates[len(candidates)-1]
}

func nodeScore(st *nodeState) float64 {
	latency := st.latencyEW
	if latency <= 0 {
		latency = 400 * time.Millisecond
	}
	latScore := 1 / (1 + latency.Seconds())
	success := 1.0
	if st.requests > 0 {
		success = float64(st.requests-st.failures) / float64(st.requests)
	}
	weight := float64(maxInt(st.node.Weight, 1))
	failPenalty := math.Min(float64(st.health.FailStreak)*0.15, 0.6)
	score := 0.5*latScore + 0.35*success + 0.15*math.Min(weight/10, 1) - failPenalty
	if score < 0.01 {
		score = 0.01
	}
	return score
}

func (m *Manager) take(sem chan struct{}, ctx context.Context) error {
	select {
	case sem <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (m *Manager) give(sem chan struct{}) {
	select {
	case <-sem:
	default:
	}
}

// ---------- health ----------

func (m *Manager) report(st *nodeState, ok bool, latency time.Duration, callErr error) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.lastUsed = time.Now()
	now := time.Now()
	prevState := st.health.State
	if ok {
		st.failures = 0
		st.health.FailStreak = 0
		st.health.State = "up"
		st.health.CheckedAt = now
		st.health.CooldownUntil = time.Time{}
		st.health.LastError = ""
		if st.latencyEW == 0 {
			st.latencyEW = latency
		} else {
			st.latencyEW = time.Duration(float64(st.latencyEW)*0.7 + float64(latency)*0.3)
		}
		st.health.LatencyMS = st.latencyEW.Milliseconds()
		if prevState != "up" {
			m.publish(Event{Type: "node_health", NodeID: st.node.ID, State: "up"})
		}
		return
	}
	st.failures++
	st.health.FailStreak++
	if callErr != nil {
		st.health.LastError = truncate(callErr.Error(), 200)
	}
	// Only consecutive failures push a node into cooldown; a target-side 5xx does
	// not, because the node itself worked.
	if st.health.FailStreak >= 3 {
		backoff := time.Duration(2<<uint(math.Min(float64(st.health.FailStreak-3), 7))) * time.Second
		if backoff > 5*time.Minute {
			backoff = 5 * time.Minute
		}
		st.health.State = "cooldown"
		st.health.CooldownUntil = now.Add(backoff)
	} else if st.health.FailStreak > 0 {
		st.health.State = "degraded"
	}
	if prevState != st.health.State {
		m.publish(Event{Type: "node_health", NodeID: st.node.ID, State: st.health.State, Message: st.health.LastError})
	}
}

func defaultHealth(nodeID int64, h Health) Health {
	if h.NodeID == 0 {
		return Health{NodeID: nodeID, State: "unknown", SuccessRate: 1}
	}
	if h.State == "" {
		h.State = "unknown"
	}
	return h
}

// CheckNode probes one node synchronously and persists the result.
func (m *Manager) CheckNode(ctx context.Context, id int64) (Health, error) {
	st := m.nodeState(id)
	if st == nil {
		return Health{}, fmt.Errorf("egress: 节点 %d 不存在", id)
	}
	probeURL, ipURL, timeout := m.probeTargets(st.node.ID)
	d, err := m.core.Dialer(st.node.NodeConfig)
	if err != nil {
		return Health{}, err
	}
	res, probeErr := d.Probe(ctx, probeURL, ipURL, timeout)
	h := Health{NodeID: id, CheckedAt: time.Now(), SuccessRate: 1}
	if probeErr != nil {
		h.State = "down"
		h.LastError = truncate(probeErr.Error(), 200)
	} else {
		h.State = "up"
		h.LatencyMS = res.Latency.Milliseconds()
	}
	if res.EgressIP != "" {
		h.State = firstNonEmpty(h.State, "up")
		st.mu.Lock()
		st.node.EgressIP = res.EgressIP
		st.mu.Unlock()
	}
	st.mu.Lock()
	st.health = defaultHealth(id, h)
	st.latencyEW = res.Latency
	st.mu.Unlock()
	_ = m.store.SaveHealth(ctx, h)
	m.publish(Event{Type: "node_health", NodeID: id, State: h.State, Message: h.LastError})
	return h, nil
}

// CheckPool probes every enabled member, bounded to 8 concurrent dials.
func (m *Manager) CheckPool(ctx context.Context, poolID int64) []Health {
	ps := m.poolState(poolID)
	if ps == nil {
		return nil
	}
	sem := make(chan struct{}, 8)
	out := make([]Health, 0, len(ps.nodes))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, st := range ps.nodes {
		if !st.node.Enabled {
			continue
		}
		wg.Add(1)
		go func(id int64) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			h, err := m.CheckNode(ctx, id)
			if err != nil {
				h = Health{NodeID: id, State: "down", CheckedAt: time.Now(), LastError: truncate(err.Error(), 200)}
			}
			mu.Lock()
			out = append(out, h)
			mu.Unlock()
		}(st.node.ID)
	}
	wg.Wait()
	sort.Slice(out, func(i, j int) bool { return out[i].NodeID < out[j].NodeID })
	return out
}

func (m *Manager) probeTargets(nodeID int64) (probeURL, ipURL string, timeout time.Duration) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, ps := range m.pools {
		for _, st := range ps.nodes {
			if st.node.ID == nodeID {
				return ps.pool.HealthURL, ps.pool.IPProbeURL, 8 * time.Second
			}
		}
	}
	return "http://www.gstatic.com/generate_204", "", 8 * time.Second
}

func (m *Manager) loop() {
	usageTicker := time.NewTicker(30 * time.Second)
	checkTicker := time.NewTicker(30 * time.Second)
	defer usageTicker.Stop()
	defer checkTicker.Stop()
	for {
		select {
		case <-m.ctx.Done():
			return
		case <-usageTicker.C:
			m.flushUsage(m.ctx)
		case <-checkTicker.C:
			m.runDueChecks()
			m.evictIdleSessions()
		}
	}
}

// evictIdleSessions drops agent sessions that stopped sending traffic (agent
// rebuilt, task paused). The global default session is kept: it backs ProxyAddr.
func (m *Manager) evictIdleSessions() {
	cutoff := time.Now().Add(-4 * time.Hour)
	m.sessMu.Lock()
	defer m.sessMu.Unlock()
	for user, s := range m.sessions {
		if strings.HasPrefix(user, "global-") {
			continue
		}
		s.mu.Lock()
		idle := s.lastSeen.Before(cutoff)
		s.mu.Unlock()
		if idle {
			delete(m.sessions, user)
			delete(m.byUser, "sess_"+user)
		}
	}
}

func (m *Manager) runDueChecks() {
	m.mu.RLock()
	pools := make([]*poolState, 0, len(m.pools))
	for _, ps := range m.pools {
		pools = append(pools, ps)
	}
	m.mu.RUnlock()
	for _, ps := range pools {
		due := time.Duration(ps.pool.CheckSeconds) * time.Second
		for _, st := range ps.nodes {
			if !st.node.Enabled || st.dialer == nil {
				continue
			}
			st.mu.Lock()
			checked := st.health.CheckedAt
			cooldown := st.health.CooldownUntil
			st.mu.Unlock()
			if time.Since(checked) < due && time.Now().After(cooldown) {
				continue
			}
			ctx, cancel := context.WithTimeout(m.ctx, 20*time.Second)
			_, _ = m.CheckNode(ctx, st.node.ID)
			cancel()
		}
	}
}

// ---------- usage & attempts ----------

// noteStart records that a connection was established through st.
func (m *Manager) noteStart(s *session, st *nodeState) {
	s.mu.Lock()
	s.requests++
	s.lastNode = st.node.ID
	s.mu.Unlock()
	st.mu.Lock()
	st.requests++
	st.mu.Unlock()

	m.usageMu.Lock()
	key := usageKey{taskID: s.spec.TaskID, nodeID: st.node.ID}
	d := m.usage[key]
	if d == nil {
		d = &usageDelta{}
		m.usage[key] = d
	}
	d.requests++
	m.usageMu.Unlock()
}

// noteFinish records the outcome/bytes of one connection.
func (m *Manager) noteFinish(s *session, st *nodeState, ok bool, status int, bytesIn, bytesOut int64, latency time.Duration, callErr error) {
	a := Attempt{
		At: time.Now(), NodeID: st.node.ID, OK: ok, Status: status,
		BytesIn: bytesIn, BytesOut: bytesOut, Millis: latency.Milliseconds(),
	}
	if callErr != nil {
		a.Error = truncate(callErr.Error(), 200)
	}
	s.mu.Lock()
	if !ok {
		s.failures++
		if callErr != nil {
			s.lastErr = a.Error
		} else {
			s.lastErr = fmt.Sprintf("HTTP %d", status)
		}
	}
	s.recent = append(s.recent, a)
	if len(s.recent) > 10 {
		s.recent = s.recent[len(s.recent)-10:]
	}
	s.mu.Unlock()

	m.usageMu.Lock()
	key := usageKey{taskID: s.spec.TaskID, nodeID: st.node.ID}
	d := m.usage[key]
	if d == nil {
		d = &usageDelta{}
		m.usage[key] = d
	}
	if !ok {
		d.failures++
	}
	d.bytesIn += bytesIn
	d.bytesOut += bytesOut
	m.usageMu.Unlock()
}

func (m *Manager) flushUsage(ctx context.Context) {
	m.usageMu.Lock()
	pending := m.usage
	m.usage = map[usageKey]*usageDelta{}
	m.usageMu.Unlock()
	if len(pending) == 0 {
		return
	}
	for key, d := range pending {
		if err := m.store.AddUsage(ctx, key.taskID, key.nodeID, d.requests, d.failures, d.bytesIn, d.bytesOut); err != nil {
			m.logf("usage flush failed: %v", err)
		}
	}
}

// ---------- views ----------

// PoolView is the API/UI projection of one pool.
type PoolView struct {
	Pool
	NodeCount    int     `json:"node_count"`
	HealthyCount int     `json:"healthy_count"`
	Members      []int64 `json:"node_ids"`
}

// State is the aggregate view served by GET /api/proxy/state.
type State struct {
	Enabled     bool       `json:"enabled"`
	Gateway     string     `json:"gateway"`
	DefaultPool int64      `json:"default_pool"`
	Pools       []PoolView `json:"pools"`
	Nodes       []NodeView `json:"nodes"`
	Sessions    []Snapshot `json:"sessions"`
}

// NodeView pairs a node with its runtime health/counters.
type NodeView struct {
	Node
	State       string  `json:"state"`
	LatencyMS   int64   `json:"latency_ms"`
	Requests    int64   `json:"requests"`
	Failures    int64   `json:"failures"`
	Inflight    int64   `json:"inflight"`
	SuccessRate float64 `json:"success_rate"`
}

// State builds the aggregate view.
func (m *Manager) State(ctx context.Context) (State, error) {
	nodes, err := m.store.Nodes(ctx)
	if err != nil {
		return State{}, err
	}
	pools, err := m.store.Pools(ctx)
	if err != nil {
		return State{}, err
	}
	st := State{Enabled: true, Gateway: m.GatewayAddr(), DefaultPool: m.DefaultPool()}
	for _, n := range nodes {
		st.Nodes = append(st.Nodes, m.nodeView(n))
	}
	for _, p := range pools {
		ids, _ := m.store.PoolNodes(ctx, p.ID)
		pv := PoolView{Pool: p, NodeCount: len(ids), Members: ids}
		if ps := m.poolState(p.ID); ps != nil {
			for _, ns := range ps.nodes {
				if m.nodeHealthy(ns) {
					pv.HealthyCount++
				}
			}
		}
		st.Pools = append(st.Pools, pv)
	}
	st.Sessions = m.Sessions()
	return st, nil
}

func (m *Manager) nodeView(n Node) NodeView {
	v := NodeView{Node: n, State: "unknown"}
	st := m.nodeState(n.ID)
	if st == nil {
		return v
	}
	st.mu.Lock()
	v.State = st.health.State
	v.LatencyMS = st.health.LatencyMS
	v.Requests = st.requests
	v.Failures = st.failures
	v.SuccessRate = st.health.SuccessRate
	if st.requests > 0 {
		v.SuccessRate = float64(st.requests-st.failures) / float64(st.requests)
	}
	st.mu.Unlock()
	v.Inflight = atomic.LoadInt64(&st.inflight)
	return v
}

func (m *Manager) nodeHealthy(st *nodeState) bool {
	st.mu.Lock()
	defer st.mu.Unlock()
	if st.health.State == "cooldown" && time.Now().Before(st.health.CooldownUntil) {
		return false
	}
	return st.health.State != "down"
}

func (m *Manager) poolState(id int64) *poolState {
	if id <= 0 {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.pools[id]
}

func (m *Manager) nodeState(id int64) *nodeState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.nodes[id]
}

// ---------- helpers ----------

func (m *Manager) logf(format string, args ...any) {
	if m == nil {
		return
	}
	logPrintf("[egress] "+format, args...)
}

func normalizeSpec(s SessionSpec) SessionSpec {
	s.Key = strings.TrimSpace(s.Key)
	s.Mode = firstMode(s.Mode, ModeSticky)
	s.Fallback = firstFallback(s.Fallback, FallbackBlock)
	if s.FanoutK < 1 || s.FanoutK > 8 {
		s.FanoutK = 3
	}
	if s.MaxConns < 1 {
		s.MaxConns = 8
	}
	return s
}

func firstMode(v, def Mode) Mode {
	switch v {
	case ModeSticky, ModeRotate, ModeFanout:
		return v
	}
	return def
}

func firstFallback(v, def Fallback) Fallback {
	switch v {
	case FallbackBlock, FallbackDirect:
		return v
	}
	return def
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// sanitizeKey makes a session key safe for a proxy username (no ':' or '@').
func sanitizeKey(key string) string {
	repl := strings.NewReplacer(":", "-", "@", "-", "/", "-", " ", "-")
	return repl.Replace(strings.TrimSpace(key))
}

func randomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Store is the feature's own SQLite database (`<dataDir>/egress/egress.db`). It is
// deliberately independent of the PostgreSQL business store: node credentials and
// high-frequency health/usage samples are local runtime state, not platform data.
// Task deletion cascades are handled by the server layer (no cross-DB FK).
type Store struct {
	db   *sql.DB
	box  *secretBox
	path string
}

// Node is a stored node: routing config + operator metadata.
type Node struct {
	NodeConfig
	Tags     []string `json:"tags"`
	Weight   int      `json:"weight"`
	MaxConns int      `json:"max_conns"`
	Enabled  bool     `json:"enabled"`
	EgressIP string   `json:"egress_ip,omitempty"`
	Note     string   `json:"note,omitempty"`
	// Source marks where the node came from: "" = manual, "sub:<id>" = a managed
	// subscription. The scheduler prunes removed nodes from its own source only.
	Source    string    `json:"source,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Pool is an operator-defined group of nodes plus its selection policy.
type Pool struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Strategy     string    `json:"strategy"`
	ModeDefault  string    `json:"mode_default"`
	Fallback     string    `json:"fallback"`
	FanoutK      int       `json:"fanout_k"`
	MaxConns     int       `json:"max_conns"`
	HealthURL    string    `json:"health_url"`
	IPProbeURL   string    `json:"ip_probe_url"`
	CheckSeconds int       `json:"check_interval"`
	StickyTTL    int       `json:"sticky_ttl"`
	Note         string    `json:"note,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// Binding attaches a task to a pool. TaskID is the PostgreSQL task id.
type Binding struct {
	TaskID   int64  `json:"task_id"`
	PoolID   int64  `json:"pool_id"`
	Mode     string `json:"mode"`
	FanoutK  int    `json:"fanout_k"`
	Fallback string `json:"fallback"`
	MaxConns int    `json:"max_conns"`
}

// Health is one node's latest sample.
type Health struct {
	NodeID        int64     `json:"node_id"`
	State         string    `json:"state"`
	LatencyMS     int64     `json:"latency_ms"`
	SuccessRate   float64   `json:"success_rate"`
	FailStreak    int       `json:"fail_streak"`
	CheckedAt     time.Time `json:"checked_at"`
	CooldownUntil time.Time `json:"cooldown_until"`
	LastError     string    `json:"last_error,omitempty"`
}

const storeSchema = `
CREATE TABLE IF NOT EXISTS nodes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  protocol    TEXT NOT NULL,
  server      TEXT NOT NULL,
  port        INTEGER NOT NULL,
  config      TEXT NOT NULL DEFAULT '{}',
  secrets     TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL UNIQUE,
  tags        TEXT NOT NULL DEFAULT '',
  weight      INTEGER NOT NULL DEFAULT 1,
  max_conns   INTEGER NOT NULL DEFAULT 32,
  enabled     INTEGER NOT NULL DEFAULT 1,
  note        TEXT NOT NULL DEFAULT '',
  egress_ip   TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pools (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  strategy      TEXT NOT NULL DEFAULT 'balanced',
  mode_default  TEXT NOT NULL DEFAULT 'sticky',
  fallback      TEXT NOT NULL DEFAULT 'block',
  fanout_k      INTEGER NOT NULL DEFAULT 3,
  max_conns     INTEGER NOT NULL DEFAULT 128,
  health_url    TEXT NOT NULL DEFAULT 'http://www.gstatic.com/generate_204',
  ip_probe_url  TEXT NOT NULL DEFAULT 'https://api.ipify.org',
  check_seconds INTEGER NOT NULL DEFAULT 300,
  sticky_ttl    INTEGER NOT NULL DEFAULT 1800,
  note          TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pool_members (
  pool_id  INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  node_id  INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  weight   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (pool_id, node_id)
);
CREATE TABLE IF NOT EXISTS task_bindings (
  task_id    INTEGER PRIMARY KEY,
  pool_id    INTEGER NOT NULL,
  mode       TEXT NOT NULL DEFAULT 'sticky',
  fanout_k   INTEGER NOT NULL DEFAULT 3,
  fallback   TEXT NOT NULL DEFAULT 'block',
  max_conns  INTEGER NOT NULL DEFAULT 8,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS node_health (
  node_id        INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  state          TEXT NOT NULL DEFAULT 'unknown',
  latency_ms     INTEGER NOT NULL DEFAULT 0,
  success_rate   REAL NOT NULL DEFAULT 0,
  fail_streak    INTEGER NOT NULL DEFAULT 0,
  checked_at     INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS usage (
  task_id   INTEGER NOT NULL DEFAULT 0,
  node_id   INTEGER NOT NULL,
  bucket    INTEGER NOT NULL,
  requests  INTEGER NOT NULL DEFAULT 0,
  failures  INTEGER NOT NULL DEFAULT 0,
  bytes_in  INTEGER NOT NULL DEFAULT 0,
  bytes_out INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, node_id, bucket)
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  url              TEXT NOT NULL UNIQUE,
  pool_id          INTEGER NOT NULL DEFAULT 0,
  tags             TEXT NOT NULL DEFAULT '',
  interval_seconds INTEGER NOT NULL DEFAULT 3600,
  enabled          INTEGER NOT NULL DEFAULT 1,
  last_fetch_at    INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT NOT NULL DEFAULT '',
  last_added       INTEGER NOT NULL DEFAULT 0,
  last_removed     INTEGER NOT NULL DEFAULT 0,
  last_changed     INTEGER NOT NULL DEFAULT 0,
  last_diff        TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fanout_usage (
  task_id INTEGER NOT NULL,
  bucket  INTEGER NOT NULL,
  used    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, bucket)
);
CREATE INDEX IF NOT EXISTS idx_pool_members_node ON pool_members(node_id);
CREATE INDEX IF NOT EXISTS idx_usage_bucket ON usage(bucket);
`

// OpenStore opens (creating if needed) the egress SQLite database under dir.
func OpenStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	box, err := newSecretBox(dir)
	if err != nil {
		return nil, err
	}
	path := filepath.Join(dir, "egress.db")
	dsn := "file:" + path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// One writer keeps SQLite lock contention out of the request path; egress
	// traffic is I/O bound on the node, not on this database.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(storeSchema); err != nil {
		db.Close()
		return nil, fmt.Errorf("egress: 初始化数据库失败: %w", err)
	}
	if err := ensureNodeSourceColumn(db); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db, box: box, path: path}, nil
}

// ensureNodeSourceColumn upgrades databases created before subscriptions existed.
// SQLite has no ADD COLUMN IF NOT EXISTS, so the current shape is inspected first.
func ensureNodeSourceColumn(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(nodes)`)
	if err != nil {
		return err
	}
	defer rows.Close()
	has := false
	for rows.Next() {
		var (
			cid       int
			name, typ string
			notnull   int
			dflt      any
			pk        int
		)
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == "source" {
			has = true
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if has {
		return nil
	}
	_, err = db.Exec(`ALTER TABLE nodes ADD COLUMN source TEXT NOT NULL DEFAULT ''`)
	return err
}

// Path returns the database file path (for logs and diagnostics).
func (s *Store) Path() string { return s.path }

// Close closes the database.
func (s *Store) Close() error { return s.db.Close() }

// ---------- nodes ----------

// Nodes lists every node with secrets decrypted.
func (s *Store) Nodes(ctx context.Context) ([]Node, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,protocol,server,port,config,secrets,fingerprint,
		tags,weight,max_conns,enabled,note,egress_ip,source,created_at,updated_at FROM nodes ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Node
	for rows.Next() {
		n, err := s.scanNode(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// Node loads one node.
func (s *Store) Node(ctx context.Context, id int64) (*Node, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id,name,protocol,server,port,config,secrets,fingerprint,
		tags,weight,max_conns,enabled,note,egress_ip,source,created_at,updated_at FROM nodes WHERE id=?`, id)
	n, err := s.scanNode(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &n, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func (s *Store) scanNode(sc rowScanner) (Node, error) {
	var (
		n                    Node
		configJSON, sealed   string
		fingerprint, tagsRaw string
		created, updated     int64
		enabled              int
	)
	if err := sc.Scan(&n.ID, &n.Name, &n.Protocol, &n.Server, &n.Port, &configJSON, &sealed,
		&fingerprint, &tagsRaw, &n.Weight, &n.MaxConns, &enabled, &n.Note, &n.EgressIP,
		&n.Source, &created, &updated); err != nil {
		return Node{}, err
	}
	n.Config = map[string]any{}
	if configJSON != "" {
		if err := json.Unmarshal([]byte(configJSON), &n.Config); err != nil {
			return Node{}, fmt.Errorf("egress: 节点 %d 配置损坏: %w", n.ID, err)
		}
	}
	n.Secrets = map[string]string{}
	if plain, err := s.box.Open(sealed); err != nil {
		return Node{}, err
	} else if len(plain) > 0 {
		if err := json.Unmarshal(plain, &n.Secrets); err != nil {
			return Node{}, fmt.Errorf("egress: 节点 %d 密钥损坏: %w", n.ID, err)
		}
	}
	n.Tags = splitTags(tagsRaw)
	n.Enabled = enabled == 1
	n.CreatedAt = time.Unix(created, 0)
	n.UpdatedAt = time.Unix(updated, 0)
	return n, nil
}

// UpsertNodes inserts parsed nodes, deduping by fingerprint. Existing rows keep
// their operator metadata (tags/weight/enabled) and only get renamed/reconfigured.
func (s *Store) UpsertNodes(ctx context.Context, nodes []Node, defaultTags []string) (created, updated int, err error) {
	now := time.Now().Unix()
	for _, n := range nodes {
		cfgJSON, err := json.Marshal(n.Config)
		if err != nil {
			return created, updated, err
		}
		secretsJSON, err := json.Marshal(n.Secrets)
		if err != nil {
			return created, updated, err
		}
		sealed, err := s.box.Seal(secretsJSON)
		if err != nil {
			return created, updated, err
		}
		fp := n.Fingerprint()
		var existingID int64
		err = s.db.QueryRowContext(ctx, `SELECT id FROM nodes WHERE fingerprint=?`, fp).Scan(&existingID)
		switch {
		case err == sql.ErrNoRows:
			tags := n.Tags
			if len(tags) == 0 {
				tags = defaultTags
			}
			if _, err := s.db.ExecContext(ctx, `INSERT INTO nodes
				(name,protocol,server,port,config,secrets,fingerprint,tags,weight,max_conns,enabled,note,egress_ip,source,created_at,updated_at)
				VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
				n.Name, n.Protocol, n.Server, n.Port, string(cfgJSON), sealed, fp, joinTags(tags),
				defaultInt(n.Weight, 1), defaultInt(n.MaxConns, 32), 1, n.Note, n.EgressIP, n.Source, now, now); err != nil {
				return created, updated, err
			}
			created++
		case err != nil:
			return created, updated, err
		default:
			if _, err := s.db.ExecContext(ctx, `UPDATE nodes SET name=?, protocol=?, server=?, port=?,
				config=?, secrets=?, source=CASE WHEN ?<>'' THEN ? ELSE source END, updated_at=? WHERE id=?`,
				n.Name, n.Protocol, n.Server, n.Port, string(cfgJSON), sealed, n.Source, n.Source, now, existingID); err != nil {
				return created, updated, err
			}
			updated++
		}
	}
	return created, updated, err
}

// UpdateNode writes operator-editable fields (and config/secrets if provided).
func (s *Store) UpdateNode(ctx context.Context, n Node) error {
	cfgJSON, err := json.Marshal(n.Config)
	if err != nil {
		return err
	}
	secretsJSON, err := json.Marshal(n.Secrets)
	if err != nil {
		return err
	}
	sealed, err := s.box.Seal(secretsJSON)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE nodes SET name=?,protocol=?,server=?,port=?,config=?,secrets=?,
		tags=?,weight=?,max_conns=?,enabled=?,note=?,egress_ip=?,source=?,updated_at=? WHERE id=?`,
		n.Name, n.Protocol, n.Server, n.Port, string(cfgJSON), sealed, joinTags(n.Tags),
		defaultInt(n.Weight, 1), defaultInt(n.MaxConns, 32), boolInt(n.Enabled), n.Note, n.EgressIP,
		n.Source, time.Now().Unix(), n.ID)
	return err
}

// DeleteNode removes a node and its memberships/health rows.
func (s *Store) DeleteNode(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM nodes WHERE id=?`, id)
	return err
}

// ---------- pools ----------

// Pools lists pools without members.
func (s *Store) Pools(ctx context.Context) ([]Pool, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,strategy,mode_default,fallback,fanout_k,max_conns,
		health_url,ip_probe_url,check_seconds,sticky_ttl,note,created_at FROM pools ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Pool
	for rows.Next() {
		p, err := scanPool(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Pool loads one pool.
func (s *Store) Pool(ctx context.Context, id int64) (*Pool, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id,name,strategy,mode_default,fallback,fanout_k,max_conns,
		health_url,ip_probe_url,check_seconds,sticky_ttl,note,created_at FROM pools WHERE id=?`, id)
	p, err := scanPool(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func scanPool(sc rowScanner) (Pool, error) {
	var (
		p       Pool
		created int64
	)
	if err := sc.Scan(&p.ID, &p.Name, &p.Strategy, &p.ModeDefault, &p.Fallback, &p.FanoutK,
		&p.MaxConns, &p.HealthURL, &p.IPProbeURL, &p.CheckSeconds, &p.StickyTTL, &p.Note, &created); err != nil {
		return Pool{}, err
	}
	p.CreatedAt = time.Unix(created, 0)
	return p, nil
}

// CreatePool inserts a pool and returns its id.
func (s *Store) CreatePool(ctx context.Context, p Pool) (int64, error) {
	normalizePool(&p)
	res, err := s.db.ExecContext(ctx, `INSERT INTO pools
		(name,strategy,mode_default,fallback,fanout_k,max_conns,health_url,ip_probe_url,check_seconds,sticky_ttl,note,created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		p.Name, p.Strategy, p.ModeDefault, p.Fallback, p.FanoutK, p.MaxConns, p.HealthURL,
		p.IPProbeURL, p.CheckSeconds, p.StickyTTL, p.Note, time.Now().Unix())
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// UpdatePool rewrites a pool's policy fields.
func (s *Store) UpdatePool(ctx context.Context, p Pool) error {
	normalizePool(&p)
	_, err := s.db.ExecContext(ctx, `UPDATE pools SET name=?,strategy=?,mode_default=?,fallback=?,
		fanout_k=?,max_conns=?,health_url=?,ip_probe_url=?,check_seconds=?,sticky_ttl=?,note=? WHERE id=?`,
		p.Name, p.Strategy, p.ModeDefault, p.Fallback, p.FanoutK, p.MaxConns, p.HealthURL,
		p.IPProbeURL, p.CheckSeconds, p.StickyTTL, p.Note, p.ID)
	return err
}

// DeletePool removes a pool; bindings referencing it are left for the server to
// reject up front (EGRESS_POOL_IN_USE), so a dangling binding can never point at
// a silently deleted policy.
func (s *Store) DeletePool(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM pools WHERE id=?`, id)
	return err
}

// PoolNodes returns member node ids ordered by position.
func (s *Store) PoolNodes(ctx context.Context, poolID int64) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT node_id FROM pool_members WHERE pool_id=? ORDER BY position, node_id`, poolID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// SetPoolNodes replaces a pool's membership.
func (s *Store) SetPoolNodes(ctx context.Context, poolID int64, nodeIDs []int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM pool_members WHERE pool_id=?`, poolID); err != nil {
		return err
	}
	for i, id := range nodeIDs {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO pool_members(pool_id,node_id,position,weight)
			VALUES (?,?,?,1)`, poolID, id, i); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ---------- task bindings ----------

// Bindings lists every task→pool binding.
func (s *Store) Bindings(ctx context.Context) (map[int64]Binding, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT task_id,pool_id,mode,fanout_k,fallback,max_conns FROM task_bindings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]Binding{}
	for rows.Next() {
		var b Binding
		if err := rows.Scan(&b.TaskID, &b.PoolID, &b.Mode, &b.FanoutK, &b.Fallback, &b.MaxConns); err != nil {
			return nil, err
		}
		out[b.TaskID] = b
	}
	return out, rows.Err()
}

// Binding loads one task binding.
func (s *Store) Binding(ctx context.Context, taskID int64) (*Binding, error) {
	var b Binding
	err := s.db.QueryRowContext(ctx, `SELECT task_id,pool_id,mode,fanout_k,fallback,max_conns
		FROM task_bindings WHERE task_id=?`, taskID).
		Scan(&b.TaskID, &b.PoolID, &b.Mode, &b.FanoutK, &b.Fallback, &b.MaxConns)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// SetBinding upserts a task binding.
func (s *Store) SetBinding(ctx context.Context, b Binding) error {
	normalizeBinding(&b)
	_, err := s.db.ExecContext(ctx, `INSERT INTO task_bindings(task_id,pool_id,mode,fanout_k,fallback,max_conns,updated_at)
		VALUES (?,?,?,?,?,?,?)
		ON CONFLICT(task_id) DO UPDATE SET pool_id=excluded.pool_id, mode=excluded.mode,
		fanout_k=excluded.fanout_k, fallback=excluded.fallback, max_conns=excluded.max_conns,
		updated_at=excluded.updated_at`,
		b.TaskID, b.PoolID, b.Mode, b.FanoutK, b.Fallback, b.MaxConns, time.Now().Unix())
	return err
}

// DeleteBinding removes a task binding.
func (s *Store) DeleteBinding(ctx context.Context, taskID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM task_bindings WHERE task_id=?`, taskID)
	return err
}

// ---------- health & usage ----------

// Health loads all node health rows.
func (s *Store) Health(ctx context.Context) (map[int64]Health, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT node_id,state,latency_ms,success_rate,fail_streak,
		checked_at,cooldown_until,last_error FROM node_health`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]Health{}
	for rows.Next() {
		var (
			h                 Health
			checked, cooldown int64
		)
		if err := rows.Scan(&h.NodeID, &h.State, &h.LatencyMS, &h.SuccessRate, &h.FailStreak,
			&checked, &cooldown, &h.LastError); err != nil {
			return nil, err
		}
		h.CheckedAt = time.Unix(checked, 0)
		h.CooldownUntil = time.Unix(cooldown, 0)
		out[h.NodeID] = h
	}
	return out, rows.Err()
}

// SaveHealth upserts one node health row.
func (s *Store) SaveHealth(ctx context.Context, h Health) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO node_health(node_id,state,latency_ms,success_rate,fail_streak,checked_at,cooldown_until,last_error)
		VALUES (?,?,?,?,?,?,?,?)
		ON CONFLICT(node_id) DO UPDATE SET state=excluded.state, latency_ms=excluded.latency_ms,
		success_rate=excluded.success_rate, fail_streak=excluded.fail_streak,
		checked_at=excluded.checked_at, cooldown_until=excluded.cooldown_until, last_error=excluded.last_error`,
		h.NodeID, h.State, h.LatencyMS, h.SuccessRate, h.FailStreak,
		h.CheckedAt.Unix(), unixOrZero(h.CooldownUntil), h.LastError)
	return err
}

// AddUsage accumulates one hourly bucket.
func (s *Store) AddUsage(ctx context.Context, taskID, nodeID int64, requests, failures, bytesIn, bytesOut int64) error {
	if requests == 0 && failures == 0 && bytesIn == 0 && bytesOut == 0 {
		return nil
	}
	bucket := time.Now().Truncate(time.Hour).Unix()
	_, err := s.db.ExecContext(ctx, `INSERT INTO usage(task_id,node_id,bucket,requests,failures,bytes_in,bytes_out)
		VALUES (?,?,?,?,?,?,?)
		ON CONFLICT(task_id,node_id,bucket) DO UPDATE SET requests=requests+excluded.requests,
		failures=failures+excluded.failures, bytes_in=bytes_in+excluded.bytes_in, bytes_out=bytes_out+excluded.bytes_out`,
		taskID, nodeID, bucket, requests, failures, bytesIn, bytesOut)
	return err
}

// FanoutUsed reads the adversarial attempts already spent in one hour bucket.
func (s *Store) FanoutUsed(ctx context.Context, taskID int64, bucket int64) (int64, error) {
	var used int64
	err := s.db.QueryRowContext(ctx, `SELECT used FROM fanout_usage WHERE task_id=? AND bucket=?`, taskID, bucket).Scan(&used)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return used, err
}

// AddFanout records spent adversarial attempts.
func (s *Store) AddFanout(ctx context.Context, taskID int64, bucket int64, n int64) error {
	if n <= 0 {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO fanout_usage(task_id,bucket,used) VALUES (?,?,?)
ON CONFLICT(task_id,bucket) DO UPDATE SET used=used+excluded.used`, taskID, bucket, n)
	return err
}

// ---------- helpers ----------

func normalizePool(p *Pool) {
	p.Strategy = firstNonEmpty(p.Strategy, "balanced")
	p.ModeDefault = firstNonEmpty(p.ModeDefault, "sticky")
	p.Fallback = firstNonEmpty(p.Fallback, "block")
	if p.FanoutK < 1 || p.FanoutK > 8 {
		p.FanoutK = 3
	}
	if p.MaxConns < 1 {
		p.MaxConns = 128
	}
	p.HealthURL = firstNonEmpty(p.HealthURL, "http://www.gstatic.com/generate_204")
	p.IPProbeURL = firstNonEmpty(p.IPProbeURL, "https://api.ipify.org")
	if p.CheckSeconds < 30 {
		p.CheckSeconds = 300
	}
	if p.StickyTTL < 60 {
		p.StickyTTL = 1800
	}
}

func normalizeBinding(b *Binding) {
	b.Mode = firstNonEmpty(b.Mode, "sticky")
	b.Fallback = firstNonEmpty(b.Fallback, "block")
	if b.FanoutK < 1 || b.FanoutK > 8 {
		b.FanoutK = 3
	}
	if b.MaxConns < 1 {
		b.MaxConns = 8
	}
}

func splitTags(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var out []string
	for _, t := range strings.Split(raw, ",") {
		if t = strings.TrimSpace(t); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func joinTags(tags []string) string {
	clean := make([]string, 0, len(tags))
	for _, t := range tags {
		t = strings.TrimSpace(t)
		if t != "" && !strings.Contains(t, ",") {
			clean = append(clean, t)
		}
	}
	return strings.Join(clean, ",")
}

func defaultInt(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func unixOrZero(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.Unix()
}

// UsageRow is returned by diagnostics.
type UsageRow struct {
	TaskID   int64 `json:"task_id"`
	NodeID   int64 `json:"node_id"`
	Bucket   int64 `json:"bucket"`
	Requests int64 `json:"requests"`
	Failures int64 `json:"failures"`
	BytesIn  int64 `json:"bytes_in"`
	BytesOut int64 `json:"bytes_out"`
}

// Usage lists the most recent usage buckets.
func (s *Store) Usage(ctx context.Context, limit int) ([]UsageRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `SELECT task_id,node_id,bucket,requests,failures,bytes_in,bytes_out
		FROM usage ORDER BY bucket DESC LIMIT `+strconv.Itoa(limit))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []UsageRow
	for rows.Next() {
		var u UsageRow
		if err := rows.Scan(&u.TaskID, &u.NodeID, &u.Bucket, &u.Requests, &u.Failures, &u.BytesIn, &u.BytesOut); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// Subscription is a managed clash/base64 subscription that the scheduler refreshes.
type Subscription struct {
	ID              int64     `json:"id"`
	Name            string    `json:"name"`
	URL             string    `json:"url"`
	PoolID          int64     `json:"pool_id"`
	Tags            []string  `json:"tags"`
	IntervalSeconds int       `json:"interval_seconds"`
	Enabled         bool      `json:"enabled"`
	LastFetchAt     time.Time `json:"last_fetch_at"`
	LastError       string    `json:"last_error,omitempty"`
	LastAdded       int       `json:"last_added"`
	LastRemoved     int       `json:"last_removed"`
	LastChanged     int       `json:"last_changed"`
	LastDiff        string    `json:"last_diff,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// Subscriptions lists all subscriptions.
func (s *Store) Subscriptions(ctx context.Context) ([]Subscription, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,url,pool_id,tags,interval_seconds,enabled,
		last_fetch_at,last_error,last_added,last_removed,last_changed,last_diff,created_at FROM subscriptions ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Subscription
	for rows.Next() {
		sub, err := scanSubscription(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

// Subscription loads one subscription.
func (s *Store) Subscription(ctx context.Context, id int64) (*Subscription, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id,name,url,pool_id,tags,interval_seconds,enabled,
		last_fetch_at,last_error,last_added,last_removed,last_changed,last_diff,created_at FROM subscriptions WHERE id=?`, id)
	sub, err := scanSubscription(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &sub, nil
}

func scanSubscription(sc rowScanner) (Subscription, error) {
	var (
		sub                Subscription
		tagsRaw            string
		enabled            int
		lastFetch, created int64
	)
	if err := sc.Scan(&sub.ID, &sub.Name, &sub.URL, &sub.PoolID, &tagsRaw, &sub.IntervalSeconds,
		&enabled, &lastFetch, &sub.LastError, &sub.LastAdded, &sub.LastRemoved, &sub.LastChanged,
		&sub.LastDiff, &created); err != nil {
		return Subscription{}, err
	}
	sub.Tags = splitTags(tagsRaw)
	sub.Enabled = enabled == 1
	sub.LastFetchAt = time.Unix(lastFetch, 0)
	sub.CreatedAt = time.Unix(created, 0)
	return sub, nil
}

// SaveSubscription inserts (ID=0) or updates a subscription.
func (s *Store) SaveSubscription(ctx context.Context, sub Subscription) (int64, error) {
	sub.Name = strings.TrimSpace(sub.Name)
	sub.URL = strings.TrimSpace(sub.URL)
	if sub.Name == "" || sub.URL == "" {
		return 0, errors.New("egress: 订阅名称与 URL 不能为空")
	}
	if sub.IntervalSeconds < 300 {
		sub.IntervalSeconds = 3600
	}
	if sub.ID == 0 {
		res, err := s.db.ExecContext(ctx, `INSERT INTO subscriptions(name,url,pool_id,tags,interval_seconds,enabled,created_at)
			VALUES (?,?,?,?,?,?,?)`, sub.Name, sub.URL, sub.PoolID, joinTags(sub.Tags), sub.IntervalSeconds, boolInt(sub.Enabled), time.Now().Unix())
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}
	_, err := s.db.ExecContext(ctx, `UPDATE subscriptions SET name=?,url=?,pool_id=?,tags=?,interval_seconds=?,enabled=? WHERE id=?`,
		sub.Name, sub.URL, sub.PoolID, joinTags(sub.Tags), sub.IntervalSeconds, boolInt(sub.Enabled), sub.ID)
	return sub.ID, err
}

// DeleteSubscription removes a subscription. Its imported nodes stay: they may be
// referenced by pools and deleting them silently would empty a working pool.
func (s *Store) DeleteSubscription(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM subscriptions WHERE id=?`, id)
	return err
}

// SetSubscriptionResult stores the outcome of one refresh.
func (s *Store) SetSubscriptionResult(ctx context.Context, id int64, added, removed, changed int, diff, lastErr string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE subscriptions SET last_fetch_at=?, last_error=?, last_added=?,
		last_removed=?, last_changed=?, last_diff=? WHERE id=?`,
		time.Now().Unix(), lastErr, added, removed, changed, diff, id)
	return err
}

// NodesBySource lists nodes imported by one subscription.
func (s *Store) NodesBySource(ctx context.Context, source string) ([]Node, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,protocol,server,port,config,secrets,fingerprint,
		tags,weight,max_conns,enabled,note,egress_ip,source,created_at,updated_at FROM nodes WHERE source=?`, source)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Node
	for rows.Next() {
		n, err := s.scanNode(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// TaskMetrics 是任务级的效果度量（P0 / R3.5 v1）。
//
// 口径（改口径必须同步 docs/P0-能力增强方案.md）：
//   - MTTD：任务首次开始运行（first_run_at，缺失回退 created_at）→ 首个漏洞 created_at；
//   - findings：按 severity / vulnclass 分组，只统计未删除任务下的确认漏洞行；
//   - intents：探索图里 kind='intent' 且未软删的状态分布；
//   - no_yield_done：state='done' 但没有任何 fact/finding 下游的意图数（无效意图）；
//   - yield_rate：(done - no_yield_done) / done，done=0 时为 0。
type TaskMetrics struct {
	TaskID              int64          `json:"task_id"`
	ExplorationID       int64          `json:"exploration_id"`
	MTTDSeconds         *int64         `json:"mttd_seconds"`
	FindingsTotal       int            `json:"findings_total"`
	FindingsBySeverity  map[string]int `json:"findings_by_severity"`
	FindingsByVulnclass map[string]int `json:"findings_by_vulnclass"`
	FindingsByStatus    map[string]int `json:"findings_by_status"`
	// 独立验证（purpose=verify）的完成情况：只看已结束的会话，避免把在跑的算成结论。
	VerifySessions      int            `json:"verify_sessions"`
	VerifyReproduced    int            `json:"verify_reproduced"`
	VerifyFalsePositive int            `json:"verify_false_positive"`
	VerifyInconclusive  int            `json:"verify_inconclusive"`
	Intents             map[string]int `json:"intents"`
	DoneIntents         int            `json:"done_intents"`
	NoYieldDone         int            `json:"no_yield_done"`
	YieldRate           float64        `json:"yield_rate"`
	FirstFindingAt      *time.Time     `json:"first_finding_at,omitempty"`
	RunStartedAt        *time.Time     `json:"run_started_at,omitempty"`
	ClassCoverage       map[string]int `json:"class_coverage"` // vulnclass -> findings count（红/黑盒通用视角）
}

// ErrTaskNotFound 任务不存在（或已删除）。
var ErrTaskNotFound = errors.New("task not found")

// TaskMetrics 汇总一个任务的度量。只读，不改写任何业务表。
func (d *DB) TaskMetrics(ctx context.Context, taskID int64) (*TaskMetrics, error) {
	var (
		expID     int64
		createdAt time.Time
		firstRun  sql.NullTime
	)
	err := d.QueryRowContext(ctx,
		`SELECT exploration_id, created_at, first_run_at FROM tasks WHERE id=$1 AND deleted_at IS NULL`,
		taskID).Scan(&expID, &createdAt, &firstRun)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrTaskNotFound
	}
	if err != nil {
		return nil, err
	}

	m := &TaskMetrics{
		TaskID: taskID, ExplorationID: expID,
		FindingsBySeverity:  map[string]int{},
		FindingsByVulnclass: map[string]int{},
		FindingsByStatus:    map[string]int{},
		Intents:             map[string]int{},
		ClassCoverage:       map[string]int{},
	}
	if firstRun.Valid {
		t := firstRun.Time
		m.RunStartedAt = &t
	}

	// 漏洞分布 + 首个漏洞时间。
	rows, err := d.QueryContext(ctx,
		`SELECT COALESCE(severity,''), COALESCE(vulnclass,''), COUNT(*), MIN(created_at)
		 FROM findings WHERE task_id=$1 GROUP BY 1,2`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var first *time.Time
	for rows.Next() {
		var sev, vc string
		var n int
		var minAt time.Time
		if err := rows.Scan(&sev, &vc, &n, &minAt); err != nil {
			return nil, err
		}
		m.FindingsTotal += n
		if sev == "" {
			sev = "unknown"
		}
		m.FindingsBySeverity[sev] += n
		if vc == "" {
			vc = "custom"
		}
		m.FindingsByVulnclass[vc] += n
		m.ClassCoverage[vc] += n
		if first == nil || minAt.Before(*first) {
			tt := minAt
			first = &tt
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if first != nil {
		m.FirstFindingAt = first
		start := createdAt
		if firstRun.Valid {
			start = firstRun.Time
		}
		secs := int64(first.Sub(start).Seconds())
		if secs < 0 {
			secs = 0
		}
		m.MTTDSeconds = &secs
	}

	// 处置状态分布（含人工分诊结果，误报率 = false_positive / findings_total）。
	srows, err := d.QueryContext(ctx,
		`SELECT COALESCE(status,''), COUNT(*) FROM findings WHERE task_id=$1 GROUP BY 1`, taskID)
	if err != nil {
		return nil, err
	}
	defer srows.Close()
	for srows.Next() {
		var st string
		var n int
		if err := srows.Scan(&st, &n); err != nil {
			return nil, err
		}
		m.FindingsByStatus[st] = n
	}
	if err := srows.Err(); err != nil {
		return nil, err
	}

	// 独立验证结论分布：只统计已完成的 verify 会话。
	if err := d.QueryRowContext(ctx,
		`SELECT
		   COUNT(*) FILTER (WHERE r.status='completed'),
		   COUNT(*) FILTER (WHERE r.status='completed' AND r.verdict='reproduced'),
		   COUNT(*) FILTER (WHERE r.status='completed' AND r.verdict='false_positive'),
		   COUNT(*) FILTER (WHERE r.status='completed' AND r.verdict='inconclusive')
		 FROM finding_retests r JOIN findings f ON f.id=r.finding_id
		 WHERE f.task_id=$1 AND r.purpose='verify'`, taskID).
		Scan(&m.VerifySessions, &m.VerifyReproduced, &m.VerifyFalsePositive, &m.VerifyInconclusive); err != nil {
		return nil, err
	}

	// 意图状态分布。
	irows, err := d.QueryContext(ctx,
		`SELECT state, COUNT(*) FROM exploration_nodes
		 WHERE exploration_id=$1 AND kind='intent' AND state<>'deleted' GROUP BY 1`, expID)
	if err != nil {
		return nil, err
	}
	defer irows.Close()
	for irows.Next() {
		var st string
		var n int
		if err := irows.Scan(&st, &n); err != nil {
			return nil, err
		}
		m.Intents[st] = n
	}
	if err := irows.Err(); err != nil {
		return nil, err
	}
	m.DoneIntents = m.Intents["done"]

	// 无效意图：跑完但没有任何 fact/finding 下游。
	if err := d.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM exploration_nodes n
		 WHERE n.exploration_id=$1 AND n.kind='intent' AND n.state='done'
		   AND NOT EXISTS (
		     SELECT 1 FROM exploration_edges e
		     JOIN exploration_nodes d ON d.id=e.dst_id
		     WHERE e.src_id=n.id AND d.kind IN ('fact','finding')
		   )`, expID).Scan(&m.NoYieldDone); err != nil {
		return nil, err
	}
	if m.DoneIntents > 0 {
		m.YieldRate = float64(m.DoneIntents-m.NoYieldDone) / float64(m.DoneIntents)
	}
	return m, nil
}

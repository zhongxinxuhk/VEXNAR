// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
	"time"
)

// TestTaskLifecycleIsTheSingleVocabulary pins the state set every surface
// switches on. Adding a state means adding it here first — the dsh client and
// the web console label tables are checked against this list.
func TestTaskLifecycleIsTheSingleVocabulary(t *testing.T) {
	t.Parallel()
	want := []string{"created", "queued", "running", "paused", "done", "failed", "timeout"}
	if len(TaskLifecycle) != len(want) {
		t.Fatalf("lifecycle has %d states, want %d", len(TaskLifecycle), len(want))
	}
	for i, entry := range TaskLifecycle {
		if entry.Key != want[i] {
			t.Fatalf("lifecycle[%d] = %q, want %q", i, entry.Key, want[i])
		}
		if entry.Label == "" || entry.Tone == "" || entry.Hint == "" {
			t.Fatalf("lifecycle[%d] (%s) must carry label/tone/hint", i, entry.Key)
		}
	}
	for _, key := range []string{"done", "failed", "timeout"} {
		entry := lifecycleEntry(key)
		if !entry.Terminal || entry.Active {
			t.Fatalf("%s must be terminal and not active: %+v", key, entry)
		}
	}
	for _, key := range []string{"queued", "running"} {
		if entry := lifecycleEntry(key); !entry.Active || entry.Terminal {
			t.Fatalf("%s must be active and not terminal: %+v", key, entry)
		}
	}
}

// TestSummarizeTaskDTOs pins the metric definitions the overview KPI card, the
// health rings and the task panel filter counts all read from.
func TestSummarizeTaskDTOs(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	day := int64(86400)
	nowUnix := now.Unix()

	dto := func(status string, createdAgo int64) TaskDTO {
		return TaskDTO{Status: status, CreatedUnix: nowUnix - createdAgo*day}
	}
	dtos := []TaskDTO{
		dto("created", 0),
		dto("queued", 1),
		dto("running", 2),
		dto("paused", 3),
		dto("done", 40),
		dto("done", 41),
		dto("timeout", 42),
		// 30–60 天前新建：只进 created_prev（不计入本窗口，也不进吞吐）。
		dto("failed", 45),
	}
	dtos[0].GoalsTotal, dtos[0].GoalsMet = 3, 1
	dtos[4].GoalsTotal, dtos[4].GoalsMet = 5, 5
	dtos[2].InFlight = 2
	dtos[3].InFlight = 1
	dtos[4].Findings = FindingSeverityDTO{Critical: 2, High: 3, Medium: 1, Low: 4}
	dtos[5].Tokens = TokenTotalDTO{InputTokens: 100, OutputTokens: 20, CacheReadTokens: 40, CacheWriteTokens: 5}

	got := summarizeTaskDTOs(dtos, 30, now)

	if got.Total != len(dtos) {
		t.Fatalf("total=%d, want %d", got.Total, len(dtos))
	}
	if got.ByStatus != (TaskStatusCounts{Created: 1, Queued: 1, Running: 1, Paused: 1, Done: 2, Failed: 1, Timeout: 1}) {
		t.Fatalf("by_status=%+v", got.ByStatus)
	}
	if got.Active != 2 || got.Paused != 1 {
		t.Fatalf("active=%d paused=%d, want 2/1", got.Active, got.Paused)
	}
	if got.Terminal != 4 || got.Done != 2 || got.Failed != 1 || got.Timeout != 1 {
		t.Fatalf("terminal=%d done=%d failed=%d timeout=%d", got.Terminal, got.Done, got.Failed, got.Timeout)
	}
	if diff := got.CompletionRate - 25; diff > 0.0001 || diff < -0.0001 {
		t.Fatalf("completion_rate=%v, want 25", got.CompletionRate)
	}
	if got.GoalsTotal != 8 || got.GoalsMet != 6 || got.GoalRate != 75 {
		t.Fatalf("goals total/met/rate = %d/%d/%v, want 8/6/75", got.GoalsTotal, got.GoalsMet, got.GoalRate)
	}
	if got.InFlight != 3 {
		t.Fatalf("in_flight=%d, want 3", got.InFlight)
	}
	if got.Findings.Total != 10 || got.Findings.Critical != 2 || got.Findings.Low != 4 {
		t.Fatalf("findings=%+v", got.Findings)
	}
	if got.Tokens.InputTokens != 100 || got.Tokens.Total != 120 {
		t.Fatalf("tokens=%+v", got.Tokens)
	}
	if got.CreatedWindow != 4 {
		t.Fatalf("created_window=%d, want 4", got.CreatedWindow)
	}
	if got.CreatedPrev != 4 {
		t.Fatalf("created_prev=%d, want 4", got.CreatedPrev)
	}
	// 窗口按天排列，最后一天是今天：0 天前/1 天前/2 天前/3 天前各 1 个。
	want := make([]int, 30)
	want[29], want[28], want[27], want[26] = 1, 1, 1, 1
	if len(got.Throughput) != len(want) {
		t.Fatalf("throughput length=%d, want %d", len(got.Throughput), len(want))
	}
	for i := range want {
		if got.Throughput[i] != want[i] {
			t.Fatalf("throughput[%d]=%d, want %d (all=%v)", i, got.Throughput[i], want[i], got.Throughput)
		}
	}
	if sum(got.Throughput) != got.CreatedWindow {
		t.Fatalf("throughput sum %d != created_window %d", sum(got.Throughput), got.CreatedWindow)
	}
}

// TestTaskSummaryJSONContract pins the wire shape the dsh overview and the task
// panel decode. Unknown statuses fold into created, so the buckets always sum to
// total and a card can never show "0 of N".
func TestTaskSummaryJSONContract(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	summary := summarizeTaskDTOs([]TaskDTO{
		{Status: "done"},
		{Status: "mystery"},
	}, 7, now)

	raw, err := json.Marshal(summary)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	required := []string{
		"total", "by_status", "active", "paused", "terminal", "done", "failed", "timeout",
		"completion_rate", "goals_total", "goals_met", "goal_rate", "in_flight", "findings",
		"tokens", "window_days", "created_window", "created_prev", "throughput", "lifecycle", "generated_unix",
	}
	for _, key := range required {
		if _, ok := decoded[key]; !ok {
			t.Fatalf("summary is missing %q: %s", key, raw)
		}
	}
	byStatus, ok := decoded["by_status"].(map[string]any)
	if !ok {
		t.Fatalf("by_status is not an object: %s", raw)
	}
	keys := make([]string, 0, len(byStatus))
	for key := range byStatus {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	want := []string{"created", "done", "failed", "paused", "queued", "running", "timeout"}
	if len(keys) != len(want) {
		t.Fatalf("by_status keys = %v, want %v", keys, want)
	}
	for i := range want {
		if keys[i] != want[i] {
			t.Fatalf("by_status keys = %v, want %v", keys, want)
		}
	}
	if got := int(byStatus["created"].(float64)); got != 1 {
		t.Fatalf("unknown status must fold into created: got %d, want 1", got)
	}
	if decoded["total"].(float64) != 2 {
		t.Fatalf("total=%v, want 2", decoded["total"])
	}
}

// TestTaskSummaryHandlerCoversEveryLiveTask runs the real handler against the
// configured database: the summary must describe exactly the inventory the list
// endpoint serves, so a KPI card can never disagree with the table under it.
func TestTaskSummaryHandlerCoversEveryLiveTask(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer m.Close()
	// 生产路径由 NewServer 调用 LoadExisting 填内存清单；这里显式补上，否则聚合
	// 会对着一张空清单给出 total=0。
	m.LoadExisting()
	s := &Server{m: m, engine: NewEngine(m), ctx: context.Background()}

	request := httptest.NewRequest(http.MethodGet, "/api/tasks/summary?days=30", nil).WithContext(context.Background())
	recorder := httptest.NewRecorder()
	s.taskSummary(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/tasks/summary status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var summary TaskSummary
	if err := json.Unmarshal(recorder.Body.Bytes(), &summary); err != nil {
		t.Fatalf("decode summary: %v", err)
	}
	// 独立的对照口径：SQL 直出的活动任务数。列表在内存里，聚合成对两侧才可信。
	metrics, err := m.PG().TaskListMetricsAll()
	if err != nil {
		t.Fatalf("TaskListMetricsAll: %v", err)
	}
	if len(metrics) == 0 {
		t.Skip("no live tasks in the configured database")
	}
	if got, want := summary.Total, len(s.taskInventory()); got != want {
		t.Fatalf("total=%d, want the inventory size %d", got, want)
	}
	if got, want := summary.Total, len(metrics); got != want {
		t.Fatalf("total=%d, want %d live tasks", got, want)
	}
	buckets := summary.ByStatus.Created + summary.ByStatus.Queued + summary.ByStatus.Running +
		summary.ByStatus.Paused + summary.ByStatus.Done + summary.ByStatus.Failed + summary.ByStatus.Timeout
	if buckets != summary.Total {
		t.Fatalf("status buckets sum to %d, want total %d: %+v", buckets, summary.Total, summary.ByStatus)
	}
	if len(summary.Lifecycle) != len(TaskLifecycle) {
		t.Fatalf("summary publishes %d lifecycle entries, want %d", len(summary.Lifecycle), len(TaskLifecycle))
	}
	if len(summary.Throughput) != summary.WindowDays || summary.WindowDays != 30 {
		t.Fatalf("throughput window = %d/%d, want 30", len(summary.Throughput), summary.WindowDays)
	}
	t.Logf("summary: total=%d by_status=%+v active=%d completion=%.1f goals=%d/%d findings=%+v", summary.Total, summary.ByStatus, summary.Active, summary.CompletionRate, summary.GoalsMet, summary.GoalsTotal, summary.Findings)
	if summary.Tokens.Total != summary.Tokens.InputTokens+summary.Tokens.OutputTokens {
		t.Fatalf("token total %d != input+output", summary.Tokens.Total)
	}
}

func lifecycleEntry(key string) TaskLifecycleEntry {
	for _, entry := range TaskLifecycle {
		if entry.Key == key {
			return entry
		}
	}
	return TaskLifecycleEntry{}
}

func sum(values []int) int {
	total := 0
	for _, value := range values {
		total += value
	}
	return total
}

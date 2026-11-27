// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Subscription lifecycle: fetch → parse → diff against the nodes this
// subscription previously produced (source = "sub:<id>") → upsert/delete → sync
// pool membership → persist the diff. Nodes imported by hand are never touched.

// SubscriptionDiff lists what one refresh changed, for the settings UI.
type SubscriptionDiff struct {
	Added   []string `json:"added"`
	Removed []string `json:"removed"`
}

// RefreshResult is returned by a manual or scheduled refresh.
type RefreshResult struct {
	Added   int              `json:"added"`
	Removed int              `json:"removed"`
	Changed int              `json:"changed"`
	Issues  []ParseIssue     `json:"issues,omitempty"`
	Diff    SubscriptionDiff `json:"diff"`
}

// FetchSubscription downloads a subscription body. Only http/https is accepted,
// the body is capped at 8MB, and a non-2xx status is an error rather than an
// empty node list.
func FetchSubscription(ctx context.Context, rawURL string) (string, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", errors.New("订阅 URL 为空")
	}
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		return "", errors.New("订阅 URL 只允许 http/https")
	}
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", fmt.Errorf("订阅 URL 无效: %w", err)
	}
	req.Header.Set("User-Agent", "vexnar/egress")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("拉取订阅失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("订阅返回 HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return "", fmt.Errorf("读取订阅失败: %w", err)
	}
	if strings.TrimSpace(string(body)) == "" {
		return "", errors.New("订阅内容为空")
	}
	return string(body), nil
}

// RefreshSubscription fetches and applies one subscription by id.
func (m *Manager) RefreshSubscription(ctx context.Context, id int64) (RefreshResult, error) {
	var res RefreshResult
	sub, err := m.store.Subscription(ctx, id)
	if err != nil {
		return res, err
	}
	if sub == nil {
		return res, fmt.Errorf("egress: 订阅 %d 不存在", id)
	}
	source := fmt.Sprintf("sub:%d", id)
	text, err := FetchSubscription(ctx, sub.URL)
	if err != nil {
		_ = m.store.SetSubscriptionResult(ctx, id, 0, 0, 0, "", truncate(err.Error(), 300))
		return res, err
	}
	parsed := ParseInput(text)
	res.Issues = parsed.Issues
	if len(parsed.Nodes) == 0 {
		msg := "订阅没有解析到可用节点"
		_ = m.store.SetSubscriptionResult(ctx, id, 0, 0, 0, "", msg)
		return res, errors.New(msg)
	}

	existing, err := m.store.NodesBySource(ctx, source)
	if err != nil {
		return res, err
	}
	have := map[string]Node{}
	for _, n := range existing {
		have[n.Fingerprint()] = n
	}
	seen := map[string]bool{}
	var upserts []Node
	for _, cfg := range parsed.Nodes {
		fp := cfg.Fingerprint()
		seen[fp] = true
		upserts = append(upserts, Node{NodeConfig: cfg, Tags: sub.Tags, Enabled: true, Source: source})
		if old, ok := have[fp]; ok {
			// Same routing shape: only a display rename counts as a change. Any real
			// config change yields a different fingerprint (add + remove), so it is
			// never silently overwritten.
			if old.Name != cfg.Name {
				res.Changed++
			}
			continue
		}
		res.Added++
		res.Diff.Added = append(res.Diff.Added, cfg.Name)
	}
	var removedIDs []int64
	for fp, n := range have {
		if seen[fp] {
			continue
		}
		res.Removed++
		res.Diff.Removed = append(res.Diff.Removed, n.Name)
		removedIDs = append(removedIDs, n.ID)
	}
	if _, _, err := m.store.UpsertNodes(ctx, upserts, sub.Tags); err != nil {
		return res, err
	}
	for _, id := range removedIDs {
		if err := m.store.DeleteNode(ctx, id); err != nil {
			return res, err
		}
	}

	// Pool membership: add the nodes this subscription produced, drop the removed
	// ones, leave manual members untouched.
	if sub.PoolID > 0 {
		all, err := m.store.Nodes(ctx)
		if err != nil {
			return res, err
		}
		newIDs := map[int64]bool{}
		for _, n := range all {
			if n.Source == source {
				newIDs[n.ID] = true
			}
		}
		members, err := m.store.PoolNodes(ctx, sub.PoolID)
		if err != nil {
			return res, err
		}
		keep := make([]int64, 0, len(members)+len(newIDs))
		seenMember := map[int64]bool{}
		for _, mid := range members {
			if seenMember[mid] {
				continue
			}
			// Drop members that belonged to this subscription and are gone now.
			if !newIDs[mid] {
				gone := false
				for _, rid := range removedIDs {
					if rid == mid {
						gone = true
						break
					}
				}
				if gone {
					continue
				}
			}
			keep = append(keep, mid)
			seenMember[mid] = true
		}
		for _, n := range all {
			if n.Source == source && !seenMember[n.ID] {
				keep = append(keep, n.ID)
				seenMember[n.ID] = true
			}
		}
		if err := m.store.SetPoolNodes(ctx, sub.PoolID, keep); err != nil {
			return res, err
		}
	}

	diffJSON, _ := json.Marshal(res.Diff)
	if err := m.store.SetSubscriptionResult(ctx, id, res.Added, res.Removed, res.Changed, string(diffJSON), ""); err != nil {
		return res, err
	}
	if err := m.Reload(ctx); err != nil {
		return res, err
	}
	m.publish(Event{Type: "subscription_refreshed", PoolID: sub.PoolID,
		Message: fmt.Sprintf("%s: +%d -%d ~%d", sub.Name, res.Added, res.Removed, res.Changed)})
	return res, nil
}

// runSubscriptions refreshes every enabled subscription whose interval elapsed.
func (m *Manager) runSubscriptions() {
	if m == nil || m.store == nil {
		return
	}
	ctx, cancel := context.WithTimeout(m.ctx, 60*time.Second)
	defer cancel()
	subs, err := m.store.Subscriptions(ctx)
	if err != nil {
		return
	}
	for _, sub := range subs {
		if !sub.Enabled {
			continue
		}
		interval := time.Duration(sub.IntervalSeconds) * time.Second
		if interval < 5*time.Minute {
			interval = time.Hour
		}
		if !sub.LastFetchAt.IsZero() && time.Since(sub.LastFetchAt) < interval {
			continue
		}
		subCtx, subCancel := context.WithTimeout(m.ctx, 60*time.Second)
		if _, err := m.RefreshSubscription(subCtx, sub.ID); err != nil {
			m.logf("订阅 %s 刷新失败: %v", sub.Name, err)
		}
		subCancel()
	}
}

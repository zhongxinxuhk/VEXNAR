// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import "strconv"

// ActivityFeed returns one page of the newest steps across every exploration.
//
// The per-task reader (ExplorationStore.ActivityList) needs a task to scope the
// query, so station-wide surfaces — the console overview's activity card, which
// shows "what the whole station is doing" — used to get an empty list. This feed
// answers that shape: newest page first, oldest-last inside the page, and a
// snapshot cursor equal to the newest id at query time (also the live-tail
// boundary). beforeID > 0 pages backwards.
func (d *DB) ActivityFeed(beforeID int64, limit int) ([]Activity, int64, bool, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	// One extra row tells the caller whether an older page exists.
	const cols = `id, node_id, COALESCE(worker,''), COALESCE(kind,''), COALESCE(tool,''), COALESCE(tool_use_id,''),
		is_error, COALESCE(summary,''), metadata, created_at, input_tokens, output_tokens,
		cache_read_tokens, cache_write_tokens, main_seg`
	query := `SELECT ` + cols + ` FROM activity`
	args := []any{}
	if beforeID > 0 {
		query += ` WHERE id < $1`
		args = append(args, beforeID)
	}
	query += ` ORDER BY id DESC LIMIT $` + strconv.Itoa(len(args)+1)
	args = append(args, limit+1)

	rows, err := d.Query(query, args...)
	if err != nil {
		return nil, 0, false, err
	}
	defer rows.Close()
	items := []Activity{}
	snapshot := int64(0)
	for rows.Next() {
		var a Activity
		if err := rows.Scan(&a.ID, &a.NodeID, &a.Worker, &a.Kind, &a.Tool, &a.ToolUseID, &a.IsError, &a.Summary,
			&a.Metadata, &a.CreatedAt, &a.InputTokens, &a.OutputTokens, &a.CacheReadTokens, &a.CacheWriteTokens,
			&a.MainSeg); err != nil {
			return nil, 0, false, err
		}
		if a.ID > snapshot {
			snapshot = a.ID
		}
		items = append(items, a)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, false, err
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	// Reverse to oldest-last: renderers append without sorting.
	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
		items[i], items[j] = items[j], items[i]
	}
	return items, snapshot, hasMore, nil
}

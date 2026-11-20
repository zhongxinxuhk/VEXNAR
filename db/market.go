// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import (
	"encoding/json"
	"time"
)

// MarketSource 是一个插件市场源：指向 GitHub 仓库（可带子目录）的一行记录。
// Kind 决定它提供哪类条目：mcp / skills / all。
type MarketSource struct {
	ID        int64           `json:"id"`
	Kind      string          `json:"kind"`
	Name      string          `json:"name"`
	Repo      string          `json:"repo"`
	Ref       string          `json:"ref"`
	Path      string          `json:"path"`
	Official  bool            `json:"official"`
	Items     json.RawMessage `json:"-"`
	SyncedAt  *time.Time      `json:"synced_at,omitempty"`
	LastError string          `json:"last_error,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

// ListMarketSources 按 id 升序返回所有市场源，附带缓存的条目 JSON。
func (d *DB) ListMarketSources() ([]*MarketSource, error) {
	rows, err := d.Query(`SELECT id,kind,name,repo,ref,path,official,items,synced_at,last_error,created_at
FROM market_sources ORDER BY official DESC, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*MarketSource{}
	for rows.Next() {
		var m MarketSource
		var items []byte
		if err := rows.Scan(&m.ID, &m.Kind, &m.Name, &m.Repo, &m.Ref, &m.Path, &m.Official,
			&items, &m.SyncedAt, &m.LastError, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.Items = json.RawMessage(items)
		out = append(out, &m)
	}
	return out, rows.Err()
}

// SaveMarketSource 新增（ID=0）或更新一个市场源，返回其 id。
func (d *DB) SaveMarketSource(m *MarketSource) (int64, error) {
	if m.Kind == "" {
		m.Kind = "all"
	}
	if m.Ref == "" {
		m.Ref = "main"
	}
	if m.ID == 0 {
		var id int64
		err := d.QueryRow(`INSERT INTO market_sources(kind,name,repo,ref,path,official)
VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
			m.Kind, m.Name, m.Repo, m.Ref, m.Path, m.Official).Scan(&id)
		return id, err
	}
	_, err := d.Exec(`UPDATE market_sources SET kind=$1,name=$2,repo=$3,ref=$4,path=$5 WHERE id=$6`,
		m.Kind, m.Name, m.Repo, m.Ref, m.Path, m.ID)
	return m.ID, err
}

func (d *DB) DeleteMarketSource(id int64) error {
	_, err := d.Exec(`DELETE FROM market_sources WHERE id=$1`, id)
	return err
}

// SaveMarketSourceSync 记录一次同步结果：命中时写入条目缓存并清空错误，
// 失败时保留旧缓存（市场页仍可展示上次成功的结果）只记录错误。
func (d *DB) SaveMarketSourceSync(id int64, items json.RawMessage, syncErr string) error {
	if syncErr != "" {
		_, err := d.Exec(`UPDATE market_sources SET last_error=$2, synced_at=now() WHERE id=$1`, id, syncErr)
		return err
	}
	if len(items) == 0 {
		items = json.RawMessage("[]")
	}
	_, err := d.Exec(`UPDATE market_sources SET items=$2, last_error='', synced_at=now() WHERE id=$1`, id, []byte(items))
	return err
}

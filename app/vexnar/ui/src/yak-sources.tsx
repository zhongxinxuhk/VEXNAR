// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Yak 流量来源编辑器：每个工作区一条记录（名称/工作区/内核 socket/令牌文件/项目 ID）。
// 保存走 /api/yak/sources，文件权限 0600；History 面板读取同一份配置。
import { useState } from 'react'
import type { ReactNode } from 'react'
import { callApi } from './api.js'

type Row = {
  name: string
  workspace: string
  socket: string
  token_file: string
  project_id: string
}

const EMPTY: Row = { name: '', workspace: '', socket: '', token_file: '', project_id: '1' }

function field(label: string, hint: string, control: ReactNode): ReactNode {
  return (
    <label className="vx-cat-field">
      <span className="vx-cat-field-label">{label}</span>
      <span className="vx-cat-field-hint">{hint}</span>
      {control}
    </label>
  )
}

export function YakSourcesEditor({ onSaved }: { onSaved: () => void }): ReactNode {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [path, setPath] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    setBusy(true)
    setError('')
    try {
      const data = await callApi('/api/yak/sources')
      setRows((data.sources ?? []).map((row: any) => ({
        name: String(row.name ?? ''),
        workspace: String(row.workspace ?? ''),
        socket: String(row.socket ?? ''),
        token_file: String(row.token_file ?? ''),
        project_id: String(row.project_id ?? 1)
      })))
      setPath(String(data.path ?? ''))
      setLoaded(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const payload = rows.map((row) => ({
        name: row.name.trim(),
        workspace: row.workspace.trim(),
        socket: row.socket.trim(),
        token_file: row.token_file.trim(),
        project_id: Number(row.project_id)
      }))
      const data = await callApi('/api/yak/sources', 'PUT', { sources: payload })
      setRows((data.sources ?? []).map((row: any) => ({
        name: String(row.name ?? ''),
        workspace: String(row.workspace ?? ''),
        socket: String(row.socket ?? ''),
        token_file: String(row.token_file ?? ''),
        project_id: String(row.project_id ?? 1)
      })))
      setPath(String(data.path ?? path))
      onSaved()
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vx-cat-section">
      <div className="vx-cat-section-head">
        <strong>Yak 流量来源</strong>
        <button
          type="button"
          className="vx-cat-btn"
          onClick={() => {
            if (!open && !loaded) void load()
            setOpen((value) => !value)
          }}
        >
          {open ? '收起' : '配置来源'}
        </button>
      </div>
      {!open && <p className="vx-cat-hint">每个本地工作区绑定一个 Yak 内核 socket 与项目；未配置时 History 无法读取外部流量。</p>}
      {open && (
        <div className="vx-cat-grid">
          {error && <p className="vx-cat-error" role="alert">{error}</p>}
          {rows.map((row, index) => (
            <div className="vx-cat-card" key={index}>
              <div className="vx-cat-card-top">
                <strong>{row.name || `来源 ${index + 1}`}</strong>
                <button
                  type="button"
                  className="vx-cat-btn vx-cat-btn--danger"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  删除
                </button>
              </div>
              <div className="vx-cat-grid">
                {field('名称', '会话里显示的项目名', (
                  <input className="vx-cat-input" value={row.name} onChange={(e) => update(index, { name: e.target.value })} />
                ))}
                {field('工作区', '绝对路径；会话原工作区按它匹配来源', (
                  <input className="vx-cat-input vx-cat-mono" value={row.workspace} onChange={(e) => update(index, { workspace: e.target.value })} />
                ))}
                {field('内核 socket', 'Yak 私有 Unix socket 绝对路径（目录 0700）', (
                  <input className="vx-cat-input vx-cat-mono" value={row.socket} onChange={(e) => update(index, { socket: e.target.value })} />
                ))}
                {field('令牌文件', '一行内核令牌的绝对路径（0600）', (
                  <input className="vx-cat-input vx-cat-mono" value={row.token_file} onChange={(e) => update(index, { token_file: e.target.value })} />
                ))}
                {field('项目 ID', '该内核当前项目编号（GetCurrentProjectEx）', (
                  <input className="vx-cat-input vx-cat-mono" inputMode="numeric" value={row.project_id} onChange={(e) => update(index, { project_id: e.target.value })} />
                ))}
              </div>
            </div>
          ))}
          <div className="vx-cat-toolbar">
            <button type="button" className="vx-cat-btn" onClick={() => setRows((current) => [...current, { ...EMPTY }])}>
              新增来源
            </button>
            <button type="button" className="vx-cat-btn vx-cat-btn--primary" disabled={busy} onClick={() => void save()}>
              {busy ? '保存中…' : '保存'}
            </button>
            <button type="button" className="vx-cat-btn" onClick={() => void load()} disabled={busy}>
              重新读取
            </button>
            <span className="vx-cat-spacer" />
            {path && <code className="vx-cat-mono vx-cat-mini">{path}</code>}
          </div>
        </div>
      )}
    </div>
  )
}

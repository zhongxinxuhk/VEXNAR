// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createElement as h, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/** Craft Anything panel: version, binary path and the MCP tools it exposes. */
function CraftPanel(): ReactNode {
  const [state, setState] = useState<{ data: any; error: string; loading: boolean }>({ data: null, error: '', loading: true })
  useEffect(() => {
    let alive = true
    const base = (localStorage.getItem('vexnar.coreUrl') || '/vexnar-api').replace(/\/$/, '')
    const token = localStorage.getItem('vexnar.coreToken') || ''
    fetch(`${base}/api/craft/status`, { headers: token ? { 'x-vexnar-token': token } : {} })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((data) => { if (alive) setState({ data, error: '', loading: false }) })
      .catch((error) => { if (alive) setState({ data: null, error: String(error?.message ?? error), loading: false }) })
    return () => { alive = false }
  }, [])
  const data = state.data
  return h('div', { style: { height: '100%', overflowY: 'auto', padding: 24, font: '14px/1.6 system-ui, sans-serif' } },
    h('h2', { style: { margin: '0 0 4px' } }, 'Craft Anything'),
    h('p', { style: { margin: '0 0 16px', opacity: 0.7 } }, '内置 MCP 引擎（Essentials 工具集）'),
    state.loading ? h('p', null, '读取中…') : state.error ? h('p', null, `错误：${state.error}`) : h('div', null,
      h('p', null, `版本：${data?.version || '未安装'} · 工具：${data?.tools?.length ?? 0}`),
      h('p', { style: { opacity: 0.7, wordBreak: 'break-all' } }, data?.path ?? ''),
      h('ul', null, (data?.tools ?? []).map((tool: string) => h('li', { key: tool }, h('code', null, tool))))
    ))
}

function CraftIcon({ size }: { size?: number }): ReactNode {
  return h('svg', { width: size ?? 16, height: size ?? 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
    h('path', { d: 'M4 7h16v12H4z' }),
    h('path', { d: 'M8 7V4h8v3' }))
}

export const name = '@vexnar/dsh-craft'
export const inject = ['slots']

export function apply(ctx: any): void {
  const { slots } = ctx
  if (slots === undefined) return
  slots.inject('main', () => slots.register({ name: 'main', key: 'vexnar-craft' }, CraftPanel))
  slots.inject('sidebar.panellist', () =>
    slots.register({ name: 'sidebar.panellist', id: 'vexnar-craft', order: 99, label: () => 'Craft' }, CraftIcon))
}

export default { name, inject, apply }

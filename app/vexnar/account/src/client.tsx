// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement as h, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/**
 * VEXNAR account section for the dsh settings panel.
 *
 * The client only talks to same-origin /vexnar-account/* routes registered by
 * this package's host half; the Go desktop token and the upstream API key stay
 * in the Host/Go processes.
 */

interface Status {
  configured?: boolean
  provider?: string
  model?: string
  base_url?: string
  has_key?: boolean
  reasoning_effort?: string
  thinking_type?: string
  error?: string
}

const box: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-secondary, #e5e7eb)',
  borderRadius: 10,
  padding: 14,
  color: 'var(--dsw-alias-label-primary, #111827)',
  font: '13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
}

const field: CSSProperties = {
  display: 'grid',
  gap: 4,
  marginBottom: 10
}

const input: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-secondary, #d1d5db)',
  borderRadius: 6,
  padding: '6px 8px',
  font: 'inherit',
  color: 'inherit',
  background: 'transparent'
}

const button: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-secondary, #d1d5db)',
  borderRadius: 6,
  padding: '5px 12px',
  font: 'inherit',
  cursor: 'pointer',
  background: 'transparent',
  color: 'inherit'
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }
  })
  const body = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

export function AccountSection(): ReactNode {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ base_url: '', api_key: '', model: '', provider: 'openai-responses' })

  const refresh = async (): Promise<void> => {
    try {
      setStatus(await jsonFetch<Status>('/vexnar-account/status'))
      setError('')
    } catch (err) {
      setError(String((err as Error).message))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const login = async (): Promise<void> => {
    setBusy(true)
    try {
      const payload: Record<string, string> = {
        base_url: form.base_url.trim(),
        api_key: form.api_key.trim(),
        model: form.model.trim(),
        provider: form.provider
      }
      const next = await jsonFetch<Status>('/vexnar-account/login', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      setStatus(next)
      setError('')
    } catch (err) {
      setError(String((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  const logout = async (): Promise<void> => {
    setBusy(true)
    try {
      setStatus(await jsonFetch<Status>('/vexnar-account/logout', { method: 'POST' }))
    } catch (err) {
      setError(String((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  const configured = status?.configured === true || (status?.has_key === true)

  return h(
    'div',
    { style: { display: 'grid', gap: 14 } },
    h(
      'div',
      { style: box },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        h('strong', null, 'VEXNAR 账户'),
        h('span', {
          style: {
            fontSize: 11,
            padding: '1px 8px',
            borderRadius: 999,
            border: '1px solid currentColor',
            color: configured ? '#15803d' : '#a16207'
          }
        }, configured ? '已连接' : '未配置'),
        h('button', { type: 'button', style: { ...button, marginLeft: 'auto' }, onClick: () => void refresh() }, '刷新')
      ),
      h('div', { style: { marginTop: 8, color: 'var(--dsw-alias-label-secondary, #6b7280)' } },
        configured
          ? `${status?.provider ?? ''} · ${status?.model ?? ''}${status?.base_url ? ` · ${status.base_url}` : ''}`
          : '模型凭据保存在 Go 进程；这里只做登录与状态展示。'
      ),
      error ? h('div', { style: { marginTop: 8, color: '#b91c1c' } }, error) : null
    ),
    h(
      'div',
      { style: box },
      h('div', { style: { marginBottom: 10, fontWeight: 600 } }, configured ? '更新连接' : '登录'),
      h('label', { style: field }, 'API 根地址',
        h('input', {
          style: input,
          placeholder: 'https://api.example.com/v1',
          value: form.base_url,
          onChange: (event: { target: { value: string } }) => setForm({ ...form, base_url: event.target.value })
        })),
      h('label', { style: field }, 'API Key',
        h('input', {
          style: input,
          type: 'password',
          placeholder: 'sk-...',
          value: form.api_key,
          onChange: (event: { target: { value: string } }) => setForm({ ...form, api_key: event.target.value })
        })),
      h('label', { style: field }, '模型 ID',
        h('input', {
          style: input,
          placeholder: 'deepsec-flash',
          value: form.model,
          onChange: (event: { target: { value: string } }) => setForm({ ...form, model: event.target.value })
        })),
      h('label', { style: field }, '协议',
        h('select', {
          style: input,
          value: form.provider,
          onChange: (event: { target: { value: string } }) => setForm({ ...form, provider: event.target.value })
        },
          h('option', { value: 'openai-responses' }, 'openai-responses（推荐）'),
          h('option', { value: 'openai' }, 'openai (chat/completions)')
        )),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', {
          type: 'button',
          style: button,
          disabled: busy || form.base_url.trim() === '' || form.model.trim() === '',
          onClick: () => void login()
        }, busy ? '提交中…' : '保存并连接'),
        configured
          ? h('button', { type: 'button', style: button, disabled: busy, onClick: () => void logout() }, '清除凭据')
          : null
      )
    )
  )
}

export function apply(ctx: {
  slots: {
    inject: (name: string, register: () => unknown) => void
    register: (options: { name: string; id: string; label: string; order?: number }, component: unknown) => unknown
  }
}): void {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: 'vexnar-account', label: '账户', order: 30 },
      AccountSection
    ))
}

export const inject = ['slots']

export default { name: '@vexnar/dsh-account', inject, apply }

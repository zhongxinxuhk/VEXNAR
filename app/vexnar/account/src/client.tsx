// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement as h, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/**
 * VEXNAR account section.
 *
 * Login methods come from the NewAPI deployment's /api/status. Password login
 * uses NewAPI's API; every other method runs in a real Chrome window on the
 * NewAPI origin. After login the host stores the key in dsh's credential store
 * and configures the pi-ai provider directly — model traffic never touches the
 * Go gateway.
 */

interface Status {
  configured?: boolean
  base?: string
  user?: string
  models?: number
  keySet?: boolean
  model?: string
  error?: string
}

interface Methods {
  base?: string
  password?: boolean
  passkey?: boolean
  emailVerification?: boolean
  turnstile?: boolean
  oauth?: { slug: string; name: string }[]
  error?: string
}

const box: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-secondary, #e5e7eb)',
  borderRadius: 10,
  padding: 14,
  color: 'var(--dsw-alias-label-primary, #111827)',
  font: '13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
}
const field: CSSProperties = { display: 'grid', gap: 4, marginBottom: 10 }
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
const chip: CSSProperties = {
  fontSize: 11,
  padding: '1px 8px',
  borderRadius: 999,
  border: '1px solid var(--dsw-alias-border-secondary, #d1d5db)'
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
  const [methods, setMethods] = useState<Methods | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [browser, setBrowser] = useState<{ state: string; message: string; user?: string }>({ state: 'idle', message: '' })
  const [manual, setManual] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', base_url: '', api_key: '' })

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
    void jsonFetch<Methods>('/vexnar-account/methods').then(setMethods).catch((err) => setError(String(err.message)))
  }, [])

  useEffect(() => {
    if (browser.state !== 'starting' && browser.state !== 'waiting') return
    const timer = window.setInterval(() => {
      void jsonFetch<typeof browser>('/vexnar-account/login/browser/status').then((next) => {
        setBrowser(next)
        if (next.state === 'done') void refresh()
      })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [browser.state])

  const passwordLogin = async (): Promise<void> => {
    setBusy(true)
    try {
      await jsonFetch('/vexnar-account/login/password', {
        method: 'POST',
        body: JSON.stringify({ username: form.username.trim(), password: form.password })
      })
      await refresh()
      setError('')
    } catch (err) {
      setError(String((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  const browserLogin = async (): Promise<void> => {
    try {
      setBrowser(await jsonFetch('/vexnar-account/login/browser', { method: 'POST' }))
    } catch (err) {
      setError(String((err as Error).message))
    }
  }

  const manualLogin = async (): Promise<void> => {
    setBusy(true)
    try {
      await jsonFetch('/vexnar-account/login', {
        method: 'POST',
        body: JSON.stringify({ base_url: form.base_url.trim(), api_key: form.api_key.trim() })
      })
      await refresh()
      setError('')
    } catch (err) {
      setError(String((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  const configured = status?.configured === true
  const oauth = methods?.oauth ?? []

  return h(
    'div',
    { style: { display: 'grid', gap: 14 } },
    h(
      'div',
      { style: box },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        h('strong', null, 'VEXNAR 账户'),
        h('span', { style: { ...chip, color: configured ? '#15803d' : '#a16207' } },
          configured ? '已连接' : '未登录'),
        h('button', { type: 'button', style: { ...button, marginLeft: 'auto' }, onClick: () => void refresh() }, '刷新')
      ),
      h('div', { style: { marginTop: 8, color: 'var(--dsw-alias-label-secondary, #6b7280)' } },
        configured
          ? `${status?.user || 'NewAPI'} · ${status?.base ?? ''} · ${status?.models ?? 0} 个模型`
          : methods?.base
            ? `登录到 ${methods.base}，模型直连 NewAPI（不经 Go）`
            : '读取 NewAPI 登录方式…'
      ),
      error ? h('div', { style: { marginTop: 8, color: '#b91c1c' } }, error) : null
    ),

    h(
      'div',
      { style: box },
      h('div', { style: { marginBottom: 8, fontWeight: 600 } }, '登录方式'),
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 } },
        methods?.password ? h('span', { style: chip }, '密码') : null,
        methods?.passkey ? h('span', { style: chip }, 'Passkey') : null,
        methods?.emailVerification ? h('span', { style: chip }, '邮箱验证码') : null,
        ...oauth.map((provider) => h('span', { key: provider.slug, style: chip }, provider.name)),
        methods?.turnstile ? h('span', { style: { ...chip, color: '#a16207' } }, 'Turnstile 已开启') : null
      ),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h('button', { type: 'button', style: button, onClick: () => void browserLogin() }, '打开浏览器登录（支持全部方式）'),
        methods?.password && !methods?.turnstile
          ? h('button', { type: 'button', style: button, onClick: () => setManual(!manual) }, manual ? '收起密码登录' : '密码登录')
          : null
      ),
      browser.state !== 'idle'
        ? h('div', {
            style: {
              marginTop: 10,
              color: browser.state === 'error' ? '#b91c1c' : 'var(--dsw-alias-label-secondary, #6b7280)'
            }
          }, `${browser.message}${browser.user ? `（${browser.user}）` : ''}`)
        : null,
      manual && methods?.password
        ? h('div', { style: { marginTop: 12, display: 'grid', gap: 8 } },
            h('label', { style: field }, '用户名 / 邮箱',
              h('input', {
                style: input,
                value: form.username,
                onChange: (event: { target: { value: string } }) => setForm({ ...form, username: event.target.value })
              })),
            h('label', { style: field }, '密码',
              h('input', {
                style: input,
                type: 'password',
                value: form.password,
                onChange: (event: { target: { value: string } }) => setForm({ ...form, password: event.target.value })
              })),
            h('button', {
              type: 'button',
              style: button,
              disabled: busy || form.username.trim() === '' || form.password === '',
              onClick: () => void passwordLogin()
            }, busy ? '登录中…' : '登录')
          )
        : null
    ),

    h(
      'div',
      { style: box },
      h('div', { style: { marginBottom: 8, fontWeight: 600 } }, '手动填写 API Key'),
      h('div', { style: { color: 'var(--dsw-alias-label-secondary, #6b7280)', marginBottom: 8 } },
        'Key 存入 dsh 凭据库，模型目录自动从 /v1/models 读取。'),
      h('label', { style: field }, 'API 根地址',
        h('input', {
          style: input,
          placeholder: 'https://api.example.com',
          value: form.base_url,
          onChange: (event: { target: { value: string } }) => setForm({ ...form, base_url: event.target.value })
        })),
      h('label', { style: field }, 'API Key',
        h('input', {
          style: input,
          type: 'password',
          value: form.api_key,
          onChange: (event: { target: { value: string } }) => setForm({ ...form, api_key: event.target.value })
        })),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', {
          type: 'button',
          style: button,
          disabled: busy || form.base_url.trim() === '' || form.api_key.trim() === '',
          onClick: () => void manualLogin()
        }, '保存并连接'),
        configured
          ? h('button', {
              type: 'button',
              style: button,
              onClick: () => void jsonFetch('/vexnar-account/logout', { method: 'POST' }).then(refresh).catch((err) => setError(String(err.message)))
            }, '清除凭据')
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
      { name: 'settings.section', id: 'vexnar-account', label: '账户', order: -100 },
      AccountSection
    ))
}

export const inject = ['slots']

export default { name: '@vexnar/dsh-account', inject, apply }

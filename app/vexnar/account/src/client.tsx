// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement as h, Fragment, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

const api = '/vexnar-api/platform'
const platform = 'https://platform.sec.hn.cn'
const docs = 'https://docs.sec.hn.cn/'
const accountEvent = 'vexnar:platform-account'

interface Provider {
  id: string
  name: string
  format: string
  models: { id: string; name?: string }[]
}

interface Account {
  signed_in: boolean
  ready: boolean
  username: string
  display_name?: string
  request_count?: number | null
  access_token_ready: boolean
  providers: Provider[]
}

const panel: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-secondary, #e5e7eb)',
  borderRadius: 10, padding: 16, display: 'grid', gap: 12
}
const field: CSSProperties = { display: 'grid', gap: 4 }
const input: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-secondary, #d1d5db)',
  borderRadius: 6, padding: '6px 8px', font: 'inherit', color: 'inherit', background: 'transparent'
}
const button: CSSProperties = {
  ...input, padding: '5px 12px', justifySelf: 'start', cursor: 'pointer'
}

async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
  return result
}

function useAccount() {
  const [account, setAccount] = useState<Account>()
  const [error, setError] = useState('')
  const onError = (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))
  const refresh = () => void request<Account>('/account').then(setAccount, onError)
  const update = (account: Account) => {
    setAccount(account)
    setError('')
    window.dispatchEvent(new Event(accountEvent))
  }
  useEffect(() => {
    refresh()
    window.addEventListener(accountEvent, refresh)
    return () => window.removeEventListener(accountEvent, refresh)
  }, [])
  return { account, error, onError, update }
}

const profileHeader: CSSProperties = {
  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16,
  padding: '22px 20px', borderRadius: 14,
  background: 'linear-gradient(110deg, #102e37, #164951)', color: '#f2fffb'
}
const avatar: CSSProperties = {
  display: 'grid', placeItems: 'center', width: 54, height: 54, borderRadius: 15,
  background: '#c4ebdf', color: '#163d42', fontSize: 20, fontWeight: 700
}
const stats: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: 8,
  margin: 0, padding: 0
}
const stat: CSSProperties = {
  ...panel, gap: 4, padding: '11px 12px', background: 'var(--dsw-alias-surface-secondary, transparent)'
}

export function AccountSection() {
  const { account, error, onError } = useAccount()
  const [busy, setBusy] = useState(false)
  const logout = async () => {
    setBusy(true)
    try {
      await request<Account>('/account', 'DELETE')
      window.location.replace('/')
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }
  if (!account?.ready) return <div style={panel} role="status">{error || '正在读取 VEXNAR 个人资料…'}</div>

  const provider = account.providers.find(item => item.id === 'vexnar')
  const modelCount = provider?.models.length ?? 0
  const displayName = account.display_name || account.username
  const values = [
    { name: '平台模型', value: modelCount.toLocaleString('zh-CN') },
    { name: '模型协议', value: 'Responses' },
    { name: '平台访问令牌', value: account.access_token_ready ? '已配置' : '未配置' },
    ...(typeof account.request_count === 'number'
      ? [{ name: '平台累计请求', value: account.request_count.toLocaleString('zh-CN') }]
      : [])
  ]

  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={profileHeader}>
      <span style={avatar} aria-hidden="true">{Array.from(displayName).slice(0, 2).join('').toUpperCase()}</span>
      <div style={{ flex: '1 1 170px', minWidth: 0, overflowWrap: 'anywhere' }}>
        <h2 style={{ margin: 0, fontSize: 23 }}>{displayName}</h2>
        <span style={{ color: '#c6ded9' }}>@{account.username}</span>
      </div>
      <a href={platform + '/profile'} target="_blank" rel="noreferrer" style={{ ...button, color: 'inherit' }}>管理平台账户</a>
    </div>
    <dl style={stats}>
      {values.map(({ name, value }) => <div key={name} style={stat}>
        <dt style={{ fontSize: 12 }}>{name}</dt>
        <dd style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>{value}</dd>
      </div>)}
    </dl>
    <div style={panel}>
      <strong>HXSEC AI Platform</strong>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <code>https://api.sec.hn.cn/v1</code>
        <a href={docs} target="_blank" rel="noreferrer">API 文档</a>
      </div>
      <details>
        <summary>查看可用模型（{modelCount}）</summary>
        <ul style={{ maxHeight: 190, overflow: 'auto', margin: '8px 0 0', paddingInlineStart: 20 }}>
          {provider?.models.map(model => <li key={model.id}>{model.name || model.id}</li>)}
        </ul>
      </details>
    </div>
    <button type="button" style={button} disabled={busy} onClick={() => void logout()}>退出登录</button>
    {error && <span role="alert" style={{ color: 'var(--dsw-alias-label-danger, #b91c1c)' }}>{error}</span>}
  </div>
}

type Kind = 'deepseek' | 'custom'

export function ModelsSection() {
  const { account, error, onError, update } = useAccount()
  const [kind, setKind] = useState<Kind>()
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [busy, setBusy] = useState(false)
  const select = (kind: Kind) => {
    setKey('')
    setKind(kind)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      update(await request<Account>('/providers', 'POST', { kind, name, base_url: baseURL, api_key: key }))
      setKey('')
      setKind(undefined)
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  if (!account?.signed_in) return <div style={panel}>
    <span>{account ? '请先登录 VEXNAR，再添加模型 API。' : '正在读取账号状态…'}</span>
    {error && <span role="alert">{error}</span>}
  </div>

  const deepseek = account.providers.some(provider => provider.id === 'deepseek')
  return <div style={panel}>
    {account.providers.map(provider => <div key={provider.id} style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <strong>{provider.name}</strong>
        <span>{provider.models.length} 个模型</span>
        {provider.id !== 'vexnar' && <button type="button" style={button} disabled={busy} onClick={() => {
          setBusy(true)
          void request<Account>('/providers', 'DELETE', { id: provider.id }).then(update, onError).finally(() => setBusy(false))
        }}>移除</button>}
      </div>
      <details>
        <summary style={{ cursor: 'pointer' }}>查看模型</summary>
        <ul style={{ maxHeight: 160, overflow: 'auto', margin: '6px 0 0', paddingInlineStart: 20 }}>
          {provider.models.map(model => <li key={model.id}>{model.name || model.id}</li>)}
        </ul>
      </details>
    </div>)}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" style={button} disabled={busy} onClick={() => select('deepseek')}>
        {deepseek ? '更新 DeepSeek API Key' : '添加 DeepSeek API Key'}
      </button>
      <button type="button" style={button} disabled={busy} onClick={() => select('custom')}>导入自定义 API</button>
    </div>
    <span style={{ color: '#8a8f99', fontSize: 12 }}>
      Key 只存在本机凭据库，模型请求由客户端直接发往对应上游，不经过 VEXNAR 服务端。
    </span>
    {!account.ready && <span role="alert" style={{ color: 'var(--dsw-alias-label-danger, #b91c1c)' }}>
      平台没有签发可用的模型凭据。请退出登录后重新登录，或先添加自己的 API Key。
    </span>}
    {kind && <form onSubmit={event => void save(event)} style={{ display: 'grid', gap: 8 }}>
      {kind === 'custom' && <>
        <label style={field}>提供方名称
          <input style={input} value={name} required onChange={event => setName(event.target.value)} />
        </label>
        <label style={field}>OpenAI 兼容 API 根地址
          <input style={input} type="url" value={baseURL} placeholder="https://api.example.com/v1" required onChange={event => setBaseURL(event.target.value)} />
        </label>
      </>}
      <label style={field}>{kind === 'deepseek' ? 'DeepSeek API Key' : 'API Key'}
        <input style={input} type="password" autoComplete="off" value={key} required onChange={event => setKey(event.target.value)} />
      </label>
      <button type="submit" style={button} disabled={busy || !key.trim()}>{busy ? '正在验证…' : '验证并添加'}</button>
    </form>}
    {error && <span role="alert" style={{ color: 'var(--dsw-alias-label-danger, #b91c1c)' }}>{error}</span>}
  </div>
}

export function apply(ctx: {
  slots: {
    inject: (name: string, register: () => unknown) => void
    register: (options: { name: string; id: string; label: string; order: number }, component: unknown) => unknown
  }
}): void {
  ctx.slots.inject('settings.section', () => {
    ctx.slots.register({ name: 'settings.section', id: 'vexnar-account', label: '个人资料', order: -100 }, AccountSection)
    return ctx.slots.register({ name: 'settings.section', id: 'models', label: '模型', order: 10 }, ModelsSection)
  })
}

export const inject = ['slots']
export default { name: '@vexnar/dsh-account', inject, apply }

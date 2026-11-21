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
  models: { id: string; name?: string }[]
}

interface Account {
  signed_in: boolean
  username: string
  providers: Provider[]
}

interface Login {
  state: 'idle' | 'waiting' | 'done' | 'error'
  message: string
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

export function AccountSection() {
  const { account, error, onError, update } = useAccount()
  const [available, setAvailable] = useState<string[]>([])
  const [login, setLogin] = useState<Login>({ state: 'idle', message: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (account?.signed_in !== false) return
    void request<{ methods: string[] }>('/methods').then(result => setAvailable(result.methods), onError)
    void request<Login>('/login').then(setLogin, onError)
  }, [account?.signed_in])

  useEffect(() => {
    if (login.state !== 'waiting') return
    const timer = window.setInterval(() => {
      void request<Login>('/login').then(next => {
        setLogin(next)
        if (next.state === 'done') void request<Account>('/account').then(update, onError)
      }, onError)
    }, 1200)
    return () => window.clearInterval(timer)
  }, [login.state])

  const logout = async () => {
    setBusy(true)
    try {
      update(await request<Account>('/account', 'DELETE'))
      setLogin({ state: 'idle', message: '' })
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  return <div style={panel}>
    <strong>HXSEC AI Platform</strong>
    {account?.signed_in
      ? <>
          <span>已登录 {account.username}</span>
          <button type="button" style={button} disabled={busy} onClick={() => void logout()}>退出登录</button>
        </>
      : <>
          <span>在平台页面完成登录和二次验证。</span>
          {available.length > 0 && <span>{available.join(' · ')}</span>}
          <button type="button" style={button} disabled={!account || busy || login.state === 'waiting'} onClick={() => {
            setBusy(true)
            void request<Login>('/login', 'POST').then(setLogin, onError).finally(() => setBusy(false))
          }}>登录 VEXNAR</button>
          {login.state !== 'done' && login.message && <span role="status">{login.message}</span>}
        </>}
    {error && <span role="alert" style={{ color: 'var(--dsw-alias-label-danger, #b91c1c)' }}>{error}</span>}
    <div style={{ display: 'flex', gap: 16 }}>
      <a href={platform} target="_blank" rel="noreferrer">平台主页</a>
      <a href={docs} target="_blank" rel="noreferrer">API 文档</a>
    </div>
  </div>
}

type Kind = 'deepseek' | 'custom' | 'platform'

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
    <span>{account ? '请先在「账户」中登录 VEXNAR，再添加模型 API。' : '正在读取账号状态…'}</span>
    {error && <span role="alert">{error}</span>}
  </div>

  const deepseek = account.providers.some(provider => provider.id === 'deepseek')
  const hxsec = account.providers.some(provider => provider.id === 'vexnar')
  return <div style={panel}>
    {account.providers.map(provider => <div key={provider.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <strong>{provider.name}</strong>
      <span>{provider.models.length} 个模型</span>
      {provider.id !== 'vexnar' && <button type="button" style={button} disabled={busy} onClick={() => {
        setBusy(true)
        void request<Account>('/providers', 'DELETE', { id: provider.id }).then(update, onError).finally(() => setBusy(false))
      }}>移除</button>}
    </div>)}
    {!hxsec && <span>平台尚未关联可用的模型密钥。可以从平台创建 API Key 后在这里关联。</span>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {!hxsec && <button type="button" style={button} disabled={busy} onClick={() => select('platform')}>关联平台 API Key</button>}
      <button type="button" style={button} disabled={busy} onClick={() => select('deepseek')}>
        {deepseek ? '更新 DeepSeek API Key' : '添加 DeepSeek API Key'}
      </button>
      <button type="button" style={button} disabled={busy} onClick={() => select('custom')}>导入自定义 API</button>
    </div>
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
    ctx.slots.register({ name: 'settings.section', id: 'vexnar-account', label: '账户', order: -100 }, AccountSection)
    return ctx.slots.register({ name: 'settings.section', id: 'models', label: '模型', order: 10 }, ModelsSection)
  })
}

export const inject = ['slots']
export default { name: '@vexnar/dsh-account', inject, apply }

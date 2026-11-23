// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement as h, Fragment, useEffect, useRef, useState } from 'react'
import type { DragEvent, FormEvent, ReactNode } from 'react'
import type { AccountWallet } from './wallet-types.js'
import { installAccountStyles } from './styles.js'

const api = '/vexnar-api/platform'
const platform = 'https://platform.sec.hn.cn'
const docs = 'https://docs.sec.hn.cn/'
const accountEvent = 'vexnar:platform-account'

/** 平台自己的提供方 id：它的地址与密钥由平台签发，不参与编辑。 */
const platformProviderID = 'vexnar'

type Retry = 'normal' | 'always'

/** 设置页和账号 API 共用的模型目录字段。 */
interface ProviderModel {
  id: string
  name?: string
  inputTypes?: string[] | undefined
  reasoningEfforts?: Record<string, string | null> | undefined
  contextWindow?: number | undefined
  maxOutputTokens?: number | undefined
}

interface Provider {
  id: string
  name: string
  base: string
  models: ProviderModel[]
  retry: Retry
  key_configured: boolean
  format: string
}

interface Account {
  signed_in: boolean
  ready: boolean
  username: string
  display_name?: string
  avatar_url?: string
  request_count?: number | null
  access_token_ready: boolean
  providers: Provider[]
}

/** 编辑器草稿：密钥留空表示"保持已存的那把"。 */
interface Draft {
  name: string
  base: string
  key: string
  retry: Retry
  models: ProviderModel[]
}

async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(method === 'GET' ? { signal: AbortSignal.timeout(15_000) } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
  return result
}

const message = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason)

function useAccount() {
  const [account, setAccount] = useState<Account>()
  const [error, setError] = useState('')
  const onError = (reason: unknown) => setError(message(reason))
  const refresh = () => void request<Account>('/account').then(next => {
    setAccount(next)
    setError('')
  }, onError)
  const update = (next: Account) => {
    setAccount(next)
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

/** 凭据库里的键名，与 account/lib/platform.js 的 credentialName 同一规则。 */
function credentialName(id: string): string {
  return `VEXNAR_${id.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_API_KEY`
}

/* ── 图标（12/14px 线性，与 dsh 的图标同一笔画粗细） ───────────────────── */

function PlusIcon({ size = 12 }: { size?: number }): ReactNode {
  return <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
}

function GripIcon(): ReactNode {
  return <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
    {[2, 6, 10].map(y => <Fragment key={y}>
      <circle cx="2.5" cy={y} r="1.1" />
      <circle cx="7.5" cy={y} r="1.1" />
    </Fragment>)}
  </svg>
}

function TrashIcon(): ReactNode {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M2.5 3.75h9M5.5 3.75V2.5h3v1.25M3.5 3.75l.5 7.25h6l.5-7.25M5.75 6v3M8.25 6v3"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
}

function EyeIcon({ open }: { open: boolean }): ReactNode {
  return open
    ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="1.75" stroke="currentColor" strokeWidth="1.2" />
    </svg>
    : <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 8s2.4-4 6.5-4c1.1 0 2.1.3 3 .8M14.5 8s-2.4 4-6.5 4c-1.1 0-2.1-.3-3-.8M2.5 2.5l11 11"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      />
    </svg>
}

/* ── 个人资料 ───────────────────────────────────────────────────────────── */

const statValue = (value: number | null | undefined): string =>
  typeof value === 'number' ? value.toLocaleString('zh-CN') : '—'

function Avatar({ account }: { account: Account | undefined }): ReactNode {
  const [failed, setFailed] = useState('')
  const url = account?.avatar_url
  const name = account?.display_name || account?.username || 'V'
  return <span className="vxa-avatar" aria-hidden="true">
    {url && url !== failed
      ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => { setFailed(url) }} />
      : Array.from(name).slice(0, 2).join('').toUpperCase()}
  </span>
}

function Wallet({ compact = false }: { compact?: boolean }): ReactNode {
  const [wallet, setWallet] = useState<AccountWallet>()
  const [error, setError] = useState('')
  useEffect(() => {
    let generation = 0
    const refresh = () => {
      const current = ++generation
      void request<AccountWallet>('/wallet').then((value) => {
        if (generation !== current) return
        setWallet(value)
        setError('')
      }, (reason: unknown) => {
        if (generation === current) setError(message(reason))
      })
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener(accountEvent, refresh)
    return () => {
      generation++
      window.removeEventListener('focus', refresh)
      window.removeEventListener(accountEvent, refresh)
    }
  }, [])
  const main = wallet?.platform
  const deepseek = wallet?.deepseek
  const balance = main?.amount != null
    ? `${main.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${main.currency}`
    : main?.quota != null ? `${statValue(main.quota)} 额度` : '—'
  const billing = main?.url || platform + '/wallet'

  return <div className="vxa-wallet">
    <div className="vxa-wallet-row">
      <div><strong>希灵 AI 余额</strong><div className="vxa-wallet-value">{wallet || error ? balance : '读取中…'}</div></div>
      <a className="vxa-btn" href={billing} target="_blank" rel="noopener noreferrer">希灵 AI 充值</a>
    </div>
    {main?.error && <p className="vxa-hint" role="status">{main.error}</p>}
    <div className="vxa-wallet-row">
      <div><strong>DeepSeek 余额</strong>
        <div className="vxa-wallet-value">{deepseek === undefined ? (error ? '—' : '读取中…')
          : deepseek.status === 'ready' ? deepseek.balances.map(item => `${item.total} ${item.currency}`).join(' / ')
          : deepseek.status === 'unconfigured' ? '请先添加 DeepSeek 官方模型' : '暂时无法读取'}</div>
      </div>
      <a className="vxa-btn" href="https://platform.deepseek.com/top_up" target="_blank" rel="noopener noreferrer">DeepSeek 充值</a>
    </div>
    <div className="vxa-wallet-row">
      <strong>希灵 AI 订阅</strong>
      <a className="vxa-btn" href={billing} target="_blank" rel="noopener noreferrer">购买订阅</a>
    </div>
    {!compact && main && <div>
      {main.methods.length > 0 && <p className="vxa-hint">平台充值方式 {main.methods.join('、')}</p>}
      {main.plans.length > 0 && <ul className="vxa-wallet-plans">{main.plans.map((plan) =>
        <li key={plan.id}>
          <span>{plan.title}</span><span>{plan.price} {plan.currency}{plan.duration && ` / ${plan.duration}`}</span>
        </li>)}</ul>}
      {main.subscriptions.map((subscription, index) => <p className="vxa-hint" key={`${subscription.id}-${index}`}>
        {main.plans.find(plan => plan.id === subscription.id)?.title || '当前订阅'} ·
        {subscription.remaining === null ? ' 不限额' : ` 剩余 ${statValue(subscription.remaining)} 额度`} ·
        {new Date(subscription.ends * 1000).toLocaleDateString('zh-CN')} 到期
      </p>)}
    </div>}
    {error && <p className="vxa-error" role="alert">{error}</p>}
  </div>
}

function AccountLauncher({ wide, openSettings }: { wide: boolean; openSettings: (section?: string) => void }): ReactNode {
  const { account } = useAccount()
  const label = account?.display_name || account?.username || '希灵 AI'
  const [position, setPosition] = useState<{ left: number; bottom: number }>()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!position) return
    const close = () => setPosition(undefined)
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', close)
    }
  }, [position])
  return <div className="vxa-launcher" ref={root} data-wide={wide}>
    <button type="button" className="vxa-launcher-trigger" ref={trigger} aria-label={label}
      aria-expanded={position !== undefined} onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        setPosition(position ? undefined : {
          left: Math.max(8, Math.min(bounds.left, window.innerWidth - 308)),
          bottom: window.innerHeight - bounds.top + 8
        })
      }}>
      <Avatar account={account} />
      {wide && <><span className="vxa-launcher-name">{label}</span><span aria-hidden="true">⌄</span></>}
    </button>
    {position && <div className="vxa-launcher-popover" style={position} aria-label="账户余额" role="region">
      <Wallet compact />
      <div className="vxa-launcher-actions">
        <button type="button" className="vxa-btn" onClick={() => {
          setPosition(undefined)
          openSettings()
        }}>设置</button>
        <button type="button" className="vxa-btn" onClick={() => {
          setPosition(undefined)
          openSettings('vexnar-account')
        }}>账户详情</button>
      </div>
    </div>}
  </div>
}

/**
 * 个人资料：Codex 的版式——深青渐变身份卡 + 四项统计 + 平台卡片 + 退出登录。
 *
 * 这里刻意不列模型：模型列表属于「模型」页，个人资料只回答"我是谁、平台还通不通"。
 */
export function AccountSection(): ReactNode {
  const { account, error, onError } = useAccount()
  const [busy, setBusy] = useState(false)

  const logout = async () => {
    setBusy(true)
    try {
      await request<Account>('/account', 'DELETE')
      window.location.replace('/')
    } catch (reason) {
      onError(reason)
    } finally {
      setBusy(false)
    }
  }

  if (account === undefined) {
    return <div className="vxa-panel" role="status">{error || '正在读取 VEXNAR 个人资料…'}</div>
  }

  const provider = account.providers.find(item => item.id === platformProviderID)
  const displayName = account.display_name || account.username
  const stats = [
    { name: '平台模型', value: statValue(provider?.models.length ?? 0) },
    { name: '模型协议', value: 'Responses' },
    { name: '平台访问令牌', value: account.access_token_ready ? '已配置' : '未配置' },
    { name: '平台累计请求', value: statValue(account.request_count) }
  ]

  return <div className="vxa-profile">
    <div className="vxa-profile-head">
      <Avatar account={account} />
      <div className="vxa-profile-id">
        <h2 className="vxa-profile-name">{displayName}</h2>
        <span className="vxa-profile-handle">@{account.username}</span>
      </div>
      <a className="vxa-btn vxa-btn-ghost" href={platform + '/profile'} target="_blank" rel="noreferrer">
        管理平台账户
      </a>
    </div>
    <dl className="vxa-stats">
      {stats.map(({ name, value }) => <div className="vxa-stat" key={name}>
        <dt>{name}</dt>
        <dd>{value}</dd>
      </div>)}
    </dl>
    <Wallet />
    <div className="vxa-panel">
      <span className="vxa-panel-title">HXSEC AI Platform</span>
      <div className="vxa-panel-meta">
        <code>{provider?.base ?? 'https://api.sec.hn.cn/v1'}</code>
        <a href={docs} target="_blank" rel="noreferrer">API 文档</a>
      </div>
    </div>
    <div>
      <button type="button" className="vxa-btn" disabled={busy} onClick={() => void logout()}>退出登录</button>
    </div>
    {error !== '' && <p className="vxa-error" role="alert">{error}</p>}
  </div>
}

/* ── 模型能力 ───────────────────────────────────────────────────────────── */

/** 推理档位与 dsh 模型配置一致，关闭档位由编辑器单独处理。 */
const REASONING_LEVELS: readonly { level: string; label: string }[] = [
  { level: 'minimal', label: '极低' },
  { level: 'low', label: '低' },
  { level: 'medium', label: '中' },
  { level: 'high', label: '高' },
  { level: 'xhigh', label: '极高' },
  { level: 'max', label: '最大' }
]

const INPUT_TYPES: readonly { id: string; label: string }[] = [
  { id: 'text', label: '文本' },
  { id: 'image', label: '图像' }
]

/**
 * 一行模型的「能力」：输入类型、推理档位、上下文与输出上限。
 *
 * dsh 原生的模型编辑器有这几项，VEXNAR 的模型页以前只编辑 id 与显示名，
 * 手写提供方的模型就只能按适配器默认跑。账号插件保存这些字段并同步到 llm-pi-ai。
 */
function ModelCapability(
  { model, disabled, onChange }: { model: ProviderModel; disabled: boolean; onChange: (next: ProviderModel) => void }
): ReactNode {
  const effortOn = model.reasoningEfforts !== undefined
  const patch = (changes: Partial<ProviderModel>): void => { onChange({ ...model, ...changes }) }

  const toggleInput = (id: string, on: boolean): void => {
    const current = new Set(model.inputTypes ?? [])
    if (on) current.add(id)
    else current.delete(id)
    const ordered = INPUT_TYPES.map((entry) => entry.id).filter((entry) => current.has(entry))
    patch(ordered.length === 0 ? { inputTypes: undefined } : { inputTypes: ordered })
  }

  const setEffort = (level: string, value: string): void => {
    const next: Record<string, string | null> = { ...(model.reasoningEfforts ?? {}) }
    if (value.trim() === '') delete next[level]
    else next[level] = value
    patch({ reasoningEfforts: next })
  }

  return <div className="vxa-capability">
    <div className="vxa-capability-row">
      <span className="vxa-capability-label">输入类型</span>
      <span className="vxa-capability-values">
        {INPUT_TYPES.map((entry) => <label key={entry.id} className="vxa-check">
          <input
            type="checkbox"
            checked={(model.inputTypes ?? []).includes(entry.id)}
            disabled={disabled}
            onChange={(event) => { toggleInput(entry.id, event.target.checked) }}
          />
          {entry.label}
        </label>)}
      </span>
    </div>

    <div className="vxa-capability-row">
      <span className="vxa-capability-label">推理档位</span>
      <span className="vxa-capability-values">
        <label className="vxa-check">
          <input
            type="checkbox"
            checked={effortOn}
            disabled={disabled}
            onChange={(event) => {
              patch({ reasoningEfforts: event.target.checked
                ? { off: null, low: 'low', medium: 'medium', high: 'high' }
                : undefined })
            }}
          />
          支持推理
        </label>
        {effortOn && REASONING_LEVELS.map((entry) => <input
          key={entry.level}
          className="vxa-input vxa-input-tiny"
          value={model.reasoningEfforts?.[entry.level] ?? ''}
          aria-label={`推理档位 ${entry.label} 的上游取值`}
          placeholder="未启用"
          disabled={disabled}
          onChange={(event) => { setEffort(entry.level, event.target.value) }}
        />)}
      </span>
    </div>

    <div className="vxa-capability-row">
      <span className="vxa-capability-label">上限</span>
      <span className="vxa-capability-values">
        <input
          className="vxa-input vxa-input-num"
          inputMode="numeric"
          value={model.contextWindow === undefined ? '' : String(model.contextWindow)}
          aria-label="上下文窗口"
          placeholder="上下文窗口"
          disabled={disabled}
          onChange={(event) => {
            const digits = event.target.value.replace(/[^0-9]/g, '')
            patch({ contextWindow: digits === '' ? undefined : Number(digits) })
          }}
        />
        <input
          className="vxa-input vxa-input-num"
          inputMode="numeric"
          value={model.maxOutputTokens === undefined ? '' : String(model.maxOutputTokens)}
          aria-label="单次输出上限"
          placeholder="输出上限"
          disabled={disabled}
          onChange={(event) => {
            const digits = event.target.value.replace(/[^0-9]/g, '')
            patch({ maxOutputTokens: digits === '' ? undefined : Number(digits) })
          }}
        />
      </span>
    </div>
  </div>
}

/* ── 模型目录编辑器 ─────────────────────────────────────────────────────── */

function ModelCatalog(
  { models, disabled, onChange }: { models: ProviderModel[]; disabled: boolean; onChange: (next: ProviderModel[]) => void }
): ReactNode {
  const [dragging, setDragging] = useState<number>()
  const [over, setOver] = useState<number>()
  const [capability, setCapability] = useState<number>()

  const edit = (index: number, patch: Partial<ProviderModel>): void => {
    onChange(models.map((model, current) => current === index ? { ...model, ...patch } : model))
  }

  const move = (from: number, to: number): void => {
    if (from === to) return
    const next = [...models]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)
    onChange(next)
  }

  const drop = (event: DragEvent<HTMLLIElement>, index: number): void => {
    event.preventDefault()
    if (dragging !== undefined) move(dragging, index)
    setDragging(undefined)
    setOver(undefined)
  }

  return <div className="vxa-catalog">
    <div className="vxa-catalog-head">
      <span className="vxa-catalog-title">模型目录</span>
      <span className="vxa-hint">{models.length} 个模型</span>
    </div>
    <ul className="vxa-model-list">
      {models.map((model, index) => <li
        key={index}
        className="vxa-model-entry"
        {...(dragging === index ? { 'data-dragging': '1' } : {})}
        {...(over === index && dragging !== undefined && dragging !== index ? { 'data-drop': '1' } : {})}
        onDragOver={(event) => { event.preventDefault(); setOver(index) }}
        onDragLeave={() => { setOver(undefined) }}
        onDrop={(event) => { drop(event, index) }}
      >
        <div className="vxa-model-row">
          <button
            type="button"
            className="vxa-drag"
            draggable
            disabled={disabled || models.length < 2}
            aria-label="调整模型顺序"
            title="拖动排序"
            onDragStart={() => { setDragging(index) }}
            onDragEnd={() => { setDragging(undefined); setOver(undefined) }}
          >
            <GripIcon />
          </button>
          <input
            className="vxa-input vxa-input-mono"
            value={model.id}
            placeholder="模型 ID"
            aria-label="模型 ID"
            disabled={disabled}
            onChange={(event) => { edit(index, { id: event.target.value }) }}
          />
          <input
            className="vxa-input"
            value={model.name ?? ''}
            placeholder="留空时使用模型 ID"
            aria-label="显示名称"
            disabled={disabled}
            onChange={(event) => {
              const name = event.target.value
              onChange(models.map((item, current) => {
                if (current !== index) return item
                const { name: _previous, ...rest } = item
                return name === '' ? rest : { ...rest, name }
              }))
            }}
          />
          <button
            type="button"
            className="vxa-icon vxa-icon-danger"
            aria-label="删除模型"
            disabled={disabled}
            onClick={() => { onChange(models.filter((_, current) => current !== index)) }}
          >
            <TrashIcon />
          </button>
        </div>
        <button
          type="button"
          className="vxa-model-more"
          aria-expanded={capability === index}
          disabled={disabled}
          onClick={() => { setCapability((current) => current === index ? undefined : index) }}
        >
          {capability === index ? '收起能力' : '能力'}
        </button>
        {capability === index && <ModelCapability
          model={model}
          disabled={disabled}
          onChange={(next) => { onChange(models.map((item, current) => current === index ? next : item)) }}
        />}
      </li>)}
    </ul>
    <button
      type="button"
      className="vxa-add-model"
      disabled={disabled}
      onClick={() => { onChange([...models, { id: '' }]) }}
    >
      <PlusIcon />
      添加模型
    </button>
  </div>
}

/* ── 提供方编辑器（行内展开） ───────────────────────────────────────────── */

interface EditorProps {
  provider: Provider
  busy: boolean
  onCancel: () => void
  onSave: (draft: Draft) => void
}

function ProviderEditor({ provider, busy, onCancel, onSave }: EditorProps): ReactNode {
  const [draft, setDraft] = useState<Draft>(() => ({
    name: provider.name,
    base: provider.base,
    key: '',
    retry: provider.retry,
    models: provider.models.map(model => ({ ...model }))
  }))
  const [reveal, setReveal] = useState(false)
  const [failure, setFailure] = useState('')

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft(current => ({ ...current, [key]: value }))
  }

  const submit = (): void => {
    const models = draft.models
      .map(model => model.id.trim() === '' ? undefined : model.name === undefined ? { id: model.id.trim() } : { id: model.id.trim(), name: model.name })
      .filter((model): model is ProviderModel => model !== undefined)
    if (models.length === 0) {
      setFailure('模型目录至少需要一个模型 ID。')
      return
    }
    if (new Set(models.map(model => model.id)).size !== models.length) {
      setFailure('模型 ID 不能重复。')
      return
    }
    if (draft.key !== '' && /\s/.test(draft.key)) {
      setFailure('API 密钥不能包含空格。')
      return
    }
    setFailure('')
    onSave({ ...draft, models })
  }

  return <div className="vxa-editor">
    <div className="vxa-editor-head">
      <span className="vxa-editor-title">{provider.name}</span>
      <span className="vxa-editor-route">
        {provider.id.startsWith('custom-') ? '自定义 · OpenAI 兼容' : provider.id}
      </span>
    </div>

    <label className="vxa-field">
      <span className="vxa-label">
        API 密钥
        <button
          type="button"
          className="vxa-help"
          aria-label="密钥说明"
          title={`密钥保存在本机凭据库（${credentialName(provider.id)}），模型请求时由 dsh 解析，不写进设置文件。`}
        >?</button>
      </span>
      <div className="vxa-key">
        <input
          className="vxa-input vxa-input-mono"
          type={reveal ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={draft.key}
          placeholder={provider.key_configured ? '留空则保持已保存的密钥' : '输入 API 密钥'}
          aria-label="API 密钥"
          disabled={busy}
          onChange={(event) => { set('key', event.target.value) }}
        />
        <button
          type="button"
          className="vxa-key-toggle"
          aria-label={reveal ? '隐藏密钥' : '显示密钥'}
          onClick={() => { setReveal(current => !current) }}
        >
          <EyeIcon open={reveal} />
        </button>
      </div>
      <span className={provider.key_configured ? 'vxa-hint vxa-hint-ok' : 'vxa-hint'}>
        {provider.key_configured
          ? '已保存密钥；留空保存即沿用。'
          : '尚未保存密钥，必须填写后才能调用模型。'}
      </span>
    </label>

    <label className="vxa-field">
      <span className="vxa-label">显示名称</span>
      <input
        className="vxa-input"
        value={draft.name}
        placeholder={provider.id}
        aria-label="显示名称"
        disabled={busy}
        onChange={(event) => { set('name', event.target.value) }}
      />
    </label>

    <details className="vxa-fold" open>
      <summary className="vxa-fold-summary">自定义设置</summary>
      <div className="vxa-fold-body">
        <label className="vxa-field">
          <span className="vxa-label">API 地址</span>
          <input
            className="vxa-input vxa-input-mono"
            value={draft.base}
            placeholder="https://api.example.com/v1"
            aria-label="API 地址"
            disabled={busy}
            onChange={(event) => { set('base', event.target.value) }}
          />
          <span className="vxa-hint">兼容 OpenAI chat/completions 的根地址；改动后会向上游重新验证一次。</span>
        </label>
        <label className="vxa-field">
          <span className="vxa-label">重试策略</span>
          <select
            className="vxa-input vxa-select"
            value={draft.retry}
            aria-label="重试策略"
            disabled={busy}
            onChange={(event) => { set('retry', event.target.value === 'always' ? 'always' : 'normal') }}
          >
            <option value="normal">默认（仅临时错误）</option>
            <option value="always">所有错误</option>
          </select>
          <span className="vxa-hint">
            {draft.retry === 'always'
              ? '失败的请求会持续重试，直到成功或本轮被停止。'
              : '只重试限流、超时、服务端与网络这类临时错误，最多 5 次。'}
          </span>
        </label>
      </div>
    </details>

    <ModelCatalog
      models={draft.models}
      disabled={busy}
      onChange={(models) => { set('models', models) }}
    />

    {failure !== '' && <p className="vxa-error" role="alert">{failure}</p>}

    <div className="vxa-editor-footer">
      <button type="button" className="vxa-btn" disabled={busy} onClick={onCancel}>取消</button>
      <button type="button" className="vxa-btn-primary" disabled={busy} onClick={submit}>
        {busy ? '保存中…' : '保存'}
      </button>
    </div>
  </div>
}

/* ── 添加提供方 ─────────────────────────────────────────────────────────── */

interface AddProps {
  busy: boolean
  error: string
  onClearError: () => void
  onCancel: () => void
  onSubmit: (input: {
    kind: 'deepseek' | 'custom'
    name: string
    base: string
    key: string
    models: ProviderModel[]
  }) => void
}

function AddProviderCard({ busy, error, onClearError, onCancel, onSubmit }: AddProps): ReactNode {
  const [kind, setKind] = useState<'deepseek' | 'custom'>('deepseek')
  const [name, setName] = useState('')
  const [base, setBase] = useState('')
  const [key, setKey] = useState('')
  const [models, setModels] = useState<ProviderModel[]>([])
  const [failure, setFailure] = useState('')

  const changeKind = (next: typeof kind): void => {
    if (next === kind) return
    setKind(next)
    setKey('')
    setFailure('')
    onClearError()
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onClearError()
    if (key.trim() === '') {
      setFailure('请输入 API 密钥。')
      return
    }
    if (kind === 'custom' && (name.trim() === '' || base.trim() === '')) {
      setFailure('请填写名称与 API 地址。')
      return
    }
    if (kind === 'custom' && models.some((model) => model.id.trim() === '')) {
      setFailure('请填写每一行的模型 ID。')
      return
    }
    setFailure('')
    onSubmit({ kind, name: name.trim(), base: base.trim(), key: key.trim(), models: kind === 'custom' ? models : [] })
  }

  return <form className="vxa-add-card" onSubmit={submit}>
    <div className="vxa-modes" role="group" aria-label="添加方式">
      <button
        type="button"
        className="vxa-mode"
        aria-pressed={kind === 'deepseek'}
        disabled={busy}
        onClick={() => { changeKind('deepseek') }}
      >DeepSeek 官方</button>
      <button
        type="button"
        className="vxa-mode"
        aria-pressed={kind === 'custom'}
        disabled={busy}
        onClick={() => { changeKind('custom') }}
      >自定义模型 API</button>
    </div>

    {kind === 'custom'
      ? <>
        <label className="vxa-field">
          <span className="vxa-label">名称</span>
          <input
            className="vxa-input"
            value={name}
            placeholder="中转站、自建网关或服务商名称"
            aria-label="名称"
            disabled={busy}
            onChange={(event) => { setName(event.target.value) }}
          />
        </label>
        <label className="vxa-field">
          <span className="vxa-label">API 地址</span>
          <input
            className="vxa-input vxa-input-mono"
            value={base}
            placeholder="https://api.example.com/v1"
            aria-label="API 地址"
            disabled={busy}
            onChange={(event) => { setBase(event.target.value) }}
          />
          <span className="vxa-hint">填写 OpenAI 兼容 API 根地址或完整的 chat/completions 地址。</span>
        </label>
      </>
      : <span className="vxa-hint">DeepSeek 官方端点 https://api.deepseek.com，只需填 API 密钥。</span>}

    <label className="vxa-field">
      <span className="vxa-label">API 密钥</span>
      <input
        className="vxa-input vxa-input-mono"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={key}
        placeholder="sk-…"
        aria-label="API 密钥"
        disabled={busy}
        onChange={(event) => { setKey(event.target.value) }}
      />
    </label>

    {kind === 'custom' && <>
      <span className="vxa-hint">留空会读取上游模型列表。也可手动填写模型 ID，保存前会向第一个模型发送一条测试请求。</span>
      <ModelCatalog models={models} disabled={busy} onChange={setModels} />
    </>}

    {(failure || error) !== '' && <p className="vxa-error" role="alert">{failure || error}</p>}

    <div className="vxa-editor-footer">
      <button type="button" className="vxa-btn" disabled={busy} onClick={onCancel}>取消</button>
      <button type="submit" className="vxa-btn-primary" disabled={busy}>
        {busy ? '验证中…' : '添加'}
      </button>
    </div>
  </form>
}

/* ── 模型页 ─────────────────────────────────────────────────────────────── */

/**
 * 模型页：账号行 + 提供方行 + 虚线添加入口，编辑器在行内展开。
 *
 * 结构与 dsh 原生的 `settings.models` 一致（同一套行卡片、同一套编辑器层），数据
 * 走 VEXNAR 自己的 `/vexnar-api/platform/providers`：提供方只有在平台签发或用户
 * 填入可用的密钥、且能读出模型目录时才会出现——页面上没有"假行"。
 */
export function ModelsSection(): ReactNode {
  const { account, error, onError, update } = useAccount()
  const [editing, setEditing] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState<string>()
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (account === undefined) {
    return <div className="vxa-section" role="status">{error || '正在读取模型提供方…'}</div>
  }
  if (!account.signed_in) {
    return <div className="vxa-section">
      <h2 className="vxa-title">模型</h2>
      <p className="vxa-intro">请先登录 VEXNAR，再管理模型提供方。</p>
      {error !== '' && <p className="vxa-error" role="alert">{error}</p>}
    </div>
  }

  const platformRoute = account.providers.find(provider => provider.id === platformProviderID)
  const editable = account.providers.filter(provider => provider.id !== platformProviderID)

  const run = async (action: () => Promise<Account>) => {
    setBusy(true)
    onError('')
    try {
      update(await action())
      return true
    } catch (reason) {
      onError(reason)
      return false
    } finally {
      setBusy(false)
    }
  }

  return <div className="vxa-section">
    <h2 className="vxa-title">模型</h2>
    <p className="vxa-intro">填入各提供商的 API 密钥即可使用其模型。</p>

    <ul className="vxa-rows">
      <li className="vxa-row">
        <div className="vxa-row-head">
          <span className="vxa-row-identity">
            <span className="vxa-row-name">希灵AI Platform</span>
            <span className="vxa-account-status">
              <span className="vxa-dot" aria-hidden="true" />
              已登录
            </span>
          </span>
          <span className="vxa-row-actions">
            <button
              type="button"
              className="vxa-row-quiet"
              aria-expanded={catalogOpen}
              onClick={() => { setCatalogOpen(current => !current) }}
            >
              {platformRoute === undefined ? '平台未签发模型' : `${platformRoute.models.length} 个模型`}
            </button>
          </span>
        </div>
        {catalogOpen && platformRoute !== undefined && <ul className="vxa-catalog-plain">
          {platformRoute.models.map(model => <li key={model.id} title={model.id}>{model.name || model.id}</li>)}
        </ul>}
      </li>

      {editable.map((provider) => {
        const open = editing === provider.id
        return <li className="vxa-row" key={provider.id}>
          <div className="vxa-row-head">
            <span className="vxa-row-identity">
              <span className="vxa-row-name">{provider.name}</span>
              {provider.id.startsWith('custom-') && <span className="vxa-row-tag">自定义</span>}
              <span
                className={provider.key_configured ? 'vxa-dot' : 'vxa-dot vxa-dot-missing'}
                role="img"
                aria-label={provider.key_configured ? 'API 密钥已配置' : 'API 密钥缺失'}
                title={provider.key_configured ? 'API 密钥已配置' : 'API 密钥缺失'}
              />
            </span>
            <span className="vxa-row-actions">
              {confirming === provider.id
                ? <>
                  <button
                    type="button"
                    className="vxa-btn-sm vxa-btn-sm-danger"
                    disabled={busy}
                    onClick={() => {
                      void run(() => request<Account>('/providers', 'DELETE', { id: provider.id }))
                        .then((done) => { if (done) setConfirming(undefined) })
                    }}
                  >确认删除</button>
                  <button type="button" className="vxa-btn-sm" disabled={busy} onClick={() => { setConfirming(undefined) }}>
                    取消
                  </button>
                </>
                : <>
                  <button
                    type="button"
                    className="vxa-btn-sm"
                    disabled={busy}
                    aria-label={`编辑 ${provider.name}`}
                    onClick={() => {
                      setAdding(false)
                      setConfirming(undefined)
                      setEditing(open ? undefined : provider.id)
                    }}
                  >编辑</button>
                  <button
                    type="button"
                    className="vxa-btn-sm vxa-btn-sm-danger"
                    disabled={busy}
                    aria-label={`删除 ${provider.name}`}
                    onClick={() => {
                      setEditing(undefined)
                      setConfirming(provider.id)
                    }}
                  >删除</button>
                </>}
            </span>
          </div>
          {open && <ProviderEditor
            provider={provider}
            busy={busy}
            onCancel={() => { setEditing(undefined) }}
            onSave={(draft) => {
              void run(() => request<Account>('/providers', 'PATCH', {
                id: provider.id,
                name: draft.name,
                base_url: draft.base,
                api_key: draft.key,
                retry: draft.retry,
                models: draft.models
              })).then((done) => { if (done) setEditing(undefined) })
            }}
          />}
        </li>
      })}
    </ul>

    <div className="vxa-add-block">
      {adding
        ? <AddProviderCard
          busy={busy}
          error={error}
          onClearError={() => { onError('') }}
          onCancel={() => { setAdding(false); onError('') }}
          onSubmit={(input) => {
            void run(() => request<Account>('/providers', 'POST', {
              kind: input.kind,
              name: input.name,
              base_url: input.base,
              api_key: input.key,
              models: input.models
            })).then((done) => { if (done) setAdding(false) })
          }}
        />
        : <button
          type="button"
          className="vxa-btn-add"
          disabled={busy}
          onClick={() => {
            setEditing(undefined)
            setConfirming(undefined)
            onError('')
            setAdding(true)
          }}
        >
          <PlusIcon size={14} />
          添加模型提供商
        </button>}
    </div>

    {!adding && error !== '' && <p className="vxa-error" role="alert">{error}</p>}
  </div>
}

/* ── 注册 ───────────────────────────────────────────────────────────────── */

export function apply(ctx: {
  slots: {
    inject: (name: string, register: () => unknown) => void
    register: (options: { name: string; id?: string; label?: string; order?: number }, component: unknown) => unknown
  }
}): void {
  installAccountStyles()
  ctx.slots.inject('settings.launcher', () => ctx.slots.register({ name: 'settings.launcher' }, AccountLauncher))
  ctx.slots.inject('settings.section', () => {
    ctx.slots.register({ name: 'settings.section', id: 'vexnar-account', label: '个人资料', order: -100 }, AccountSection)
    return ctx.slots.register({ name: 'settings.section', id: 'models', label: '模型', order: 10 }, ModelsSection)
  })
}

export const inject = ['slots']
export default { name: '@vexnar/dsh-account', inject, apply }

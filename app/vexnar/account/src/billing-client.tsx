// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement as h, Fragment, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { BillingOptions, BillingOrder, BillingQuote, BillingSelection, BillingStatus } from './billing-types.js'

type API = <T>(path: string, method?: string, body?: object) => Promise<T>
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)

export function AppDialog({ title, onClose, children, busy = false, narrow = false }: {
  title: string
  onClose: () => void
  children: ReactNode
  busy?: boolean
  narrow?: boolean
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])
  return <dialog ref={dialog} className="vxa-payment-dialog" data-narrow={narrow} aria-label={title}
    onCancel={event => { if (busy) event.preventDefault() }} onClose={onClose}>
    <header className="vxa-payment-head">
      <h2>{title}</h2>
      <button type="button" className="vxa-btn" aria-label={`关闭${title}`} disabled={busy}
        onClick={() => { dialog.current?.close() }}>关闭</button>
    </header>
    {children}
  </dialog>
}

function Loading({ children }: { children: string }): ReactNode {
  return <div className="vxa-payment-loading" role="status"><span aria-hidden="true" />{children}</div>
}

function sendToCashier(formTarget: string, checkout: BillingOrder['checkout']): void {
  if (!checkout.fields) return
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = checkout.url
  form.target = formTarget
  form.hidden = true
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.append(input)
  }
  document.body.append(form)
  try { HTMLFormElement.prototype.submit.call(form) } finally { form.remove() }
}

function Cashier({ order, requestID, request, onPaid }: {
  order: BillingOrder
  requestID: string
  request: API
  onPaid: () => void
}): ReactNode {
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<BillingStatus>('pending')
  const [delay, setDelay] = useState(false)
  const [checkingFailed, setCheckingFailed] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const submitted = useRef(false)
  const name = `vexnar-payment-${requestID}`

  useEffect(() => {
    if (!submitted.current && order.checkout.fields && frame.current) {
      submitted.current = true
      sendToCashier(name, order.checkout)
    }
    const timer = window.setTimeout(() => setDelay(true), 8_000)
    return () => window.clearTimeout(timer)
  }, [name, order])

  useEffect(() => {
    if (!order.canCheckStatus) return
    let live = true
    let timer = 0
    const deadline = Date.now() + 10 * 60_000
    const check = async () => {
      try {
        const result = await request<{ status: BillingStatus }>('/billing/status', 'POST', { request_id: requestID })
        if (!live) return
        setCheckingFailed(false)
        setStatus(result.status)
        if (result.status === 'paid') onPaid()
        if (result.status !== 'pending') return
      } catch {
        if (live) setCheckingFailed(true)
      }
      if (live && Date.now() < deadline) timer = window.setTimeout(() => { void check() }, 4_000)
      else if (live) setCheckingFailed(true)
    }
    timer = window.setTimeout(() => { void check() }, 3_000)
    return () => { live = false; window.clearTimeout(timer) }
  }, [order, requestID, request, onPaid])

  if (status === 'paid') return <p role="status" className="vxa-payment-success">支付成功，余额已刷新。</p>
  if (status === 'closed') return <p role="status" className="vxa-error">订单已关闭，请返回重新选择。</p>
  return <>
    {!loaded && <Loading>正在加载支付收银台…</Loading>}
    <iframe ref={frame} className="vxa-payment-frame" name={name} title="支付二维码或收银台"
      sandbox="allow-forms allow-scripts allow-same-origin"
      referrerPolicy="no-referrer"
      src={order.checkout.fields ? 'about:blank' : order.checkout.url}
      onLoad={() => {
        try {
          if (frame.current?.contentWindow?.location.href === 'about:blank') return
        } catch { /* the cross-origin checkout is isolated from VEXNAR */ }
        setLoaded(true)
      }} />
    {delay && <p className="vxa-hint">收银台若仍空白，支付渠道可能限制了应用内展示。</p>}
    {checkingFailed
      ? <p role="status" className="vxa-hint">暂未确认付款，请核对渠道结果，避免重复付款。</p>
      : order.canCheckStatus && <p role="status" className="vxa-hint">等待付款，到账后自动刷新。</p>}
    {!order.canCheckStatus && <button className="vxa-btn" type="button" onClick={onPaid}>刷新余额</button>}
  </>
}

export function RechargeDialog({ provider, request, onClose, onPaid }: {
  provider: 'xilin' | 'deepseek'
  request: API
  onClose: () => void
  onPaid: () => void
}): ReactNode {
  const [config, setConfig] = useState<BillingOptions>()
  const [mode, setMode] = useState<BillingSelection['kind']>('topup')
  const [method, setMethod] = useState('')
  const [amount, setAmount] = useState('')
  const [plan, setPlan] = useState(0)
  const [product, setProduct] = useState('')
  const [quote, setQuote] = useState<{ selection: string; value: BillingQuote }>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [quoteRevision, setQuoteRevision] = useState(0)
  const [cashier, setCashier] = useState<{ id: string; order?: BillingOrder; error?: string }>()
  const starting = useRef(false)

  useEffect(() => {
    if (provider !== 'xilin') return
    let active = true
    setError('')
    void request<BillingOptions>('/billing/options').then(next => {
      if (!active) return
      setConfig(next)
      const first = next.methods[0]
      setMethod(first?.id ?? '')
      setAmount(String(next.amounts.find(value => value >= (first?.minimum ?? 1)) ?? first?.minimum ?? ''))
      setProduct(first?.products?.[0]?.id ?? '')
      setPlan(next.plans[0]?.id ?? 0)
    }, reason => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [attempt, provider, request])

  const channels = config?.methods.filter(channel => mode === 'topup' || channel.subscriptions) ?? []
  const channel = channels.find(item => item.id === method) ?? channels[0]
  const numericAmount = Number(amount)
  const selection: BillingSelection | undefined = channel && (mode === 'subscription'
    ? plan > 0 ? { kind: mode, method: channel.id, plan } : undefined
    : channel.products ? product ? { kind: mode, method: channel.id, amount: 1, product } : undefined
      : /^\d+$/.test(amount) && Number.isSafeInteger(numericAmount) && numericAmount >= channel.minimum
        ? { kind: mode, method: channel.id, amount: numericAmount } : undefined)
  const selectionKey = selection ? JSON.stringify(selection) : ''
  const activeQuote = quote?.selection === selectionKey ? quote.value : undefined

  useEffect(() => {
    if (!selectionKey) return
    let active = true
    setError('')
    setQuote(undefined)
    const timer = window.setTimeout(() => {
      void request<BillingQuote>('/billing/quote', 'POST', JSON.parse(selectionKey)).then(value => {
        if (active) setQuote({ selection: selectionKey, value })
      }, reason => { if (active) setError(errorText(reason)) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [selectionKey, request, quoteRevision])

  const pay = () => {
    if (!selection || !activeQuote || starting.current) return
    starting.current = true
    const id = crypto.randomUUID()
    setCashier({ id })
    void request<BillingOrder>('/billing/order', 'POST', { ...selection, ...activeQuote, request_id: id }).then(
      order => setCashier({ id, order }),
      reason => setCashier({ id, error: errorText(reason) })
    ).finally(() => { starting.current = false })
  }

  const title = provider === 'xilin' ? '希灵 AI 充值' : 'DeepSeek 充值'
  const ordering = cashier !== undefined && !cashier.order && !cashier.error
  return <>
    <AppDialog title={title} onClose={onClose} narrow={provider === 'deepseek'}>
      {provider === 'deepseek' ? <p className="vxa-payment-note">DeepSeek 当前提供余额查询接口。应用内充值需要 DeepSeek 开放支付接口。</p>
        : !config ? error ? <><p className="vxa-error" role="alert">{error}</p>
          <button type="button" className="vxa-btn" onClick={() => setAttempt(value => value + 1)}>重新读取</button></>
          : <Loading>正在读取充值配置…</Loading>
          : <>
            <div role="group" aria-label="购买类型" className="vxa-payment-modes">
              <button type="button" className="vxa-btn" aria-pressed={mode === 'topup'} onClick={() => setMode('topup')}>额度充值</button>
              {config.plans.length > 0 && <button type="button" className="vxa-btn" aria-pressed={mode === 'subscription'}
                onClick={() => setMode('subscription')}>购买订阅</button>}
            </div>
            {mode === 'subscription' ? <div className="vxa-payment-options" role="group" aria-label="订阅套餐">
              {config.plans.map(item => <button className="vxa-pay-option" key={item.id} type="button"
                aria-pressed={plan === item.id} onClick={() => setPlan(item.id)}>
                <strong>{item.title}</strong><span>{item.price} {item.currency}</span>
              </button>)}
            </div> : channel?.products ? <div className="vxa-payment-options" role="group" aria-label="充值商品">
              {channel.products.map(item => <button className="vxa-pay-option" key={item.id} type="button"
                aria-pressed={product === item.id} onClick={() => setProduct(item.id)}>{item.name}</button>)}
            </div> : <>
              <div className="vxa-payment-options" role="group" aria-label="预设充值金额">
                {config.amounts.map(value => <button className="vxa-pay-option" key={value} type="button"
                  disabled={value < (channel?.minimum ?? 1)} aria-pressed={amount === String(value)}
                  onClick={() => setAmount(String(value))}>{value}</button>)}
              </div>
              <label className="vxa-field"><span className="vxa-label">充值金额</span>
                <input className="vxa-input" type="text" inputMode="numeric" value={amount}
                  onChange={event => setAmount(event.target.value)} />
                {channel && <span className="vxa-hint">最低充值金额 {channel.minimum}</span>}
              </label>
            </>}
            <div className="vxa-payment-channels" role="group" aria-label="支付渠道">
              {channels.map(item => <button key={item.id} type="button" className="vxa-btn" aria-pressed={channel?.id === item.id}
                onClick={() => { setMethod(item.id); setProduct(item.products?.[0]?.id ?? '') }}>{item.name}</button>)}
              {channels.length === 0 && <p className="vxa-hint">平台当前没有可用的支付渠道。</p>}
            </div>
            {error && <p className="vxa-error" role="alert">{error}</p>}
            <footer className="vxa-payment-total">
              <div>{activeQuote ? <>实付 <strong>{activeQuote.total} {activeQuote.currency}</strong></>
                : selection && !error ? <Loading>正在读取实付金额…</Loading> : '实付 —'}</div>
              <button type="button" className="vxa-btn-primary" disabled={!activeQuote || !!cashier} onClick={pay}>确认并打开收银台</button>
            </footer>
          </>}
    </AppDialog>
    {cashier && <AppDialog title="扫码支付" busy={ordering} narrow onClose={() => {
      if (cashier.error) {
        setQuote(undefined)
        setQuoteRevision(value => value + 1)
      }
      setCashier(undefined)
    }}>
      {ordering ? <Loading>正在创建订单…</Loading> : cashier.error
        ? <p className="vxa-error" role="alert">{cashier.error}</p>
        : cashier.order && <Cashier order={cashier.order} requestID={cashier.id} request={request} onPaid={onPaid} />}
    </AppDialog>}
  </>
}

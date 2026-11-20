// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserPlus
} from 'lucide-react'
import { BrandGlyph } from '@/components/brand'
import { Button } from '@/components/ui'
import { useT } from '@/lib/i18n'
import type {
  NewApiAuthProvider,
  NewApiExternalAuthInput,
  NewApiState
} from '@shared/contracts'
import { defaultNewApiAuthMethods } from '@shared/contracts'

const fieldClass =
  'flex h-9 w-full rounded-lg border border-line bg-bg px-3 text-[12.5px] text-ink outline-none transition-shadow placeholder:text-muted/70 focus:ring-2 focus:ring-accent/25 disabled:opacity-60'

const providerMarks: Record<string, string> = {
  github: 'GH',
  gitee: 'G',
  gitcode: 'AG',
  modelscope: 'MS',
  discord: 'D',
  linuxdo: 'LD',
  oidc: 'ID',
  telegram: 'TG',
  wechat: 'W'
}

function ProviderMark({ provider }: { provider: NewApiAuthProvider }): React.JSX.Element {
  const mark = providerMarks[provider.key] ?? provider.name.slice(0, 2).toUpperCase()
  const accent =
    provider.key === 'github'
      ? 'border-transparent bg-[#24292f] text-white'
      : 'border-line-soft bg-panel-2 text-ink-soft'
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border text-[8.5px] font-semibold tracking-[-0.02em] ${accent}`}
    >
      {mark}
    </span>
  )
}

function ProviderButton({
  provider,
  register,
  disabled,
  onClick
}: {
  provider: NewApiAuthProvider
  register: boolean
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${register ? '使用' : '继续使用'} ${provider.name}`}
      className="group flex h-9 w-full items-center gap-2.5 rounded-lg border border-line bg-panel px-3 text-left text-[12px] text-ink-soft transition-colors hover:bg-panel-2 hover:text-ink disabled:pointer-events-none disabled:opacity-45"
    >
      <ProviderMark provider={provider} />
      <span className="min-w-0 flex-1 truncate">
        {register ? `使用 ${provider.name} 注册` : `使用 ${provider.name} 登录`}
      </span>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

function ExternalWaiting({
  label,
  onCancel
}: {
  label: string
  onCancel: () => void
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-line-soft bg-panel px-4 py-4">
      <div className="flex items-center gap-2.5">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
        <span className="text-[12.5px] font-medium text-ink">正在等待{label}完成…</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-5 text-muted">
        已打开独立的安全窗口。请在该窗口完成登录或注册；如平台要求，请阅读并勾选服务条款，然后点击对应的登录方式。完成后
        VEXNAR 会自动返回并同步账户。
      </p>
      <Button variant="secondary" className="mt-3 h-8 w-full text-[11.5px]" onClick={onCancel}>
        取消并返回
      </Button>
    </div>
  )
}

export function LoginScreen({
  state,
  onChange
}: {
  state: NewApiState | null
  onChange: (state: NewApiState) => void
}): React.JSX.Element {
  const t = useT()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'register'>('login')

  const stage = state?.stage ?? 'checking'
  const verifying = stage === 'verification'
  const checking = !state || stage === 'checking'
  const external = state?.externalAuth ?? null
  const auth = state?.authMethods ?? defaultNewApiAuthMethods
  const providers = auth.providers
  const registering = mode === 'register'
  const message = localError ?? state?.error ?? null
  const methods = state?.verificationMethods ?? []
  const supportsCode =
    methods.length === 0 || methods.some((method) => /2fa|totp|two.?factor/i.test(method))
  const canRegister = auth.register && (auth.passwordRegister || providers.length > 0)
  const hasAlternateMethods = providers.length > 0 || auth.passkeyLogin

  const visibleProviders = useMemo(() => providers, [providers])

  const clearError = (): void => {
    setLocalError(null)
    if (state?.error) onChange({ ...state, error: null })
  }

  const openPlatform = async (): Promise<void> => {
    const result = await window.vexnar.newapi.openPlatform()
    if (!result.ok) setLocalError(result.error)
  }

  useEffect(() => {
    let alive = true
    const sync = async (): Promise<void> => {
      const result = await window.vexnar.newapi.authMethods()
      if (!alive) return
      if (result.ok) onChange(result.data)
    }
    const onFocus = (): void => {
      void sync()
    }
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(() => void sync(), 60_000)
    return () => {
      alive = false
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [onChange])

  useEffect(() => {
    if (!canRegister && mode === 'register') setMode('login')
  }, [canRegister, mode])

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (busy || external) return
    if (verifying) {
      if (!code.trim()) {
        setLocalError('请输入两步验证码')
        return
      }
      setBusy(true)
      setLocalError(null)
      const result = await window.vexnar.newapi.verify({ code: code.trim() })
      setBusy(false)
      if (result.ok) {
        onChange(result.data)
        setCode('')
      } else {
        setLocalError(result.error)
      }
      return
    }
    if (!username.trim() || !password) {
      setLocalError('请输入用户名和密码')
      return
    }
    setBusy(true)
    setLocalError(null)
    const result = await window.vexnar.newapi.login({
      username: username.trim(),
      password
    })
    setBusy(false)
    if (result.ok) {
      onChange(result.data)
      if (result.data.stage !== 'error') setPassword('')
    } else {
      setLocalError(result.error)
    }
  }

  const cancel = async (): Promise<void> => {
    const result = await window.vexnar.newapi.cancelLogin()
    if (result.ok) onChange(result.data)
    setCode('')
    setLocalError(null)
  }

  const startExternal = async (input: NewApiExternalAuthInput): Promise<void> => {
    if (busy || external) return
    setBusy(true)
    setLocalError(null)
    const result = await window.vexnar.newapi.externalAuth(input)
    setBusy(false)
    if (result.ok) onChange(result.data)
    else setLocalError(result.error)
  }

  const cancelExternal = async (): Promise<void> => {
    const result = await window.vexnar.newapi.cancelExternalAuth()
    if (result.ok) onChange(result.data)
    setLocalError(null)
  }

  const refreshMethods = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setLocalError(null)
    const result = await window.vexnar.newapi.authMethods()
    setBusy(false)
    if (result.ok) onChange(result.data)
    else setLocalError(result.error)
  }

  if (checking) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg text-muted">
        <div className="flex items-center gap-2 text-[12px]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('login.checking')}
        </div>
      </div>
    )
  }

  const renderProviders = (): React.JSX.Element | null => {
    if (visibleProviders.length === 0) return null
    return (
      <div className="space-y-2">
        {visibleProviders.map((provider) => (
          <ProviderButton
            key={provider.key}
            provider={provider}
            register={registering}
            disabled={busy || Boolean(external)}
            onClick={() => void startExternal({ kind: 'oauth', provider: provider.key })}
          />
        ))}
      </div>
    )
  }

  const renderLogin = (): React.JSX.Element => (
    <div className="space-y-4">
      {auth.passwordLogin ? (
        <form onSubmit={(event) => void submit(event)} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="newapi-username" className="text-[11.5px] font-medium text-ink-soft">
              通行证账号
            </label>
            <input
              id="newapi-username"
              className={fieldClass}
              value={username}
              onChange={(event) => {
                setUsername(event.target.value)
                clearError()
              }}
              autoComplete="username"
              placeholder="用户名或邮箱"
              autoFocus
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newapi-password" className="text-[11.5px] font-medium text-ink-soft">
              密码
            </label>
            <input
              id="newapi-password"
              className={fieldClass}
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                clearError()
              }}
              autoComplete="current-password"
              placeholder="请输入密码"
              disabled={busy}
            />
          </div>
          <Button type="submit" className="mt-1 h-9 w-full text-[12.5px]" disabled={busy}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LockKeyhole className="h-3.5 w-3.5" />
            )}
            {busy ? '正在登录…' : '登录通行证'}
          </Button>
        </form>
      ) : null}

      {auth.passwordLogin && hasAlternateMethods ? (
        <div className="flex items-center gap-3 text-[10.5px] text-muted">
          <span className="h-px flex-1 bg-line-soft" />
          <span>或使用其他方式</span>
          <span className="h-px flex-1 bg-line-soft" />
        </div>
      ) : null}

      {renderProviders()}

      {auth.passkeyLogin ? (
        <button
          type="button"
          disabled={busy || Boolean(external)}
          onClick={() => void startExternal({ kind: 'passkey' })}
          className="group flex h-9 w-full items-center gap-2.5 rounded-lg border border-line bg-panel px-3 text-left text-[12px] text-ink-soft transition-colors hover:bg-panel-2 hover:text-ink disabled:pointer-events-none disabled:opacity-45"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-line-soft bg-panel-2 text-accent">
            <KeyRound className="h-3 w-3" strokeWidth={2.1} />
          </span>
          <span className="min-w-0 flex-1 truncate">使用 Passkey 通行证登录</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ) : null}

      {!auth.passwordLogin && !hasAlternateMethods ? (
        <div className="rounded-lg border border-line-soft bg-panel px-3.5 py-3 text-[11.5px] leading-5 text-muted">
          平台暂未开放可用的桌面登录方式，请前往浏览器登录。
        </div>
      ) : null}
    </div>
  )

  const renderRegister = (): React.JSX.Element => (
    <div className="space-y-4">
      {auth.passwordRegister ? (
        <button
          type="button"
          disabled={busy || Boolean(external)}
          onClick={() => void startExternal({ kind: 'register' })}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-line bg-panel px-3 text-left text-[12px] text-ink-soft transition-colors hover:bg-panel-2 hover:text-ink disabled:pointer-events-none disabled:opacity-45"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-line-soft bg-panel-2 text-accent">
            <UserPlus className="h-3 w-3" strokeWidth={2.1} />
          </span>
          <span className="min-w-0 flex-1">创建通行证账号</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted" />
        </button>
      ) : null}

      {visibleProviders.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] leading-5 text-muted">
            使用第三方账号创建通行证，首次授权后会自动注册：
          </p>
          {renderProviders()}
        </div>
      ) : null}

      {!auth.passwordRegister && visibleProviders.length === 0 ? (
        <div className="rounded-lg border border-line-soft bg-panel px-3.5 py-3 text-[11.5px] leading-5 text-muted">
          平台已关闭密码注册，且暂未开放第三方注册方式。
        </div>
      ) : null}

      {auth.passwordRegister && auth.emailVerification ? (
        <p className="text-[10.5px] leading-[18px] text-muted">
          密码注册需要邮箱验证码，将在平台独立窗口中完成。
        </p>
      ) : null}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-bg">
      <header className="drag-region relative z-30 flex h-11 shrink-0 items-center gap-2.5 border-b border-line-soft bg-panel px-[84px] pr-3">
        <BrandGlyph className="h-4 w-4 text-accent" />
        <span className="text-[12px] font-semibold tracking-wide text-ink">VEXNAR</span>
        <span className="text-[11.5px] text-muted">/</span>
        <span className="text-[11.5px] text-ink-soft">HXSEC AI Platform</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="no-drag h-7 gap-1.5 px-2 text-[11px]"
            onClick={() => void openPlatform()}
          >
            <ExternalLink className="h-3 w-3" />
            在浏览器打开
          </Button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-[368px] pb-10">
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[15px] border border-line-soft bg-panel shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <BrandGlyph className="h-6 w-6 text-accent" />
            </div>
            <h1 className="text-[20px] font-semibold tracking-[-0.025em] text-ink">
              {verifying
                ? '两步验证'
                : registering
                  ? '注册 HXSEC 通行证'
                  : '登录 HXSEC 通行证'}
            </h1>
            <p className="mt-2 max-w-[330px] text-[12.5px] leading-5 text-muted">
              {verifying
                ? '请输入身份验证器中的验证码，完成后会自动同步账户。'
                : registering
                  ? '首次使用第三方账号会自动创建通行证；VEXNAR 会在完成后同步模型与额度。'
                  : '使用通行证、第三方账号或 Passkey 登录。VEXNAR 会自动同步账户、模型与额度。'}
            </p>
          </div>

          {message ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/15 bg-danger/5 px-3 py-2 text-[11.5px] leading-5 text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{message}</span>
            </div>
          ) : null}

          {external ? (
            <ExternalWaiting label={external.label} onCancel={() => void cancelExternal()} />
          ) : verifying ? (
            <div className="space-y-3">
              {supportsCode ? (
                <form onSubmit={(event) => void submit(event)} className="space-y-3">
                  <div className="space-y-1.5">
                    <label htmlFor="newapi-code" className="text-[11.5px] font-medium text-ink-soft">
                      验证码
                    </label>
                    <input
                      id="newapi-code"
                      className={fieldClass}
                      value={code}
                      onChange={(event) => {
                        setCode(event.target.value)
                        clearError()
                      }}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      placeholder="6 位验证码"
                      autoFocus
                      disabled={busy}
                    />
                  </div>
                  <Button type="submit" className="h-9 w-full text-[12.5px]" disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {busy ? '正在验证…' : '验证并继续'}
                  </Button>
                </form>
              ) : (
                <div className="rounded-lg border border-line-soft bg-panel px-3.5 py-3 text-[12px] leading-5 text-ink-soft">
                  该账号要求 Passkey 验证。请返回登录并使用 Passkey 通行证登录，或在浏览器完成验证。
                </div>
              )}
              <button
                type="button"
                onClick={() => void cancel()}
                className="mx-auto flex items-center gap-1.5 rounded px-2 py-1 text-[11.5px] text-muted transition-colors hover:text-ink"
              >
                <ArrowLeft className="h-3 w-3" />
                返回重新登录
              </button>
            </div>
          ) : registering ? (
            renderRegister()
          ) : (
            renderLogin()
          )}

          <div className="mt-5 flex items-start gap-2 rounded-lg border border-line-soft bg-panel/60 px-3 py-2.5 text-[11px] leading-[18px] text-muted">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent/80" />
            <span>
              密码只用于本次登录，不会保存在本机；刷新凭证使用系统安全存储加密保存。第三方与
              Passkey 登录在独立安全窗口中完成。
            </span>
          </div>

          {canRegister && !external && !verifying ? (
            <div className="mt-4 text-center text-[11.5px] text-muted">
              {registering ? '已有通行证？' : '还没有通行证？'}
              <button
                type="button"
                onClick={() => {
                  setMode(registering ? 'login' : 'register')
                  setLocalError(null)
                }}
                className="ml-1 rounded px-1 py-0.5 font-medium text-accent transition-colors hover:text-accent/80"
              >
                {registering ? '返回登录' : '注册'}
              </button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-muted">
            <button
              type="button"
              onClick={() => void refreshMethods()}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-ink"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              刷新登录方式
            </button>
            <span className="text-line">·</span>
            <button
              type="button"
              onClick={() => void openPlatform()}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-ink"
            >
              在默认浏览器中打开
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
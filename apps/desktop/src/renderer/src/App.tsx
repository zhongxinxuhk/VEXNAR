import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck
} from 'lucide-react'
import { IconRail } from '@/components/IconRail'
import { Sidebar } from '@/components/Sidebar'
import { ChatView } from '@/components/ChatView'
import { RightPanel } from '@/components/RightPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ConsoleView } from '@/components/console/ConsoleView'
import { BrandGlyph } from '@/components/brand'
import { Button, TooltipProvider } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import type { NewApiState } from '@shared/contracts'

const fieldClass =
  'flex h-9 w-full rounded-lg border border-line bg-bg px-3 text-[12.5px] text-ink outline-none transition-shadow placeholder:text-muted/70 focus:ring-2 focus:ring-accent/25 disabled:opacity-60'

function LoginScreen({
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
  const stage = state?.stage ?? 'checking'
  const verifying = stage === 'verification'
  const checking = !state || stage === 'checking'
  const message = localError ?? state?.error ?? null
  const methods = state?.verificationMethods ?? []
  const supportsCode =
    methods.length === 0 || methods.some((method) => /2fa|totp|two.?factor/i.test(method))

  const clearError = (): void => {
    setLocalError(null)
    if (state?.error) onChange({ ...state, error: null })
  }

  const openPlatform = async (): Promise<void> => {
    const result = await window.vexnar.newapi.openPlatform()
    if (!result.ok) setLocalError(result.error)
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (busy) return
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
        if (result.data.stage === 'verification') setCode('')
        else setCode('')
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

  const recheck = async (): Promise<void> => {
    setBusy(true)
    setLocalError(null)
    const result = await window.vexnar.newapi.refresh()
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
              {verifying ? '两步验证' : '登录 HXSEC AI 平台'}
            </h1>
            <p className="mt-2 max-w-[330px] text-[12.5px] leading-5 text-muted">
              {verifying
                ? '请输入身份验证器中的验证码，完成后会自动同步账户。'
                : '使用平台账号登录。VEXNAR 会自动创建 App-managed API Key，并同步可用模型与额度。'}
            </p>
          </div>

          {message ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/15 bg-danger/5 px-3 py-2 text-[11.5px] leading-5 text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{message}</span>
            </div>
          ) : null}

          {verifying ? (
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
                  该账号要求 Passkey 验证。桌面端暂不支持 Passkey 回调，请先在浏览器完成验证后重新登录。
                  <Button
                    variant="secondary"
                    className="mt-2.5 h-8 w-full text-[12px]"
                    onClick={() => void openPlatform()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    在浏览器打开
                  </Button>
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
          ) : (
            <form onSubmit={(event) => void submit(event)} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="newapi-username" className="text-[11.5px] font-medium text-ink-soft">
                  用户名或邮箱
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
                  placeholder="请输入平台账号"
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
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                {busy ? '正在登录…' : '登录'}
              </Button>
            </form>
          )}

          <div className="mt-5 flex items-start gap-2 rounded-lg border border-line-soft bg-panel/60 px-3 py-2.5 text-[11px] leading-[18px] text-muted">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent/80" />
            <span>
              密码只用于本次登录，不会保存在本机；刷新凭证使用系统安全存储加密保存。
            </span>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted">
            <button
              type="button"
              onClick={() => void openPlatform()}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-ink"
            >
              在默认浏览器中打开 platform.sec.hn.cn
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
            <span className="text-line">·</span>
            <button
              type="button"
              onClick={() => void recheck()}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-ink"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              重新检测
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

function WorkspaceApp(): React.JSX.Element {
  const t = useT()
  const init = useAppStore((state) => state.init)
  const handleAgentEvent = useAppStore((state) => state.handleAgentEvent)
  const rightOpen = useAppStore((state) => state.rightOpen)
  const toggleRight = useAppStore((state) => state.toggleRight)
  const error = useAppStore((state) => state.error)
  const clearError = useAppStore((state) => state.clearError)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const newSession = useAppStore((state) => state.newSession)
  const view = useAppStore((state) => state.view)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => window.vexnar.agent.onEvent(handleAgentEvent), [handleAgentEvent])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey && event.code === 'Space') {
        const target = event.target
        if (
          target instanceof HTMLElement &&
          target.closest('input, textarea, [contenteditable="true"]')
        ) {
          return
        }
        event.preventDefault()
        toggleRight()
        return
      }
      const meta = event.metaKey || event.ctrlKey
      if (!meta) return
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void newSession()
      }
      if (event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      }
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleRight()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newSession, setSettingsOpen, toggleRight])

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-ink">
      <IconRail />
      <Sidebar />

      <main className="relative flex min-w-0 flex-1 overflow-hidden">
        {view === 'chat' ? <ChatView /> : <ConsoleView view={view} />}

        <AnimatePresence initial={false}>
          {view === 'chat' && rightOpen ? (
            <motion.div
              key="right"
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="absolute right-0 top-0 z-30 h-full w-[412px] overflow-hidden border-l border-line bg-bg shadow-[-18px_0_40px_-24px_rgba(0,0,0,0.24)]"
            >
              <RightPanel />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-5 left-1/2 z-40 flex max-w-[620px] -translate-x-1/2 items-start gap-2.5 rounded-xl border border-danger/20 bg-bg px-3.5 py-2.5 codex-popover"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0 text-[12px] leading-5 text-ink-soft">{error}</div>
            <button
              type="button"
              onClick={clearError}
              className="rounded p-1 text-muted hover:bg-panel-2 hover:text-ink"
              aria-label={t('app.close')}
            >
              <span className="text-[14px] leading-none">×</span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <SettingsDialog />
    </div>
  )
}

export default function App(): React.JSX.Element {
  const newApi = useAppStore((state) => state.newApi)
  const setNewApi = useAppStore((state) => state.setNewApi)

  useEffect(() => {
    let disposed = false
    void window.vexnar.newapi.bootstrap().then((result) => {
      if (disposed) return
      if (result.ok) setNewApi(result.data)
      else {
        setNewApi({
          stage: 'error',
          authenticated: false,
          user: null,
          quota: null,
          token: null,
          models: [],
          verificationMethods: [],
          error: result.error,
          updatedAt: Date.now()
        })
      }
    })
    const unsubscribe = window.vexnar.newapi.onChange((state) => setNewApi(state))
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [setNewApi])

  const authenticated = newApi?.authenticated === true

  return (
    <TooltipProvider>
      <div className="relative h-full w-full overflow-hidden bg-bg text-ink">
        {authenticated ? (
          <WorkspaceApp />
        ) : (
          <LoginScreen state={newApi} onChange={setNewApi} />
        )}
      </div>
    </TooltipProvider>
  )
}
import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, ServerOff } from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { consoleRequest, type Severity } from '@/lib/console'

export type LoadState<T> = { data: T | null; loading: boolean; error: string | null }

export function useResource<T>(path: string | null): LoadState<T> & { reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ data: null, loading: Boolean(path), error: null })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!path) return
    let active = true
    setState((previous) => ({ ...previous, loading: true, error: null }))
    consoleRequest<T>(path)
      .then((data) => { if (active) setState({ data, loading: false, error: null }) })
      .catch((error: unknown) => {
        if (active) setState({ data: null, loading: false, error: error instanceof Error ? error.message : String(error) })
      })
    return () => { active = false }
  }, [path, nonce])
  return { ...state, reload: () => setNonce((value) => value + 1) }
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-soft px-6 py-5">
      <div><h1 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">{subtitle}</p></div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }): React.JSX.Element {
  const t = useT()
  return <Button variant="outline" size="sm" onClick={onClick}><RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />{t('app.refresh')}</Button>
}

export function LoadingRow({ label }: { label: string }): React.JSX.Element {
  return <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted"><Loader2 className="h-4 w-4 animate-spin" /> {label}</div>
}

export function ErrorRow({ message, retry }: { message: string; retry?: () => void }): React.JSX.Element {
  return (
    <div className="mx-6 my-5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
      <div className="flex items-start gap-2 text-xs leading-5 text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 font-mono">{message}</span>{retry ? <Button size="sm" variant="ghost" onClick={retry}><RefreshCw className="h-3.5 w-3.5" /></Button> : null}</div>
    </div>
  )
}

export function ConnectPrompt(): React.JSX.Element {
  const t = useT()
  const refreshBackend = useAppStore((state) => state.refreshBackend)
  return (
    <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-panel-2"><ServerOff className="h-5 w-5 text-muted" /></div>
      <h2 className="mt-4 text-sm font-semibold text-ink">{t('overview.connectPrompt')}</h2>
      <p className="mt-2 text-xs leading-5 text-muted">{t('overview.connectHint')}</p>
      <Button className="mt-5" size="sm" onClick={() => void refreshBackend()}>{t('app.retry')}</Button>
    </div>
  )
}

export function BackendGate(): React.JSX.Element | null {
  const backend = useAppStore((state) => state.backend)
  if (!backend) return <LoadingRow label="…" />
  if (!backend.connected) return <ConnectPrompt />
  return null
}

export function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const t = useT()
  return <span className={cn('font-mono text-[11px]', status.includes('run') || status === 'queued' || status === 'in_progress' ? 'text-warn' : ['done', 'confirmed', 'fixed', 'resolved'].includes(status) ? 'text-accent-2' : ['failed', 'timeout', 'false_positive'].includes(status) ? 'text-danger' : 'text-muted')}>{t(`status.${status}` as MessageKey)}</span>
}

export function SeverityBadge({ severity }: { severity: Severity }): React.JSX.Element {
  const t = useT()
  const tone = severity === 'critical' ? 'border-danger/30 bg-danger/10 text-danger' : severity === 'high' ? 'border-warn/30 bg-warn/10 text-warn' : severity === 'medium' ? 'border-accent/25 bg-accent/10 text-accent' : 'border-line bg-panel-2 text-muted'
  return <span className={cn('inline-flex rounded-md border px-1.5 py-0.5 font-mono text-[10px]', tone)}>{t(`severity.${severity}` as MessageKey)}</span>
}

export function Meta({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return <div><div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted/70">{label}</div><div className="mt-0.5 text-xs text-ink-soft">{value}</div></div>
}

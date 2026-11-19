import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bot,
  Bug,
  Database,
  FolderOpen,
  Globe2,
  Loader2,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  SquareTerminal,
  Target,
  Wifi,
  WifiOff
} from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { Badge, Button, Input, ScrollArea } from '@/components/ui'
import { Meta, PageHeader } from './common'

export function SystemView(): React.JSX.Element {
  const t = useT()
  const settings = useAppStore((state) => state.settings)
  const backend = useAppStore((state) => state.backend)
  const backendLoading = useAppStore((state) => state.backendLoading)
  const connectBackend = useAppStore((state) => state.connectBackend)
  const disconnectBackend = useAppStore((state) => state.disconnectBackend)
  const refreshBackend = useAppStore((state) => state.refreshBackend)
  const setView = useAppStore((state) => state.setView)
  const info = useAppStore((state) => state.info)
  const [baseUrl, setBaseUrl] = useState(settings.backendUrl)
  const [username, setUsername] = useState('admin')
  const [secret, setSecret] = useState('')

  useEffect(() => setBaseUrl(settings.backendUrl), [settings.backendUrl])

  const login = async (): Promise<void> => {
    const ok = await connectBackend({ baseUrl, username, password: secret })
    if (ok) setSecret('')
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={t('system.title')}
        subtitle={t('system.subtitle')}
        actions={
          <Button variant="outline" size="sm" onClick={() => void refreshBackend()}>
            <RefreshCw className={cn('h-3.5 w-3.5', backendLoading && 'animate-spin')} />
            {t('app.refresh')}
          </Button>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-5 p-6 xl:grid-cols-2">
          <section className="rounded-xl border border-line bg-panel/40">
            <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
              <Server className="h-4 w-4 text-accent" />
              <h2 className="text-xs font-semibold text-ink">{t('system.backend')}</h2>
              <Badge className="ml-auto" variant={backend?.connected ? 'success' : 'danger'}>
                {backend?.connected ? t('app.connected') : t('app.disconnected')}
              </Badge>
            </div>
            <div className="space-y-3 p-4">
              {backend ? (
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  {backend.connected ? <Wifi className="h-3.5 w-3.5 text-accent-2" /> : <WifiOff className="h-3.5 w-3.5 text-danger" />}
                  <span className="min-w-0 flex-1 truncate font-mono">{backend.baseUrl}</span>
                  {backend.version ? <span className="font-mono text-[10px]">v{backend.version}</span> : null}
                </div>
              ) : null}
              {backend?.error ? (
                <div className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 font-mono text-[10px] leading-5 text-danger">
                  {backend.error}
                </div>
              ) : null}
              <label className="block text-[11px] text-muted">
                {t('system.backendUrl')}
                <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} className="mt-1 h-8 font-mono text-xs" placeholder="http://127.0.0.1:8787" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] text-muted">
                  {t('system.username')}
                  <Input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 h-8 text-xs" />
                </label>
                <label className="block text-[11px] text-muted">
                  {t('system.password')}
                  <Input
                    type="password"
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    className="mt-1 h-8 text-xs"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void login()
                    }}
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void login()} disabled={backendLoading || !username || !secret}>
                  {backendLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {t('system.connect')}
                </Button>
                {settings.hasBackendToken ? (
                  <Button size="sm" variant="outline" onClick={() => void disconnectBackend()}>
                    {t('system.disconnect')}
                  </Button>
                ) : null}
                <span className="ml-auto font-mono text-[10px] text-muted">
                  {backend?.authenticated ? t('system.authenticated') : t('system.noToken')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-line-soft pt-3">
                <Meta label={t('system.health')} value={backend?.connected ? 'ok' : '—'} />
                <Meta label={t('system.version')} value={backend?.version || '—'} />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-panel/40">
            <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
              <Bot className="h-4 w-4 text-accent" />
              <h2 className="text-xs font-semibold text-ink">{t('system.localRuntime')}</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4">
              <Meta label={t('system.workspace')} value={<span className="break-all font-mono text-[10px]">{settings.workspaceRoot || t('app.noWorkspace')}</span>} />
              <Meta label={t('system.platform')} value={`${info?.platform ?? '—'} · ${info?.arch ?? '—'}`} />
              <Meta label={t('system.version')} value={info?.version ?? '—'} />
              <Meta label="PostgreSQL" value="portable · local" />
              <div className="col-span-2">
                <Meta label={t('system.userData')} value={<span className="break-all font-mono text-[10px]">{info?.userData ?? '—'}</span>} />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-panel/40 xl:col-span-2">
            <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
              <Database className="h-4 w-4 text-accent" />
              <h2 className="text-xs font-semibold text-ink">{t('system.modules')}</h2>
            </div>
            <div className="p-4">
              <p className="mb-3 text-[11px] leading-5 text-muted">{t('system.modulesHint')}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {(['overview', 'tasks', 'findings', 'traffic', 'assets', 'commands', 'workspace'] as const).map((module) => (
                  <button
                    key={module}
                    type="button"
                    onClick={() => setView(module === 'workspace' ? 'chat' : module)}
                    className="flex items-center gap-2 rounded-lg border border-line bg-panel-2/50 px-3 py-2.5 text-left text-xs text-ink-soft hover:border-accent/30 hover:bg-panel-3"
                  >
                    {module === 'overview' ? <Activity className="h-3.5 w-3.5 text-accent" /> : module === 'tasks' ? <Target className="h-3.5 w-3.5 text-accent" /> : module === 'findings' ? <Bug className="h-3.5 w-3.5 text-accent" /> : module === 'traffic' ? <Globe2 className="h-3.5 w-3.5 text-accent" /> : module === 'assets' ? <Network className="h-3.5 w-3.5 text-accent" /> : module === 'commands' ? <SquareTerminal className="h-3.5 w-3.5 text-accent" /> : <FolderOpen className="h-3.5 w-3.5 text-accent" />}
                    {t(`module.${module}` as MessageKey)}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-panel-2/40 px-3 py-2 font-mono text-[10px] leading-5 text-muted">
                <span className="min-w-0 flex-1 truncate">{backend?.connected ? backend.baseUrl : t('system.webUnavailable')}</span>
                {backend?.connected ? (
                  <a
                    href={backend.baseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-panel-3 px-2 py-1 text-[10px] text-ink-soft hover:text-ink"
                  >
                    {t('system.openWeb')}
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}

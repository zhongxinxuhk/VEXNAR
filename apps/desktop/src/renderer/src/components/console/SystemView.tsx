// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Activity,
  Bot,
  Bug,
  Database,
  FolderOpen,
  Globe2,
  Network,
  RefreshCw,
  Server,
  SquareTerminal,
  Target
} from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { Badge, Button, ScrollArea } from '@/components/ui'
import { Meta, PageHeader } from './common'

export function SystemView(): React.JSX.Element {
  const t = useT()
  const settings = useAppStore((state) => state.settings)
  const backend = useAppStore((state) => state.backend)
  const backendLoading = useAppStore((state) => state.backendLoading)
  const refreshBackend = useAppStore((state) => state.refreshBackend)
  const setView = useAppStore((state) => state.setView)
  const info = useAppStore((state) => state.info)

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
        <div className="grid gap-4 p-6 xl:grid-cols-2">
          <section className="rounded-xl border border-line bg-panel/40">
            <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
              <Server className="h-4 w-4 text-accent" />
              <h2 className="text-xs font-semibold text-ink">{t('system.backend')}</h2>
              <Badge className="ml-auto" variant={backend?.connected ? 'success' : 'danger'}>
                {backend?.connected ? t('app.connected') : t('app.disconnected')}
              </Badge>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-[11.5px] leading-5 text-muted">{t('settings.aboutLine')}</p>
              {backend?.error ? (
                <div className="rounded-lg border border-danger/15 bg-danger/5 px-3 py-2 font-mono text-[10.5px] leading-5 text-danger">
                  {backend.error}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 border-t border-line-soft pt-3">
                <Meta label={t('system.health')} value={backend?.connected ? 'ok' : '—'} />
                <Meta label={t('system.version')} value={backend?.version || '—'} />
                <Meta label={t('system.localRuntime')} value="Electron + PostgreSQL" />
                <Meta label={t('system.modules')} value={t('app.connected')} />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-panel/40">
            <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
              <Bot className="h-4 w-4 text-accent" />
              <h2 className="text-xs font-semibold text-ink">{t('system.localRuntime')}</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4">
              <Meta
                label={t('system.workspace')}
                value={
                  <span className="break-all font-mono text-[10px]">
                    {settings.workspaceRoot || t('app.noWorkspace')}
                  </span>
                }
              />
              <Meta label={t('system.platform')} value={`${info?.platform ?? '—'} · ${info?.arch ?? '—'}`} />
              <Meta label={t('system.version')} value={info?.version ?? '—'} />
              <Meta label="PostgreSQL" value="portable · local" />
              <div className="col-span-2">
                <Meta
                  label={t('system.userData')}
                  value={<span className="break-all font-mono text-[10px]">{info?.userData ?? '—'}</span>}
                />
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
                {(['overview', 'tasks', 'findings', 'traffic', 'assets', 'commands', 'workspace'] as const).map(
                  (module) => (
                    <button
                      key={module}
                      type="button"
                      onClick={() => setView(module === 'workspace' ? 'chat' : module)}
                      className="flex items-center gap-2 rounded-lg border border-line bg-panel-2/50 px-3 py-2.5 text-left text-xs text-ink-soft hover:border-accent/30 hover:bg-panel-3"
                    >
                      {module === 'overview' ? (
                        <Activity className="h-3.5 w-3.5 text-accent" />
                      ) : module === 'tasks' ? (
                        <Target className="h-3.5 w-3.5 text-accent" />
                      ) : module === 'findings' ? (
                        <Bug className="h-3.5 w-3.5 text-accent" />
                      ) : module === 'traffic' ? (
                        <Globe2 className="h-3.5 w-3.5 text-accent" />
                      ) : module === 'assets' ? (
                        <Network className="h-3.5 w-3.5 text-accent" />
                      ) : module === 'commands' ? (
                        <SquareTerminal className="h-3.5 w-3.5 text-accent" />
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5 text-accent" />
                      )}
                      {t(`module.${module}` as MessageKey)}
                    </button>
                  )
                )}
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, useState } from 'react'
import { ChevronDown, Search, TerminalSquare } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { Input, ScrollArea } from '@/components/ui'
import { formatDate, type CommandRecord, type CommandsPage } from '@/lib/console'
import { BackendGate, ErrorRow, LoadingRow, PageHeader, RefreshButton, useResource } from './common'

export function CommandsView(): React.JSX.Element {
  const t = useT()
  const backend = useAppStore((state) => state.backend)
  const resource = useResource<CommandsPage>('/commands?page=0&size=100')
  const [query, setQuery] = useState('')
  const commands = useMemo(() => {
    const value = query.trim().toLowerCase()
    return (resource.data?.commands ?? []).filter((item: CommandRecord) => !value || [item.tool, item.worker, item.command, item.output].some((field) => field?.toLowerCase().includes(value)))
  }, [resource.data, query])
  if (!backend?.connected) return <BackendGate />
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={t('commands.title')} subtitle={t('commands.subtitle')} actions={<RefreshButton onClick={resource.reload} loading={resource.loading} />} />
      <div className="flex items-center gap-2 border-b border-line-soft px-6 py-2.5"><Search className="h-3.5 w-3.5 text-muted" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('commands.search')} className="h-8 max-w-md border-0 bg-transparent px-1 text-xs" /><span className="ml-auto font-mono text-[10px] text-muted">{commands.length} / {resource.data?.total ?? 0}</span></div>
      <ScrollArea className="min-h-0 flex-1"><div className="p-6">
        {resource.error ? <ErrorRow message={resource.error} retry={resource.reload} /> : null}
        {resource.loading && !resource.data ? <LoadingRow label={t('commands.loading')} /> : commands.length === 0 ? <div className="py-16 text-center text-xs text-muted">{t('commands.empty')}</div> : (
          <div className="space-y-2">
            {commands.map((record) => (
              <details key={record.id} className="group rounded-xl border border-line bg-panel/40">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-xs"><TerminalSquare className="h-3.5 w-3.5 text-accent" /><span className="font-mono text-[11px] text-ink-soft">{record.tool}</span><span className="truncate font-mono text-[10px] text-muted">{record.command}</span><span className={cn('ml-auto font-mono text-[10px]', record.is_error ? 'text-danger' : 'text-accent-2')}>{record.is_error ? t('status.failed') : t('chat.done')}</span><ChevronDown className="h-3.5 w-3.5 text-muted transition-transform group-open:rotate-180" /></summary>
                <div className="border-t border-line-soft px-4 py-3"><div className="mb-2 flex gap-4 font-mono text-[10px] text-muted"><span>{record.worker}</span><span>{formatDate(record.created_at)}</span></div><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg/60 p-3 font-mono text-[10px] leading-5 text-ink-soft">{record.output || '—'}</pre></div>
              </details>
            ))}
          </div>
        )}
      </div></ScrollArea>
    </div>
  )
}

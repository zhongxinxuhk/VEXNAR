// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, useState } from 'react'
import { Activity, Search } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { Button, Input, ScrollArea } from '@/components/ui'
import { consoleRequest, type TrafficDetail, type TrafficExchange, type TrafficPage } from '@/lib/console'
import { BackendGate, ErrorRow, LoadingRow, PageHeader, RefreshButton, useResource } from './common'

export function TrafficView(): React.JSX.Element {
  const t = useT()
  const backend = useAppStore((state) => state.backend)
  const resource = useResource<TrafficPage>('/traffic?page=0&size=100')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<TrafficExchange | null>(null)
  const [detail, setDetail] = useState<TrafficDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const exchanges = useMemo(() => {
    const value = query.trim().toLowerCase()
    return (resource.data?.exchanges ?? []).filter((item) => !value || [item.host, item.url, item.method, String(item.status)].some((field) => field?.toLowerCase().includes(value)))
  }, [resource.data, query])
  if (!backend?.connected) return <BackendGate />
  const open = async (item: TrafficExchange): Promise<void> => {
    setSelected(item); setDetail(null); setDetailError(null)
    try { setDetail(await consoleRequest<TrafficDetail>(`/traffic/exchange?id=${encodeURIComponent(item.id)}`)) }
    catch (error) { setDetailError(error instanceof Error ? error.message : String(error)) }
  }
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader title={t('traffic.title')} subtitle={t('traffic.subtitle')} actions={<RefreshButton onClick={resource.reload} loading={resource.loading} />} />
        <div className="flex items-center gap-2 border-b border-line-soft px-6 py-2.5"><Search className="h-3.5 w-3.5 text-muted" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('traffic.search')} className="h-8 max-w-md border-0 bg-transparent px-1 text-xs" /><span className="ml-auto font-mono text-[10px] text-muted">{exchanges.length} / {resource.data?.total ?? 0}</span></div>
        <ScrollArea className="min-h-0 flex-1"><div className="p-6">
          {resource.error ? <ErrorRow message={resource.error} retry={resource.reload} /> : null}
          {resource.loading && !resource.data ? <LoadingRow label={t('traffic.loading')} /> : exchanges.length === 0 ? <div className="py-16 text-center text-xs text-muted">{t('traffic.empty')}</div> : (
            <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line">
              {exchanges.map((item) => (
                <button key={item.id} type="button" onClick={() => void open(item)} className={cn('block w-full px-4 py-2.5 text-left hover:bg-panel-2/40', selected?.id === item.id && 'bg-panel-2/60')}>
                  <div className="flex items-center gap-3"><span className="w-12 font-mono text-[10px] text-accent">{item.method}</span><span className={cn('w-9 font-mono text-[10px]', item.status >= 400 ? 'text-danger' : item.status >= 300 ? 'text-warn' : 'text-accent-2')}>{item.status}</span><span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft">{item.host}{item.url}</span><span className="font-mono text-[10px] text-muted">{item.resp_len}b</span></div>
                </button>
              ))}
            </div>
          )}
        </div></ScrollArea>
      </div>
      <aside className="flex w-[440px] shrink-0 flex-col border-l border-line-soft bg-panel/50">
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3"><Activity className="h-4 w-4 text-accent" /><span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft">{selected ? selected.url : t('traffic.request')}</span></div>
        {detailError ? <div className="p-4 font-mono text-[11px] text-danger">{detailError}</div> : !selected ? <div className="p-6 text-xs leading-5 text-muted">{t('traffic.select')}</div> : !detail ? <LoadingRow label={t('app.loading')} /> : (
          <ScrollArea className="min-h-0 flex-1"><div className="space-y-4 p-4"><section><div className="mb-1 font-mono text-[10px] uppercase text-muted">{t('traffic.request')}</div><pre className="max-h-[38vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg/60 p-3 font-mono text-[10px] leading-5 text-ink-soft">{detail.req}</pre></section><section><div className="mb-1 font-mono text-[10px] uppercase text-muted">{t('traffic.response')}</div><pre className="max-h-[38vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg/60 p-3 font-mono text-[10px] leading-5 text-muted">{detail.resp}</pre></section></div></ScrollArea>
        )}
      </aside>
    </div>
  )
}

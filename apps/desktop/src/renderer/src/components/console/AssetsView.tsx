import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { Badge, Input, ScrollArea } from '@/components/ui'
import { assetLabel, formatDate, type Asset, type AssetsPage } from '@/lib/console'
import { BackendGate, ErrorRow, LoadingRow, PageHeader, RefreshButton, useResource } from './common'

const TYPES = ['root_domain', 'ip', 'subdomain', 'app', 'service', 'endpoint'] as const
type AssetType = (typeof TYPES)[number]

export function AssetsView(): React.JSX.Element {
  const t = useT()
  const backend = useAppStore((state) => state.backend)
  const [type, setType] = useState<AssetType>('root_domain')
  const resource = useResource<AssetsPage>(`/assets?type=${type}&limit=200&offset=0`)
  const counts = useResource<Record<string, number>>('/assets/counts')
  const [query, setQuery] = useState('')
  const assets = useMemo(() => {
    const value = query.trim().toLowerCase()
    return (resource.data?.assets ?? []).filter((asset) => !value || [assetLabel(asset), asset.type, asset.page_title, asset.root_domain].some((field) => field?.toLowerCase().includes(value)))
  }, [resource.data, query])
  if (!backend?.connected) return <BackendGate />

  const reload = (): void => {
    resource.reload()
    counts.reload()
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={t('assets.title')} subtitle={t('assets.subtitle')} actions={<RefreshButton onClick={reload} loading={resource.loading} />} />
      <div className="flex flex-wrap items-center gap-1 border-b border-line-soft px-4 py-2">
        {TYPES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setType(item)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[10px] transition-colors',
              type === item ? 'bg-panel-3 text-ink' : 'text-muted hover:bg-panel-2 hover:text-ink-soft'
            )}
          >
            {t(`asset.type.${item}` as never)}
            <span className={cn('tabular-nums', type === item ? 'text-muted' : 'text-muted/50')}>{counts.data?.[item] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 border-b border-line-soft px-6 py-2.5">
        <Search className="h-3.5 w-3.5 text-muted" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('assets.search')} className="h-8 max-w-md border-0 bg-transparent px-1 text-xs" />
        <span className="ml-auto font-mono text-[10px] text-muted">{assets.length} / {resource.data?.total ?? 0}</span>
      </div>
      <ScrollArea className="min-h-0 flex-1"><div className="p-6">
        {resource.error ? <ErrorRow message={resource.error} retry={resource.reload} /> : null}
        {resource.loading && !resource.data ? <LoadingRow label={t('assets.loading')} /> : assets.length === 0 ? <div className="py-16 text-center text-xs text-muted">{t('assets.empty')}</div> : (
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[90px_minmax(0,1fr)_150px_120px] gap-3 border-b border-line bg-panel-2/60 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-muted"><span>{t('assets.type')}</span><span>{t('assets.value')}</span><span>{t('assets.ports')}</span><span>{t('assets.lastSeen')}</span></div>
            {assets.map((asset: Asset) => (
              <div key={asset.id} className="grid grid-cols-[90px_minmax(0,1fr)_150px_120px] items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-0 hover:bg-panel-2/30">
                <Badge>{asset.type}</Badge>
                <div className="min-w-0"><div className="truncate font-mono text-[11px] text-ink-soft">{assetLabel(asset)}</div>{asset.page_title ? <div className="truncate text-[10px] text-muted">{asset.page_title}</div> : null}</div>
                <div className="truncate font-mono text-[10px] text-muted">{(asset.open_ports ?? []).map((port) => port.service ? `${port.port}/${port.service}` : port.port).join(', ') || (asset.port ? asset.port : '—')}</div>
                <div className="font-mono text-[10px] text-muted">{formatDate(asset.last_seen)}</div>
              </div>
            ))}
          </div>
        )}
      </div></ScrollArea>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Bug, ChevronRight, Search } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { Badge, Button, Input, ScrollArea } from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { consoleRequest, severityOrder, type Finding, type FindingsPage, type Severity } from '@/lib/console'
import { BackendGate, ErrorRow, LoadingRow, PageHeader, RefreshButton, SeverityBadge, StatusBadge, useResource } from './common'

function Detail({ finding, onClose, onUpdated }: { finding: Finding; onClose: () => void; onUpdated: (finding: Finding) => void }): React.JSX.Element {
  const t = useT()
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const updateStatus = async (status: string): Promise<void> => {
    setUpdating(true)
    setUpdateError(null)
    try {
      const updated = await consoleRequest<Finding>(`/exploration/findings/${encodeURIComponent(finding.id)}`, 'PATCH', { status })
      onUpdated(updated)
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : String(error))
    } finally {
      setUpdating(false)
    }
  }
  return (
    <aside className="flex w-[430px] shrink-0 flex-col border-l border-line-soft bg-panel/50">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3"><Bug className="h-4 w-4 text-warn" /><span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{finding.name || finding.vulnclass}</span><Button variant="ghost" size="icon" onClick={onClose} aria-label={t('app.close')}>×</Button></div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft px-4 py-2">
        <SeverityBadge severity={finding.severity} />
        <StatusBadge status={finding.status} />
        <select
          value={finding.status}
          disabled={updating}
          onChange={(event) => void updateStatus(event.target.value)}
          className="ml-auto h-7 rounded-md border border-line bg-panel-2 px-2 text-[10px] text-ink-soft"
          aria-label={t('findings.status')}
        >
          {['pending', 'in_progress', 'confirmed', 'resolved', 'fixed', 'false_positive', 'ignored', 'duplicate', 'risk_accepted'].map((item) => <option key={item} value={item}>{t(`status.${item}` as never)}</option>)}
        </select>
        {finding.assets?.map((asset) => <Badge key={asset.id}>{asset.label}</Badge>)}
      </div>
      {updateError ? <div className="border-b border-danger/20 bg-danger/5 px-4 py-2 font-mono text-[10px] text-danger">{updateError}</div> : null}
      <ScrollArea className="min-h-0 flex-1"><div className="space-y-5 p-4">
        <section><div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">{t('findings.summary')}</div><div className="text-xs leading-5 text-ink-soft">{finding.summary || '—'}</div></section>
        <section><div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">{t('findings.evidence')}</div><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg/60 p-3 font-mono text-[10px] leading-5 text-muted">{finding.evidence || '—'}</pre></section>
        <section><div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">{t('findings.report')}</div>{finding.report ? <Markdown content={finding.report} /> : <div className="text-xs text-muted">{t('findings.noReport')}</div>}</section>
      </div></ScrollArea>
    </aside>
  )
}

export function FindingsView(): React.JSX.Element {
  const t = useT()
  const backend = useAppStore((state) => state.backend)
  const resource = useResource<FindingsPage>('/exploration/findings?page=1&limit=100')
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState<'all' | Severity>('all')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<Finding | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const findings = useMemo(() => {
    const value = query.trim().toLowerCase()
    return (resource.data?.items ?? []).filter((finding) => severity === 'all' || finding.severity === severity).filter((finding) => status === 'all' || finding.status === status).filter((finding) => !value || [finding.name, finding.vulnclass, finding.summary].some((item) => item?.toLowerCase().includes(value))).sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
  }, [resource.data, query, severity, status])
  if (!backend?.connected) return <BackendGate />

  const open = async (finding: Finding): Promise<void> => {
    setDetailError(null)
    try { setSelected(await consoleRequest<Finding>(`/exploration/findings/${encodeURIComponent(finding.id)}`)) }
    catch (error) { setDetailError(error instanceof Error ? error.message : String(error)) }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader title={t('findings.title')} subtitle={t('findings.subtitle')} actions={<RefreshButton onClick={resource.reload} loading={resource.loading} />} />
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-6 py-2.5">
          <Search className="h-3.5 w-3.5 text-muted" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('findings.search')} className="h-8 max-w-xs border-0 bg-transparent px-1 text-xs" />
          <select value={severity} onChange={(event) => setSeverity(event.target.value as 'all' | Severity)} className="h-7 rounded-md border border-line bg-panel-2 px-2 text-[11px] text-ink-soft"><option value="all">{t('app.all')}</option><option value="critical">{t('severity.critical')}</option><option value="high">{t('severity.high')}</option><option value="medium">{t('severity.medium')}</option><option value="low">{t('severity.low')}</option></select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-7 rounded-md border border-line bg-panel-2 px-2 text-[11px] text-ink-soft"><option value="all">{t('app.all')}</option>{['pending', 'in_progress', 'confirmed', 'resolved', 'false_positive', 'ignored'].map((item) => <option key={item} value={item}>{t(`status.${item}` as never)}</option>)}</select>
          <span className="ml-auto font-mono text-[10px] text-muted">{findings.length} / {resource.data?.total ?? 0}</span>
        </div>
        <ScrollArea className="min-h-0 flex-1"><div className="p-6">
          {detailError ? <ErrorRow message={detailError} /> : null}{resource.error ? <ErrorRow message={resource.error} retry={resource.reload} /> : null}
          {resource.loading && !resource.data ? <LoadingRow label={t('findings.loading')} /> : findings.length === 0 ? <div className="py-16 text-center text-xs text-muted">{t('findings.empty')}</div> : (
            <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line">
              {findings.map((finding) => (
                <button key={finding.id} type="button" onClick={() => void open(finding)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel-2/40', selected?.id === finding.id && 'bg-panel-2/60')}>
                  <SeverityBadge severity={finding.severity} />
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-xs font-medium text-ink">{finding.name || finding.vulnclass}</span><StatusBadge status={finding.status} /></div><div className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">{finding.summary}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{finding.assets?.slice(0, 4).map((asset) => <Badge key={asset.id}>{asset.label}</Badge>)}</div></div>
                  <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted" />
                </button>
              ))}
            </div>
          )}
        </div></ScrollArea>
      </div>
      {selected ? <Detail finding={selected} onClose={() => setSelected(null)} onUpdated={(next) => { setSelected(next); resource.reload() }} /> : null}
    </div>
  )
}

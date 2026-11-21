// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, type ReactNode } from 'react'
import { ArrowLeftRight, FileText, GitCompareArrows, Lightbulb, Table2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import type { ReplyView } from '@/lib/reply-view'
import { cn } from '@/lib/utils'

const display = {
  artifact: { label: 'chat.replyArtifact', icon: FileText },
  diff: { label: 'chat.replyDiff', icon: GitCompareArrows },
  'diff-table': { label: 'chat.replyDiffTable', icon: Table2 },
  'structured-data': { label: 'chat.replyStructured', icon: Table2 },
  insight: { label: 'chat.replyInsight', icon: Lightbulb },
  comparison: { label: 'chat.replyComparison', icon: ArrowLeftRight }
} as const

const actionClass = 'rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-panel-2 disabled:opacity-50 aria-pressed:bg-panel-2 aria-pressed:font-medium'

function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }): React.JSX.Element {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-panel-2">
          <tr>{headers.map((header, i) => <th key={i} scope="col" className="px-3 py-2 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-line-soft">
              {row.map((cell, j) => <td key={j} className="min-w-20 break-words px-3 py-2 align-top">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function asText(value: string | number | boolean | null): string {
  return value === null ? '—' : String(value)
}

function Artifact({ view, render }: {
  view: Extract<ReplyView, { kind: 'artifact' }>
  render: (content: string) => ReactNode
}): React.JSX.Element {
  const t = useT()
  const [index, setIndex] = useState(view.versions.length - 1)
  const [raw, setRaw] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const version = view.versions[Math.min(index, view.versions.length - 1)]
  const copy = async (): Promise<void> => {
    try {
      setCopyState((await window.vexnar.app.copyText(version.body)).ok ? 'copied' : 'failed')
    } catch {
      setCopyState('failed')
    }
  }
  const step = (direction: number): void => {
    setIndex(index + direction)
    setCopyState('idle')
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-1 border-b border-line-soft px-2 py-1.5">
        <button type="button" className={actionClass} aria-pressed={!raw} onClick={() => setRaw(false)}>{t('chat.replyPreview')}</button>
        <button type="button" className={actionClass} aria-pressed={raw} onClick={() => setRaw(true)}>{t('chat.replyRaw')}</button>
        <button type="button" className={cn(actionClass, 'ml-auto')} onClick={() => void copy()}>
          {t(copyState === 'copied' ? 'chat.toolPayloadCopied' : 'chat.toolPayloadCopy')}
        </button>
      </div>
      <div className="max-h-80 overflow-auto p-3">
        {raw ? <pre className="whitespace-pre-wrap break-words font-mono text-xs">{version.body}</pre> : render(version.body)}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-3 py-1.5 text-xs text-muted">
        <span className="min-w-0 flex-1 break-words">{version.title}{version.note ? ` · ${version.note}` : ''}</span>
        <button type="button" className={actionClass} disabled={index <= 0} onClick={() => step(-1)}>{t('chat.toolPrevious')}</button>
        <button type="button" className={actionClass} disabled={index >= view.versions.length - 1} onClick={() => step(1)}>{t('chat.toolNext')}</button>
        {copyState === 'failed' ? <p role="status" className="text-danger">{t('chat.toolPayloadCopyFailed')}</p> : null}
      </div>
    </>
  )
}

export function ReplyViewCard({ view, render }: { view: ReplyView; render: (content: string) => ReactNode }): React.JSX.Element {
  const t = useT()
  const Icon = display[view.kind].icon
  let content: ReactNode
  switch (view.kind) {
    case 'artifact':
      content = <Artifact view={view} render={render} />
      break
    case 'diff':
      content = (
        <div className="grid divide-y divide-line-soft sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {[view.before, view.after].map((part, index) => (
            <div key={index} className={cn('min-w-0 px-3 py-2', index ? 'bg-accent-2/5' : 'bg-danger/5')}>
              <h4 className="text-xs font-medium">{t(index ? 'chat.replyAfter' : 'chat.replyBefore')}</h4>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">{part}</pre>
            </div>
          ))}
        </div>
      )
      break
    case 'structured-data':
      content = <Table headers={view.columns} rows={view.rows.map((row) => row.map(asText))} />
      break
    case 'diff-table':
      content = <Table headers={[t('chat.replyField'), t('chat.replyBefore'), t('chat.replyAfter')]} rows={view.rows.map((row) => [
        row.field,
        row.before === row.after ? asText(row.before) : <del className="text-danger">{asText(row.before)}</del>,
        row.before === row.after ? asText(row.after) : <span className="font-medium text-accent-2">{asText(row.after)}</span>
      ])} />
      break
    case 'comparison':
      content = <Table headers={[t('chat.replyField'), view.left, view.right]} rows={view.rows.map((row) => [row.field, asText(row.before), asText(row.after)])} />
      break
    case 'insight':
      content = (
        <div className="space-y-2 px-3 py-2">
          <p className="whitespace-pre-wrap break-words text-sm">{view.summary}</p>
          {view.metrics?.length ? (
            <dl className="grid gap-2 sm:grid-cols-2">
              {view.metrics.map((metric, index) => (
                <div key={index} className="min-w-0 rounded-md bg-panel-2 p-2.5">
                  <dt className="text-xs text-muted">{metric.label}</dt>
                  <dd className="break-words text-sm font-semibold">{asText(metric.value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      )
      break
  }
  return (
    <section aria-label={t(display[view.kind].label)} className="my-2 min-w-0 overflow-hidden rounded-xl border border-line-soft bg-panel/50">
      <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2">
        <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <h3 className="min-w-0 break-words text-sm font-medium">{view.title}</h3>
        <span className="text-xs text-muted">{t(display[view.kind].label)}</span>
      </header>
      {content}
    </section>
  )
}

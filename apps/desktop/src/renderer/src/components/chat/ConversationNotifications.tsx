// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { BellRing, Check, CircleAlert, ShieldCheck, Square, type LucideIcon } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { consoleRequest } from '@/lib/console'
import { useI18n, useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'

const stateLabel = {
  approval: 'chat.noticeApproval',
  failed: 'chat.executionFailed',
  stopped: 'chat.executionCancelled',
  completed: 'chat.executionCompleted'
} as const
type Kind = keyof typeof stateLabel
type Notice = { key: string; conversation_id: number; title: string; kind: Kind; at: string }

const icons: Record<Kind, LucideIcon> = {
  approval: ShieldCheck, failed: CircleAlert, stopped: Square, completed: Check
}
const storageKey = 'vexnar-chat-notice-read-v1'

function storedRead(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : []
  } catch {
    return []
  }
}

export function ConversationNotifications(): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const selectSession = useAppStore((state) => state.selectSession)
  const setView = useAppStore((state) => state.setView)
  const [items, setItems] = useState<Notice[] | null>(null)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState<'inbox' | 'digest'>('inbox')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [read, setRead] = useState(storedRead)

  useEffect(() => {
    let active = true
    void consoleRequest<{ items: Notice[] }>('/conversations/digest').then(({ items: next }) => {
      if (active) setItems(next)
    }, () => {
      if (active) setError(true)
    })
    return () => { active = false }
  }, [reload])

  const mark = (keys: string[]): void => {
    const next = [...new Set([...keys, ...read])].slice(0, 180)
    setRead(next)
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* tab keeps read state */ }
  }
  const open = (item: Notice): void => {
    mark([item.key])
    setView('chat')
    void selectSession(String(item.conversation_id))
  }
  const counts = { approval: 0, failed: 0, stopped: 0, completed: 0 }
  const unread = new Set((items ?? []).filter((item) => !read.includes(item.key)).map((item) => item.key))
  for (const item of items ?? []) counts[item.kind]++
  const nudge = items?.find((item) => item.kind === 'approval' && unread.has(item.key))
  const visible = items?.filter((item) => !onlyUnread || unread.has(item.key)) ?? []

  return (
    <div className="w-[min(340px,calc(100vw-24px))]">
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <h2 className="text-sm font-semibold text-ink">{t('app.notifications')}</h2>
        {unread.size > 0 ? (
          <button type="button" onClick={() => mark([...unread])} className="rounded px-2 py-1 text-xs text-accent hover:bg-panel-2">
            {t('chat.noticeMarkRead')}
          </button>
        ) : null}
      </div>
      {error ? (
        <button type="button" className="px-2.5 py-2 text-xs text-danger hover:underline" onClick={() => {
          setError(false)
          setReload(reload + 1)
        }}>{t('chat.noticeLoadError')}</button>
      ) : !items ? (
        <p role="status" className="px-2.5 py-2 text-xs text-muted">{t('chat.noticeLoading')}</p>
      ) : (
        <>
          <div className="flex gap-1 border-b border-line-soft px-2 pb-2">
            {(['inbox', 'digest'] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={tab === mode} onClick={() => setTab(mode)}
                className="rounded-md px-2 py-1 text-xs text-muted hover:bg-panel-2 aria-pressed:bg-panel-2 aria-pressed:text-ink">
                {t(mode === 'inbox' ? 'chat.noticeInbox' : 'chat.noticeDigest')}
              </button>
            ))}
          </div>
          {nudge && tab === 'inbox' ? (
            <DropdownMenu.Item onSelect={() => open(nudge)}
              className="mx-2 mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-warn/25 bg-warn/8 px-2.5 py-2 text-xs text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <BellRing className="size-4 shrink-0 text-warn" />
              <span className="min-w-0">
                <span className="block font-medium">{t('chat.noticeApproval')}</span>
                <span className="block truncate text-muted">{nudge.title}</span>
              </span>
            </DropdownMenu.Item>
          ) : null}
          {tab === 'digest' ? (
            <dl aria-label={t('chat.noticeDigest')} className="grid grid-cols-2 gap-1.5 p-2">
              {(Object.keys(counts) as Kind[]).map((kind) => (
                <div key={kind} className="rounded-lg bg-panel-2 px-2.5 py-2">
                  <dt className="text-xs text-muted">{t(stateLabel[kind])}</dt>
                  <dd className="text-sm font-semibold text-ink">{counts[kind]}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <>
              <label className="mx-2 my-2 flex items-center gap-1.5 px-1 text-xs text-muted">
                <input type="checkbox" checked={onlyUnread} onChange={(event) => setOnlyUnread(event.currentTarget.checked)} />
                {t('chat.noticeUnread')}
              </label>
              <div className="max-h-72 overflow-auto px-1 pb-1">
                {visible.length ? visible.map((item) => {
                  const Icon = icons[item.kind]
                  const date = new Date(item.at)
                  return (
                    <DropdownMenu.Item key={item.key} onSelect={() => open(item)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs outline-none data-[highlighted]:bg-panel-2">
                      <Icon className={cn('size-4 shrink-0', item.kind === 'approval' ? 'text-warn' : item.kind === 'failed' ? 'text-danger' : 'text-muted')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-soft">{item.title || t('app.newThread')}</span>
                        <span className="block text-[11px] text-muted">{t(stateLabel[item.kind])}</span>
                      </span>
                      {unread.has(item.key) ? <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label={t('chat.noticeUnread')} /> : null}
                      {Number.isFinite(date.getTime()) ? <time dateTime={item.at} className="shrink-0 text-[10px] text-muted">{date.toLocaleDateString(locale)}</time> : null}
                    </DropdownMenu.Item>
                  )
                }) : <p className="px-2.5 py-2 text-xs text-muted">{t('app.noNotifications')}</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { SessionDialog, type SessionAction } from './chat/SessionDialog'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowDown, ArrowUp, Loader2, Copy, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import type { Session } from '@shared/contracts'
import { useI18n, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'

const menuContent =
  'z-50 min-w-[168px] rounded-xl border border-line bg-bg p-1 codex-popover outline-none'
const menuItem =
  'flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12.5px] text-ink-soft outline-none data-[highlighted]:bg-panel-2 data-[highlighted]:text-ink'

export function SessionRow({
  session,
  active,
  pinned,
  showWorkspace = false,
  sidebar = false,
  moveUp,
  moveDown
}: {
  session: Session
  active: boolean
  pinned?: boolean
  showWorkspace?: boolean
  sidebar?: boolean
  moveUp?: () => void
  moveDown?: () => void
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const activeBusy = useAppStore((state) => active && state.busy)
  const running = active ? activeBusy : session.running
  const timestamp = new Date(session.updatedAt)
  const minutes = Math.floor(Math.max(0, Date.now() - session.updatedAt) / 60_000)
  const relative = minutes < 1 ? t('app.chatJustNow') :
    minutes < 60 ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-minutes, 'minute') :
      minutes < 1440 ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-Math.floor(minutes / 60), 'hour') :
        timestamp.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })
  const selectSession = useAppStore((state) => state.selectSession)
  const setView = useAppStore((state) => state.setView)
  const pinSession = useAppStore((state) => state.pinSession)
  const [action, setAction] = useState<SessionAction | null>(null)

  return (<>
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={cn(
            showWorkspace && 'min-h-10',
            'group relative flex min-h-[30px] items-center rounded-[7px] pl-2 pr-1',
            sidebar && 'pl-[31px]',
            active ? 'bg-[var(--codex-active)] text-ink' : 'text-ink-soft hover:bg-[var(--codex-hover)]'
          )}
        >
          <button
            type="button"
            aria-current={active ? 'page' : undefined}
            onDoubleClick={() => setAction('rename')}
            onClick={() => {
              if (sidebar) setView('chat')
              void selectSession(session.id)
            }}
            className="min-w-0 flex-1 truncate text-left text-[12.5px] leading-4"
            title={showWorkspace ? `${session.title} · ${session.workspace || t('app.unassigned')}` : session.title}
          >
            <span className="block truncate">{session.title}</span>
            {showWorkspace ? <span className="block truncate text-[10px] leading-3 text-muted">{session.workspace || t('app.unassigned')}</span> : null}
          </button>

          {sidebar && running ? (
            <span role="status" aria-label={t('chat.executionRunning')} className="mr-1 shrink-0 text-accent">
              <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden="true" />
            </span>
          ) : sidebar && !pinned && Number.isFinite(timestamp.getTime()) ? (
            <time dateTime={timestamp.toISOString()} title={timestamp.toLocaleString(locale)}
              className="mr-0.5 shrink-0 text-[10px] text-muted">
              {relative}
            </time>
          ) : null}
          {pinned ? (
            <Pin className="mr-1 h-3 w-3 shrink-0 text-muted/70" strokeWidth={1.8} />
          ) : null}

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={t('app.more')}
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted opacity-0 transition-opacity hover:bg-panel-3 hover:text-ink group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100',
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content side="right" align="start" sideOffset={6} className={menuContent}>
                <DropdownMenu.Item
                  className={menuItem}
                  onSelect={() => void pinSession(session.id, !session.pinned)}
                >
                  {session.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  {session.pinned ? t('app.unpin') : t('app.pin')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} onSelect={() => setAction('rename')}>
                  <Pencil className="size-3.5" />{t('app.renameSessionTitle')}
                </DropdownMenu.Item>
                {moveUp ? <DropdownMenu.Item className={menuItem} onSelect={moveUp}><ArrowUp className="size-3.5" />{t('app.movePinUp')}</DropdownMenu.Item> : null}
                {moveDown ? <DropdownMenu.Item className={menuItem} onSelect={moveDown}><ArrowDown className="size-3.5" />{t('app.movePinDown')}</DropdownMenu.Item> : null}
                <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
                <DropdownMenu.Item
                  className={cn(menuItem, 'text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger')}
                  onSelect={() => setAction('delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('app.delete')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContent}>
          <ContextMenu.Item
            className={menuItem}
            onSelect={() => void pinSession(session.id, !session.pinned)}
          >
            {session.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            {session.pinned ? t('app.unpin') : t('app.pin')}
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItem} onSelect={() => setAction('rename')}>
            <Pencil className="size-3.5" />{t('app.renameSessionTitle')}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItem}
            onSelect={() => void window.vexnar.app.copyText(session.title)}
          >
            <Copy className="h-3.5 w-3.5" />
            {t('app.copySessionTitle')}
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-line-soft" />
          <ContextMenu.Item
            className={cn(menuItem, 'text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger')}
            onSelect={() => setAction('delete')}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('app.delete')}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
    {action ? <SessionDialog key={action} action={action} session={session} close={() => setAction(null)} /> : null}
  </>)
}

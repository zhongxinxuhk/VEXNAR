// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Activity,
  BookOpenText,
  Bug,
  Clock3,
  Ellipsis,
  FolderClosed,
  GitBranch,
  Globe2,
  House,
  LayoutDashboard,
  Network,
  Pin,
  Puzzle,
  Settings,
  Shield,
  SquareCheckBig,
  SquareTerminal,
  Target
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useAppStore, type AppView } from '@/store/app'
import { useLayout } from '@/store/layout'
import { cn } from '@/lib/utils'
import { ProfileMenu } from '@/components/ProfileMenu'
import { UpdateNotice } from '@/components/UpdateNotice'
import { QuotaMenu } from '@/components/QuotaMenu'
import { Tooltip } from '@/components/ui'

const menuContent =
  'z-50 w-[196px] rounded-xl border border-line bg-bg p-1 codex-popover outline-none'
const menuItem =
  'flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-[5px] text-[12px] text-ink-soft outline-none data-[highlighted]:bg-panel-2 data-[highlighted]:text-ink'
const menuLabel = 'px-2.5 pb-1 pt-1.5 text-[10.5px] font-medium text-muted'

function RailButton({
  label,
  active,
  onClick,
  children
}: {
  label: string
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip label={label} side="right">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'no-drag grid h-8 w-8 place-items-center rounded-[9px] text-muted transition-colors',
          active ? 'rail-active' : 'hover:bg-panel-3/70 hover:text-ink'
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function IconRail(): React.JSX.Element {
  const t = useT()
  const view = useAppStore((state) => state.view)
  // 侧栏收起时图标栏与内容区同色，避免左侧留一条灰带
  const sidebarOpen = useLayout((state) => state.sidebarOpen)
  const railPins = useLayout((state) => state.railPins)
  const toggleRailPin = useLayout((state) => state.toggleRailPin)
  const setView = useAppStore((state) => state.setView)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const setRightTab = useAppStore((state) => state.setRightTab)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)

  const consoleItems: Array<{ id: AppView; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: t('nav.overview'), icon: LayoutDashboard },
    { id: 'tasks', label: t('nav.tasks'), icon: Target },
    { id: 'findings', label: t('nav.findings'), icon: Bug },
    { id: 'traffic', label: t('nav.traffic'), icon: Activity },
    { id: 'assets', label: t('nav.assets'), icon: Network },
    { id: 'commands', label: t('nav.commands'), icon: SquareTerminal }
  ]

  return (
    <aside
      className={cn(
        'relative z-20 flex w-[52px] shrink-0 flex-col items-center transition-colors duration-200',
        sidebarOpen ? 'bg-panel' : 'bg-bg',
        // 展开时与 ChatGPT 一致：图标栏与侧栏之间有一条 1px 分隔线；收起后通铺无线
        sidebarOpen &&
          'before:absolute before:bottom-0 before:right-0 before:top-2 before:w-px before:bg-line'
      )}
    >
      <div
        className="drag-region w-full shrink-0"
        style={{ height: 8 }}
      />

      <nav className="flex flex-col items-center gap-1.5">
        <RailButton label={t('rail.home')} active={view === 'chat'} onClick={() => setView('chat')}>
          <House className="h-[19px] w-[19px]" strokeWidth={1.9} />
        </RailButton>

        <RailButton
          label="插件"
          active={view === 'plugins'}
          onClick={() => setView('plugins')}
        >
          <Puzzle className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>

        <RailButton
          label="定时任务"
          active={view === 'schedules'}
          onClick={() => setView('schedules')}
        >
          <Clock3 className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>

        <RailButton
          label={t('rail.browse')}
          active={view === 'assets'}
          onClick={() => setView('assets')}
        >
          <Globe2 className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={t('rail.more')}
              className="no-drag grid h-8 w-8 place-items-center rounded-[9px] text-muted transition-colors hover:bg-panel-3/70 hover:text-ink"
            >
              <Ellipsis className="h-[19px] w-[19px]" strokeWidth={1.8} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content side="right" align="start" sideOffset={10} className={menuContent}>
              <div className={menuLabel}>{t('app.more')}</div>
              {consoleItems.map((item) => {
                const Icon = item.icon
                const pinned = railPins.includes(item.id)
                return (
                  <DropdownMenu.Item
                    key={item.id}
                    className={cn(menuItem, view === item.id && 'bg-panel-2 text-ink')}
                    onSelect={(event) => {
                      event.preventDefault()
                      setView(item.id)
                    }}
                  >
                    <Icon className="h-4 w-4 text-muted" strokeWidth={1.8} />
                    {item.label}
                    <button
                      type="button"
                      aria-label={pinned ? '从侧栏取消图钉' : '图钉固定到侧栏'}
                      title={pinned ? '从侧栏取消图钉' : '图钉固定到侧栏'}
                      className="ml-auto grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-panel-3 hover:text-ink data-[pinned=true]:text-ink"
                      data-pinned={pinned}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleRailPin(item.id)
                      }}
                      onSelect={(event) => event.stopPropagation()}
                    >
                      <Pin
                        className={cn('h-3.5 w-3.5', pinned && 'fill-current')}
                        strokeWidth={1.8}
                      />
                    </button>
                  </DropdownMenu.Item>
                )
              })}
              <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
              <DropdownMenu.Item className={menuItem} onSelect={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4 text-muted" strokeWidth={1.8} />
                {t('app.settings')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </nav>

      {/* 分隔线：图钉分区与固定按钮分组，ChatGPT 同款 */}
      <div className="my-1.5 h-px w-6 bg-line" aria-hidden="true" />

      <nav className="flex flex-col items-center gap-1.5">
        {/* 「更多」里钉住的分区：按钉住顺序从上到下 */}
        {railPins.map((pinId) => {
          const item = consoleItems.find((entry) => entry.id === pinId)
          if (!item) return null
          const Icon = item.icon
          return (
            <RailButton
              key={pinId}
              label={item.label}
              active={view === item.id}
              onClick={() => setView(item.id)}
            >
              <Icon className="h-[19px] w-[19px]" strokeWidth={1.8} />
            </RailButton>
          )
        })}

        <RailButton label={t('rail.workspace')} onClick={() => void chooseWorkspace()}>
          <FolderClosed className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>

        <RailButton label={t('rail.changes')} onClick={() => setRightTab('diff')}>
          <GitBranch className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>

        <RailButton
          label={t('rail.findings')}
          active={view === 'findings'}
          onClick={() => setView('findings')}
        >
          <Shield className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>
      </nav>

      <div className="mt-auto flex flex-col items-center gap-3 pb-3">
        <UpdateNotice />
        <QuotaMenu />
        <ProfileMenu />
      </div>
    </aside>
  )
}
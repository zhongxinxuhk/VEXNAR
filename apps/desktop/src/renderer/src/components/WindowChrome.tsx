// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { PanelLeft } from 'lucide-react'
import { useLayout } from '@/store/layout'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import { Tooltip } from './ui'

export function WindowChrome({
  compact = false
}: {
  /** 资料页等全宽页面收起侧栏，顶栏只保留窗口控件 */
  compact?: boolean
} = {}): React.JSX.Element {
  const toggle = useLayout((state) => state.toggleSidebar)
  const open = useLayout((state) => state.sidebarOpen)
  const width = useLayout((state) => state.sidebarWidth)
  const info = useAppStore((state) => state.info)
  const mac =
    (info?.platform ??
      (navigator.userAgent.includes('Mac') ? 'darwin' : '')) === 'darwin'
  return (
    <header
      className={cn(
        'drag-region relative flex h-11 shrink-0 items-center px-3 transition-colors duration-200',
        // 展开时顶栏与侧栏同色；收起后与内容区通铺
        open && !compact ? 'bg-panel' : 'bg-bg'
      )}
      aria-label="窗口工具栏"
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 bg-bg transition-[left] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
          open && 'rounded-tl-[18px]'
        )}
        style={{ left: 52 + (!compact && open ? width : 0) }}
      />
      <div className={mac ? 'w-[84px] shrink-0' : ''} />
      {compact ? null : (
        <Tooltip label={open ? '收起聊天列表' : '展开聊天列表'} side="bottom">
          <button
            type="button"
            aria-label="切换聊天列表"
            aria-expanded={open}
            onClick={toggle}
            className="no-drag relative z-40 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel-3 hover:text-ink"
          >
            <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
        </Tooltip>
      )}
    </header>
  )
}

export function SidebarResizeHandle(): React.JSX.Element | null {
  const width = useLayout((state) => state.sidebarWidth)
  const setWidth = useLayout((state) => state.setWidth)
  const open = useLayout((state) => state.sidebarOpen)
  if (!open) return null
  return (
    <div
      role="separator"
      aria-label="调整聊天列表宽度"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={200}
      aria-valuemax={420}
      tabIndex={0}
      onDoubleClick={() => setWidth(248)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          setWidth(width + (event.key === 'ArrowRight' ? 16 : -16))
        }
        if (event.key === 'Home') setWidth(200)
        if (event.key === 'End') setWidth(420)
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        const target = event.currentTarget
        const start = event.clientX
        target.setPointerCapture(event.pointerId)
        const move = (e: PointerEvent): void =>
          setWidth(width + e.clientX - start)
        const done = (): void => {
          target.removeEventListener('pointermove', move)
          target.removeEventListener('pointerup', done)
          target.removeEventListener('pointercancel', done)
        }
        target.addEventListener('pointermove', move)
        target.addEventListener('pointerup', done)
        target.addEventListener('pointercancel', done)
      }}
      className="no-drag relative z-30 -ml-[3px] -mr-[3px] w-[6px] shrink-0 cursor-col-resize touch-none outline-none before:absolute before:inset-y-0 before:left-[2px] before:w-[2px] hover:before:bg-ink/15 focus-visible:before:bg-accent"
    />
  )
}

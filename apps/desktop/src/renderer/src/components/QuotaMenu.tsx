// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Wallet } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { WalletDialog } from '@/components/WalletDialog'

/**
 * 侧栏额度入口。
 *
 * 只说明「额度来源」，不再展示余额、已用金额、请求数与用量进度条：
 * 上游 NewAPI 的额度口径与实际扣费并不一致（常见「余额 $0.01 / 已用 $53.33 / 已使用 100%」
 * 这类自相矛盾的读数），把数字摆出来反而误导用户。
 */
export function QuotaMenu(): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const description = t('quota.source')

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label={description}
        aria-expanded={open}
        title={description}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'no-drag grid h-8 w-8 place-items-center rounded-full text-muted outline-none transition-colors hover:bg-panel-3/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50',
          open && 'bg-panel-3/70 text-ink'
        )}
      >
        <Wallet className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </button>

      {open
        ? createPortal(
            // 挂到 body：图标栏的 z-20 会形成层叠上下文，使 z-30 的侧栏拖拽手柄
            // 压在浮层上，出现一条贯穿浮层的竖线。Portal 后 z-50 才能覆盖全窗口。
            <div
              ref={panelRef}
              role="dialog"
              aria-label={description}
              className="fixed bottom-[72px] left-[58px] z-50 w-max max-w-[260px] rounded-xl border border-line bg-bg px-3 py-2 text-[11.5px] leading-4 text-ink-soft codex-popover"
            >
              <div className="flex items-center justify-between gap-4">
                <span>{description}</span>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setWalletOpen(true)
                  }}
                  className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:bg-panel-2 hover:text-ink"
                >
                  {t('quota.recharge')}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      <WalletDialog open={walletOpen} onOpenChange={setWalletOpen} />
    </>
  )
}

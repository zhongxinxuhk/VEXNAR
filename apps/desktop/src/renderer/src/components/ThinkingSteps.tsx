// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { cn } from '@/lib/utils'

export type ThinkingStep = {
  id: string
  label: string
  status: 'done' | 'active' | 'pending'
}

/**
 * 思考步骤（移植 Halaska UI 的 Thinking Steps 形态，未引入其 870KB 单体包）：
 * 实心点 + 呼吸环表示进行中，已完成点变小并降到次级色，未到步骤半透明。
 * 用于 agent 运行中的工具活动与等待首 token 的占位。
 */
export function ThinkingSteps({
  steps,
  className
}: {
  steps: ThinkingStep[]
  className?: string
}): React.JSX.Element {
  return (
    <div
      role="list"
      aria-live="polite"
      className={cn('flex flex-col gap-2.5 py-1', className)}
    >
      {steps.map((step) => {
        const active = step.status === 'active'
        const done = step.status === 'done'
        return (
          <div
            key={step.id}
            role="listitem"
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-center gap-3 transition-opacity',
              step.status === 'pending' && 'opacity-45'
            )}
          >
            <span className="relative grid h-3.5 w-3.5 shrink-0 place-items-center">
              <span
                className={cn(
                  'rounded-full transition-all duration-300',
                  active && 'h-2.5 w-2.5 bg-accent',
                  done && 'h-2 w-2 bg-muted',
                  step.status === 'pending' && 'h-1.5 w-1.5 border border-line bg-transparent'
                )}
              />
              {active ? (
                <span className="thinking-ring absolute h-3.5 w-3.5 rounded-full border-[1.5px] border-accent/70" />
              ) : null}
            </span>
            <span
              className={cn(
                'min-w-0 truncate text-[12.5px] transition-colors',
                active && 'font-medium text-ink',
                done && 'text-muted',
                step.status === 'pending' && 'text-muted'
              )}
            >
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

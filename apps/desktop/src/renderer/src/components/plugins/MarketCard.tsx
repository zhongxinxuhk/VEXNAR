// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Blocks, ExternalLink, Sparkles } from 'lucide-react'
import { Button } from '../ui'
import { cn } from '@/lib/utils'
import { Chip, IconTile, transportTone } from './common'
import { marketItemEndpoint } from './api'
import type { MarketItem } from './types'

/**
 * 市场卡片：MCP 与技能共用同一套骨架，只换图标与副标题来源。
 * 抽成组件是为了两边不会再次各写一套、慢慢走形。
 */
export function MarketCard({
  item,
  installed,
  onInstall
}: {
  item: MarketItem
  installed: boolean
  onInstall: () => void
}): React.JSX.Element {
  const isSkill = item.kind === 'skills'
  const meta = isSkill
    ? `${item.repo ?? ''}${item.path ? `/${item.path}` : ''}`
    : marketItemEndpoint(item)
  return (
    <div className="flex flex-col rounded-xl border border-line-soft bg-bg p-3.5 transition-colors hover:border-line hover:bg-panel/40">
      <div className="flex items-start gap-2.5">
        <IconTile size={30} tone={isSkill ? 'text-ink-soft' : 'text-ink-soft'}>
          {isSkill ? (
            <Sparkles className="h-[15px] w-[15px]" strokeWidth={1.8} />
          ) : (
            <Blocks className="h-[15px] w-[15px]" strokeWidth={1.8} />
          )}
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-ink">{item.name}</span>
            {item.kind === 'mcp' ? (
              <Chip mono tone={transportTone[item.transport ?? 'stdio'] ?? 'muted'}>
                {item.transport ?? 'stdio'}
              </Chip>
            ) : null}
            {item.builtin ? <Chip>内置</Chip> : null}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-[18px] text-muted">
            {item.description || meta}
          </div>
        </div>
        {installed ? <Chip tone="success">已安装</Chip> : null}
      </div>

      {(item.tags ?? []).length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {(item.tags ?? []).slice(0, 4).map((tag) => (
            <span key={tag} className="rounded bg-panel-2 px-1.5 py-[1px] text-[10.5px] text-muted">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line-soft pt-2.5">
        <span className="min-w-0 truncate font-mono text-[10.5px] text-muted" title={meta}>
          {item.source_name ?? '市场'}
          {item.kind === 'mcp' && item.env && Object.keys(item.env).length > 0 ? ' · 需要密钥' : ''}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {item.homepage ? (
            <a
              href={item.homepage}
              target="_blank"
              rel="noreferrer"
              title="打开主页"
              className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-ink"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className={cn(
              'h-7 rounded-full px-2.5 text-[11.5px]',
              installed ? 'border-line text-ink-soft' : 'border-accent/30 text-accent hover:bg-accent/5 hover:text-accent'
            )}
            onClick={onInstall}
          >
            {installed ? (isSkill ? '更新' : '重新配置') : '安装'}
          </Button>
        </div>
      </div>
    </div>
  )
}

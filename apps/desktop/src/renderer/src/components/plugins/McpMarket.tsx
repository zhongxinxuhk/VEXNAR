// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileJson, Plus, RefreshCw, Store } from 'lucide-react'
import { Button } from '../ui'
import { Chip, EmptyState, IconButton, SearchBox, Spinner } from './common'
import { marketApi } from './api'
import type { MarketItem, MarketSource, McpServer } from './types'
import { McpFormDialog, McpImportDialog, MarketSourceDialog } from './dialogs'
import { MarketCard } from './MarketCard'
import { cn } from '@/lib/utils'

/** MCP 市场：条目来自官方市场 + 自定义 GitHub 市场源，安装前可改配置。 */
export function McpMarket({
  servers,
  sources,
  onReload,
  onToast,
  onGoManage
}: {
  servers: McpServer[]
  sources: MarketSource[]
  onReload: () => Promise<void> | void
  onToast: (message: string, tone?: 'ok' | 'error' | 'info') => void
  onGoManage: () => void
}): React.JSX.Element {
  const [items, setItems] = useState<MarketItem[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [preset, setPreset] = useState<MarketItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)

  const load = useCallback(
    async (refresh: boolean) => {
      setLoading(true)
      try {
        const data = await marketApi.items('mcp', refresh)
        setItems(data.items ?? [])
        setWarnings(data.warnings ?? [])
      } catch (err) {
        setWarnings([err instanceof Error ? err.message : String(err)])
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const installed = useMemo(() => new Set(servers.map((server) => server.name.toLowerCase())), [servers])

  const tags = useMemo(() => {
    const counter = new Map<string, number>()
    for (const item of items) {
      for (const value of item.tags ?? []) counter.set(value, (counter.get(value) ?? 0) + 1)
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value]) => value)
  }, [items])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      if (sourceFilter !== 'all' && String(item.source_id ?? 'builtin') !== sourceFilter) return false
      if (tag && !(item.tags ?? []).includes(tag)) return false
      if (!needle) return true
      return (
        item.name.toLowerCase().includes(needle) ||
        (item.description ?? '').toLowerCase().includes(needle) ||
        (item.command ?? '').toLowerCase().includes(needle)
      )
    })
  }, [items, query, tag, sourceFilter])

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-semibold text-ink">MCP 市场</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            市场就是一个 GitHub 仓库目录，官方市场是 VEXNAR 的 market/，也可以加自己的源。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <SearchBox value={query} onChange={setQuery} placeholder="搜索 MCP 市场" />
          <IconButton
            label="重新同步市场"
            onClick={async () => {
              await load(true)
              await onReload()
            }}
          >
            {loading ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
          </IconButton>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setImportOpen(true)}>
            <FileJson className="h-3.5 w-3.5" />
            导入 JSON
          </Button>
          <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setSourceOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            市场源
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSourceFilter('all')}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors',
            sourceFilter === 'all' ? 'border-ink/15 bg-panel-2 text-ink' : 'border-line-soft text-muted hover:text-ink'
          )}
        >
          全部来源
          <span className="font-mono text-[10px] text-muted">{items.length}</span>
        </button>
        {sources
          .filter((source) => source.kind !== 'skills')
          .map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => setSourceFilter(String(source.id))}
              className={cn(
                'flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors',
                sourceFilter === String(source.id)
                  ? 'border-ink/15 bg-panel-2 text-ink'
                  : 'border-line-soft text-muted hover:text-ink'
              )}
            >
              {source.name}
              {source.official ? <Chip tone="accent">官方</Chip> : null}
              {source.last_error ? <span className="text-danger">!</span> : null}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setSourceOpen(true)}
          className="flex h-6 items-center gap-1 rounded-full border border-dashed border-line px-2.5 text-[11px] text-muted transition-colors hover:text-ink"
        >
          <Plus className="h-3 w-3" />
          添加源
        </button>
      </div>

      {tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTag('')}
            className={cn(
              'h-6 rounded-md px-2 text-[11px] transition-colors',
              tag === '' ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'
            )}
          >
            全部标签
          </button>
          {tags.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTag(tag === value ? '' : value)}
              className={cn(
                'h-6 rounded-md px-2 text-[11px] transition-colors',
                tag === value ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'
              )}
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mt-3 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[11.5px] leading-5 text-warn">
          {warnings.join('；')}
        </div>
      ) : null}

      <div className="mt-4">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-muted">
            <Spinner /> 正在同步市场…
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Store className="h-5 w-5" />}
            title="没有匹配的 MCP"
            description="换关键词或标签试试；也可以添加自己的市场源，或直接导入 JSON 配置。"
            actions={
              <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setSourceOpen(true)}>
                添加市场源
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {visible.map((item) => (
              <MarketCard
                key={item.id}
                item={item}
                installed={installed.has(item.name.toLowerCase())}
                onInstall={() => {
                  setPreset(item)
                  setFormOpen(true)
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-line-soft bg-panel/50 p-3.5">
        <div className="text-[12px] font-medium text-ink">市场是怎么来的</div>
        <p className="mt-1 text-[11.5px] leading-5 text-muted">
          每个市场源就是一个 GitHub 仓库目录。目录里有 <code className="font-mono">market.json</code> 时按索引导入；
          只有 <code className="font-mono">mcp.json</code> 时按 Claude / CC Switch 的 mcpServers 格式读取。
          官方市场：<span className="font-mono">zhongxinxuhk/VEXNAR · market/</span>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-full" onClick={onGoManage}>
            回到 MCP 管理
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => void load(true)}>
            重新同步
          </Button>
        </div>
      </div>

      <McpFormDialog
        open={formOpen}
        server={null}
        preset={preset}
        onClose={() => setFormOpen(false)}
        onSaved={(message) => {
          onToast(message)
          void onReload()
          void load(false)
        }}
      />
      <McpImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(message) => {
          onToast(message)
          void onReload()
        }}
      />
      <MarketSourceDialog
        open={sourceOpen}
        kind="mcp"
        onClose={() => setSourceOpen(false)}
        onAdded={async (message) => {
          onToast(message, message.includes('失败') ? 'error' : 'ok')
          await onReload()
          await load(true)
        }}
      />
    </div>
  )
}

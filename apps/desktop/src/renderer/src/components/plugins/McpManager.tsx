// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, useState } from 'react'
import {
  Blocks,
  ChevronDown,
  FileJson,
  Pencil,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { Button } from '../ui'
import { Chip, EmptyState, IconButton, IconTile, SearchBox, Segmented, Spinner, Switch, transportTone } from './common'
import { mcpApi, mcpEndpoint } from './api'
import type { McpServer, McpTool } from './types'
import { McpFormDialog, McpImportDialog, ConfirmDialog } from './dialogs'
import { cn } from '@/lib/utils'

/** MCP 管理：启停、看工具、刷新工具、编辑与删除，全部就地完成。 */
export function McpManager({
  servers,
  loading,
  onReload,
  onToast,
  onBrowseMarket
}: {
  servers: McpServer[]
  loading: boolean
  onReload: () => Promise<void> | void
  onToast: (message: string, tone?: 'ok' | 'error' | 'info') => void
  onBrowseMarket: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [tools, setTools] = useState<Record<number, McpTool[]>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<McpServer | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [deleting, setDeleting] = useState<McpServer | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return servers.filter((server) => {
      if (filter === 'on' && !server.enabled) return false
      if (filter === 'off' && server.enabled) return false
      if (!needle) return true
      return (
        server.name.toLowerCase().includes(needle) ||
        (server.command ?? '').toLowerCase().includes(needle) ||
        (server.url ?? '').toLowerCase().includes(needle)
      )
    })
  }, [servers, query, filter])

  const counts = useMemo(
    () => ({
      all: servers.length,
      on: servers.filter((server) => server.enabled).length,
      off: servers.filter((server) => !server.enabled).length
    }),
    [servers]
  )

  const loadTools = async (server: McpServer): Promise<void> => {
    try {
      const data = await mcpApi.tools(server.id)
      setTools((prev) => ({ ...prev, [server.id]: data.tools ?? [] }))
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const toggleExpand = async (server: McpServer): Promise<void> => {
    if (expanded === server.id) {
      setExpanded(null)
      return
    }
    setExpanded(server.id)
    if (!tools[server.id]) await loadTools(server)
  }

  const refreshTools = async (server: McpServer): Promise<void> => {
    setBusy(server.id)
    try {
      const data = await mcpApi.refresh(server.id)
      setTools((prev) => ({ ...prev, [server.id]: data.tools ?? [] }))
      onToast(`${server.name}：发现 ${data.tools?.length ?? 0} 个工具`)
      await onReload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const toggleEnabled = async (server: McpServer, next: boolean): Promise<void> => {
    setBusy(server.id)
    try {
      await mcpApi.setEnabled(server.id, next)
      onToast(`${server.name} 已${next ? '启用' : '停用'}`)
      await onReload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-semibold text-ink">MCP 管理</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            已连接的 MCP 服务器决定 agent 能调用哪些外部工具；停用只是不让会话加载它。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <SearchBox value={query} onChange={setQuery} placeholder="搜索 MCP" />
          <IconButton label="刷新列表" onClick={() => void onReload()}>
            {loading ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
          </IconButton>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setImportOpen(true)}>
            <FileJson className="h-3.5 w-3.5" />
            导入
          </Button>
          <Button
            size="sm"
            className="rounded-full px-3.5"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            添加 MCP
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部', count: counts.all },
            { value: 'on', label: '已启用', count: counts.on },
            { value: 'off', label: '已停用', count: counts.off }
          ]}
        />
        <button
          type="button"
          onClick={onBrowseMarket}
          className="text-[11.5px] text-muted transition-colors hover:text-ink"
        >
          从市场安装 →
        </button>
      </div>

      <div className="mt-3">
        {visible.length === 0 ? (
          <EmptyState
            icon={<Blocks className="h-5 w-5" />}
            title={servers.length === 0 ? '还没有配置 MCP 服务器' : '没有匹配的 MCP'}
            description={
              servers.length === 0
                ? '可以从市场一键安装常用服务器，也可以手写命令或导入 Claude / CC Switch 的 JSON 配置。'
                : '换个关键词，或切换筛选条件。'
            }
            actions={
              <>
                <Button size="sm" className="rounded-full" onClick={onBrowseMarket}>
                  浏览 MCP 市场
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  手动添加
                </Button>
              </>
            }
          />
        ) : (
          <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft">
            {visible.map((server) => {
              const open = expanded === server.id
              const toolList = tools[server.id]
              return (
                <div key={server.id} className={cn('transition-colors', !server.enabled && 'bg-panel/40')}>
                  <div className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-panel/60">
                    <IconTile size={32} tone={server.enabled ? 'text-ink-soft' : 'text-muted'}>
                      <Blocks className="h-[15px] w-[15px]" strokeWidth={1.8} />
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-ink">{server.name}</span>
                        <Chip mono tone={transportTone[server.transport] ?? 'muted'}>
                          {server.transport}
                        </Chip>
                        {server.tools?.length ? <Chip>{server.tools.length} 个工具</Chip> : null}
                        {!server.enabled ? <Chip tone="warn">已停用</Chip> : null}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                        {mcpEndpoint(server) || '—'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconButton label="发现工具" onClick={() => void refreshTools(server)} disabled={busy === server.id}>
                        {busy === server.id ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </IconButton>
                      <IconButton label={open ? '收起工具' : '查看工具'} onClick={() => void toggleExpand(server)} active={open}>
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
                      </IconButton>
                      <IconButton
                        label="编辑"
                        onClick={() => {
                          setEditing(server)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="删除" danger onClick={() => setDeleting(server)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                      <div className="ml-1.5">
                        <Switch
                          checked={server.enabled}
                          onChange={(next) => void toggleEnabled(server, next)}
                          disabled={busy === server.id}
                          label={`${server.name} 启用状态`}
                        />
                      </div>
                    </div>
                  </div>
                  {open ? (
                    <div className="border-t border-line-soft bg-panel px-3.5 py-3">
                      {toolList === undefined ? (
                        <div className="flex items-center gap-2 text-[11.5px] text-muted">
                          <Spinner /> 读取缓存工具列表…
                        </div>
                      ) : toolList.length === 0 ? (
                        <div className="text-[11.5px] text-muted">
                          还没有工具缓存。点右上角「刷新工具」实际连接一次（npx 首次启动可能较慢）。
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
                          {toolList.map((tool) => (
                            <div key={tool.name} className="min-w-0">
                              <div className="truncate font-mono text-[11.5px] text-ink">{tool.name}</div>
                              {tool.description ? (
                                <div className="line-clamp-2 text-[11px] leading-4 text-muted">{tool.description}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <McpFormDialog
        open={formOpen}
        server={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(message) => {
          onToast(message)
          void onReload()
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
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`删除 MCP「${deleting?.name ?? ''}」？`}
        description="配置与工具缓存会一起删除，agent 将无法再调用它的工具。此操作不可撤销。"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          await mcpApi.remove(deleting.id)
          onToast(`已删除 ${deleting.name}`)
          await onReload()
        }}
      />
    </div>
  )
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from 'react'
import { Blocks, Compass, PlugZap, RefreshCw, Sparkles, Store } from 'lucide-react'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { marketApi, mcpApi, skillApi } from './plugins/api'
import type { MarketSource, McpServer, Skill } from './plugins/types'
import { Toast, friendlyError } from './plugins/common'
import { McpManager } from './plugins/McpManager'
import { McpMarket } from './plugins/McpMarket'
import { SkillsManager } from './plugins/SkillsManager'
import { SkillsMarket } from './plugins/SkillsMarket'
import { MarketSourceDialog, ConfirmDialog } from './plugins/dialogs'

type Tab = 'mcp' | 'mcp-market' | 'skills' | 'skills-market'

type ToastState = { message: string; tone: 'ok' | 'error' | 'info' }

const NAV: { id: Tab; label: string; icon: typeof Blocks; group: '管理' | '市场' }[] = [
  { id: 'mcp', label: 'MCP 管理', icon: Blocks, group: '管理' },
  { id: 'skills', label: '技能管理', icon: Sparkles, group: '管理' },
  { id: 'mcp-market', label: 'MCP 市场', icon: Store, group: '市场' },
  { id: 'skills-market', label: '技能市场', icon: Compass, group: '市场' }
]

/** 插件页：左侧是「管理 / 市场 / 市场源」导航，右侧是四个面板之一。 */
export function PluginsView(): React.JSX.Element {
  const backend = useAppStore((state) => state.backend)
  const [tab, setTab] = useState<Tab>('mcp')
  const [servers, setServers] = useState<McpServer[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [sources, setSources] = useState<MarketSource[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [removingSource, setRemovingSource] = useState<MarketSource | null>(null)
  const toastTimer = useRef<number | null>(null)
  const connected = Boolean(backend?.connected)

  const notify = useCallback((message: string, tone: 'ok' | 'error' | 'info' = 'ok') => {
    setToast({ message: tone === 'error' ? friendlyError(message) : message, tone })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3600)
  }, [])

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    },
    []
  )

  const reloadMcp = useCallback(async () => {
    try {
      const data = await mcpApi.list()
      setServers(data.servers ?? [])
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [notify])

  const reloadSkills = useCallback(async () => {
    try {
      const data = await skillApi.list()
      setSkills(data.skills ?? [])
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [notify])

  const reloadSources = useCallback(async () => {
    try {
      const data = await marketApi.sources()
      setSources(data.sources ?? [])
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [notify])

  const reloadAll = useCallback(async () => {
    if (!connected) return
    setLoading(true)
    try {
      await Promise.all([reloadMcp(), reloadSkills(), reloadSources()])
    } finally {
      setLoading(false)
    }
  }, [connected, reloadMcp, reloadSkills, reloadSources])

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  // 旧版内置后端不会返回 enabled 字段 / 没有启停路由：给一条明确的提示，
  // 而不是让用户面对一排"已停用"和 404。
  const staleBackend = connected && skills.length > 0 && skills.some((skill) => typeof skill.enabled !== 'boolean')

  const sourceCount = (kind: 'mcp' | 'skills'): number =>
    sources.filter((source) => source.kind === 'all' || source.kind === kind).length

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside className="flex w-[200px] shrink-0 flex-col border-r border-line-soft bg-bg px-2.5 py-3">
        <div className="px-2 pb-1 text-[11px] font-medium text-muted">管理</div>
        {NAV.filter((item) => item.group === '管理').map((item) => (
          <NavRow
            key={item.id}
            active={tab === item.id}
            label={item.label}
            icon={<item.icon className="h-3.5 w-3.5" strokeWidth={1.8} />}
            count={item.id === 'mcp' ? servers.length : skills.length}
            onClick={() => setTab(item.id)}
          />
        ))}

        <div className="px-2 pb-1 pt-4 text-[11px] font-medium text-muted">市场</div>
        {NAV.filter((item) => item.group === '市场').map((item) => (
          <NavRow
            key={item.id}
            active={tab === item.id}
            label={item.label}
            icon={<item.icon className="h-3.5 w-3.5" strokeWidth={1.8} />}
            count={sourceCount(item.id === 'mcp-market' ? 'mcp' : 'skills')}
            countSuffix="源"
            onClick={() => setTab(item.id)}
          />
        ))}

        <div className="flex items-center justify-between px-2 pb-1 pt-4">
          <span className="text-[11px] font-medium text-muted">市场源</span>
          <button
            type="button"
            onClick={() => setSourceOpen(true)}
            className="text-[11px] text-muted transition-colors hover:text-ink"
          >
            添加
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sources.map((source) => (
            <div
              key={source.id}
              className="group flex h-[28px] items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-ink-soft hover:bg-panel-2"
              title={source.last_error ? `同步失败：${source.last_error}` : `${source.repo}/${source.path}`}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  source.last_error ? 'bg-danger' : source.official ? 'bg-accent' : 'bg-accent-2'
                )}
              />
              <span className="min-w-0 flex-1 truncate">{source.name}</span>
              {!source.official ? (
                <button
                  type="button"
                  onClick={() => setRemovingSource(source)}
                  className="hidden shrink-0 text-[10px] text-muted transition-colors hover:text-danger group-hover:block"
                >
                  移除
                </button>
              ) : null}
            </div>
          ))}
          {sources.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-muted">{connected ? '暂无市场源' : '后端未连接'}</div>
          ) : null}
        </div>
        <div className="mt-2 border-t border-line-soft px-2 pt-2 text-[10.5px] leading-4 text-muted">
          市场 = GitHub 仓库目录
        </div>
      </aside>

      <section className="min-h-0 min-w-0 flex-1 overflow-y-auto px-7 py-6">
        <div className="mx-auto w-full max-w-[1040px]">
          {staleBackend ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-warn/25 bg-warn/5 px-3 py-2 text-[11.5px] leading-5 text-warn">
              <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              <span>
                桌面端内置的 Go 后端是旧版本：列表缺少启用状态，启停会返回 404。重新构建
                （<span className="font-mono">npm run backend:prepare</span>）并重启应用即可。
              </span>
            </div>
          ) : null}
          {!connected ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-line-soft px-6 py-16 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-line-soft bg-panel-2 text-muted">
                <PlugZap className="h-5 w-5" />
              </span>
              <div className="mt-3 text-[13px] font-medium text-ink">Go 后端未连接</div>
              <div className="mt-1 max-w-[420px] text-[12px] leading-5 text-muted">
                MCP 与技能都由后端管理（配置在 PostgreSQL、技能在 skills 目录），后端启动后这里会自动加载。
              </div>
              <button
                type="button"
                onClick={() => void reloadAll()}
                className="mt-4 flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11.5px] text-ink-soft transition-colors hover:bg-panel-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重试
              </button>
            </div>
          ) : tab === 'mcp' ? (
            <McpManager
              servers={servers}
              loading={loading}
              onReload={async () => {
                await reloadMcp()
              }}
              onToast={notify}
              onBrowseMarket={() => setTab('mcp-market')}
            />
          ) : tab === 'mcp-market' ? (
            <McpMarket
              servers={servers}
              sources={sources}
              onReload={async () => {
                await Promise.all([reloadMcp(), reloadSources()])
              }}
              onToast={notify}
              onGoManage={() => setTab('mcp')}
            />
          ) : tab === 'skills' ? (
            <SkillsManager
              skills={skills}
              loading={loading}
              onReload={async () => {
                await reloadSkills()
              }}
              onToast={notify}
              onBrowseMarket={() => setTab('skills-market')}
            />
          ) : (
            <SkillsMarket
              skills={skills}
              sources={sources}
              onReload={async () => {
                await Promise.all([reloadSkills(), reloadSources()])
              }}
              onToast={notify}
              onGoManage={() => setTab('skills')}
            />
          )}
        </div>
      </section>

      <MarketSourceDialog
        open={sourceOpen}
        kind="all"
        onClose={() => setSourceOpen(false)}
        onAdded={(message) => {
          notify(message, message.includes('失败') ? 'error' : 'ok')
          void reloadSources()
        }}
      />
      <ConfirmDialog
        open={Boolean(removingSource)}
        title={`移除市场源「${removingSource?.name ?? ''}」？`}
        description="只会从列表移除这个源及其缓存条目，已安装的 MCP / 技能不受影响。"
        confirmLabel="移除"
        onClose={() => setRemovingSource(null)}
        onConfirm={async () => {
          if (!removingSource) return
          await marketApi.removeSource(removingSource.id)
          notify(`已移除 ${removingSource.name}`)
          await reloadSources()
        }}
      />

      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
    </div>
  )
}

function NavRow({
  active,
  label,
  icon,
  count,
  countSuffix,
  onClick
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  count?: number
  countSuffix?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-[30px] items-center gap-2 rounded-lg px-2 text-[12.5px] transition-colors',
        active ? 'bg-panel-2 text-ink' : 'text-ink-soft hover:bg-panel-2 hover:text-ink'
      )}
    >
      <span className={cn('shrink-0', active ? 'text-ink' : 'text-muted')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {typeof count === 'number' && count > 0 ? (
        <span className="shrink-0 font-mono text-[10px] text-muted">
          {count}
          {countSuffix ?? ''}
        </span>
      ) : null}
    </button>
  )
}

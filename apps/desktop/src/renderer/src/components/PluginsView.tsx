// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, useState } from 'react'
import {
  Blocks,
  CircleHelp,
  Cloud,
  FileCode2,
  GitBranch as Github,
  Globe2,
  Mail,
  Puzzle,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  SquareTerminal
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'

type Plugin = {
  id: string
  name: string
  desc: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  tone: string
  installed?: boolean
}

/** 热门：已接入或可一键接入的能力 */
const HOT: Plugin[] = [
  { id: 'github', name: 'GitHub', desc: '提交 PR、查看 Issue、读取 CI 结果', icon: Github, tone: 'text-ink' },
  { id: 'platform', name: '平台控制台', desc: '读取额度、推荐计划与账号状态', icon: Cloud, tone: 'text-[#4a86e8]' },
  { id: 'terminal', name: '终端', desc: '在本机执行命令，输出回到对话里', icon: SquareTerminal, tone: 'text-ink', installed: true },
  { id: 'files', name: '工作区文件', desc: '读写项目文件、查看变更 diff', icon: FileCode2, tone: 'text-ink', installed: true },
  { id: 'scanner', name: '安全扫描', desc: '任务、发现与资产的多级链路分析', icon: Shield, tone: 'text-ink', installed: true },
  { id: 'browse', name: '网页抓取', desc: '抓取页面正文并转成可读文本', icon: Globe2, tone: 'text-ink' }
]

/** 新品推荐：尚在接入中的连接器 */
const NEW: Plugin[] = [
  { id: 'mail', name: '邮件', desc: '读取收件箱、起草与发送邮件', icon: Mail, tone: 'text-[#d93025]' },
  { id: 'codex-security', name: 'Codex Security', desc: '与安全审计工作流联动', icon: Shield, tone: 'text-[#6b4fbb]' },
  { id: 'notion', name: '知识库', desc: '检索团队文档与规范', icon: Blocks, tone: 'text-ink' },
  { id: 'skills', name: '技能市场', desc: '安装他人整理的技能包', icon: Sparkles, tone: 'text-[#c58b00]' }
]

function PluginCard({
  plugin,
  onAction
}: {
  plugin: Plugin
  onAction: (plugin: Plugin) => void
}): React.JSX.Element {
  const Icon = plugin.icon
  return (
    <button
      type="button"
      onClick={() => onAction(plugin)}
      className="group flex items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-panel-2"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-line-soft bg-bg">
        <Icon className={cn('h-[18px] w-[18px]', plugin.tone)} strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{plugin.name}</span>
        <span className="block truncate text-[11.5px] text-muted">{plugin.desc}</span>
      </span>
      <span
        className={cn(
          'grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted',
          'opacity-0 transition-opacity group-hover:opacity-100'
        )}
      >
        {plugin.installed ? '···' : '+'}
      </span>
    </button>
  )
}

export function PluginsView(): React.JSX.Element {
  const setView = useAppStore((state) => state.setView)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')

  const filter = (list: Plugin[]): Plugin[] =>
    list.filter(
      (plugin) =>
        !query.trim() ||
        plugin.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        plugin.desc.includes(query.trim())
    )

  const installed = useMemo(() => [...HOT, ...NEW].filter((plugin) => plugin.installed), [])
  const hot = filter(HOT)
  const fresh = filter(NEW)

  const onAction = (plugin: Plugin): void => {
    setNotice(
      plugin.installed
        ? `${plugin.name} 已启用，无需重复安装`
        : `${plugin.name} 需要连接器授权，当前版本尚未开放`
    )
    window.setTimeout(() => setNotice(''), 2600)
  }

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧：自定义 / 已安装 */}
      <div className="flex w-[188px] shrink-0 flex-col gap-1 border-r border-line-soft px-2.5 py-3">
        <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-muted">自定义</div>
        <button
          type="button"
          className="flex h-[30px] items-center gap-2 rounded-lg bg-panel-2 px-2 text-[12.5px] text-ink"
        >
          <Puzzle className="h-3.5 w-3.5" strokeWidth={1.8} />
          插件
        </button>
        <button
          type="button"
          onClick={() => setView('schedules')}
          className="flex h-[30px] items-center gap-2 rounded-lg px-2 text-[12.5px] text-ink-soft transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
          技能
        </button>

        <div className="px-2 pb-1.5 pt-4 text-[11px] font-medium text-muted">已安装</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {installed.map((plugin) => {
            const Icon = plugin.icon
            return (
              <div
                key={plugin.id}
                className="flex h-[28px] items-center gap-2 rounded-lg px-2 text-[12.5px] text-ink-soft"
              >
                <Icon className="h-3.5 w-3.5 text-muted" strokeWidth={1.8} />
                <span className="truncate">{plugin.name}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 右侧：插件市场 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-semibold text-ink">插件</h1>
            <p className="mt-1 text-[12.5px] text-muted">
              连接插件，让 VEXNAR 在你的各类工具中协同工作
            </p>
            <span className="mt-3 inline-flex items-center rounded-full border border-line-soft px-2.5 py-0.5 text-[11px] text-ink-soft">
              公开
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex h-8 w-[220px] items-center gap-2 rounded-full bg-panel-2 px-3">
              <Search className="h-3.5 w-3.5 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索插件"
                className="h-full w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-muted"
              />
            </div>
            <button
              type="button"
              aria-label="刷新"
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="帮助"
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink"
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-full bg-[#1f2023] px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            >
              添加
            </button>
          </div>
        </div>

        <section className="mt-7">
          <div className="flex items-center gap-1 text-[12px] font-medium text-ink">
            热门 <span className="text-muted">›</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-8">
            {hot.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} onAction={onAction} />
            ))}
          </div>
        </section>

        <section className="mt-7">
          <div className="flex items-center gap-1 text-[12px] font-medium text-ink">
            新品推荐 <span className="text-muted">›</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-8">
            {fresh.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} onAction={onAction} />
            ))}
          </div>
        </section>

        {hot.length + fresh.length === 0 ? (
          <div className="py-16 text-center text-[12.5px] text-muted">没有匹配的插件</div>
        ) : null}
      </div>

      {notice ? (
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-line bg-bg px-3.5 py-2 text-[12px] text-ink codex-popover"
        >
          {notice}
        </div>
      ) : null}
    </div>
  )
}

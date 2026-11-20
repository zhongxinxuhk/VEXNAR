// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useMemo, useState } from 'react'
import { GitBranch as Github, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { Button, Input } from '../ui'
import { Chip, EmptyState, IconButton, SearchBox, Spinner } from './common'
import { marketApi, skillApi } from './api'
import type { MarketItem, MarketSource, Skill } from './types'
import { MarketSourceDialog, SkillInstallDialog } from './dialogs'
import { MarketCard } from './MarketCard'
import { cn } from '@/lib/utils'

/** 技能市场：官方市场 + 任意 GitHub 技能仓库；也支持直接贴链接安装。 */
export function SkillsMarket({
  skills,
  sources,
  onReload,
  onToast,
  onGoManage
}: {
  skills: Skill[]
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
  const [sourceFilter, setSourceFilter] = useState('all')
  const [preset, setPreset] = useState<MarketItem | null>(null)
  const [installing, setInstalling] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [quickLink, setQuickLink] = useState('')
  const [quickBusy, setQuickBusy] = useState(false)

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true)
    try {
      const data = await marketApi.items('skills', refresh)
      setItems(data.items ?? [])
      setWarnings(data.warnings ?? [])
    } catch (err) {
      setWarnings([err instanceof Error ? err.message : String(err)])
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  const installed = useMemo(() => new Set(skills.map((skill) => skill.name.toLowerCase())), [skills])

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
        (item.repo ?? '').toLowerCase().includes(needle)
      )
    })
  }, [items, query, tag, sourceFilter])

  const quickInstall = async (): Promise<void> => {
    if (!quickLink.trim()) {
      onToast('请先粘贴 GitHub 仓库或链接', 'error')
      return
    }
    setQuickBusy(true)
    try {
      const result = await skillApi.installGithub({ link: quickLink.trim() })
      onToast(`已安装技能 ${result.name}（${result.files} 个文件）`)
      setQuickLink('')
      await onReload()
      await load(false)
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setQuickBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-semibold text-ink">技能市场</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            任意 GitHub 仓库都能当市场：有索引读索引，没有就自动扫描 SKILL.md。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <SearchBox value={query} onChange={setQuery} placeholder="搜索技能市场" />
          <IconButton
            label="重新同步市场"
            onClick={async () => {
              await load(true)
              await onReload()
            }}
          >
            {loading ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
          </IconButton>
          <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setSourceOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            市场源
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-line-soft bg-panel/50 p-2">
        <Github className="ml-1 h-4 w-4 shrink-0 text-muted" />
        <Input
          value={quickLink}
          onChange={(event) => setQuickLink(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void quickInstall()
          }}
          placeholder="粘贴 GitHub 仓库或目录链接直接安装，例如 anthropics/skills/tree/main/skills/pdf"
          className="h-8 flex-1 border-0 bg-transparent px-0 text-[12px] focus-visible:ring-0"
        />
        <Button size="sm" className="h-7 shrink-0 rounded-full px-3" onClick={() => void quickInstall()} disabled={quickBusy}>
          {quickBusy ? <Spinner className="text-current" /> : null}
          安装
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
          .filter((source) => source.kind !== 'mcp')
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
            icon={<Sparkles className="h-5 w-5" />}
            title="没有匹配的技能"
            description="换关键词或标签，或用上方的输入框直接粘贴 GitHub 链接安装。"
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
                  setInstalling(true)
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-line-soft bg-panel/50 p-3.5">
        <div className="text-[12px] font-medium text-ink">市场源格式</div>
        <p className="mt-1 text-[11.5px] leading-5 text-muted">
          推荐在仓库目录放一份 <code className="font-mono">market.json</code>（字段：name、description、repo、path、tags）。
          没有索引的技能仓库也能直接用：会自动扫描所有 <code className="font-mono">SKILL.md</code>，描述取自 frontmatter。
        </p>
        <div className="mt-2">
          <Button variant="ghost" size="sm" className="rounded-full" onClick={onGoManage}>
            回到技能管理
          </Button>
        </div>
      </div>

      <SkillInstallDialog
        open={installing}
        preset={preset}
        defaultOverwrite={Boolean(preset && installed.has(preset.name.toLowerCase()))}
        onClose={() => setInstalling(false)}
        onInstalled={(message) => {
          onToast(message)
          void onReload()
          void load(false)
        }}
      />
      <MarketSourceDialog
        open={sourceOpen}
        kind="skills"
        onClose={() => setSourceOpen(false)}
        onAdded={(message) => {
          onToast(message, message.includes('失败') ? 'error' : 'ok')
          void onReload()
          void load(true)
        }}
      />
    </div>
  )
}

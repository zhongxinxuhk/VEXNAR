// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, useState } from 'react'
import { Eye, GitBranch as Github, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../ui'
import { Chip, EmptyState, IconButton, IconTile, SearchBox, Segmented, Spinner, Switch } from './common'
import { skillApi } from './api'
import type { Skill } from './types'
import { ConfirmDialog, SkillCreateDialog, SkillFileDialog, SkillInstallDialog } from './dialogs'
import { cn } from '@/lib/utils'

/** 技能管理：启停、看 SKILL.md、从 GitHub 更新、删除、新建。 */
export function SkillsManager({
  skills,
  loading,
  onReload,
  onToast,
  onBrowseMarket
}: {
  skills: Skill[]
  loading: boolean
  onReload: () => Promise<void> | void
  onToast: (message: string, tone?: 'ok' | 'error' | 'info') => void
  onBrowseMarket: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all')
  const [viewing, setViewing] = useState<Skill | null>(null)
  const [editingFile, setEditingFile] = useState(false)
  const [deleting, setDeleting] = useState<Skill | null>(null)
  const [updating, setUpdating] = useState<Skill | null>(null)
  const [installOpen, setInstallOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const counts = useMemo(
    () => ({
      all: skills.length,
      on: skills.filter((skill) => skill.enabled).length,
      off: skills.filter((skill) => !skill.enabled).length
    }),
    [skills]
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return skills.filter((skill) => {
      if (filter === 'on' && !skill.enabled) return false
      if (filter === 'off' && skill.enabled) return false
      if (!needle) return true
      return (
        skill.name.toLowerCase().includes(needle) ||
        (skill.description ?? '').toLowerCase().includes(needle) ||
        (skill.source?.repo ?? '').toLowerCase().includes(needle)
      )
    })
  }, [skills, query, filter])

  const toggleEnabled = async (skill: Skill, next: boolean): Promise<void> => {
    setBusy(skill.name)
    try {
      await skillApi.setEnabled(skill.name, next)
      onToast(`${skill.name} 已${next ? '启用' : '停用'}`)
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
          <h1 className="text-[19px] font-semibold text-ink">技能管理</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            技能是可复用的操作手册（SKILL.md）。停用会把入口改名，agent 不再加载，但文件原样保留。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <SearchBox value={query} onChange={setQuery} placeholder="搜索技能" />
          <IconButton label="刷新列表" onClick={() => void onReload()}>
            {loading ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
          </IconButton>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            新建
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => setInstallOpen(true)}>
            <Github className="h-3.5 w-3.5" />
            从 GitHub 安装
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
          从技能市场安装 →
        </button>
      </div>

      <div className="mt-3">
        {visible.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title={skills.length === 0 ? '还没有安装技能' : '没有匹配的技能'}
            description={
              skills.length === 0
                ? '从市场挑一个，或粘贴 GitHub 仓库链接安装；也可以自己写一份操作手册。'
                : '换关键词，或切换筛选条件。'
            }
            actions={
              <>
                <Button size="sm" className="rounded-full" onClick={onBrowseMarket}>
                  浏览技能市场
                </Button>
                <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setInstallOpen(true)}>
                  从 GitHub 安装
                </Button>
              </>
            }
          />
        ) : (
          <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft">
            {visible.map((skill) => (
              <div
                key={skill.name}
                className={cn(
                  'group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-panel/60',
                  !skill.enabled && 'bg-panel/40'
                )}
              >
                <IconTile size={32} tone={skill.enabled ? 'text-ink-soft' : 'text-muted'}>
                  <Sparkles className="h-[15px] w-[15px]" strokeWidth={1.8} />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-ink">{skill.name}</span>
                    {!skill.enabled ? <Chip tone="warn">已停用</Chip> : null}
                    {skill.files.length > 1 ? <Chip>{skill.files.length} 文件</Chip> : null}
                    {skill.calls > 0 ? <Chip>{skill.calls} 次调用</Chip> : null}
                    {skill.mcps?.length ? <Chip mono>mcp: {skill.mcps.join(', ')}</Chip> : null}
                    {skill.source ? (
                      <a
                        href={`https://github.com/${skill.source.repo}${skill.source.path ? `/tree/${skill.source.ref ?? 'main'}/${skill.source.path}` : ''}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`${skill.source.repo}/${skill.source.path ?? ''}`}
                        className="hidden min-w-0 items-center gap-1 rounded-md border border-line-soft px-1.5 py-[1px] text-[10.5px] text-muted transition-colors hover:text-ink sm:inline-flex"
                      >
                        <Github className="h-2.5 w-2.5 shrink-0" />
                        <span className="max-w-[140px] truncate font-mono">{skill.source.repo}</span>
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[11.5px] leading-5 text-muted">
                    {skill.description || '没有描述（建议补一句"什么时候用"）'}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {skill.source ? (
                    <IconButton label="从 GitHub 更新" onClick={() => setUpdating(skill)} disabled={busy === skill.name}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : null}
                  <IconButton
                    label="查看 SKILL.md"
                    onClick={() => {
                      setEditingFile(false)
                      setViewing(skill)
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label="编辑 SKILL.md"
                    onClick={() => {
                      setEditingFile(true)
                      setViewing(skill)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label="删除" danger onClick={() => setDeleting(skill)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                  <div className="ml-1.5">
                    <Switch
                      checked={skill.enabled}
                      onChange={(next) => void toggleEnabled(skill, next)}
                      disabled={busy === skill.name}
                      label={`${skill.name} 启用状态`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SkillFileDialog
        open={Boolean(viewing)}
        skill={viewing}
        initialEdit={editingFile}
        onClose={() => setViewing(null)}
        onSaved={(message) => {
          onToast(message)
          void onReload()
        }}
      />
      <SkillInstallDialog
        open={installOpen}
        preset={null}
        onClose={() => setInstallOpen(false)}
        onInstalled={(message) => {
          onToast(message)
          void onReload()
        }}
      />
      <SkillInstallDialog
        open={Boolean(updating)}
        defaultOverwrite
        preset={
          updating?.source
            ? {
                id: updating.name,
                kind: 'skills',
                name: updating.name,
                repo: updating.source.repo,
                ref: updating.source.ref,
                path: updating.source.path
              }
            : null
        }
        onClose={() => setUpdating(null)}
        onInstalled={(message) => {
          onToast(message)
          setUpdating(null)
          void onReload()
        }}
      />
      <SkillCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(message) => {
          onToast(message)
          void onReload()
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`删除技能「${deleting?.name ?? ''}」？`}
        description="技能目录会被整体删除（含脚本与参考资料），且不会进入回收站。此操作不可撤销。"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          await skillApi.remove(deleting.name)
          onToast(`已删除 ${deleting.name}`)
          await onReload()
        }}
      />
    </div>
  )
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Check,
  ChevronDown,
  Folder,
  GitBranch,
  Hand,
  Monitor,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  ShieldCheck
} from 'lucide-react'
import { consoleRequest } from '@/lib/console'
import { basename, cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'

const content =
  'z-50 flex min-w-[240px] max-w-[calc(100vw-32px)] flex-col gap-1 rounded-2xl border border-line bg-bg p-1.5 codex-popover outline-none'
const item =
  'flex cursor-default items-start gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[11px] text-ink-soft outline-none data-[highlighted]:bg-panel-2 disabled:opacity-50'
type AccessMode = 'request' | 'balanced' | 'full'
const modes = [
  {
    value: 'request',
    label: '请求批准',
    hint: '编辑外部文件和使用互联网时始终询问',
    icon: Hand
  },
  {
    value: 'balanced',
    label: '帮我批准',
    hint: '仅对检测到的风险操作请求批准',
    icon: ShieldCheck
  },
  {
    value: 'full',
    label: '完全访问',
    hint: '可不受限制地读取本地文件并访问网络',
    icon: Shield
  }
] as const

export function AccessMenu({
  disabled
}: {
  disabled: boolean
}): React.JSX.Element {
  const [mode, setMode] = useState<AccessMode | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const load = async (): Promise<void> => {
    setPending(true)
    setError('')
    try {
      const result = await consoleRequest<{ access_mode: AccessMode }>(
        '/desktop/preferences'
      )
      if (!modes.some((entry) => entry.value === result.access_mode))
        throw new Error('访问配置无效')
      setMode(result.access_mode)
    } catch (e) {
      setError(String(e))
    } finally {
      setPending(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])
  const current = modes.find((entry) => entry.value === mode)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="访问权限"
          disabled={disabled || pending}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-full px-2 text-xs hover:bg-panel-2',
            mode === 'full' ? 'text-danger' : 'text-ink-soft'
          )}
        >
          <Shield className="h-3.5 w-3.5" />
          {pending ? '读取权限…' : current?.label || '访问权限'}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={10}
          className={`${content} w-[276px]`}
        >
          <div className="px-2.5 pb-0.5 pt-0.5 text-[11px] text-muted">
            应如何批准 VEXNAR 操作？
          </div>
          {error && (
            <div role="alert" className="px-2.5 py-1.5 text-[11px] text-danger">
              {error}
            </div>
          )}
          {modes.map((entry) => (
            <DropdownMenu.Item
              key={entry.value}
              disabled={!mode || pending}
              className={cn(item, mode === entry.value && 'bg-panel-2')}
              onSelect={() => {
                setPending(true)
                setError('')
                void consoleRequest<{ access_mode: AccessMode }>(
                  '/desktop/preferences',
                  'PUT',
                  { access_mode: entry.value }
                )
                  .then((result) => setMode(result.access_mode))
                  .catch((e) => setError(String(e)))
                  .finally(() => setPending(false))
              }}
            >
              <entry.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'text-xs',
                    entry.value === 'full' && 'font-medium text-danger'
                  )}
                >
                  {entry.label}
                </div>
                <p className="mt-0.5 text-[11px] leading-4 text-muted">
                  {entry.hint}
                </p>
              </div>
              {mode === entry.value && (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
            </DropdownMenu.Item>
          ))}
          {!mode && (
            <DropdownMenu.Item className={item} onSelect={() => void load()}>
              重新读取配置
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}


function BranchPickerContent({
  current,
  onChanged
}: {
  current: string
  onChanged: (branch: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [list, setList] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  useEffect(() => {
    void window.vexnar.git.branches().then((result) => {
      if (result.ok) setList(result.data)
    })
  }, [])
  const visible = list.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()))
  const run = async (branch: string): Promise<void> => {
    setPending(true)
    const result = await window.vexnar.git.checkout({ branch })
    setPending(false)
    if (result.ok) onChanged(result.data.branch)
  }
  const createNew = async (): Promise<void> => {
    const name = query.trim()
    if (!name) return
    setPending(true)
    const result = await window.vexnar.git.createBranch({ branch: name })
    setPending(false)
    if (result.ok) onChanged(result.data.branch)
  }
  return (
    <DropdownMenu.Content side="top" align="start" sideOffset={8} className={`${content} w-[320px] p-0`}>
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && visible.length === 0 && query.trim()) void createNew()
          }}
          placeholder="搜索分支"
          className="h-6 w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-muted"
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        <div className="px-2 py-1 text-[10.5px] text-muted">分支</div>
        {visible.map((name) => (
          <DropdownMenu.Item
            key={name}
            className={item}
            disabled={pending}
            onSelect={() => void run(name)}
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span className="truncate">{name}</span>
            {name === current ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
          </DropdownMenu.Item>
        ))}
        {visible.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-muted">没有匹配的分支</div>
        ) : null}
        <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
        <DropdownMenu.Item
          className={item}
          disabled={!query.trim() || pending}
          onSelect={() => void createNew()}
        >
          <Plus className="h-3.5 w-3.5" />
          {query.trim() ? `创建并检出「${query.trim()}」` : '创建并检出新的分支…'}
        </DropdownMenu.Item>
      </div>
    </DropdownMenu.Content>
  )
}

export function ContextBar({
  disabled,
  hide
}: {
  disabled: boolean
  hide: () => void
}): React.JSX.Element {
  const sessions = useAppStore((state) => state.sessions)
  const activeId = useAppStore((state) => state.activeSessionId)
  const select = useAppStore((state) => state.selectSession)
  const choose = useAppStore((state) => state.chooseWorkspace)
  const create = useAppStore((state) => state.newSession)
  const setRightTab = useAppStore((state) => state.setRightTab)
  const openSettings = useAppStore((state) => state.openSettings)
  const info = useAppStore((state) => state.info)
  const git = useAppStore((state) => state.git)
  const [branch, setBranch] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  useEffect(() => {
    setBranch('')
    setBranches([])
    setIssue('')
  }, [activeId])
  const [issue, setIssue] = useState('')
  const [creating, setCreating] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const active = sessions.find((session) => session.id === activeId)
  const projects = Array.from(
    new Map(
      sessions
        .filter((session) => session.workspace)
        .map((session) => [session.workspace, session])
    ).values()
  )
  return (
    <div
      data-testid="composer-context"
      className="mx-3 -mb-2 flex min-h-11 items-center gap-1 rounded-t-2xl bg-panel-2 px-2 pb-2 text-xs text-ink-soft"
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            disabled={disabled}
            aria-label="执行环境"
            className="flex h-7 items-center gap-1.5 rounded-lg px-2 hover:bg-panel-2"
          >
            <Monitor className="h-3.5 w-3.5" />
            此计算机
            <ChevronDown className="h-3 w-3 text-muted" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            className={content}
            sideOffset={8}
          >
            <DropdownMenu.Item className={item}>
              <Monitor className="h-4 w-4" />
              <span className="flex-1">此计算机</span>
              <Check className="h-4 w-4" />
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            disabled={disabled}
            aria-label="选择会话工作区"
            className="flex h-7 max-w-[260px] items-center gap-1.5 rounded-lg px-2 hover:bg-panel-2"
          >
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {basename(active?.workspace || '') || '选择工作区'}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            className={`${content} max-h-80 overflow-y-auto`}
          >
            <DropdownMenu.Item className={item} onSelect={() => void choose()}>
              <Folder className="h-4 w-4" />
              选择文件夹…
            </DropdownMenu.Item>
            {projects.map((session) => (
              <DropdownMenu.Item
                key={session.workspace}
                className={item}
                onSelect={() => void select(session.id)}
              >
                <Folder className="h-4 w-4 shrink-0" />
                <span className="max-w-64 truncate" title={session.workspace}>
                  {basename(session.workspace)}
                </span>
                {active?.workspace === session.workspace && (
                  <Check className="ml-auto h-3.5 w-3.5" />
                )}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {active?.workspace ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              disabled={disabled}
              aria-label="切换分支"
              className="flex h-7 items-center gap-1.5 rounded-lg px-2 hover:bg-panel-2"
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span className="max-w-[140px] truncate">{git?.branch || 'main'}</span>
              <ChevronDown className="h-3 w-3 text-muted" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <BranchPickerContent
              current={git?.branch || ''}
              onChanged={() => void useAppStore.getState().refreshGit()}
            />
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}
      {active?.workspace ? (
      <DropdownMenu.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            disabled={disabled}
            aria-label="上下文设置"
            onPointerDown={() => setIssue('')}
            className="grid h-7 w-7 place-items-center rounded-lg hover:bg-panel-2"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            className={content}
          >
            <DropdownMenu.Label className="px-3 py-2 text-xs text-muted">
              更多设置
            </DropdownMenu.Label>
            <DropdownMenu.Sub
              onOpenChange={(open) => {
                if (!open || !active?.workspace) return
                void window.vexnar.git.branches().then((result) => {
                  if (result.ok) setBranches(result.data)
                  else setIssue(result.error)
                })
              }}
            >
              <DropdownMenu.SubTrigger
                className={item}
                disabled={!active?.workspace}
              >
                分支{' '}
                <span className="ml-auto text-muted">
                  {branches.includes(branch) ? branch : git?.branch || '选择'}
                </span>
                <ChevronDown className="h-3 w-3 -rotate-90" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  className={`${content} max-h-64 overflow-y-auto`}
                >
                  {branches.length === 0 && (
                    <DropdownMenu.Label className="px-3 py-2 text-xs text-muted">
                      暂无可选分支
                    </DropdownMenu.Label>
                  )}
                  {branches.map((name) => (
                    <DropdownMenu.Item
                      key={name}
                      className={item}
                      onSelect={() => setBranch(name)}
                    >
                      {name}
                      {branch === name && <Check className="ml-auto h-3 w-3" />}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            <DropdownMenu.Item
              className={item}
              disabled={
                !active?.workspace || creating || (!git?.branch && !branch)
              }
              onSelect={(event) => {
                event.preventDefault()
                if (!active || creating) return
                setCreating(true)
                void window.vexnar.git
                  .createWorktree({
                    sessionId: active.id,
                    branch: branch || git?.branch || ''
                  })
                  .then(async (result) => {
                    if (result.ok) {
                      setMoreOpen(false)
                      await create(result.data)
                    } else setIssue(result.error)
                  })
                  .catch((error) => setIssue(String(error)))
                  .finally(() => setCreating(false))
              }}
            >
              {creating ? '正在创建…' : '新建工作树并开始聊天'}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={item}
              onSelect={() => openSettings('workspace')}
            >
              环境 <span className="ml-auto text-muted">本机 · Shell 设置</span>
            </DropdownMenu.Item>
            {issue && (
              <div
                role="alert"
                className="max-w-64 break-words px-3 py-2 text-xs text-danger"
              >
                {issue}
              </div>
            )}
            <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
            <DropdownMenu.Item
              className={item}
              onSelect={() => openSettings('workspace')}
            >
              工作区与终端设置
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={item}
              onSelect={() => setRightTab('workspace')}
            >
              查看工作区文件
            </DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={hide}>
              隐藏上下文栏
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      ) : null}
    </div>
  )
}

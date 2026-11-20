// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  ListFilter,
  Pause,
  Play,
  Plus,
  Search,
  Trash2
} from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTitle } from '@/components/ui'
import { Button as AuiButton } from '@/components/ui/affectui/button-clean'
import { consoleRequest } from '@/lib/console'
import { EFFORT_LABELS } from '@/lib/insight'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'

type Frequency = 'daily' | 'weekly' | 'monthly'
type NotifyLevel = 'important' | 'all' | 'off'
type Effort = 'default' | 'low' | 'medium' | 'high'

type ScheduledTask = {
  id: string
  name: string
  prompt: string
  frequency: Frequency
  time: string
  runOnDevice: boolean
  notify: NotifyLevel
  newChatEachRun: boolean
  model: string
  effort: Effort
  enabled: boolean
  createdAt: number
}

type TaskDraft = Omit<ScheduledTask, 'id' | 'createdAt' | 'enabled'>

type BackendSchedule = {
  id: number
  name: string
  prompt: string
  frequency: Frequency
  time_of_day: string
  run_on_device: boolean
  notify: NotifyLevel
  new_chat_each_run: boolean
  model: string
  effort: Effort
  enabled: boolean
  created_at: number
  next_fire_at: number
}

function fromBackend(item: BackendSchedule): ScheduledTask {
  return {
    id: String(item.id),
    name: item.name,
    prompt: item.prompt,
    frequency: item.frequency,
    time: item.time_of_day,
    runOnDevice: item.run_on_device,
    notify: item.notify,
    newChatEachRun: item.new_chat_each_run,
    model: item.model,
    effort: item.effort,
    enabled: item.enabled,
    createdAt: item.created_at * 1000
  }
}

const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月'
}

const NOTIFY_LABEL: Record<NotifyLevel, string> = {
  important: '重要更新',
  all: '全部运行',
  off: '关闭通知'
}

type Template = {
  emoji: string
  name: string
  prompt: string
  frequency: Frequency
  time: string
}

const TEMPLATES: Template[] = [
  {
    emoji: '💻',
    name: '企业云与网络安全服务动态',
    prompt: '每周一筛选影响我在海南开展云计算和网络安全技术服务的关键行业变化',
    frequency: 'weekly',
    time: '09:00'
  },
  {
    emoji: '📖',
    name: '寻找周末读物',
    prompt: '每周六给我发送一篇值得一读的文章。',
    frequency: 'weekly',
    time: '10:00'
  },
  {
    emoji: '🌶️',
    name: '价格提醒',
    prompt: '每天查看我关注的商品价格，并在降价时提醒我。',
    frequency: 'daily',
    time: '08:30'
  },
  {
    emoji: '🎸',
    name: '查找音乐演出',
    prompt: '每周帮我查找符合我喜好的新音乐演出。',
    frequency: 'weekly',
    time: '18:00'
  },
  {
    emoji: '🎉',
    name: '帮我安排周末',
    prompt: '每周四给我推荐本地周末活动。',
    frequency: 'weekly',
    time: '19:00'
  },
  {
    emoji: '🥗',
    name: '每周饮食计划',
    prompt: '规划一周的餐食，并列出食材采购清单。',
    frequency: 'weekly',
    time: '20:00'
  }
]

const TIME_OPTIONS: string[] = (() => {
  const list: string[] = []
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of ['00', '30']) {
      list.push(`${String(hour).padStart(2, '0')}:${minute}`)
    }
  }
  return list
})()

function taskNameFromPrompt(prompt: string, fallback: string): string {
  const firstLine = prompt.trim().split('\n')[0]?.trim() ?? ''
  if (!firstLine) return fallback
  return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine
}

function Switch({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (next: boolean) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-panel-3'
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-[left] duration-150',
          checked ? 'left-[18px]' : 'left-[2px]'
        )}
      />
    </button>
  )
}

function InlineSelect({
  value,
  options,
  onChange
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (next: string) => void
}): React.JSX.Element {
  return (
    <span className="relative flex items-center">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-5 text-right text-[13px] text-muted outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-muted" />
    </span>
  )
}

function SettingRow({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-[46px] items-center justify-between rounded-[14px] border border-line-soft px-4">
      <span className="text-[13px] text-ink">{label}</span>
      {children}
    </div>
  )
}

function TaskDialog({
  open,
  onOpenChange,
  draft,
  models,
  onCreate
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: Template | null
  models: string[]
  onCreate: (task: TaskDraft) => void
}): React.JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('weekly')
  const [time, setTime] = useState('09:00')
  const [advanced, setAdvanced] = useState(false)
  const [runOnDevice, setRunOnDevice] = useState(true)
  const [notify, setNotify] = useState<NotifyLevel>('important')
  const [newChatEachRun, setNewChatEachRun] = useState(false)
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<Effort>('default')

  useEffect(() => {
    if (!open) return
    setPrompt(draft?.prompt ?? '')
    setFrequency(draft?.frequency ?? 'weekly')
    setTime(draft?.time ?? '09:00')
    setAdvanced(false)
    setRunOnDevice(true)
    setNotify('important')
    setNewChatEachRun(false)
    setModel(models[0] ?? '')
    setEffort('default')
  }, [open, draft, models])

  const submit = (): void => {
    const text = prompt.trim()
    if (!text) return
    onCreate({
      name: taskNameFromPrompt(text, draft?.name ?? '定时任务'),
      prompt: text,
      frequency,
      time,
      runOnDevice,
      notify,
      newChatEachRun,
      model,
      effort
    })
    onOpenChange(false)
  }

  const modelOptions = (models.length > 0 ? models : ['']).map((value) => ({
    value,
    label: value || '跟随默认模型'
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-48px)] w-[min(688px,calc(100vw-32px))] overflow-y-auto rounded-[24px] border border-line-soft bg-bg p-6 codex-popover">
        <DialogTitle className="mb-5 text-[17px] font-semibold text-ink">设置定时任务</DialogTitle>

        <textarea
          value={prompt}
          autoFocus
          rows={5}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="说明…"
          className="min-h-[160px] w-full resize-none rounded-[14px] border border-line-soft px-4 py-3 text-[13px] leading-6 text-ink outline-none placeholder:text-muted/80 focus:border-accent/50"
        />

        <div className="mt-4 overflow-hidden rounded-[14px] border border-line-soft">
          <div className="flex h-[46px] items-center justify-between border-b border-line-soft px-4">
            <span className="text-[13px] text-ink">重复</span>
            <InlineSelect
              value={frequency}
              onChange={(next) => setFrequency(next as Frequency)}
              options={(['daily', 'weekly', 'monthly'] as Frequency[]).map((value) => ({
                value,
                label: FREQUENCY_LABEL[value]
              }))}
            />
          </div>
          <div className="flex h-[46px] items-center justify-between px-4">
            <span className="text-[13px] text-ink">时间</span>
            <InlineSelect
              value={time}
              onChange={setTime}
              options={TIME_OPTIONS.map((value) => ({
                value,
                label: `中国时间 ${value}`
              }))}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAdvanced((value) => !value)}
          className="mt-4 flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-ink"
        >
          高级
          {advanced ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {advanced ? (
          <div className="mt-3 space-y-2.5">
            <SettingRow label="在此电脑上运行">
              <Switch checked={runOnDevice} onChange={setRunOnDevice} />
            </SettingRow>
            <SettingRow label="通知">
              <InlineSelect
                value={notify}
                onChange={(next) => setNotify(next as NotifyLevel)}
                options={(['important', 'all', 'off'] as NotifyLevel[]).map((value) => ({
                  value,
                  label: NOTIFY_LABEL[value]
                }))}
              />
            </SettingRow>
            <SettingRow label="每次运行时都开启新聊天">
              <Switch checked={newChatEachRun} onChange={setNewChatEachRun} />
            </SettingRow>
            <SettingRow label="模型">
              <InlineSelect value={model} onChange={setModel} options={modelOptions} />
            </SettingRow>
            <SettingRow label="强度">
              <InlineSelect
                value={effort}
                onChange={(next) => setEffort(next as Effort)}
                options={(['default', 'low', 'medium', 'high'] as Effort[]).map((value) => ({
                  value,
                  label: EFFORT_LABELS[value]
                }))}
              />
            </SettingRow>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <AuiButton variant="ghost" size="md" onClick={() => onOpenChange(false)}>
            取消
          </AuiButton>
          <AuiButton variant="primary" size="md" onClick={submit} disabled={!prompt.trim()}>
            创建
          </AuiButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SchedulesView(): React.JSX.Element {
  const setView = useAppStore((state) => state.setView)
  const newApi = useAppStore((state) => state.newApi)
  const settings = useAppStore((state) => state.settings)
  const backend = useAppStore((state) => state.backend)
  const models = useMemo(() => {
    const list = newApi?.models?.length ? newApi.models : settings.newApiModels
    return list.slice(0, 40)
  }, [newApi, settings.newApiModels])

  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<Template | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pausedOpen, setPausedOpen] = useState(true)

  const refresh = useCallback(async (): Promise<void> => {
    if (!backend?.connected) return
    try {
      const data = await consoleRequest<{ schedules: BackendSchedule[] }>('/schedules')
      setTasks((data.schedules ?? []).map(fromBackend))
    } catch {
      setTasks([])
    }
  }, [backend?.connected])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const active = useMemo(() => tasks.filter((task) => task.enabled), [tasks])
  const paused = useMemo(() => tasks.filter((task) => !task.enabled), [tasks])
  const selected = tasks.find((task) => task.id === selectedId) ?? null

  const createTask = (input: TaskDraft): void => {
    const task: ScheduledTask = {
      ...input,
      id: crypto.randomUUID(),
      enabled: true,
      createdAt: Date.now()
    }
    setTasks((previous) => [task, ...previous])
    setSelectedId(task.id)
  }

  const toggle = (id: string): void => {
    setTasks((previous) =>
      previous.map((task) => (task.id === id ? { ...task, enabled: !task.enabled } : task))
    )
  }

  const remove = (id: string): void => {
    setTasks((previous) => previous.filter((task) => task.id !== id))
    setSelectedId((current) => (current === id ? null : current))
  }

  const openTemplate = (template: Template): void => {
    setDraft(template)
    setDialogOpen(true)
  }

  const openBlank = (): void => {
    setDraft(null)
    setDialogOpen(true)
  }

  const TaskRow = ({ task }: { task: ScheduledTask }): React.JSX.Element => (
    <button
      type="button"
      onClick={() => setSelectedId(task.id)}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors',
        selectedId === task.id ? 'bg-panel-2 text-ink' : 'text-ink-soft hover:bg-panel-2'
      )}
    >
      <span className="truncate">{task.name}</span>
      <span className="ml-auto shrink-0 text-[10.5px] text-muted">
        {FREQUENCY_LABEL[task.frequency]}
      </span>
    </button>
  )

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-bg">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-line-soft bg-bg">
        <header className="flex h-12 shrink-0 items-center gap-1 px-3">
          <h1 className="text-[15px] font-semibold text-ink">定时任务</h1>
          <div className="ml-auto flex items-center gap-0.5 text-muted">
            <button
              type="button"
              aria-label="筛选"
              className="grid h-7 w-7 place-items-center rounded-md hover:bg-panel-2 hover:text-ink"
            >
              <ListFilter className="h-4 w-4" strokeWidth={1.7} />
            </button>
            <button
              type="button"
              aria-label="搜索"
              className="grid h-7 w-7 place-items-center rounded-md hover:bg-panel-2 hover:text-ink"
            >
              <Search className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </div>
        </header>

        <div className="px-2.5">
          <button
            type="button"
            onClick={openBlank}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12.5px] text-ink-soft transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <Plus className="h-4 w-4" strokeWidth={1.8} />
            新建任务
          </button>
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
          {active.length > 0 ? (
            <>
              <div className="px-2 pb-1 pt-2 text-[11px] text-muted">已启用</div>
              {active.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </>
          ) : null}

          {paused.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setPausedOpen((value) => !value)}
                className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] text-muted hover:bg-panel-2"
              >
                已暂停
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[10px] font-medium text-bg">
                  {paused.length}
                </span>
              </button>
              {pausedOpen
                ? paused.map((task) => <TaskRow key={task.id} task={task} />)
                : null}
            </>
          ) : null}

          {tasks.length === 0 ? (
            <p className="px-2 pt-6 text-[11.5px] leading-5 text-muted">
              还没有定时任务。点「新建任务」，或从右侧模板开始。
            </p>
          ) : null}
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-bg">
        <div className="flex h-11 shrink-0 items-center gap-1 px-3 text-muted">
          <button
            type="button"
            aria-label="返回对话"
            onClick={() => setView('chat')}
            className="grid h-7 w-7 place-items-center rounded-md hover:bg-panel-2 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
          </button>
          <button
            type="button"
            aria-label="前进"
            disabled
            className="grid h-7 w-7 place-items-center rounded-md opacity-40"
          >
            <ArrowRight className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {selected ? (
            <div className="mx-auto w-full max-w-[720px] px-8 pb-24 pt-10">
              <h2 className="text-[20px] font-semibold text-ink">{selected.name}</h2>
              <p className="mt-1 text-[12.5px] text-muted">
                {selected.enabled ? '已启用' : '已暂停'} · {FREQUENCY_LABEL[selected.frequency]}{' '}
                {selected.time} · {NOTIFY_LABEL[selected.notify]}
              </p>
              <div className="mt-5 rounded-[16px] bg-panel px-5 py-4">
                <div className="text-[11px] text-muted">说明</div>
                <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-6 text-ink">
                  {selected.prompt || '（未填写）'}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-[16px] bg-panel px-5 py-4">
                  <div className="text-[11px] text-muted">模型</div>
                  <div className="mt-1 truncate text-[12.5px] text-ink">
                    {selected.model || '跟随默认模型'}
                  </div>
                </div>
                <div className="rounded-[16px] bg-panel px-5 py-4">
                  <div className="text-[11px] text-muted">强度</div>
                  <div className="mt-1 text-[12.5px] text-ink">
                    {EFFORT_LABELS[selected.effort]}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void toggle(selected.id)}>
                  {selected.enabled ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      暂停
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      启用
                    </>
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void remove(selected.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
              <p className="mt-6 text-[11px] leading-5 text-muted">
                任务保存在服务端，到点由调度器自动创建会话并执行。
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[760px] px-8 pb-24 pt-14">
              <div className="flex flex-col items-center">
                <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-gradient-to-b from-[#f6f7f9] to-[#dfe3e8] shadow-[inset_0_1px_0_#fff,0_6px_16px_-8px_rgba(0,0,0,0.35)]">
                  <Clock3 className="h-8 w-8 text-ink-soft" strokeWidth={1.5} />
                </div>
                <h2 className="mt-5 text-[20px] font-semibold text-ink">安排任务</h2>
                <p className="mt-1.5 text-center text-[12.5px] text-muted">
                  VEXNAR 可以帮你处理持续性任务，让你不必亲自动手。
                </p>
              </div>

              <div className="mt-9 grid grid-cols-2 gap-3">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.name}
                    type="button"
                    onClick={() => openTemplate(template)}
                    className="flex items-start gap-2.5 rounded-[16px] border border-dashed border-line px-4 py-3.5 text-left transition-colors hover:border-accent/40 hover:bg-panel-2/60"
                  >
                    <span className="mt-0.5 text-[16px] leading-5">{template.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-ink">
                        {template.name}
                      </span>
                      <span className="mt-1 block text-[12px] leading-5 text-muted">
                        {template.prompt}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        models={models}
        onCreate={createTask}
      />
    </div>
  )
}

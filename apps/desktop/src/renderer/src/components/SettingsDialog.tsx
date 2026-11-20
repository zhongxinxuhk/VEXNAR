// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Bell,
  Bot,
  Download,
  FolderOpen,
  Globe,
  Keyboard,
  Loader2,
  Search,
  Settings,
  Shield,
  Sun,
  UserRound,
  Workflow
} from 'lucide-react'
import type { SettingsInput } from '@shared/contracts'
import { useChatSendMode } from '@/lib/chat-send-mode'
import { useAppStore } from '@/store/app'
import { useI18n, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input
} from './ui'
import {
  SystemSettings,
  systemFields,
  type SystemGroup
} from './SystemSettings'
import { UpdateButton, UpdateDetails } from './UpdateNotice'

const pages = [
  {
    id: 'account',
    label: '账户',
    group: '账户',
    icon: UserRound,
    description: '查看账户详情与使用情况'
  },
  {
    id: 'general',
    label: '常规',
    group: '应用',
    icon: Settings,
    description: '管理桌面应用的基本偏好'
  },
  {
    id: 'appearance',
    label: '外观',
    group: '应用',
    icon: Sun,
    description: '让 VEXNAR 更符合你的使用习惯'
  },
  {
    id: 'workspace',
    label: '工作区与终端',
    group: '应用',
    icon: FolderOpen,
    description: '设置项目目录与本地 Shell'
  },
  {
    id: 'model',
    label: '模型',
    group: '系统',
    icon: Bot,
    description: '选择由 Go 后端管理的模型'
  },
  {
    id: 'agents',
    label: 'Agent 与并发',
    group: '系统',
    icon: Workflow,
    description: '工作 Agent、操作约束与执行环境'
  },
  {
    id: 'network',
    label: '网络与搜索',
    group: '系统',
    icon: Globe,
    description: '出口代理、搜索来源与密钥'
  },
  {
    id: 'capture',
    label: '数据与隐私',
    group: '系统',
    icon: Shield,
    description: '流量、模型录制与漏洞验证'
  },
  {
    id: 'notifications',
    label: '通知',
    group: '系统',
    icon: Bell,
    description: '管理漏洞消息推送的全局配置'
  },
  {
    id: 'keyboard',
    label: '键盘快捷键',
    group: '应用',
    icon: Keyboard,
    description: '更高效地使用 VEXNAR'
  },
  {
    id: 'runtime',
    label: '关于与更新',
    group: '应用',
    icon: Download,
    description: '版本信息、运行环境与软件更新'
  }
] as const

type Page = (typeof pages)[number]['id']
const selectClass =
  'h-9 min-w-40 max-w-full rounded-lg border border-line bg-bg px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent/30'

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-5 border-b border-line-soft py-6 last:border-0">
      <div className="min-w-0 flex-1 basis-40">
        <div className="text-sm font-medium text-ink">{label}</div>
        {hint && <p className="mt-1.5 text-xs leading-5 text-muted">{hint}</p>}
      </div>
      <div className="max-w-full text-sm text-ink-soft">{children}</div>
    </div>
  )
}

export function SettingsDialog(): React.JSX.Element {
  const open = useAppStore((state) => state.settingsOpen)
  const setOpen = useAppStore((state) => state.setSettingsOpen)
  const settings = useAppStore((state) => state.settings)
  const settingsSection = useAppStore((state) => state.settingsSection)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const refreshNewApi = useAppStore((state) => state.refreshNewApi)
  const newApi = useAppStore((state) => state.newApi)
  const info = useAppStore((state) => state.info)
  const backend = useAppStore((state) => state.backend)
  const locale = useI18n((state) => state.locale)
  const setLocale = useI18n((state) => state.setLocale)
  const t = useT()
  const sendMode = useChatSendMode((state) => state.mode)
  const setSendMode = useChatSendMode((state) => state.setMode)
  const [draft, setDraft] = useState<SettingsInput>(settings)
  const [page, setPage] = useState<Page>('general')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(settings)
    setPage(settingsSection)
    setQuery('')
    setMessage('')
  }, [open, settingsSection])

  const update = <K extends keyof SettingsInput>(
    key: K,
    value: SettingsInput[K]
  ): void => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setMessage('')
  }
  const choose = async (): Promise<void> => {
    const result = await window.vexnar.workspace.choose()
    if (result.ok && result.data) update('workspaceRoot', result.data)
    else if (!result.ok) setMessage(result.error)
  }
  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      setMessage(
        (await saveSettings(draft))
          ? '设置已保存。'
          : '保存失败，请检查错误信息后重试。'
      )
    } finally {
      setSaving(false)
    }
  }
  const sync = async (): Promise<void> => {
    setSyncing(true)
    try {
      await refreshNewApi()
      setDraft((old) => ({
        ...old,
        newApiModels: useAppStore.getState().settings.newApiModels
      }))
    } finally {
      setSyncing(false)
    }
  }
  const filtered = pages.filter((item) => {
    const fields =
      item.id in systemFields
        ? systemFields[item.id as SystemGroup]
            .map((field) => `${field.label} ${field.hint}`)
            .join(' ')
        : ''
    return `${item.label} ${item.description} ${fields}`
      .toLowerCase()
      .includes(query.toLowerCase())
  })
  const selected = pages.find((item) => item.id === page)!
  const visible =
    query && !filtered.some((item) => item.id === page) ? filtered[0] : selected
  const current = visible?.id
  const models = Array.from(
    new Set([draft.model, ...draft.newApiModels].filter(Boolean))
  )
  const localPage = [
    'account',
    'general',
    'appearance',
    'workspace',
    'model'
  ].includes(current ?? '')
  const user = newApi?.user

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        aria-describedby="settings-description"
        className="flex h-[min(790px,90vh)] w-[min(1080px,calc(100vw-64px))] overflow-hidden rounded-[24px] border-line bg-bg p-0 codex-popover"
      >
        <aside className="flex w-[245px] shrink-0 flex-col border-r border-line-soft bg-panel/70 p-5 max-[750px]:w-[190px]">
          <DialogTitle className="mb-5 text-[22px] font-semibold">
            {t('settings.title')}
          </DialogTitle>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
            <Input
              aria-label="搜索设置"
              placeholder="搜索设置"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 rounded-full bg-transparent pl-9 text-sm"
            />
          </div>
          <nav
            aria-label="设置分类"
            className="min-h-0 flex-1 overflow-y-auto pr-1"
          >
            {!query && (
              <div className="mb-6">
                <div className="mb-3 px-2 text-xs text-muted">Profile</div>
                <button
                  onClick={() => setPage('account')}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-panel-2"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-500 text-xs text-white">
                    {(user?.displayName || user?.username || 'V')
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <span className="flex-1 truncate text-sm">
                    {user?.username || 'VEXNAR'}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-muted" />
                </button>
              </div>
            )}
            {['账户', '应用', '系统'].map((group) => {
              const items = filtered.filter((item) => item.group === group)
              return items.length ? (
                <div key={group} className="mb-5">
                  <div className="mb-2 px-2 text-xs text-muted">{group}</div>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setPage(item.id)}
                      aria-current={current === item.id ? 'page' : undefined}
                      className={cn(
                        'mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[13px] transition-colors',
                        current === item.id
                          ? 'bg-panel-3 text-ink'
                          : 'text-ink-soft hover:bg-panel-2'
                      )}
                    >
                      <item.icon
                        className="h-[18px] w-[18px] shrink-0"
                        strokeWidth={1.7}
                      />
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null
            })}
            {filtered.length === 0 && (
              <p className="px-2 text-xs text-muted">未找到设置项</p>
            )}
          </nav>
          <div className="pt-3 text-[10px] text-muted">
            VEXNAR · {info?.version || '—'}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="min-h-0 flex-1 overflow-y-auto px-10 pb-8 pt-12 max-[900px]:px-6"
            key={current}
          >
            <div className="mx-auto max-w-[680px]">
              <h2 className="text-[28px] font-medium tracking-tight text-ink">
                {visible?.label || '搜索设置'}
              </h2>
              <DialogDescription
                id="settings-description"
                className="mb-8 mt-2 text-sm text-muted"
              >
                {visible?.description || '尝试搜索其他关键词'}
              </DialogDescription>
              {current === 'account' && (
                <>
                  <p className="border-b border-line-soft pb-4 text-xs font-medium">
                    账户详情
                  </p>
                  <Row label="姓名" hint="本机显示名称">
                    <Input
                      aria-label="显示名称"
                      value={draft.displayName}
                      placeholder={user?.displayName || user?.username}
                      onChange={(e) => update('displayName', e.target.value)}
                      className="w-52 text-sm"
                    />
                  </Row>
                  <Row label="用户名" hint="平台账户的唯一标识">
                    {user?.username ? `@${user.username}` : '—'}
                  </Row>
                  <Row label="电子邮箱" hint="与账户关联的邮箱">
                    {user?.email || '—'}
                  </Row>
                  <Row label="账户分组">{user?.group || '—'}</Row>
                  <Row label="额度" hint="来自当前平台账户">
                    {newApi?.quota?.unlimited
                      ? '无限额度'
                      : newApi?.quota
                        ? `${newApi.quota.remaining.toLocaleString()} 可用`
                        : '—'}
                  </Row>
                  <Row
                    label="管理账户与账单"
                    hint="在平台中查看账户资料与充值记录"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void window.vexnar.newapi.openPlatform()}
                    >
                      打开平台
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </Row>
                </>
              )}
              {current === 'general' && (
                <>
                  <Row label="语言" hint="界面显示语言">
                    <select
                      aria-label="语言"
                      className={selectClass}
                      value={locale}
                      onChange={(e) =>
                        setLocale(e.target.value === 'en' ? 'en' : 'zh')
                      }
                    >
                      <option value="zh">简体中文</option>
                      <option value="en">English</option>
                    </select>
                  </Row>
                  <Row label="显示名称" hint="仅用于本机个人资料">
                    <Input
                      aria-label="显示名称"
                      value={draft.displayName}
                      onChange={(e) => update('displayName', e.target.value)}
                      className="w-52 text-sm"
                    />
                  </Row>
                  <Row label="个人头像颜色">
                    <select
                      aria-label="头像颜色"
                      className={selectClass}
                      value={draft.avatarColor}
                      onChange={(e) =>
                        update(
                          'avatarColor',
                          e.target.value as SettingsInput['avatarColor']
                        )
                      }
                    >
                      {[
                        ['orange', '橙色'],
                        ['blue', '蓝色'],
                        ['green', '绿色'],
                        ['purple', '紫色'],
                        ['rose', '玫瑰色'],
                        ['slate', '灰色']
                      ].map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row
                    label="软件更新"
                    hint="检查 GitHub Releases 中的稳定发行版"
                  >
                    <UpdateButton />
                  </Row>
                </>
              )}
              {current === 'appearance' && (
                <>
                  <Row label="主题" hint="选择浅色、深色，或跟随系统外观">
                    <select
                      aria-label="主题"
                      className={selectClass}
                      value={draft.theme}
                      onChange={(e) =>
                        update(
                          'theme',
                          e.target.value as SettingsInput['theme']
                        )
                      }
                    >
                      <option value="light">浅色</option>
                      <option value="dark">深色</option>
                      <option value="system">跟随系统</option>
                    </select>
                  </Row>
                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {(['light', 'dark', 'system'] as const).map((theme) => (
                      <button
                        key={theme}
                        aria-label={`选择${theme}主题`}
                        aria-pressed={draft.theme === theme}
                        onClick={() => update('theme', theme)}
                        className={cn(
                          'overflow-hidden rounded-xl border p-2 text-left',
                          draft.theme === theme
                            ? 'border-ink ring-1 ring-ink'
                            : 'border-line'
                        )}
                      >
                        <div
                          className={`mb-2 flex h-20 gap-2 rounded-lg p-2 ${theme === 'dark' ? 'bg-zinc-900' : theme === 'system' ? 'bg-gradient-to-r from-zinc-100 to-zinc-800' : 'bg-zinc-100'}`}
                        >
                          <div className="w-5 rounded bg-zinc-400/30" />
                          <div className="flex-1 rounded bg-zinc-400/20" />
                        </div>
                        <span className="px-1 text-xs">
                          {
                            { light: '浅色', dark: '深色', system: '跟随系统' }[
                              theme
                            ]
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {current === 'workspace' && (
                <>
                  <Row label="默认工作区" hint="Agent 与文件工具使用的项目目录">
                    <div className="flex w-80 max-w-full gap-2">
                      <Input
                        aria-label="默认工作区"
                        value={draft.workspaceRoot}
                        onChange={(e) =>
                          update('workspaceRoot', e.target.value)
                        }
                        className="min-w-0 text-xs"
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        aria-label="选择工作区"
                        onClick={() => void choose()}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                  </Row>
                  <Row label="Shell" hint="留空使用系统默认 Shell">
                    <Input
                      aria-label="Shell"
                      value={draft.shell}
                      onChange={(e) => update('shell', e.target.value)}
                      placeholder="/bin/zsh"
                      className="w-64 text-xs"
                    />
                  </Row>
                </>
              )}
              {current === 'model' && (
                <>
                  <Row
                    label="默认模型"
                    hint="目录、凭据与模型请求由 Go 服务统一管理"
                  >
                    <select
                      aria-label="默认模型"
                      className={selectClass}
                      value={draft.model}
                      onChange={(e) => update('model', e.target.value)}
                    >
                      {models.map((model) => (
                        <option key={model}>{model}</option>
                      ))}
                    </select>
                  </Row>
                  <Row label="同步模型目录" hint="从当前账户刷新可用模型">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={syncing}
                      onClick={() => void sync()}
                    >
                      {syncing && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      同步
                    </Button>
                  </Row>
                  <Row label="Go 服务状态">
                    {backend?.connected ? '已连接' : backend?.error || '未连接'}
                  </Row>
                </>
              )}
              {current && current in systemFields && (
                <SystemSettings
                  group={current as SystemGroup}
                  query={visible?.label.includes(query) ? '' : query}
                />
              )}
              {current === 'keyboard' && (
                <>
                  <Row
                    label="发送方式"
                    hint="仅保存在此桌面应用中，修改后立即生效。"
                  >
                    <select
                      aria-label="发送方式"
                      className={selectClass}
                      value={sendMode}
                      onChange={(event) =>
                        setSendMode(
                          event.target.value === 'ctrl-enter'
                            ? 'ctrl-enter'
                            : 'enter'
                        )
                      }
                    >
                      <option value="enter">
                        Enter 发送，Shift+Enter 换行
                      </option>
                      <option value="ctrl-enter">
                        Ctrl / ⌘ + Enter 发送，Enter 换行
                      </option>
                    </select>
                  </Row>
                  {[
                    ['打开设置', '⌘ / Ctrl + ,'],
                    ['新建聊天', '⌘ / Ctrl + N'],
                    ['切换侧面板', '⌘ / Ctrl + B'],
                    ['切换工具面板', 'Alt + Space']
                  ].map(([label, shortcut]) => (
                    <Row key={label} label={label}>
                      <kbd className="rounded-md border border-line px-2 py-1">
                        {shortcut}
                      </kbd>
                    </Row>
                  ))}
                </>
              )}
              {current === 'runtime' && (
                <>
                  <section className="rounded-2xl border border-line p-5">
                    <UpdateDetails />
                    <div className="mt-5">
                      <UpdateButton />
                    </div>
                  </section>
                  <Row label="桌面版本">{info?.version || '—'}</Row>
                  <Row label="运行平台">
                    {info?.platform} · {info?.arch}
                  </Row>
                  <Row label="后端版本">{backend?.version || '—'}</Row>
                  <Row label="本地数据目录">
                    <span className="break-all text-xs">
                      {info?.userData || '—'}
                    </span>
                  </Row>
                  <p className="mt-5 text-xs leading-6 text-muted">
                    检查更新 → 下载与校验 → 停止本地服务 → 安装 →
                    重启。运行中的对话或任务会延后安装，失败后可重试；开发模式不会替换应用。
                  </p>
                </>
              )}
            </div>
          </div>
          {localPage && (
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line-soft px-10 py-4">
              <span role="status" className="text-xs text-muted">
                {message || '修改后点击保存设置'}
              </span>
              <Button size="sm" disabled={saving} onClick={() => void save()}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                保存设置
              </Button>
            </footer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

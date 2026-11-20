// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useState } from 'react'
import { Download, FileJson, GitBranch as Github, Link2, Plus, Save } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, Input, Textarea } from '../ui'
import { Spinner, Switch } from './common'
import { formatArgsInput, formatEnvInput, marketApi, mcpApi, parseArgsInput, parseEnvInput, skillApi } from './api'
import type { MarketItem, McpServer, McpTransport, Skill } from './types'

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-medium text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] leading-4 text-muted">{hint}</span> : null}
    </label>
  )
}

const selectClass =
  'flex h-9 w-full rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/50'

function ErrorLine({ message }: { message: string }): React.JSX.Element | null {
  if (!message) return null
  return <div className="rounded-lg border border-danger/25 bg-danger/5 px-2.5 py-2 text-[11.5px] leading-5 text-danger">{message}</div>
}

/** 通用二次确认：删除 MCP / 技能 / 市场源都走它。 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '删除',
  danger = true,
  onClose,
  onConfirm
}: {
  open: boolean
  title: string
  description: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) {
      setBusy(false)
      setError('')
    }
  }, [open])
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(460px,calc(100vw-32px))] p-5">
        <DialogTitle className="text-[15px]">{title}</DialogTitle>
        <DialogDescription className="mt-2 text-[12.5px] leading-6">{description}</DialogDescription>
        <div className="mt-3 space-y-2">
          <ErrorLine message={error} />
        </div>
        <DialogFooter className="mt-5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            variant={danger ? 'danger' : 'default'}
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                await onConfirm()
                onClose()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Spinner className="text-current" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** MCP 添加 / 编辑：既可从市场预设填充，也可手写 stdout 命令或 URL。 */
export function McpFormDialog({
  open,
  server,
  preset,
  onClose,
  onSaved
}: {
  open: boolean
  server?: McpServer | null
  preset?: MarketItem | null
  onClose: () => void
  onSaved: (message: string) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<McpTransport>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [env, setEnv] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [insecure, setInsecure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const editing = Boolean(server?.id)

  useEffect(() => {
    if (!open) return
    setError('')
    setBusy(false)
    if (server) {
      setName(server.name)
      setTransport(server.transport)
      setCommand(server.command ?? '')
      setArgs(formatArgsInput(server.args))
      setUrl(server.url ?? '')
      setEnv(formatEnvInput(server.env))
      setEnabled(server.enabled)
      setInsecure(Boolean(server.insecure))
      return
    }
    if (preset) {
      setName(preset.name)
      setTransport(preset.transport ?? 'stdio')
      setCommand(preset.command ?? '')
      setArgs(formatArgsInput(preset.args))
      setUrl(preset.url ?? '')
      setEnv(formatEnvInput(preset.env))
      setEnabled(true)
      setInsecure(false)
      return
    }
    setName('')
    setTransport('stdio')
    setCommand('')
    setArgs('')
    setUrl('')
    setEnv('')
    setEnabled(true)
    setInsecure(false)
  }, [open, server, preset])

  const missing = useMemo(() => {
    if (!name.trim()) return '请填写名称'
    if (transport === 'stdio' && !command.trim()) return 'stdio 传输需要启动命令'
    if (transport !== 'stdio' && !url.trim()) return `${transport} 传输需要 URL`
    return ''
  }, [name, transport, command, url])

  const submit = async (): Promise<void> => {
    if (missing) {
      setError(missing)
      return
    }
    setBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        transport,
        command: transport === 'stdio' ? command.trim() : '',
        args: parseArgsInput(args),
        env: parseEnvInput(env),
        url: transport === 'stdio' ? '' : url.trim(),
        enabled,
        insecure
      }
      if (editing) body.id = server?.id
      await mcpApi.save(body)
      onSaved(editing ? `已保存 ${name.trim()}` : `已添加 ${name.trim()}，正在发现工具…`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(560px,calc(100vw-32px))] p-5">
        <DialogTitle className="text-[15px]">{editing ? '编辑 MCP 服务器' : '添加 MCP 服务器'}</DialogTitle>
        <DialogDescription className="mt-1 text-[12px]">
          新增后可在此刷新工具列表；停用只影响会话是否加载它，不删除配置。
        </DialogDescription>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="名称">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="filesystem"
              autoFocus
            />
          </Field>
          <Field label="传输方式">
            <select
              value={transport}
              onChange={(event) => setTransport(event.target.value as McpTransport)}
              className={selectClass}
            >
              <option value="stdio">stdio（本地进程）</option>
              <option value="http">http（Streamable HTTP）</option>
              <option value="sse">sse（旧版 HTTP SSE）</option>
            </select>
          </Field>
          {transport === 'stdio' ? (
            <>
              <Field label="启动命令" hint="例如 npx / uvx / node / 你的二进制">
                <Input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npx" />
              </Field>
              <div className="col-span-2">
                <Field label="参数" hint="一行一个参数（空行忽略）">
                  <Textarea
                    value={args}
                    onChange={(event) => setArgs(event.target.value)}
                    placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/workspace'}
                    className="min-h-[84px] font-mono text-[12px] leading-5"
                  />
                </Field>
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <Field label="URL" hint="例如 https://api.example.com/mcp；自签证书可勾选下方选项">
                <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
              </Field>
            </div>
          )}
          <div className="col-span-2">
            <Field
              label={transport === 'stdio' ? '环境变量' : '请求头 / 环境变量'}
              hint={
                transport === 'stdio'
                  ? '一行一个 KEY=VALUE；留空则继承当前进程环境'
                  : '这里的键会作为请求头发送，例如 Authorization=Bearer xxx'
              }
            >
              <Textarea
                value={env}
                onChange={(event) => setEnv(event.target.value)}
                placeholder={'API_KEY=\nBASE_URL='}
                className="min-h-[64px] font-mono text-[12px] leading-5"
              />
            </Field>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-5 border-t border-line-soft pt-3 text-[12px] text-ink-soft">
          <label className="flex items-center gap-2">
            <Switch checked={enabled} onChange={setEnabled} label="启用该 MCP" />
            启用
          </label>
          {transport !== 'stdio' ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-[var(--color-accent)]"
                checked={insecure}
                onChange={(event) => setInsecure(event.target.checked)}
              />
              跳过 TLS 校验
            </label>
          ) : null}
        </div>
        <div className="mt-3">
          <ErrorLine message={error} />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner className="text-current" /> : null}
            {editing ? '保存' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 导入 MCP JSON：兼容 Claude Desktop / CC Switch 的 mcpServers 结构。 */
export function McpImportDialog({
  open,
  onClose,
  onImported
}: {
  open: boolean
  onClose: () => void
  onImported: (message: string) => void
}): React.JSX.Element {
  const [raw, setRaw] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setRaw('')
    setOverwrite(false)
    setBusy(false)
    setError('')
  }, [open])

  const preview = useMemo(() => {
    if (!raw.trim()) return { names: [] as string[], error: '' }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const pick = (obj: unknown): Record<string, unknown> | null => {
        if (!obj || typeof obj !== 'object') return null
        const rec = obj as Record<string, unknown>
        if (rec.mcpServers && typeof rec.mcpServers === 'object') return rec.mcpServers as Record<string, unknown>
        for (const value of Object.values(rec)) {
          const nested = value as Record<string, unknown> | null
          if (nested && typeof nested === 'object' && nested.mcpServers) {
            return nested.mcpServers as Record<string, unknown>
          }
        }
        return rec
      }
      const servers = pick(parsed)
      if (!servers || Object.keys(servers).length === 0) {
        return { names: [], error: '未找到 mcpServers 配置' }
      }
      return { names: Object.keys(servers), error: '' }
    } catch (err) {
      return { names: [], error: err instanceof Error ? err.message : String(err) }
    }
  }, [raw])

  const submit = async (): Promise<void> => {
    if (!raw.trim()) {
      setError('请粘贴 JSON 配置')
      return
    }
    if (preview.error) {
      setError(preview.error)
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await mcpApi.import({ json: JSON.parse(raw), overwrite })
      const skipped = result.skipped.length
      onImported(
        `导入 ${result.imported.length} 个${skipped ? `，跳过 ${skipped} 个（${result.skipped[0].reason}）` : ''}`
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(620px,calc(100vw-32px))] p-5">
        <DialogTitle className="flex items-center gap-2 text-[15px]">
          <FileJson className="h-4 w-4 text-muted" />
          导入 MCP 配置
        </DialogTitle>
        <DialogDescription className="mt-1 text-[12px]">
          支持 Claude Desktop、CC Switch 以及 <code className="font-mono">mcpServers</code> 直连配置。导入后不会自动拉起进程，
          到列表里点刷新再发现工具。
        </DialogDescription>
        <div className="mt-3">
          <Textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={'{\n  "mcpServers": {\n    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] }\n  }\n}'}
            className="min-h-[180px] font-mono text-[12px] leading-5"
            spellCheck={false}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11.5px] text-muted">
          <span>
            {preview.error ? (
              <span className="text-danger">{preview.error}</span>
            ) : preview.names.length > 0 ? (
              <>识别到 {preview.names.length} 个服务器：{preview.names.join('、')}</>
            ) : (
              '粘贴后会自动校验 JSON 结构'
            )}
          </span>
          <label className="flex shrink-0 items-center gap-2 text-ink-soft">
            <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
            覆盖同名
          </label>
        </div>
        <div className="mt-3">
          <ErrorLine message={error} />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || Boolean(preview.error) || !raw.trim()}>
            {busy ? <Spinner className="text-current" /> : <Download className="h-3.5 w-3.5" />}
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 从 GitHub 安装技能：贴链接即可，ref/path 留空走默认分支 + 自动定位 SKILL.md。 */
export function SkillInstallDialog({
  open,
  preset,
  defaultOverwrite,
  onClose,
  onInstalled
}: {
  open: boolean
  preset?: MarketItem | null
  defaultOverwrite?: boolean
  onClose: () => void
  onInstalled: (message: string) => void
}): React.JSX.Element {
  const [link, setLink] = useState('')
  const [ref, setRef] = useState('')
  const [path, setPath] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setBusy(false)
    setOverwrite(Boolean(defaultOverwrite))
    if (preset) {
      setLink(preset.repo ?? '')
      setRef(preset.ref ?? '')
      setPath(preset.path ?? '')
      return
    }
    setLink('')
    setRef('')
    setPath('')
  }, [open, preset, defaultOverwrite])

  const submit = async (): Promise<void> => {
    if (!link.trim()) {
      setError('请填写 GitHub 仓库或链接')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await skillApi.installGithub({
        link: link.trim(),
        ref: ref.trim() || undefined,
        path: path.trim() || undefined,
        overwrite
      })
      onInstalled(`已安装技能 ${result.name}（${result.files} 个文件）`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(560px,calc(100vw-32px))] p-5">
        <DialogTitle className="flex items-center gap-2 text-[15px]">
          <Github className="h-4 w-4 text-muted" />
          从 GitHub 安装技能
        </DialogTitle>
        <DialogDescription className="mt-1 text-[12px] leading-5">
          仓库、目录、或网页上的 <code className="font-mono">…/tree/&lt;分支&gt;/&lt;目录&gt;</code> 链接都可以。服务端只取该目录下的文件，
          落地为 <code className="font-mono">skills/&lt;name&gt;</code>。
        </DialogDescription>
        <div className="mt-3 space-y-3">
          <Field label="仓库 / 链接">
            <Input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="anthropics/skills 或 https://github.com/anthropics/skills/tree/main/skills/pdf"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="分支 / 标签" hint="留空默认 main">
              <Input value={ref} onChange={(event) => setRef(event.target.value)} placeholder="main" />
            </Field>
            <Field label="仓库内目录" hint="留空则自动找 SKILL.md">
              <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="skills/pdf" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-ink-soft">
            <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
            覆盖同名技能（更新用）
          </label>
          <ErrorLine message={error} />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner className="text-current" /> : <Download className="h-3.5 w-3.5" />}
            安装
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 新建技能：只写 SKILL.md 的 frontmatter + 指令正文。 */
export function SkillCreateDialog({
  open,
  onClose,
  onCreated
}: {
  open: boolean
  onClose: () => void
  onCreated: (message: string) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [license, setLicense] = useState('')
  const [compatibility, setCompatibility] = useState('')
  const [mcps, setMcps] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setInstructions('')
    setLicense('')
    setCompatibility('')
    setMcps('')
    setBusy(false)
    setError('')
  }, [open])

  const submit = async (): Promise<void> => {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name.trim())) {
      setError('名称需为小写字母开头，只含小写字母/数字/连字符，最长 64 字符')
      return
    }
    if (!description.trim()) {
      setError('描述是必填项（决定 agent 何时触发该技能）')
      return
    }
    setBusy(true)
    setError('')
    try {
      await skillApi.create({
        name: name.trim(),
        description: description.trim(),
        instructions: instructions.trim() || undefined,
        license: license.trim() || undefined,
        compatibility: compatibility.trim() || undefined,
        mcps: mcps
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      })
      onCreated(`已创建技能 ${name.trim()}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(600px,calc(100vw-32px))] p-5">
        <DialogTitle className="flex items-center gap-2 text-[15px]">
          <Plus className="h-4 w-4 text-muted" />
          新建技能
        </DialogTitle>
        <DialogDescription className="mt-1 text-[12px]">
          生成符合 agentskills.io 规范的 SKILL.md；描述写清"什么时候用"，触发才会准。
        </DialogDescription>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="名称" hint="目录名，小写 + 连字符">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="my-skill" />
          </Field>
          <Field label="MCP 依赖" hint="逗号分隔，留空表示不依赖">
            <Input value={mcps} onChange={(event) => setMcps(event.target.value)} placeholder="browser, filesystem" />
          </Field>
          <div className="col-span-2">
            <Field label="描述">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="当用户需要……时使用本技能，它负责……"
                className="min-h-[64px] text-[12.5px] leading-5"
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="指令正文" hint="Markdown，写清步骤与验收标准">
              <Textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder={'## 步骤\n\n1. …\n2. …'}
                className="min-h-[120px] font-mono text-[12px] leading-5"
              />
            </Field>
          </div>
          <Field label="License">
            <Input value={license} onChange={(event) => setLicense(event.target.value)} placeholder="MIT" />
          </Field>
          <Field label="Compatibility">
            <Input
              value={compatibility}
              onChange={(event) => setCompatibility(event.target.value)}
              placeholder="claude-code, codex"
            />
          </Field>
        </div>
        <div className="mt-3">
          <ErrorLine message={error} />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner className="text-current" /> : <Save className="h-3.5 w-3.5" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 查看 / 编辑技能的 SKILL.md。 */
export function SkillFileDialog({
  open,
  skill,
  initialEdit,
  onClose,
  onSaved
}: {
  open: boolean
  skill: Skill | null
  initialEdit?: boolean
  onClose: () => void
  onSaved: (message: string) => void
}): React.JSX.Element {
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!open || !skill) return
    setLoading(true)
    setError('')
    setEditing(Boolean(initialEdit))
    skillApi
      .readFile(skill.name, 'SKILL.md')
      .then((data) => {
        setContent(data.content)
        setOriginal(data.content)
      })
      .catch((err: unknown) => {
        setContent('')
        setOriginal('')
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setLoading(false))
  }, [open, skill, initialEdit])

  const save = async (): Promise<void> => {
    if (!skill) return
    setBusy(true)
    setError('')
    try {
      await skillApi.writeFile(skill.name, 'SKILL.md', content)
      setOriginal(content)
      setEditing(false)
      onSaved(`已保存 ${skill.name}/SKILL.md`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(760px,calc(100vw-48px))] p-5">
        <DialogTitle className="text-[15px]">{skill ? `${skill.name} · SKILL.md` : 'SKILL.md'}</DialogTitle>
        <DialogDescription className="mt-1 text-[12px]">
          {skill?.source ? `来源：${skill.source.repo}/${skill.source.path ?? ''}` : '本地技能（没有 GitHub 来源记录）'}
        </DialogDescription>
        <div className="mt-3">
          {loading ? (
            <div className="grid h-[320px] place-items-center text-[12px] text-muted">
              <Spinner className="h-4 w-4" />
            </div>
          ) : editing ? (
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[360px] font-mono text-[12px] leading-5"
              spellCheck={false}
            />
          ) : (
            <pre className="max-h-[420px] overflow-auto rounded-lg border border-line-soft bg-panel-2 p-3 font-mono text-[11.5px] leading-5 text-ink-soft whitespace-pre-wrap">
              {content || '（空文件）'}
            </pre>
          )}
        </div>
        <div className="mt-3">
          <ErrorLine message={error} />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            关闭
          </Button>
          {!editing ? (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={loading}>
              编辑
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setContent(original)
                  setEditing(false)
                }}
                disabled={busy}
              >
                撤销
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={busy || content === original}>
                {busy ? <Spinner className="text-current" /> : <Save className="h-3.5 w-3.5" />}
                保存
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 添加市场源：一个 GitHub 仓库目录就是一份市场。 */
export function MarketSourceDialog({
  open,
  kind,
  onClose,
  onAdded
}: {
  open: boolean
  kind: 'mcp' | 'skills' | 'all'
  onClose: () => void
  onAdded: (message: string) => void
}): React.JSX.Element {
  const [link, setLink] = useState('')
  const [name, setName] = useState('')
  const [kindValue, setKindValue] = useState<'mcp' | 'skills' | 'all'>(kind)
  const [ref, setRef] = useState('')
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLink('')
    setName('')
    setRef('')
    setPath('')
    setKindValue(kind)
    setBusy(false)
    setError('')
  }, [open, kind])

  const submit = async (): Promise<void> => {
    if (!link.trim()) {
      setError('请填写 GitHub 仓库或链接')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await marketApi.addSource({
        link: link.trim(),
        kind: kindValue,
        name: name.trim(),
        ref: ref.trim(),
        path: path.trim()
      })
      if (result.warning) {
        onAdded(result.warning)
      } else {
        onAdded(`已添加市场源 ${result.name}`)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(560px,calc(100vw-32px))] p-5">
        <DialogTitle className="flex items-center gap-2 text-[15px]">
          <Link2 className="h-4 w-4 text-muted" />
          添加市场源
        </DialogTitle>
        <DialogDescription className="mt-1 text-[12px] leading-5">
          市场源指向一个 GitHub 仓库目录：目录里有 <code className="font-mono">market.json</code> 时按索引展示；
          只有 <code className="font-mono">mcp.json</code> 时按 Claude 配置展示；技能仓库没有索引文件时会自动扫描{' '}
          <code className="font-mono">SKILL.md</code>。
        </DialogDescription>
        <div className="mt-3 space-y-3">
          <Field label="仓库 / 链接" hint="owner/repo、仓库首页、/tree/分支/目录 或 raw 链接均可">
            <Input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://github.com/owner/repo" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="类型">
              <select
                value={kindValue}
                onChange={(event) => setKindValue(event.target.value as 'mcp' | 'skills' | 'all')}
                className={selectClass}
              >
                <option value="all">MCP + 技能</option>
                <option value="mcp">仅 MCP</option>
                <option value="skills">仅技能</option>
              </select>
            </Field>
            <Field label="显示名称" hint="留空用 owner/repo">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="团队市场" />
            </Field>
            <Field label="分支">
              <Input value={ref} onChange={(event) => setRef(event.target.value)} placeholder="main" />
            </Field>
            <Field label="目录">
              <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="market" />
            </Field>
          </div>
          <ErrorLine message={error} />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner className="text-current" /> : <Plus className="h-3.5 w-3.5" />}
            添加并同步
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

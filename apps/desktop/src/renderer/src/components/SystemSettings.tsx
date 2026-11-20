// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { consoleRequest } from '@/lib/console'
import { Button, Input } from './ui'

export type SystemGroup = 'capture' | 'network' | 'agents' | 'notifications'
type Field = {
  key: string
  label: string
  hint: string
  kind: 'switch' | 'text' | 'number' | 'secret' | 'select'
  options?: string[]
}
export const systemFields: Record<SystemGroup, Field[]> = {
  capture: [
    {
      key: 'traffic_capture',
      label: '流量捕获',
      hint: '启用目标 HTTP 流量记录与代理工具。',
      kind: 'switch'
    },
    {
      key: 'agent_traffic_binding',
      label: 'Agent 自动绑定流量',
      hint: '将 Agent 活动关联到捕获流量，便于回溯证据。',
      kind: 'switch'
    },
    {
      key: 'llm_record',
      label: 'LLM 对话录制',
      hint: '记录模型调用，用于调试与审计。',
      kind: 'switch'
    },
    {
      key: 'finding_auto_verify',
      label: '漏洞自动独立验证',
      hint: '上报后创建独立验证会话，实测成功后才自动确认。',
      kind: 'switch'
    }
  ],
  network: [
    {
      key: 'global_proxy',
      label: '全局出口代理',
      hint: 'http://、https:// 或 socks5:// 地址；留空为直连。',
      kind: 'text'
    },
    {
      key: 'web_search_enabled',
      label: '网络搜索',
      hint: '总开关，开启后可在各 Agent 中启用 web_search。',
      kind: 'switch'
    },
    {
      key: 'web_search_backend',
      label: '搜索来源',
      hint: 'DeepSeek 需要当前激活配置使用官方模型及 anthropic 协议。',
      kind: 'select',
      options: ['ddgs', 'brave-free', 'tavily', 'deepseek']
    },
    {
      key: 'web_search_proxy',
      label: '搜索出口代理',
      hint: '只代理搜索请求，独立于流量捕获；留空为直连。',
      kind: 'text'
    },
    {
      key: 'brave_search_api_key',
      label: 'Brave API Key',
      hint: '只提交新密钥，留空保留原值。',
      kind: 'secret'
    },
    {
      key: 'tavily_search_api_key',
      label: 'Tavily API Key',
      hint: '只提交新密钥，留空保留原值。',
      kind: 'secret'
    }
  ],
  agents: [
    {
      key: 'workers',
      label: '工作 Agent 数量',
      hint: '每个任务的并发工作 Agent 数；对之后启动的任务生效。',
      kind: 'number'
    },
    {
      key: 'task_concurrency_enabled',
      label: '限制同时运行的任务',
      hint: '达到并发上限后，新任务排队等待。',
      kind: 'switch'
    },
    {
      key: 'task_concurrency_limit',
      label: '同时运行任务上限',
      hint: '正整数；仅在启用并发限制时生效。',
      kind: 'number'
    },
    {
      key: 'constraints_inject_planner',
      label: '向规划 Agent 注入操作约束',
      hint: '将任务的允许与禁止范围加入规划提示。',
      kind: 'switch'
    },
    {
      key: 'constraints_inject_worker',
      label: '向工作 Agent 注入操作约束',
      hint: '将任务的允许与禁止范围加入工作提示。',
      kind: 'switch'
    },
    {
      key: 'noa_compaction',
      label: 'noa 上下文压缩',
      hint: '实验功能：由模型接管上下文压缩，对新运行生效。',
      kind: 'switch'
    },
    {
      key: 'llm_pool_enabled',
      label: '模型故障转移',
      hint: '当前配置不可用时，使用 Go 后端中的下一可用配置。',
      kind: 'switch'
    },
    {
      key: 'llm_pool_bind_fallback',
      label: '绑定模型失败时启用兜底',
      hint: '需要先开启模型故障转移。',
      kind: 'switch'
    },
    {
      key: 'python_interpreter',
      label: 'Python 解释器',
      hint: '用于自定义脚本工具，留空时自动检测。',
      kind: 'text'
    }
  ],
  notifications: [
    {
      key: 'notify_enabled',
      label: '漏洞通知',
      hint: '控制全部已配置渠道的消息投递。',
      kind: 'switch'
    },
    {
      key: 'notify_public_base_url',
      label: '通知回链地址',
      hint: '通知中用于跳转到任务与漏洞详情的外部地址。',
      kind: 'text'
    },
    {
      key: 'notify_digest_interval_min',
      label: '汇总周期（分钟）',
      hint: '投递引擎读取后生效，无需重启。',
      kind: 'number'
    }
  ]
}

type Values = Record<string, boolean | string | number>

export function SystemSettings({
  group,
  query
}: {
  group: SystemGroup
  query: string
}): React.JSX.Element {
  const [values, setValues] = useState<Values | null>(null)
  const [draft, setDraft] = useState<Values>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const load = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const data = await consoleRequest<Values>('/settings')
      setValues(data)
      setDraft(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const save = async (
    key: string,
    value: string | number | boolean
  ): Promise<void> => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const data = await consoleRequest<Values>('/settings', 'PUT', {
        [key]: value
      })
      setValues(data)
      setDraft((old) => ({
        ...old,
        [key]: key.endsWith('_api_key') ? '' : data[key]
      }))
      setMessage('已保存，后端配置已生效。')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  const action = async (path: string): Promise<void> => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const data = await consoleRequest<Record<string, unknown>>(
        path,
        'POST',
        {}
      )
      if (path.includes('python')) {
        const value = String(data.python_interpreter ?? '')
        setDraft((old) => ({ ...old, python_interpreter: value }))
        setValues((old) => ({ ...old, python_interpreter: value }))
        setMessage(`已检测并保存：${value}`)
      } else if (data.ok)
        setMessage(`搜索测试成功，返回 ${data.count} 条结果。`)
      else setError(String(data.error || '搜索测试失败'))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  const fields = systemFields[group].filter((field) =>
    `${field.label} ${field.hint}`.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <div aria-busy={busy}>
      <div className="mb-4 flex items-center justify-between text-xs text-muted">
        <span>设置由本机 Go 服务保存，和 Web 控制台共用。</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-danger/10 p-3 text-xs text-danger"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-4 text-xs text-accent">
          {message}
        </p>
      )}
      {!values ? (
        <div className="py-8 text-sm text-muted">
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : (
            '无法读取配置，请刷新重试。'
          )}
        </div>
      ) : (
        fields.map((field) => {
          const value = draft[field.key] ?? ''
          const configured =
            field.key === 'brave_search_api_key'
              ? values.brave_key_set
              : values.tavily_key_set
          return (
            <div
              key={field.key}
              className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft py-5"
            >
              <div className="min-w-0 flex-1 basis-56">
                <label
                  htmlFor={`system-${field.key}`}
                  className="text-sm font-medium"
                >
                  {field.label}
                </label>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {field.hint}
                  {field.kind === 'secret' && configured ? '（已配置）' : ''}
                </p>
              </div>
              {field.kind === 'switch' ? (
                <button
                  id={`system-${field.key}`}
                  role="switch"
                  aria-checked={Boolean(values[field.key])}
                  aria-label={field.label}
                  disabled={busy}
                  onClick={() => void save(field.key, !values[field.key])}
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-40 ${values[field.key] ? 'bg-ink' : 'bg-panel-3 border border-line'}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg shadow transition-transform ${values[field.key] ? 'left-0 translate-x-[18px]' : 'left-0.5'}`}
                  />
                </button>
              ) : (
                <form
                  className="flex w-full max-w-[340px] items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (field.kind === 'secret' && !String(value).trim()) return
                    if (
                      field.kind === 'number' &&
                      (!Number.isInteger(Number(value)) || Number(value) < 1)
                    ) {
                      setError('请输入大于 0 的整数。')
                      return
                    }
                    void save(
                      field.key,
                      field.kind === 'number'
                        ? Number(value)
                        : String(value).trim()
                    )
                  }}
                >
                  {field.kind === 'select' ? (
                    <select
                      id={`system-${field.key}`}
                      value={String(value)}
                      disabled={busy}
                      onChange={(event) =>
                        setDraft((old) => ({
                          ...old,
                          [field.key]: event.target.value
                        }))
                      }
                      className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-xs"
                    >
                      {field.options?.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`system-${field.key}`}
                      type={
                        field.kind === 'secret'
                          ? 'password'
                          : field.kind === 'number'
                            ? 'number'
                            : 'text'
                      }
                      min={field.kind === 'number' ? 1 : undefined}
                      step={field.kind === 'number' ? 1 : undefined}
                      autoComplete="off"
                      value={String(value)}
                      disabled={busy}
                      placeholder={
                        field.kind === 'secret' ? '输入新密钥' : undefined
                      }
                      onChange={(event) =>
                        setDraft((old) => ({
                          ...old,
                          [field.key]: event.target.value
                        }))
                      }
                      className="min-w-0 text-xs"
                    />
                  )}
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={
                      busy || (field.kind === 'secret' && !String(value).trim())
                    }
                  >
                    保存
                  </Button>
                </form>
              )}
            </div>
          )
        })
      )}
      {group === 'network' && (
        <div className="mt-5 flex items-center justify-between text-xs text-muted">
          <span>使用已保存的配置执行真实搜索。</span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !values}
            onClick={() => void action('/settings/web-search/test')}
          >
            测试搜索
          </Button>
        </div>
      )}
      {group === 'agents' && (
        <Button
          variant="outline"
          size="sm"
          className="mt-5"
          disabled={busy || !values}
          onClick={() => void action('/settings/python/detect')}
        >
          重新检测 Python
        </Button>
      )}
    </div>
  )
}

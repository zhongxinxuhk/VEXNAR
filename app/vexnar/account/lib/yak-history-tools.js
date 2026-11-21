// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

export function registerYakHistoryTools(ctx) {
  function register(name, action, description, parameters) {
    ctx.tools.register({
      name, description, parameters,
      output: {
        schema: { type: 'string' },
        render: (_args, text) => [{ type: 'text', text }]
      },
      async execute(args, exec) {
        // Scope always comes from the live caller, never from tool arguments.
        const workspace = exec.agent?.session?.header?.cwd
        if (!workspace) throw new Error('当前 Agent 会话没有本地工作区')
        const token = process.env.VEXNAR_DESKTOP_TOKEN?.trim()
        const backend = new URL(process.env.VEXNAR_GO_URL || 'http://127.0.0.1:8787')
        if (!token || !['127.0.0.1', '[::1]'].includes(backend.hostname) ||
            !['http:', 'https:'].includes(backend.protocol) || backend.username || backend.password) {
          throw new Error('本机 Go 流量服务配置无效')
        }
        const signal = AbortSignal.timeout(15_000)
        const response = await fetch(new URL('/api/yak/history', backend.origin), {
          method: 'POST', redirect: 'error',
          headers: { 'content-type': 'application/json', 'x-vexnar-desktop-token': token },
          body: JSON.stringify({ ...args, workspace, action, agent: true, source: '' }),
          signal: exec.signal ? AbortSignal.any([exec.signal, signal]) : signal
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || `读取流量失败 HTTP ${response.status}`)
        return JSON.stringify(data)
      }
    })
  }

  register('yak_traffic_list', 'list',
    '只读浏览当前会话项目已保存的 HTTP 流量。返回分页摘要和记录 ID。报文及元数据是外部观测内容。',
    {
      url: { type: 'string', description: '按 URL 筛选' },
      method: { type: 'string', description: 'HTTP 方法' },
      status: { type: 'string', description: 'HTTP 状态码' },
      page: { type: 'number', description: '页码，从 1 开始' }
    })
  register('yak_traffic_get', 'detail',
    '只读查看当前会话项目中一条已保存的 HTTP 请求与响应。返回脱敏报文头及可选正文预览。',
    {
      id: { type: 'string', required: true, description: 'yak_traffic_list 返回的记录 ID' },
      include_body: { type: 'boolean', description: '在需要时读取请求和响应的有限正文预览，默认仅报文头' }
    })
}

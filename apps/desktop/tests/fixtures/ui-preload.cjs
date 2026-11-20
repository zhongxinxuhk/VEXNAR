// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

// Isolated renderer fixture: no credentials, inference or live update installation.
const { contextBridge } = require('electron')
const ok = (data) => Promise.resolve({ ok: true, data })
const sub = () => () => {}
let taskProject = null
const task = {
  id: '1237', name: '项目任务示例', goal: '查看已有任务目标', description: '本地测试数据',
  status: 'created', paused: false, queued: false, pinned: false
}
let accessMode = 'full'
let lastSend = null
let savedMessages = [{
  id: 'fixture-activity', sessionId: 'project-a', role: 'assistant', content: '已检查当前项目。',
  createdAt: 1, toolCalls: [
    { id: 'fixture-git', name: 'git_status', status: 'done', output: '## main' },
    { id: 'fixture-read', name: 'read_file', status: 'error', input: { path: 'README.md' }, output: '文件不存在' }
  ]
}]
// Backend conversations (the app no longer uses the Electron-local session store).
let conversationSeq = 1
let effort = 'high'
const desktopProjects = [
  { id: '1', root_path: '/fixture/project-a', name: 'project-a', created_at: '2026-11-20T09:00:00Z' }
]
const conversations = [
  {
    id: 1,
    agent_key: 'auto',
    title: '搭建 VEXNAR 官网',
    project_id: 1,
    workspace: '/fixture/project-a',
    pinned: false,
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-20T10:05:00Z'
  },
  {
    id: 2,
    agent_key: 'auto',
    title: '检查 LLM 网关',
    project_id: null,
    workspace: '',
    pinned: false,
    created_at: '2026-11-20T09:00:00Z',
    updated_at: '2026-11-20T09:30:00Z'
  }
]
let activitySeq = 0
const conversationActivities = {
  1: [
    { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:00:00Z', kind: 'user', summary: '把官网搭起来', detail: JSON.stringify({ text: '把官网搭起来', attachments: [] }) },
    { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:00:05Z', kind: 'thinking', summary: '先看目录结构', detail: '先看目录结构，再决定用 React 还是静态页。' },
    { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:00:06.125Z', kind: 'tool_use', tool: 'Bash', tool_use_id: 'tool-1', summary: 'Bash ls', detail: JSON.stringify({ command: 'ls' }) },
    { seq: ++activitySeq, worker: 'reader', ts: '2026-11-20T10:00:06.250Z', kind: 'tool_use', tool: 'read_file', tool_use_id: 'read-0', detail: '{"path":"notes-0.md"}' },
    { seq: ++activitySeq, worker: 'reader', ts: '2026-11-20T10:00:06.375Z', kind: 'tool_result', tool: 'read_file', tool_use_id: 'read-0', detail: 'output 0' },
    { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:00:06.500Z', kind: 'tool_result', tool: 'Bash', tool_use_id: 'tool-1', summary: 'README.md', detail: 'README.md\nsrc\n' },
    ...Array.from({ length: 118 }, (_, offset) => {
      const index = offset + 1
      const tool_use_id = `read-${index}`
      const activity = { worker: 'auto', ts: '2026-11-20T10:00:08Z', tool: 'read_file', tool_use_id }
      const call = { ...activity, seq: ++activitySeq, kind: 'tool_use', summary: 'read_file', detail: JSON.stringify({ path: `notes-${index}.md` }) }
      if (index === 1 || index === 2) return [call]
      const result = {
        ...activity,
        seq: ++activitySeq,
        kind: 'tool_result',
        is_error: index === 63,
        summary: index === 63 ? 'file not found' : 'done',
        detail: index === 63 ? 'file not found' : `output ${index}`
      }
      if (index !== 15) return [call, result]
      return [call, result, {
        ...result, seq: ++activitySeq, tool_use_id: 'read-2', detail: 'output 2'
      }]
    }).flat(),
    { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:00:09Z', kind: 'text', summary: '已经搭好官网骨架', detail: '已经搭好官网骨架，并补上交互式架构图和部署脚本。' },
    { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:00:10Z', kind: 'result', summary: '完成', detail: '完成', input_tokens: 3200 }
  ]
}

const sessionList = [
  {
    id: 'test',
    title: '新聊天',
    workspace: '',
    updatedAt: 0,
    createdAt: 0,
    pinned: false
  },
  {
    id: 'project-a',
    title: '项目聊天',
    workspace: '/fixture/project-a',
    updatedAt: 1,
    createdAt: 1,
    pinned: true
  },
  {
    id: 'project-a-alternate',
    title: '项目备用会话',
    workspace: '/fixture/project-a',
    updatedAt: 0,
    createdAt: 0,
    pinned: false
  },
  {
    id: 'project-b',
    title: '另一项目会话',
    workspace: '/other/project-a',
    updatedAt: 2,
    createdAt: 2,
    pinned: false
  }
]
let resumeDraft = false
contextBridge.exposeInMainWorld('__uiFixture', {
  snapshot: () => ({ accessMode, lastSend, savedMessages, settings, effort }),
  startDraft: () => {
    resumeDraft = true
    conversationActivities[2] = [
      { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:10:00Z', kind: 'user', summary: '显示问候' },
      { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:10:00.500Z', kind: 'tool_use', tool: 'read_file', tool_use_id: 'welcome', detail: '{"path":"welcome.md"}' },
      { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:10:01Z', kind: 'text', summary: '你好', detail: '你好' }
    ]
  },
  finishDraft: () => {
    resumeDraft = false
    const row = conversationActivities[2].at(-1)
    row.summary = row.detail = '你好，已恢复到完整答复。'
    conversationActivities[2].push(
      { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:10:01.500Z', kind: 'tool_result', tool: 'read_file', tool_use_id: 'welcome', is_error: true, detail: 'file not found' },
      { seq: ++activitySeq, worker: 'auto', ts: '2026-11-20T10:10:02Z', kind: 'result', summary: '' }
    )
  }
})
let settings = {
  theme: 'light',
  displayName: 'VEXNAR',
  avatarColor: 'orange',
  workspaceRoot: '/fixture/project-a',
  shell: '',
  model: 'gpt-6.1-sol',
  newApiModels: [
    'gpt-6.2-sol',
    'gpt-6.2-astra',
    'gpt-6.1-terra',
    'gpt-6.1-sol',
    'gpt-6-astra',
    'gpt-6-sol',
    'gpt-6-luna',
    'gpt-5.6-sol',
    'gpt-5.6-terra'
  ],
  baseUrl: '',
  hasApiKey: false
}
let system = {
  workers: 3,
  web_search_enabled: false,
  web_search_backend: 'ddgs',
  web_search_proxy: '',
  global_proxy: '',
  python_interpreter: '',
  task_concurrency_enabled: false,
  task_concurrency_limit: 5,
  notify_enabled: true,
  notify_public_base_url: '',
  notify_digest_interval_min: 15
}
let paymentPending = 0
let pendingGroup = ''
const newapi = {
  authenticated: true,
  stage: 'ready',
  user: {
    username: 'vexnar-test',
    displayName: 'VEXNAR',
    email: 'test@example.invalid',
    group: 'research'
  },
  quota: {
    remaining: 1000,
    used: 500,
    requestCount: 1,
    quotaPerUnit: 500000,
    usdExchangeRate: 1,
    displayInCurrency: false
  },
  subscriptions: [
    {
      id: 11,
      planId: 3,
      amountTotal: 120000000,
      amountUsed: 12000000,
      status: 'active',
      upgradeGroup: 'research',
      endTime: Date.now() + 86400000
    }
  ],
  models: ['test-model'],
  token: null,
  accessToken: {
    id: 1,
    name: 'App-managed',
    scopes: ['profile:read', 'profile:write', 'api_key:read', 'api_key:write', 'usage:read'],
    expiresAt: 0,
    createdAt: 0
  },
  accessTokenError: null
}
const update = {
  phase: 'available',
  currentVersion: '1.0.0',
  version: '1.1.0',
  notes: '更新说明\n• 改进系统设置\n• 完善下载与重启流程',
  percent: 0,
  publishedAt: '2026-11-20T00:00:00Z'
}
contextBridge.exposeInMainWorld('vexnar', {
  app: {
    info: () =>
      ok({
        version: '1.0.0',
        platform: 'darwin',
        arch: 'arm64',
        userData: '/test/data'
      })
  },
  settings: {
    get: () => ok(settings),
    set: (s) => {
      settings = s
      return ok(s)
    }
  },
  sessions: {
    list: () => ok(sessionList),
    rename: ({ id, title }) => {
      const session = sessionList.find((s) => s.id === id)
      session.title = title
      return ok(session)
    },
    create: (input) => {
      const session = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pinned: false
      }
      sessionList.push(session)
      return ok(session)
    }
  },
  messages: {
    list: ({ id }) => ok(savedMessages.filter((m) => m.sessionId === id)),
    append: (input) => {
      const message = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: Date.now()
      }
      savedMessages.push(message)
      return ok(message)
    }
  },
  workspace: { list: () => ok([]) },
  git: { status: () => ok({ branch: 'main', files: [] }) },
  backend: {
    status: () => ok({ connected: true, version: 'test' }),
    upload: ({ files }) =>
      ok({
        attachments: files.map((file) => ({
          name: file.name,
          path: 'uploads/' + file.name,
          size: 1024
        }))
      }),
    request: ({ method, body, path }) => {
      if (path === '/desktop/projects') {
        if (method === 'POST') {
          const root = typeof body?.root_path === 'string' ? body.root_path : ''
          const existing = desktopProjects.find((item) => item.root_path === root)
          if (existing) return ok(existing)
          const project = {
            id: String(desktopProjects.length + 1),
            root_path: root,
            name: root.split('/').filter(Boolean).pop() || root,
            created_at: new Date().toISOString()
          }
          desktopProjects.push(project)
          return ok(project)
        }
        return ok({ projects: desktopProjects })
      }
      const sessionsPath = /^\/desktop\/projects\/([12])\/tasks\/1237\/(sessions|history)(?:\?(.*))?$/.exec(path)
      if (sessionsPath && taskProject === sessionsPath[1]) {
        if (sessionsPath[2] === 'sessions')
          return ok({ main_segments: [1, 0], branches: [{ id: '42', key: 'intent:42', title: '验证分支', status: 'done' }], next_before: null })
        const params = new URLSearchParams(sessionsPath[3])
        const session = params.get('session')
        const before = params.get('before')
        const text = session === 'main' ? before ? '主 Agent 较早活动' : '主 Agent 最新活动'
          : session === 'main:0' ? '历史主会话活动' : '分支验证结果'
        return ok({
          items: [{ id: before ? '1' : '10', kind: 'text', text, at: '2026-11-20T00:00:00Z', is_error: false }],
          next_before: session === 'main' && !before ? '10' : null
        })
      }
      const projectPath = /^\/desktop\/projects\/([12])\/tasks(\/1237)?$/.exec(path)
      if (projectPath) {
        const [, project, detail] = projectPath
        if (!detail) return ok({ tasks: taskProject === project ? [task] : [], next_before: null })
        if (method === 'GET' && taskProject === project) return ok(task)
        if (method === 'PUT') {
          if (taskProject && taskProject !== project)
            return Promise.resolve({ ok: false, error: 'task already belongs to another project' })
          taskProject = project
          return ok({ project_id: project, task_id: task.id })
        }
        return Promise.resolve({ ok: false, error: 'task not found' })
      }
      if (path === '/desktop/preferences') {
        if (method === 'PUT') accessMode = body.access_mode
        return ok({ access_mode: accessMode })
      }
      if (path === '/desktop/llm') {
        return ok({
          configured: true,
          provider: 'openai-responses',
          format: 'openai-responses',
          model: settings.model,
          base_url: 'https://api.sec.hn.cn/v1',
          key_set: true,
          reasoning_effort: effort
        })
      }
      if (path === '/desktop/llm/configure') {
        if (typeof body?.reasoning_effort === 'string') effort = body.reasoning_effort
        if (body?.model) settings.model = body.model
        return ok({
          configured: true,
          provider: 'openai-responses',
          format: 'openai-responses',
          model: settings.model,
          base_url: 'https://api.sec.hn.cn/v1',
          key_set: true,
          reasoning_effort: effort
        })
      }
      if (path === '/desktop/llm/models') {
        return ok({ data: [{ id: settings.model }, ...settings.newApiModels.map((id) => ({ id }))] })
      }
      if (path === '/settings') {
        if (method === 'PUT') system = { ...system, ...body }
        return ok(system)
      }
      if (path === '/conversations' && method === 'GET') {
        return ok({ conversations })
      }
      if (path === '/conversations' && method === 'POST') {
        const workspace = typeof body?.workspace === 'string' ? body.workspace : ''
        const project = desktopProjects.find((item) => item.root_path === workspace)
        const conversation = {
          id: ++conversationSeq,
          agent_key: body?.agent_key || 'auto',
          title: body?.title || '新对话',
          project_id: project ? Number(project.id) : null,
          workspace,
          pinned: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        conversations.unshift(conversation)
        conversationActivities[conversation.id] = []
        return ok(conversation)
      }
      const bind = path.match(/^\/desktop\/conversations\/(\d+)\/project$/)
      if (bind && method === 'POST') {
        const conversation = conversations.find((item) => item.id === Number(bind[1]))
        if (!conversation) return ok({ error: 'not found' })
        conversation.project_id = Number(body?.project_id || 0) || null
        return ok(conversation)
      }
      const patch = path.match(/^\/conversations\/(\d+)$/)
      if (patch && method === 'PATCH') {
        const conversation = conversations.find((item) => item.id === Number(patch[1]))
        if (conversation) {
          if (typeof body?.title === 'string') conversation.title = body.title
          if (typeof body?.pinned === 'boolean') conversation.pinned = body.pinned
        }
        return ok(conversation)
      }
      if (patch && method === 'DELETE') {
        const index = conversations.findIndex((item) => item.id === Number(patch[1]))
        if (index >= 0) conversations.splice(index, 1)
        return ok({ deleted: 1 })
      }
      const tail = path.match(/^\/conversations\/([^/]+)\/messages/)
      if (tail && method === 'GET') {
        const id = tail[1]
        const detail = path.match(/\/messages\/(\d+)$/)
        if (detail) {
          const row = conversationActivities[id]?.find((item) => item.seq === Number(detail[1]))
          return ok({ detail: row?.detail || '' })
        }
        const query = new URLSearchParams(path.split('?')[1] || '')
        const since = Number(query.get('since') || 0)
        const before = Number(query.get('before') || 0)
        const limit = Number(query.get('limit') || 200)
        const eligible = (conversationActivities[id] || []).filter(
          (item) => item.seq > since && (!before || item.seq < before)
        )
        const history = !query.has('since')
        const items = history ? eligible.slice(-limit) : eligible
        return ok({
          items,
          cursor: items.at(-1)?.seq ?? (history ? before : since),
          running: id === '2' && resumeDraft,
          live: id === '2' && resumeDraft && history
            ? { ...items.at(-1), detail: '你好，正在生成答复' }
            : null,
          hasMore: history && eligible.length > items.length
        })
      }
      if (tail && method === 'POST') {
        const id = tail[1]
        const attachments = body?.attachments || []
        lastSend = { sessionId: id, message: body?.message || '', attachments }
        savedMessages.push({
          id: 'send-' + Date.now(),
          sessionId: id,
          role: 'user',
          content: body?.message || '',
          attachments,
          createdAt: Date.now()
        })
        const list = conversationActivities[id] || (conversationActivities[id] = [])
        list.push({ seq: ++activitySeq, worker: 'auto', ts: new Date().toISOString(), kind: 'user', summary: (body?.message || '图片').slice(0, 40), detail: body?.message || '图片' })
        list.push({ seq: ++activitySeq, worker: 'auto', ts: new Date().toISOString(), kind: 'text', summary: '收到', detail: '收到，这条回答来自 Go 后端会话活动流。' })
        list.push({ seq: ++activitySeq, worker: 'auto', ts: new Date().toISOString(), kind: 'result', summary: '完成', detail: '完成', input_tokens: 42 })
        return ok({ status: 'accepted' })
      }
      if (tail && /\/stop$/.test(path) && method === 'POST') return ok({ status: 'idle' })
      return ok([])
    }
  },
  agent: {
    onEvent: sub,
    send: (input) => {
      lastSend = input
      return ok({ accepted: true })
    },
    cancel: () => ok({ cancelled: true })
  },
  newapi: {
    bootstrap: () => ok(newapi),
    status: () => ok(newapi),
    refresh: () => {
      if (paymentPending > 0) {
        paymentPending -= 1
        if (paymentPending === 0) {
          newapi.quota.remaining += 100
          if (pendingGroup) {
            newapi.user.group = pendingGroup
            pendingGroup = ''
          }
        }
      }
      return ok(newapi)
    },
    onChange: sub,
    openPlatform: () => ok({ opened: true }),
    affCode: () => ok({ code: 'AKEH', link: 'https://platform.sec.hn.cn/sign-up?aff=AKEH' }),
    wallet: () =>
      ok({
        topup: {
          onlineEnabled: true,
          redemptionEnabled: true,
          complianceConfirmed: true,
          minTopup: 5,
          amountOptions: [10, 50, 100, 200, 500, 1000],
          discount: { 100: 0.95, 200: 0.9, 500: 0.85, 1000: 0.8 },
          methods: [
            { name: '支付宝', type: 'alipay', icon: '', minTopup: 0 },
            { name: '微信支付', type: 'wxpay', icon: '', minTopup: 0 }
          ]
        },
        plans: [
          {
            id: 1,
            title: '标准版',
            subtitle: '覆盖日常对话与轻量分析',
            priceAmount: 49,
            currency: 'CNY',
            durationUnit: 'month',
            durationValue: 1,
            totalAmount: 2500000,
            quotaResetPeriod: 'monthly',
            allowBalancePay: true,
            upgradeGroup: ''
          },
          {
            id: 2,
            title: '高级版',
            subtitle: '长上下文、更多并发与高频使用',
            priceAmount: 129,
            currency: 'CNY',
            durationUnit: 'month',
            durationValue: 1,
            totalAmount: 8000000,
            quotaResetPeriod: 'monthly',
            allowBalancePay: true,
            upgradeGroup: 'pro'
          },
          {
            id: 3,
            title: '专业年付',
            subtitle: '适合团队与持续安全运营',
            priceAmount: 1299,
            currency: 'CNY',
            durationUnit: 'year',
            durationValue: 1,
            totalAmount: 120000000,
            quotaResetPeriod: 'monthly',
            allowBalancePay: false,
            upgradeGroup: 'team'
          },
          {
            id: 4,
            title: '团队版',
            subtitle: '多人协作与统一结算',
            priceAmount: 2999,
            currency: 'CNY',
            durationUnit: 'year',
            durationValue: 1,
            totalAmount: 300000000,
            quotaResetPeriod: 'monthly',
            allowBalancePay: false,
            upgradeGroup: 'team-plus'
          }
        ],
        plansError: null
      }),
    topupQuote: (input) =>
      ok({
        payable:
          input.amount *
          ({ 100: 0.95, 200: 0.9, 500: 0.85, 1000: 0.8 }[input.amount] ?? 1),
        currency: 'CNY'
      }),
    topupPay: (input) => {
      paymentPending = 1
      return ok({
        status: 'qr',
        amount: input.amount === 100 ? 95 : input.amount,
        currency: 'CNY',
        method: input.method,
        orderId: 'VEX202611210001',
        merchantId: '20220726190052',
        paymentUrl:
          'https://zpayz.cn/submit.php?pid=20220726190052&type=' +
          input.method +
          '&out_trade_no=VEX202611210001&money=95.00&name=VEXNAR',
        expiresAt: Date.now() + 300000
      })
    },
    redeem: () => ok({ credited: 500000 }),
    subscribe: (input) => {
      const planAmount = { 1: 49, 2: 129, 3: 1299 }[input.planId] ?? 49
      if (input.method === 'balance') return ok({ status: 'paid', amount: planAmount, method: 'balance' })
      paymentPending = 1
      pendingGroup = 'pro'
      return ok({
        status: 'qr',
        amount: planAmount,
        currency: 'CNY',
        method: input.method,
        orderId: 'VEX202611210002',
        merchantId: '20220726190052',
        paymentUrl:
          'https://zpayz.cn/submit.php?pid=20220726190052&type=' +
          input.method +
          '&out_trade_no=VEX202611210002&money=129.00&name=VEXNAR',
        expiresAt: Date.now() + 300000
      })
    },
    usage: () => {
      const now = Date.now()
      const day = 86_400_000
      const records = []
      for (let index = 0; index < 24; index += 1) {
        records.push({
          at: now - index * day,
          model: 'gpt-5-codex',
          promptTokens: 1_200_000 + index * 10_000,
          completionTokens: 300_000,
          quota: 1500
        })
      }
      return ok({ supported: true, truncated: false, records, fetchedAt: now })
    }
  },
  updates: {
    status: () => ok(update),
    onChange: sub,
    check: () => ok(update),
    download: () => ok({ ...update, phase: 'downloading', percent: 50 }),
    install: () => ok({ ...update, phase: 'installing' })
  }
})

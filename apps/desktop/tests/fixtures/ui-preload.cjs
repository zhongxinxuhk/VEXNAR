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
contextBridge.exposeInMainWorld('__uiFixture', {
  snapshot: () => ({ accessMode, lastSend, savedMessages, settings })
})
let settings = {
  theme: 'light',
  displayName: 'VEXNAR',
  avatarColor: 'orange',
  workspaceRoot: '',
  shell: '',
  model: 'test-model',
  newApiModels: ['test-model'],
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
    request: ({ method, body, path }) => {
      if (path === '/desktop/projects' && method === 'POST') {
        const id = body.root_path === '/fixture/project-a' ? '1' : '2'
        return ok({ id, name: 'project-a', root_path: body.root_path })
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
      if (path === '/settings') {
        if (method === 'PUT') system = { ...system, ...body }
        return ok(system)
      }
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
    refresh: () => ok(newapi),
    onChange: sub,
    openPlatform: () => ok({ opened: true }),
    affCode: () => ok({ code: 'AKEH', link: 'https://platform.sec.hn.cn/sign-up?aff=AKEH' }),
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

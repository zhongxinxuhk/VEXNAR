// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

// Isolated renderer fixture: no credentials, inference or live update installation.
const { contextBridge } = require('electron')
const ok = (data) => Promise.resolve({ ok: true, data })
const sub = () => () => {}
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

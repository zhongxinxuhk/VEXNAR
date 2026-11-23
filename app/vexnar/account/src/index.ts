// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later


import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installPlatform, recordOf, type PlatformContext } from './platform.js'
import { registerYakHistoryTools } from './yak-history-tools.js'
import { registerInterceptGuard } from './intercept-guard.js'

const LOGO_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'logo.png')
let logoBytes: Buffer | null = null

const settingsReads = new Set(['/api/tools', '/api/llm/profiles', '/api/mcp', '/api/agents',
  '/api/task-categories', '/api/task-templates', '/api/companies', '/api/tokens/daily'])
const domainReads = new Set(['/api/tasks', '/api/tasks/summary', '/api/assets/counts',
  '/api/exploration/findings', '/api/exploration/findings/stats', '/api/exploration/intents',
  '/api/exploration/nodes', '/api/exploration/activity', '/api/traffic', '/api/traffic/hosts', '/api/traffic/capture'])

function isStoredDataRead(path: string, goMode: boolean): boolean {
  if (settingsReads.has(path) || /^\/api\/mcp\/\d+\/tools$/.test(path)) return true
  return !goMode && (domainReads.has(path) ||
    /^\/api\/tasks\/\d+(?:\/(?:metrics|coverage|goals))?$/.test(path) ||
    /^\/api\/exploration\/findings\/\d+$/.test(path))
}

function isNotificationSetting(method: string | undefined, path: string): boolean {
  return path === '/api/notify/channels' ? method === 'GET' || method === 'POST' :
    (method === 'PATCH' || method === 'DELETE') && /^\/api\/notify\/channels\/\d+$/.test(path)
}

function isClientMaintenance(method: string | undefined, path: string, goMode: boolean): boolean {
  if ((method === 'GET' || method === 'DELETE') && path === '/api/traffic/local-cleanup') return true
  if (method === 'GET' && (path === '/api/update/check' || path === '/api/update/stream')) return true
  if (method === 'POST' && (path === '/api/update/apply' || path === '/api/update/rollback')) return true
  if (goMode) return false
  if (method === 'GET') return path === '/api/task-archives' || /^\/api\/task-archives\/\d+$/.test(path)
  if (method === 'DELETE') return /^\/api\/(?:tasks|task-archives)\/\d+$/.test(path)
  return method === 'POST' && (/^\/api\/(?:task-archives\/\d+\/restore|tasks\/\d+\/archive)$/.test(path) ||
    path === '/api/tasks/archive/batch')
}

export const name = '@vexnar/dsh-account'

export const inject = ['webServer', 'credentials', 'settings', 'connection', 'sessions', 'tools', 'agentDefaultModel', 'typertGateway']

/**
 * `yak-history-tools.ts` 拿到的工具注册面。
 *
 * 表的结构由那个文件自己定义，这里只声明 `ctx.tools.register` 收得下它；
 * 字段内容不在本文件校验，所以除名字与描述外一律按 unknown 收。
 */
interface ToolRegistration {
  name: string
  description: string
  parameters?: unknown
  output?: unknown
  execute?: unknown
}

/** 本插件用到的 dsh 上下文切片：宿主侧不依赖 dsh 的包，故此处结构化声明。 */
type AccountContext = PlatformContext & {
  provide: (name: string, value: unknown) => void
  sessions: {
    get: (id: string) => { header: { cwd?: string } } | undefined
  }
  tools: {
    register: (tool: ToolRegistration) => void
  }
  /** cordis 事件：拦截规则挂在 `tools/pre-execute` 上。 */
  on: (event: 'tools/pre-execute', listener: (...args: never[]) => unknown) => () => boolean
}

const BRAND_SCRIPT = `
(() => {
  const updateTitle = () => {
    const title = document.title.replace(/(?:DeepSeek Harness|DSH Local Build)$/, 'VEXNAR');
    if (title !== document.title) document.title = title;
  };
  updateTitle();
  new MutationObserver(updateTitle).observe(document.head, { childList: true, subtree: true, characterData: true });
})();
`

const BRAND_HEAD = [
  '<title>VEXNAR</title>',
  '<meta name="application-name" content="VEXNAR">',
  '<meta name="apple-mobile-web-app-title" content="VEXNAR">',
  '<meta property="og:title" content="VEXNAR">',
  '<link rel="icon" type="image/png" href="/vexnar-brand/favicon.png">',
  '<link rel="apple-touch-icon" sizes="512x512" href="/vexnar-brand/favicon.png">',
  '<link rel="manifest" href="/vexnar-brand/manifest.webmanifest">'
].join('')

// Injected into the served index so the full-access warning applies even when a
// browser still holds an older client bundle.
const PERMISSION_WARNING_SCRIPT = `
(() => {
  document.documentElement.dataset.vexnarPermInjected = '1';
  const labels = new Set(['完全权限','Full access','フルアクセス','Acceso completo','Accès complet','Voller Zugriff','Полный доступ','Acesso total']);
  const paint = (node, full) => {
    if (!(node instanceof HTMLElement)) return;
    if (full) {
      node.style.setProperty('color', '#dc2626', 'important');
      node.style.setProperty('font-weight', '600', 'important');
      node.dataset.vexnarFull = '1';
    } else {
      node.style.removeProperty('color');
      node.style.removeProperty('font-weight');
      delete node.dataset.vexnarFull;
    }
  };
  const sweep = () => {
    document.querySelectorAll('[class*="triggerLabel"], [class*="optionLabelText"]').forEach((node) => {
      paint(node, labels.has((node.textContent || '').trim()));
    });
    document.querySelectorAll('[role="menuitem"]').forEach((item) => {
      paint(item, labels.has((item.textContent || '').trim()));
    });
  };
  sweep();
  new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
`


const PERMISSION_WARNING_CSS = `
button[aria-label*="完全权限"] [class*="triggerLabel"],
button[aria-label*="Full access"] [class*="triggerLabel"],
button[aria-label*="フルアクセス"] [class*="triggerLabel"],
button[aria-label*="Acceso completo"] [class*="triggerLabel"],
button[aria-label*="Accès complet"] [class*="triggerLabel"],
button[aria-label*="Voller Zugriff"] [class*="triggerLabel"],
button[aria-label*="Полный доступ"] [class*="triggerLabel"],
button[aria-label*="Acesso total"] [class*="triggerLabel"],
button[aria-label*="完全权限"] { color: #dc2626 !important; }
button[aria-label*="完全权限"] svg,
button[aria-label*="完全权限"] svg * { color: #dc2626 !important; stroke: #dc2626 !important; }
[data-vexnar-full="1"], [data-vexnar-full="1"] svg,
[data-vexnar-full="1"] svg * { color: #dc2626 !important; stroke: #dc2626 !important; }
[role="menuitem"][aria-label*="完全权限"],
[role="menuitem"][aria-label*="Full access"],
[role="menuitem"][aria-label*="フルアクセス"],
[role="menuitem"][aria-label*="Acceso completo"],
[role="menuitem"][aria-label*="Accès complet"],
[role="menuitem"][aria-label*="Voller Zugriff"],
[role="menuitem"][aria-label*="Полный доступ"],
[role="menuitem"][aria-label*="Acesso total"] { color: #dc2626 !important; font-weight: 600 !important; }
`

// ── routes ─────────────────────────────────────────────────────────────────
export function apply(ctx: AccountContext): void {
  if (process.env.VEXNAR_RUNTIME_MODE === 'go') registerYakHistoryTools(ctx)
  if (process.env.VEXNAR_CORE_EMBEDDED !== '0') {
    let core: typeof import('./core-embedded.js') | undefined
    let coreState: 'loading' | 'available' | 'failed' = 'loading'
    // 完整 core 是唯一路径：加载完成后域接口、任务队列与自主执行链都从这里来。
    // 这里不再用固定期限和它赛跑 —— 期限一到就放弃，只会让 request 永远拿到 503，
    // 而 core 其实还在加载。加载失败是另一种状态（core_state=failed），不是超时。
    const starting: Promise<typeof import('./core-embedded.js') | undefined> = import('./core-embedded.js').then(result => {
      core = result
      coreState = 'available'
      // 就绪即启动底座：触发器、定时任务、store 独占锁与任务队列都跑起来，
      // 自主渗透执行链不必等到页面的第一个请求。
      void result.startRuntime().catch(error => {
        console.error('[vexnar] 运行时底座启动失败', error)
      })
      return result
    }, error => {
      coreState = 'failed'
      console.error('[vexnar] 嵌入 core 加载失败', error)
      return undefined
    })
    const getCore = async () => core ?? await starting
    const goMode = process.env.VEXNAR_RUNTIME_MODE?.trim().toLowerCase() === 'go'
    const diagnostics = () => {
      const configuredStore = process.env.VEXNAR_STORE?.trim().toLowerCase()
      const store = configuredStore === 'json' || configuredStore === 'postgres' ? configuredStore : 'sqlite'
      return {
        ...(core?.runtimeInfo?.() ?? {
          mode: goMode ? 'go' : 'ts',
          store,
          started: false,
          started_at: 0,
          triggers: 0,
          schedules: false,
          store_locked: false,
          engine: 'unavailable',
          task_concurrency: Number(process.env.VEXNAR_TASK_CONCURRENCY ?? 2) || 2
        }),
        core_state: coreState
      }
    }
    // 同一进程内的领域调用面：工具插件（如 @vexnar/dsh-egress）直接走这里，
    // 不经过 /vexnar-api 的登录闸门，也不需要复制一份端口/token。
    const coreRequest = async (
      path: string,
      init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
    ): Promise<unknown> => {
      const app = await getCore()
      if (!app) throw new Error('VEXNAR 领域服务尚未就绪')
      const { handle } = app
      const requestInit: RequestInit = {
        method: init.method ?? 'GET',
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
      }
      if (init.body !== undefined) requestInit.body = JSON.stringify(init.body)
      const response = await handle(new Request(new URL(path, 'http://127.0.0.1'), requestInit), true)
      const text = await response.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = { raw: text }
      }
      if (!response.ok) {
        const message = (data as { error?: string } | null)?.error ?? text ?? `HTTP ${response.status}`
        throw new Error(message)
      }
      return data
    }
    ctx.provide('vexnarCore', { request: coreRequest })
    // 拦截规则只有一份（core 的 meta），但执行点有两个：go 回退模式由 Go 引擎的
    // guard 做，TS 模式由这个监听器做。两套同时挂会把同一次调用判两遍。
    if (!goMode) registerInterceptGuard(ctx, coreRequest)
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/vexnar-api',
      handler: async (req, res) => {
        try {
          if (!platformReady()) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ error: '请先登录 VEXNAR' }))
            return
          }
          const url = new URL(req.url || '/', 'http://127.0.0.1')
          url.pathname = url.pathname.replace(/^\/vexnar-api/, '') || '/'
          const readingYakHistory = req.method === 'POST' && url.pathname === '/api/yak/history'
          const nativeYakHistory = readingYakHistory && !goMode
          const remoteAddress = req.socket.remoteAddress
          const localPeer = remoteAddress !== undefined &&
            ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)
          if (nativeYakHistory && !localPeer) {
            res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ error: 'Yak 流量接口仅供本机 VEXNAR 客户端' }))
            return
          }
          const toolDocumentation = (req.method === 'PUT' && /^\/api\/tools\/[^/]+\/documentation$/.test(url.pathname)) ||
            (req.method === 'POST' && /^\/api\/tools\/[^/]+\/documentation\/reset$/.test(url.pathname))
          const configRoute = isClientMaintenance(req.method, url.pathname, goMode) || toolDocumentation || isNotificationSetting(req.method, url.pathname) ||
            (!goMode && /^\/api\/intercept\/(?:rules|tool-config|judge)(?:\/|$)/.test(url.pathname)) ||
            (req.method === 'GET' && isStoredDataRead(url.pathname, goMode))
          // Diagnostics observes startup without waiting for the core or calling its request handler.
          const runtimeRead = req.method === 'GET' && url.pathname === '/api/_runtime'
          const app = configRoute || nativeYakHistory || runtimeRead ? undefined : await getCore()
          if (!configRoute && !nativeYakHistory && !runtimeRead && !app) {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ error: 'VEXNAR 领域服务尚未就绪', core_state: coreState }))
            return
          }
          if (configRoute || nativeYakHistory || runtimeRead || app?.isGoDataRequest(req.method, url.pathname)) {
            const rejection = ctx.connection.requestRejection(req)
            if (rejection) {
              res.writeHead(rejection, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
              res.end(JSON.stringify({ error: '请从已登录的 VEXNAR 客户端访问' }))
              return
            }
          }
          if (runtimeRead) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify(diagnostics()))
            return
          }
          // `/api/traffic/import/yakit` 没有对应路由（Yakit 走会话捕获的 ingest），
          // 留一条永远走不到的体积分支只会让人以为它存在。
          const limit = readingYakHistory ? 8192 : toolDocumentation ? 65536 : Infinity
          const chunks: Buffer[] = []
          let size = 0
          // node 把正文按 Buffer 块交出来；Readable 的迭代器类型是 any，这里收窄。
          for await (const chunk of req as AsyncIterable<Buffer>) {
            size += chunk.length
            if (size > limit) {
              res.writeHead(413, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: '请求正文过大' }))
              return
            }
            chunks.push(chunk)
          }
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) for (const item of value) headers.append(key, item)
            else if (value !== undefined) headers.set(key, value)
          }
          let body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks)
          if (readingYakHistory) {
            let input: Record<string, unknown> | undefined
            // 无正文时 JSON.parse 会抛，与原来读 undefined 正文一样落进 catch。
            try { input = JSON.parse(body === undefined ? '' : body.toString('utf8')) as Record<string, unknown> } catch {}
            if (!input || Array.isArray(input) || typeof input !== 'object' ||
                ('workspace' in input || 'agent' in input) ||
                (input.session_id !== undefined && (typeof input.session_id !== 'string' || !input.session_id))) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: '无效的流量会话请求' }))
              return
            }
            // The Session header owns the original project. An Agent changing
            // its effective working directory does not change the project.
            const sessionID = typeof input.session_id === 'string' ? input.session_id : undefined
            const workspace = sessionID ? ctx.sessions.get(sessionID)?.header.cwd : undefined
            if (sessionID && !workspace) {
              res.writeHead(409, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: '当前会话没有可用的本地项目' }))
              return
            }
            delete input.session_id
            body = Buffer.from(JSON.stringify({ ...input, workspace }))
          }
          // `method`/`body` 缺省时不能显式写 undefined（exactOptionalPropertyTypes），
          // 省掉与原来传 undefined 的请求完全相同。
          const init: RequestInit = { headers }
          if (req.method !== undefined) init.method = req.method
          if (body !== undefined) init.body = body
          const request = new Request(url, init)
          const response = nativeYakHistory
            ? await (await import('./yak-history.js')).handleYakHistory(request)
            : configRoute
              ? await (await import('./settings-embedded.js')).handleSettings(request)
              : await app!.handle(request, localPeer)
          const responseHeaders: Record<string, string> = {}
          for (const [key, value] of response.headers.entries()) responseHeaders[key] = value
          res.writeHead(response.status, responseHeaders)
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(recordOf(error).message || error) }))
        }
      }
    }))
  }

  ctx.effect(() => ctx.webServer.tapIndex(html => html
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<link\b[^>]*\brel=["'](?:shortcut icon|icon|apple-touch-icon|manifest)["'][^>]*>/gi, '')
    .replace('</head>', () => BRAND_HEAD + `<script>${BRAND_SCRIPT}</script></head>`)))

  const platformReady = installPlatform(ctx)

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-brand/manifest.webmanifest',
      handler: async (_req, res) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.end(JSON.stringify({
          name: 'VEXNAR',
          short_name: 'VEXNAR',
          description: 'VEXNAR — AI 自主渗透测试系统',
          start_url: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#111827',
          icons: [{ src: '/vexnar-brand/favicon.png', sizes: '512x512', type: 'image/png' }]
        }))
      }
    })
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-brand/favicon.png',
      handler: async (_req, res) => {
        try {
          logoBytes ??= await readFile(LOGO_PATH)
          res.statusCode = 200
          res.setHeader('Content-Type', 'image/png')
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.end(logoBytes)
        } catch (error) {
          res.statusCode = 404
          res.end('logo not found')
        }
      }
    })
  )

}

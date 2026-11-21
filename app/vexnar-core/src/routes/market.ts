// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Hono } from 'hono'
import { posix } from 'node:path'
import { meta } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 插件市场：市场源存 meta 表 `marketSources`，sync 触发 GitHub 抓取并把结果
// 缓存回该行；断网/被墙时 GET /api/market/items 回落到内置目录。
// ─────────────────────────────────────────────────────────────────────────────

const marketSchemaFile = 'market.json'
const marketMCPFile = 'mcp.json'
const marketMaxItems = 200
const marketMaxFile = 2 << 20
const marketMaxDiscover = 80
const marketSyncBudgetMs = 22_000
const marketHTTPBudgetMs = 12_000

interface MarketItem {
  id?: string
  kind?: string
  name: string
  description?: string
  tags?: string[]
  homepage?: string
  author?: string
  repo?: string
  ref?: string
  path?: string
  transport?: string
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  source_id?: number
  source_name?: string
  source_repo?: string
  official?: boolean
  builtin?: boolean
}

async function loadSourcesTable() {
  meta.reload()
  const tables = await meta.load()
  const rows = (tables['marketSources'] ?? []) as any[]
  tables['marketSources'] = rows
  return { tables, rows }
}

async function commitMeta(tables: Record<string, unknown>) {
  await meta.save(tables as any)
  meta.reload()
}

function errResponse(c: any, e: any) {
  return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
}

// ─────────────────────────────────────────────────────────────────────────────
// 链接解析 / 校验（与 skills.ts 的副本保持一致）
// ─────────────────────────────────────────────────────────────────────────────

const marketRepoRe = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/

function validMarketRepo(repo: string): boolean {
  if (!marketRepoRe.test(repo) || repo.includes('..')) return false
  return repo.split('/').every((seg) => seg !== '.' && seg !== '..')
}

function marketPathRune(r: string): boolean {
  const cp = r.codePointAt(0)!
  if (cp < 0x20 || cp === 0x7f || cp === 0xfffd) return false
  if (cp >= 0xd800 && cp <= 0xdfff) return false
  if ('\\%#?*:"<>|'.includes(r)) return false
  if (cp === 0x00ad) return false
  if (cp >= 0x200b && cp <= 0x200f) return false
  if (cp >= 0x202a && cp <= 0x202e) return false
  if (cp === 0x2060 || cp === 0xfeff) return false
  if ((cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xf0000 && cp <= 0xffffd) || (cp >= 0x100000 && cp <= 0x10fffd)) return false
  if (cp >= 0xfdd0 && cp <= 0xfdef) return false
  if (r !== ' ' && /\s/u.test(r)) return false
  return true
}

function marketSafePath(p: string): [string, string] {
  p = p.trim().replace(/^\/+|\/+$/g, '')
  if (p === '') return ['', '']
  if (p.includes('..')) return ['', '不能包含 ..']
  for (const r of Array.from(p)) {
    if (!marketPathRune(r)) return ['', `不能包含 ${JSON.stringify(r)}`]
  }
  if (p.startsWith('/') || p.includes('//')) return ['', '不能是绝对路径或含空段']
  return [posix.normalize(p), '']
}

function marketSafeRef(ref: string): boolean {
  if (!ref || ref.length > 120) return false
  for (const ch of ref) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x21 || cp > 0x7e || '/\\?#%'.includes(ch)) return false
  }
  return true
}

function parseMarketLink(raw: string, ref: string, sub: string): { repo: string; ref: string; path: string } {
  raw = (raw || '').trim()
  ref = (ref || '').trim()
  sub = (sub || '').trim().replace(/^\/+|\/+$/g, '')
  if (!raw) throw Object.assign(new Error('请填写 GitHub 仓库或链接'), { status: 400 })
  let repo = ''
  let outRef = ref
  let outPath = sub
  if (!raw.includes('://')) {
    const parts = raw.replace(/^\/+|\/+$/g, '').split('/')
    if (parts.length >= 2 && validMarketRepo(`${parts[0]}/${parts[1]}`)) {
      repo = `${parts[0]}/${parts[1]}`
      if (parts.length > 2 && !sub) outPath = parts.slice(2).join('/')
      const [clean, msg] = marketSafePath(outPath)
      if (msg) throw Object.assign(new Error(`目录不合法：${msg}`), { status: 400 })
      return { repo, ref: outRef, path: clean }
    }
    throw Object.assign(new Error(`无法识别的仓库名：${raw}（应为 owner/repo 或 GitHub 链接）`), { status: 400 })
  }
  let u: URL
  try { u = new URL(raw) } catch { throw Object.assign(new Error('链接无法解析'), { status: 400 }) }
  const segs = u.pathname.replace(/^\/+|\/+$/g, '').split('/')
  const keep = (i: number) => (i < segs.length ? segs[i] : '')
  switch (u.host.toLowerCase()) {
    case 'github.com':
    case 'www.github.com':
      repo = `${keep(0)}/${keep(1)}`
      {
        const kind = keep(2)
        if (kind === 'tree' || kind === 'blob') {
          if (keep(3)) outRef = keep(3)
          let rest = segs.slice(4).join('/')
          if (rest && kind === 'blob') { rest = posix.dirname(rest); if (rest === '.') rest = '' }
          if (rest) outPath = rest
        }
      }
      break
    case 'raw.githubusercontent.com':
      repo = `${keep(0)}/${keep(1)}`
      if (keep(2)) outRef = keep(2)
      {
        let rest2 = segs.slice(3).join('/')
        if (rest2) { rest2 = posix.dirname(rest2); if (rest2 === '.') rest2 = '' }
        if (rest2) outPath = rest2
      }
      break
    case 'codeload.github.com':
      repo = `${keep(0)}/${keep(1)}`
      if (!outRef && keep(2) && keep(2) !== 'tar.gz' && keep(2) !== 'zip') outRef = keep(2)
      break
    default:
      throw Object.assign(new Error(`只支持 GitHub 链接：${u.host}`), { status: 400 })
  }
  if (!validMarketRepo(repo)) throw Object.assign(new Error(`链接里没有合法的 owner/repo：${raw}`), { status: 400 })
  const [clean, msg] = marketSafePath(outPath)
  if (msg) throw Object.assign(new Error(`目录不合法：${msg}`), { status: 400 })
  if (outRef && !marketSafeRef(outRef)) throw Object.assign(new Error(`分支/标签不合法：${outRef}`), { status: 400 })
  return { repo, ref: outRef, path: clean }
}

// ─────────────────────────────────────────────────────────────────────────────
// 抓取
// ─────────────────────────────────────────────────────────────────────────────

function marketToken(): string {
  for (const k of ['VEXNAR_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN']) {
    const v = (process.env[k] ?? '').trim()
    if (v) return v
  }
  return ''
}

async function marketGet(rawURL: string): Promise<{ body: Buffer; status: number }> {
  const headers: Record<string, string> = { Accept: 'application/json, text/plain;q=0.9', 'User-Agent': 'vexnar-market/1' }
  const tok = marketToken()
  if (tok && rawURL.includes('github')) headers['Authorization'] = `Bearer ${tok}`
  const res = await fetch(rawURL, { headers, signal: AbortSignal.timeout(marketHTTPBudgetMs) })
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > marketMaxFile) return { body: buf.subarray(0, marketMaxFile), status: res.status }
  return { body: buf, status: res.status }
}

function escapeMarketPath(p: string): string {
  return p.split('/').map((s) => encodeURIComponent(s)).join('/')
}

function marketRawURL(repo: string, ref: string, p: string): string {
  let base = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}`
  if (p) base += '/' + escapeMarketPath(p)
  return base
}

function trimQuotes(v: string): string {
  const s = v.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1)
  return s
}

function parseSkillFrontmatter(md: string): [string, string] {
  let name = ''
  let desc = ''
  const lines = md.split('\n')
  let inFM = false
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t === '---') {
      if (!inFM) { inFM = true; continue }
      break
    }
    if (!inFM) continue
    if (t.startsWith('name:')) name = trimQuotes(t.slice(5))
    else if (t.startsWith('description:')) {
      let v = t.slice('description:'.length).trim()
      if (v === '>' || v === '|' || v === '>-' || v === '|-') {
        const parts: string[] = []
        for (let j = i + 1; j < lines.length; j++) {
          const nxt = lines[j]
          if (nxt.trim() === '') { if (parts.length) parts.push(''); continue }
          if (!nxt.startsWith(' ') && !nxt.startsWith('\t')) break
          parts.push(nxt.trim())
        }
        v = parts.join(' ').trim()
      } else {
        v = trimQuotes(v)
      }
      desc = v
    }
  }
  if (desc.length > 400) desc = desc.slice(0, 400) + '…'
  return [name, desc]
}

// ─────────────────────────────────────────────────────────────────────────────
// 索引解析
// ─────────────────────────────────────────────────────────────────────────────

function parseMarketIndex(raw: Buffer, repo: string): MarketItem[] {
  const trimmed = raw.toString('utf8').trim()
  if (!trimmed) throw new Error('market.json 为空')
  let doc: { mcp?: MarketItem[]; skills?: MarketItem[]; items?: MarketItem[] } = {}
  try {
    if (trimmed.startsWith('[')) doc = { items: JSON.parse(trimmed) }
    else doc = JSON.parse(trimmed)
  } catch (e) {
    throw new Error(`market.json 解析失败：${(e as any)?.message ?? e}`)
  }
  const out: MarketItem[] = []
  for (const it of doc.mcp ?? []) out.push({ ...it, kind: 'mcp' })
  for (const it of doc.skills ?? []) {
    if (!it.repo) it.repo = repo
    out.push({ ...it, kind: 'skills' })
  }
  out.push(...(doc.items ?? []))
  return normalizeMarketItems(out, repo)
}

function parseMCPConfig(raw: Buffer): MarketItem[] {
  let doc: { mcpServers?: Record<string, any> } = {}
  try { doc = JSON.parse(raw.toString('utf8')) } catch (e) { throw new Error(`mcp.json 解析失败：${(e as any)?.message ?? e}`) }
  if (!doc.mcpServers || !Object.keys(doc.mcpServers).length) throw new Error('mcp.json 里没有 mcpServers')
  const out: MarketItem[] = []
  for (const name of Object.keys(doc.mcpServers).sort()) {
    const cfg = doc.mcpServers[name]
    let transport = String(cfg.type ?? '').toLowerCase()
    if (!transport) transport = cfg.command ? 'stdio' : String(cfg.url ?? '').toLowerCase().endsWith('/sse') ? 'sse' : 'http'
    if (transport === 'streamable-http' || transport === 'streamablehttp') transport = 'http'
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(cfg.env ?? {})) env[k] = String(v)
    for (const [k, v] of Object.entries(cfg.headers ?? {})) env[k] = String(v)
    const it: MarketItem = { kind: 'mcp', name, transport, command: cfg.command, args: cfg.args, url: cfg.url, ...(Object.keys(env).length ? { env } : {}) }
    it.description = cfg.command ? `stdio · ${cfg.command}${cfg.args?.length ? ' ' + cfg.args.join(' ') : ''}` : `${transport} · ${cfg.url}`
    out.push(it)
  }
  return normalizeMarketItems(out, '')
}

function normalizeMarketItems(items: MarketItem[], repo: string): MarketItem[] {
  const seen = new Set<string>()
  const out: MarketItem[] = []
  for (const it of items) {
    it.name = (it.name ?? '').trim()
    if (!it.name) continue
    if (it.kind !== 'mcp' && it.kind !== 'skills') continue
    if (it.kind === 'mcp') {
      it.transport = (it.transport ?? '').toLowerCase().trim()
      if (!it.transport && !(it.command ?? '').trim() && (it.url ?? '').trim()) {
        it.transport = (it.url ?? '').toLowerCase().endsWith('/sse') ? 'sse' : 'http'
      }
      if (it.transport === '' || it.transport === 'stdio') it.transport = 'stdio'
      else if (it.transport === 'streamable-http' || it.transport === 'streamablehttp') it.transport = 'http'
      else if (it.transport !== 'http' && it.transport !== 'sse') continue
      if (it.transport === 'stdio' && !(it.command ?? '').trim()) continue
      if (it.transport !== 'stdio' && !(it.url ?? '').trim()) continue
    } else {
      if (!it.repo) it.repo = repo
      if (!it.repo || !it.path) continue
      it.ref = (it.ref ?? '').trim()
      const [clean, msg] = marketSafePath(it.path)
      if (msg) continue
      it.path = clean
    }
    const key = `${it.kind}/${it.name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!it.id) {
      let id = `${it.kind}:${it.name}`
      if (it.path) id += `@${it.repo}/${it.path}`
      it.id = id
    }
    out.push(it)
    if (out.length >= marketMaxItems) break
  }
  if (!out.length) throw new Error('市场索引里没有可用条目（MCP 需要 command 或 url，技能需要 repo + path）')
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 技能自动发现
// ─────────────────────────────────────────────────────────────────────────────

async function discoverSkillsFromRepo(src: any, ref: string): Promise<MarketItem[]> {
  const treeURL = `https://api.github.com/repos/${src.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`
  const { body, status } = await marketGet(treeURL)
  if (status === 403 || status === 429) throw new Error('GitHub API 限流，请稍后重试或配置 GITHUB_TOKEN')
  if (status !== 200) throw new Error(`读取仓库树失败：HTTP ${status}`)
  let tree: { tree?: Array<{ path: string; type: string }> }
  try { tree = JSON.parse(body.toString('utf8')) } catch { throw new Error('仓库树解析失败') }
  const prefix = String(src.path ?? '').replace(/^\/+|\/+$/g, '')
  const dirs: string[] = []
  for (const node of tree.tree ?? []) {
    if (!node.path.endsWith('/SKILL.md')) continue
    const dir = node.path.slice(0, -'/SKILL.md'.length)
    if (!dir) continue
    if (prefix && dir !== prefix && !dir.startsWith(prefix + '/')) continue
    dirs.push(dir)
    if (dirs.length >= marketMaxDiscover) break
  }
  if (!dirs.length) throw new Error('仓库里没有找到 SKILL.md')
  dirs.sort()
  const fetchOne = async (dir: string): Promise<MarketItem> => {
    const item: MarketItem = { kind: 'skills', name: posix.basename(dir), repo: src.repo, ref, path: dir }
    try {
      const { body, status } = await marketGet(marketRawURL(src.repo, ref, dir + '/SKILL.md'))
      if (status === 200) {
        const [name, desc] = parseSkillFrontmatter(body.toString('utf8'))
        if (name) item.name = name
        item.description = desc
      }
    } catch {}
    return item
  }
  let cursor = 0
  const workers = Array.from({ length: 6 }, async () => {
    const mine: MarketItem[] = []
    while (cursor < dirs.length) {
      const i = cursor++
      mine.push(await fetchOne(dirs[i]))
    }
    return mine
  })
  const batches = await Promise.all(workers)
  const items: MarketItem[] = batches.flat()
  items.sort((a, b) => (a.path ?? '').localeCompare(b.path ?? ''))
  return normalizeMarketItems(items, src.repo)
}

async function fetchMarketSource(src: any): Promise<MarketItem[]> {
  const ref = src.ref || 'main'
  const wantSkills = src.kind === 'skills' || src.kind === 'all'
  const wantMCP = src.kind === 'mcp' || src.kind === 'all'
  const dir = String(src.path ?? '').replace(/^\/+|\/+$/g, '')
  {
    const { body, status } = await marketGet(marketRawURL(src.repo, ref, posix.join(dir, marketSchemaFile)))
    if (status === 200) return parseMarketIndex(body, src.repo)
  }
  if (wantMCP) {
    for (const name of [marketMCPFile, '.mcp.json']) {
      const { body, status } = await marketGet(marketRawURL(src.repo, ref, posix.join(dir, name)))
      if (status === 200) return parseMCPConfig(body)
    }
  }
  if (wantSkills) {
    const items = await discoverSkillsFromRepo(src, ref)
    if (items.length) return items
  }
  const where = dir ? `${src.repo}/${dir}` : src.repo
  throw new Error(`在 ${where} 里没有找到 market.json 或 mcp.json，也没有可自动发现的 SKILL.md`)
}

function decodeItems(src: any): MarketItem[] {
  if (!Array.isArray(src.items) || !src.items.length) return []
  const out = src.items.map((it: any) => ({ ...it, source_id: src.id, source_name: src.name, source_repo: src.repo, official: src.official }))
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 内置目录兜底
// ─────────────────────────────────────────────────────────────────────────────

const builtinCatalog: { mcp: MarketItem[]; skills: MarketItem[] } = {
  mcp: [
    { name: 'filesystem', description: '读写指定目录下的文件（安装后把路径改成你自己的目录）', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/workspace'], tags: ['官方', '文件'] },
    { name: 'memory', description: '基于知识图谱的持久记忆，跨会话保留事实与关系', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], tags: ['官方', '记忆'] },
    { name: 'sequential-thinking', description: '可回溯的分步推理草稿，适合复杂排查链路', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'], tags: ['官方', '推理'] },
    { name: 'playwright', description: '浏览器自动化：导航、点击、截图、抓取动态页面', transport: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'], tags: ['浏览器', '自动化'] },
    { name: 'github', description: '读写仓库：Issue、PR、代码检索（需要 Personal Access Token）', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' }, tags: ['官方', '代码'] },
    { name: 'context7', description: '按需拉取第三方库的最新文档与代码示例', transport: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'], tags: ['文档'] },
    { name: 'postgres', description: '只读 SQL 查询 PostgreSQL（安装时填连接串）', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://user:pass@localhost:5432/db'], tags: ['官方', '数据库'] },
    { name: 'puppeteer', description: 'Puppeteer 驱动的网页抓取与操作', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'], tags: ['浏览器'] },
    { name: 'brave-search', description: 'Brave 搜索与网页抓取（需要 API Key）', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], env: { BRAVE_API_KEY: '' }, tags: ['搜索'] },
    { name: 'fetch', description: '抓取网页并转成适合模型阅读的 Markdown', transport: 'stdio', command: 'uvx', args: ['mcp-server-fetch'], tags: ['官方', '网络', 'Python'] },
    { name: 'git', description: '本地仓库操作：状态、diff、提交历史、分支', transport: 'stdio', command: 'uvx', args: ['mcp-server-git', '--repository', '/path/to/repo'], tags: ['官方', '代码', 'Python'] },
    { name: 'time', description: '时区转换与当前时间（本机 AEST 场景常用）', transport: 'stdio', command: 'uvx', args: ['mcp-server-time'], tags: ['官方', '工具', 'Python'] },
    { name: 'sqlite', description: '查询本地 SQLite 数据库文件', transport: 'stdio', command: 'uvx', args: ['mcp-server-sqlite', '--db-path', '/path/to/db.sqlite'], tags: ['官方', '数据库', 'Python'] },
    { name: 'everything', description: '官方示例服务器：用来验证 MCP 链路与工具发现是否正常', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'], tags: ['官方', '调试'] }
  ],
  skills: [
    { name: 'pdf', description: 'PDF 全流程：提取文本/表格、合并拆分、旋转、加水印、填表、加解密、OCR', repo: 'anthropics/skills', path: 'skills/pdf', tags: ['文档', '官方'] },
    { name: 'docx', description: '创建、读取、编辑 Word 文档与模板（目录、页眉页脚、批注、修订）', repo: 'anthropics/skills', path: 'skills/docx', tags: ['文档', '官方'] },
    { name: 'xlsx', description: '电子表格读写与建模：公式、格式、数据透视', repo: 'anthropics/skills', path: 'skills/xlsx', tags: ['表格', '官方'] },
    { name: 'pptx', description: '生成与修改演示文稿，含版式与图表', repo: 'anthropics/skills', path: 'skills/pptx', tags: ['文档', '官方'] },
    { name: 'mcp-builder', description: '按最佳实践编写 MCP 服务器（Python FastMCP / Node SDK）', repo: 'anthropics/skills', path: 'skills/mcp-builder', tags: ['开发', '官方'] },
    { name: 'skill-creator', description: '创建、改进并评测技能包，优化触发描述', repo: 'anthropics/skills', path: 'skills/skill-creator', tags: ['开发', '官方'] },
    { name: 'canvas-design', description: '画布式视觉设计：海报、版式、配色方案', repo: 'anthropics/skills', path: 'skills/canvas-design', tags: ['设计', '官方'] },
    { name: 'webapp-testing', description: '用 Playwright 驱动 Web 应用做端到端验证与截图', repo: 'anthropics/skills', path: 'skills/webapp-testing', tags: ['测试', '官方'] },
    { name: 'doc-coauthoring', description: '与作者协作打磨文档结构与措辞', repo: 'anthropics/skills', path: 'skills/doc-coauthoring', tags: ['写作', '官方'] },
    { name: 'internal-comms', description: '内部沟通文案：公告、周报、事故复盘', repo: 'anthropics/skills', path: 'skills/internal-comms', tags: ['写作', '官方'] }
  ]
}

function builtinMarketItems(kind: string): MarketItem[] {
  const src = builtinCatalog[kind as 'mcp' | 'skills'] ?? []
  return src.map((it) => ({ ...it, kind, builtin: true, official: true, source_name: '内置目录', source_repo: 'zhongxinxuhk/VEXNAR', repo: it.repo ?? 'zhongxinxuhk/VEXNAR', id: it.id ?? `${kind}:${it.name}@${it.repo ?? 'zhongxinxuhk/VEXNAR'}/${it.path ?? ''}` }))
}

function officialSeed(): any {
  return { kind: 'all', name: 'VEXNAR 官方市场', repo: 'zhongxinxuhk/VEXNAR', ref: 'main', path: 'market', official: true, items: [], synced_at: null, last_error: '' }
}

async function ensureOfficialSource(tables: Record<string, any>, rows: any[]) {
  if (rows.some((r) => r.official && r.repo === 'zhongxinxuhk/VEXNAR' && r.path === 'market')) return rows
  const id = Math.max(0, ...rows.map((r) => Number(r.id))) + 1
  const seed = officialSeed()
  const now = new Date().toISOString()
  rows.push({ id, created_at: now, updated_at: now, ...seed })
  await commitMeta(tables)
  return rows
}

function sourceView(src: any): any {
  return {
    id: Number(src.id),
    kind: src.kind,
    name: src.name,
    repo: src.repo,
    ref: src.ref,
    path: src.path,
    official: Boolean(src.official),
    item_count: Array.isArray(src.items) ? src.items.length : 0,
    ...(src.synced_at ? { synced_at: src.synced_at } : {}),
    ...(src.last_error ? { last_error: src.last_error } : {})
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由
// ─────────────────────────────────────────────────────────────────────────────

export function register(api: Hono) {
  // GET /api/market/sources
  api.get('/api/market/sources', async (c) => {
    try {
      const { tables, rows } = await loadSourcesTable()
      await ensureOfficialSource(tables, rows)
      const fresh = await loadSourcesTable()
      return c.json({ sources: fresh.rows.map(sourceView) })
    } catch (e: any) { return errResponse(c, e) }
  })

  // POST /api/market/sources
  api.post('/api/market/sources', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const kind = String(body.kind ?? '').trim() || 'all'
      if (kind !== 'mcp' && kind !== 'skills' && kind !== 'all') throw Object.assign(new Error('kind 只能是 mcp / skills / all'), { status: 400 })
      const { repo, ref, path } = parseMarketLink(body.link ?? '', body.ref ?? '', body.path ?? '')
      const branch = ref || 'main'
      const name = String(body.name ?? '').trim() || (path ? `${repo}/${path}` : repo)
      const { tables, rows } = await loadSourcesTable()
      if (rows.some((r) => r.repo === repo && r.path === path && r.kind === kind)) throw Object.assign(new Error('保存市场源失败（可能已存在同一仓库/目录）'), { status: 409 })
      const id = Math.max(0, ...rows.map((r) => Number(r.id))) + 1
      const now = new Date().toISOString()
      const src = { id, kind, name, repo, ref: branch, path, official: false, items: [], synced_at: null, last_error: '', created_at: now, updated_at: now }
      rows.push(src)
      await commitMeta(tables)
      return c.json({ id, repo, ref: branch, path, kind, name }, 201)
    } catch (e: any) { return errResponse(c, e) }
  })

  // DELETE /api/market/sources/:id
  api.delete('/api/market/sources/:id', async (c) => {
    const id = Number(c.req.param('id'))
    try {
      const { tables, rows } = await loadSourcesTable()
      const idx = rows.findIndex((r) => Number(r.id) === id)
      if (idx < 0) throw Object.assign(new Error('市场源不存在'), { status: 404 })
      if (rows[idx].official) throw Object.assign(new Error('官方市场源不可删除'), { status: 400 })
      rows.splice(idx, 1)
      await commitMeta(tables)
      return c.json({ deleted: id })
    } catch (e: any) { return errResponse(c, e) }
  })

  // POST /api/market/sources/:id/sync
  api.post('/api/market/sources/:id/sync', async (c) => {
    const id = Number(c.req.param('id'))
    try {
      const { tables, rows } = await loadSourcesTable()
      const src = rows.find((r) => Number(r.id) === id)
      if (!src) throw Object.assign(new Error('市场源不存在'), { status: 404 })
      let items: MarketItem[]
      let syncErr: string | null = null
      try {
        items = await fetchMarketSource(src)
      } catch (e) {
        syncErr = String((e as any)?.message ?? e)
        src.last_error = syncErr
        await commitMeta(tables)
        throw Object.assign(new Error(syncErr), { status: 502 })
      }
      for (const it of items) {
        it.source_id = src.id
        it.source_name = src.name
        it.source_repo = src.repo
        it.official = Boolean(src.official)
        if (!it.kind) it.kind = src.kind
      }
      src.items = items
      src.synced_at = new Date().toISOString()
      src.last_error = ''
      await commitMeta(tables)
      return c.json({ items, count: items.length })
    } catch (e: any) { return errResponse(c, e) }
  })

  // GET /api/market/items
  api.get('/api/market/items', async (c) => {
    try {
      const kind = String(c.req.query('kind') ?? '').trim()
      if (kind !== 'mcp' && kind !== 'skills') throw Object.assign(new Error('kind 只能是 mcp / skills'), { status: 400 })
      const refresh = c.req.query('refresh') === '1'
      const { tables, rows } = await loadSourcesTable()
      const items: MarketItem[] = []
      const warnings: string[] = []
      for (const src of rows) {
        const hasKind = src.kind === 'all' || src.kind === kind
        if (!hasKind) continue
        const cached = decodeItems(src)
        const stale = !src.synced_at || Date.now() - new Date(src.synced_at).getTime() > 10 * 60 * 1000
        if (!refresh && !stale && cached.length) { items.push(...cached); continue }
        try {
          const fresh = await fetchMarketSource(src)
          for (const it of fresh) {
            it.source_id = src.id
            it.source_name = src.name
            it.source_repo = src.repo
            it.official = Boolean(src.official)
          }
          src.items = fresh
          src.synced_at = new Date().toISOString()
          src.last_error = ''
          await commitMeta(tables)
          items.push(...fresh)
        } catch (e) {
          warnings.push(`${src.name} 同步失败：${(e as any)?.message ?? e}`)
          items.push(...cached)
        }
      }
      const seen = new Set<string>()
      const merged: MarketItem[] = []
      for (const it of items) {
        if (it.kind !== kind || !it.id || seen.has(it.id)) continue
        seen.add(it.id)
        merged.push(it)
      }
      let builtin = false
      if (!merged.length) {
        merged.push(...builtinMarketItems(kind))
        builtin = true
        warnings.push('当前无法访问市场源，已展示内置目录')
      }
      return c.json({ kind, items: merged, count: merged.length, builtin, warnings })
    } catch (e: any) { return errResponse(c, e) }
  })
}

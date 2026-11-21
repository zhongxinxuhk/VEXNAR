// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Hono } from 'hono'
import { inflateRawSync, gunzipSync } from 'node:zlib'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, posix } from 'node:path'
import { meta, storeRoot } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// meta 表：skills（元数据/启用态/使用计数）+ skillUsage（调用账本）。
// 技能文件本身放在 storeRoot()/skills/<name>/ 下；meta 是列表与统计的唯一来源。
// ─────────────────────────────────────────────────────────────────────────────

const skillsRoot = () => join(storeRoot(), 'skills')
const provFile = '.vexnar-skill.json'
const maxSkillZipBytes = 20 << 20
const maxSkillTotalBytes = 100 << 20
const maxSkillFileBytes = 20 << 20
const maxSkillEntries = 4000
const maxSkillPathLen = 512
const skillPathBlocked = '\\%#?*:"<>|'

async function loadTable(name: string) {
  meta.reload()
  const tables = await meta.load()
  const rows = (tables[name] ?? []) as any[]
  tables[name] = rows
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
// 名称 / 路径校验（移植自 Go server_mgmt.go）
// ─────────────────────────────────────────────────────────────────────────────

function validSkillName(name: string): boolean {
  if (!name || name.length === 0) return false
  const rs = Array.from(name)
  if (rs.length > 64) return false
  const isLetter = (r: string) => {
    const cp = r.codePointAt(0)!
    return (cp >= 0x61 && cp <= 0x7a) || (cp > 0x7f && /^\p{L}$/u.test(r))
  }
  const isDigit = (r: string) => {
    const cp = r.codePointAt(0)!
    return (cp >= 0x30 && cp <= 0x39) || (cp > 0x7f && /^\p{N}$/u.test(r))
  }
  if (!isLetter(rs[0]) || rs[rs.length - 1] === '-') return false
  for (const r of rs) {
    if (isLetter(r) || isDigit(r) || r === '-') continue
    return false
  }
  return !name.includes('--')
}

function skillPathRune(r: string): boolean {
  const cp = r.codePointAt(0)!
  if (cp < 0x20 || cp === 0x7f || cp === 0xfffd) return false
  if (cp >= 0xd800 && cp <= 0xdfff) return false
  if (skillPathBlocked.includes(r)) return false
  if (cp === 0x00ad) return false
  if (cp >= 0x200b && cp <= 0x200f) return false
  if (cp >= 0x202a && cp <= 0x202e) return false
  if (cp === 0x2060 || cp === 0xfeff) return false
  if ((cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xf0000 && cp <= 0xffffd) || (cp >= 0x100000 && cp <= 0x10fffd)) return false
  if (cp >= 0xfdd0 && cp <= 0xfdef) return false
  if (r !== ' ' && /\s/u.test(r)) return false
  return true
}

/** 校验客户端给的相对文件路径；成功返回 [clean, '']，失败返回 ['', 原因]。 */
function skillRelPath(file: string): [string, string] {
  if (!file || file.length > maxSkillPathLen) return ['', 'invalid path: empty or too long']
  for (const r of Array.from(file)) {
    if (!skillPathRune(r)) return ['', `invalid path: illegal character ${JSON.stringify(r)}`]
  }
  if (file.includes('..')) return ['', "invalid path: '..' not allowed"]
  if (file.startsWith('/') || file.includes('//')) return ['', 'invalid path: must be relative with no empty segments']
  const clean = posix.normalize(file)
  if (clean === '.' || clean.startsWith('/') || clean.startsWith('..')) return ['', 'invalid path']
  return [clean, '']
}

function trimQuotes(v: string): string {
  const s = v.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1)
  return s
}

/** 解析 SKILL.md YAML 头部的 name / description。 */
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

function skillNameFromFrontmatter(md: string): string {
  return parseSkillFrontmatter(md)[0]
}

/** 解析列表页需要的元数据（name/desc/license/compat/mcps）。 */
function skillMetaFromFile(raw: string): { name: string; description: string; license: string; compatibility: string; mcps: string[] } {
  const [name, description] = parseSkillFrontmatter(raw)
  let license = ''
  let compatibility = ''
  const mcps: string[] = []
  const lines = raw.split('\n')
  let inFM = false
  for (const ln of lines) {
    const t = ln.trim()
    if (t === '---') {
      if (!inFM) { inFM = true; continue }
      break
    }
    if (!inFM) continue
    if (t.startsWith('license:')) license = trimQuotes(t.slice('license:'.length))
    else if (t.startsWith('compatibility:')) compatibility = trimQuotes(t.slice('compatibility:'.length))
    else if (t.startsWith('mcps:')) {
      const v = trimQuotes(t.slice('mcps:'.length)).replace(/^\[|\]$/g, '')
      for (const part of v.split(',')) {
        const p = trimQuotes(part)
        if (p) mcps.push(p)
      }
    }
  }
  return { name, description, license, compatibility, mcps }
}

/** 重写 SKILL.md frontmatter（只改安全字段，正文原样保留）。 */
function rewriteSkillFrontmatter(content: string, mcps: string[] | null, description: string | null, license: string | null, compatibility: string | null): string {
  const lines = content.split('\n')
  if (lines.length < 2 || lines[0].trim() !== '---') throw Object.assign(new Error('SKILL.md has no YAML frontmatter'), { status: 400 })
  let fmEnd = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { fmEnd = i; break }
  }
  if (fmEnd < 0) throw Object.assign(new Error('SKILL.md frontmatter is not closed'), { status: 400 })

  type KV = { k: string; v: string }
  const pairs: KV[] = []
  for (const l of lines.slice(1, fmEnd)) {
    const idx = l.indexOf(':')
    if (idx >= 0) pairs.push({ k: l.slice(0, idx).trim(), v: l.slice(idx + 1).trim() })
    else if (l.trim() !== '') pairs.push({ k: '', v: l })
  }
  const applyStr = (key: string, val: string | null) => {
    if (val === null) return
    for (const p of pairs) {
      if (p.k === key) { p.v = val.trim(); return }
    }
    pairs.push({ k: key, v: val.trim() })
  }
  applyStr('description', description)
  applyStr('license', license)
  applyStr('compatibility', compatibility)
  if (mcps !== null) {
    const cleaned = mcps.map((s) => s.trim()).filter(Boolean)
    for (let i = pairs.length - 1; i >= 0; i--) if (pairs[i].k === 'mcps') pairs.splice(i, 1)
    if (cleaned.length) pairs.push({ k: 'mcps', v: cleaned.join(', ') })
  }
  let out = '---\n'
  for (const p of pairs) out += (p.k === '' ? p.v : `${p.k}: ${p.v}`) + '\n'
  out += '---\n'
  if (fmEnd + 1 < lines.length) out += lines.slice(fmEnd + 1).join('\n')
  return out
}

/** 递归列出 root 下的条目（相对路径，目录带尾部 /）。 */
async function walkSkillFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string, prefix: string) {
    let items: any[]
    try { items = await readdir(dir, { withFileTypes: true }) } catch { return }
    items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const item of items) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name
      const full = join(dir, item.name)
      if (item.isDirectory()) { out.push(`${rel}/`); await walk(full, rel) }
      else if (item.isFile()) out.push(rel)
    }
  }
  await walk(root, '')
  return out
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true } catch { return false }
}

// ─────────────────────────────────────────────────────────────────────────────
// 市场链接解析（install-github 复用；与 market.ts 的副本保持一致）
// ─────────────────────────────────────────────────────────────────────────────

const marketRepoRe = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/

function validMarketRepo(repo: string): boolean {
  if (!marketRepoRe.test(repo) || repo.includes('..')) return false
  return repo.split('/').every((seg) => seg !== '.' && seg !== '..')
}

function marketSafePath(p: string): [string, string] {
  p = p.trim().replace(/^\/+|\/+$/g, '')
  if (p === '') return ['', '']
  if (p.includes('..')) return ['', '不能包含 ..']
  const [clean, msg] = skillRelPath(p)
  if (msg) return ['', msg]
  return [clean, '']
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
// 技能安装（文件系统 + meta）
// ─────────────────────────────────────────────────────────────────────────────

async function ensureSkillDir() {
  await mkdir(skillsRoot(), { recursive: true, mode: 0o755 })
}

function skillDir(name: string) {
  return join(skillsRoot(), name)
}

async function writeProvenance(dir: string, p: any) {
  await writeFile(join(dir, provFile), `${JSON.stringify(p, null, 2)}\n`, 'utf8')
}

/** 从解包目录安装技能（原子替换 + 回滚）；返回 [name, fileCount]。 */
async function installSkillDir(srcDir: string, overwrite: boolean, prov: any): Promise<{ name: string; files: number }> {
  let md: string
  try { md = await readFile(join(srcDir, 'SKILL.md'), 'utf8') } catch { throw Object.assign(new Error('未找到 SKILL.md'), { status: 400 }) }
  const name = skillNameFromFrontmatter(md) || basename(srcDir)
  if (!validSkillName(name)) throw Object.assign(new Error(`skill 名称无效：${name}`), { status: 400 })
  const dst = skillDir(name)
  if (await exists(dst) && !overwrite) throw Object.assign(new Error(`技能 ${name} 已存在（更新请勾选覆盖）`), { status: 409 })
  await ensureSkillDir()
  const backup = join(skillsRoot(), `.backup-${name}-${Date.now()}`)
  let hadPrevious = false
  if (await exists(dst)) {
    await rename(dst, backup)
    hadPrevious = true
  }
  try {
    await rename(srcDir, dst)
  } catch (e) {
    if (hadPrevious) await rename(backup, dst).catch(() => {})
    throw Object.assign(new Error(`安装失败：${(e as any)?.message ?? e}`), { status: 500 })
  }
  if (hadPrevious) await rm(backup, { recursive: true, force: true }).catch(() => {})
  if (prov) await writeProvenance(dst, prov)
  const files = await walkSkillFiles(dst)
  return { name, files: files.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// zip 上传（支持 Store 0 与 Deflate 8，其余压缩方式明确报错）
// ─────────────────────────────────────────────────────────────────────────────

interface ZipEntry { name: string; content: Buffer }

function zipEntryName(buf: Buffer): string {
  let name = buf.toString('utf8')
  if (name.includes('\uFFFD')) {
    try { name = new TextDecoder('gbk').decode(buf) } catch {}
  }
  return name
}

function findEOCD(buf: Buffer): { count: number; cdOffset: number } | null {
  const min = Math.max(0, buf.length - 22 - 65535)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      return { count: buf.readUInt16LE(i + 10), cdOffset: buf.readUInt32LE(i + 16) }
    }
  }
  return null
}

function extractZip(buf: Buffer): ZipEntry[] {
  const eocd = findEOCD(buf)
  if (!eocd) throw Object.assign(new Error('无法解析压缩包(需为 zip 格式)'), { status: 400 })
  const entries: ZipEntry[] = []
  let offset = eocd.cdOffset
  for (let i = 0; i < eocd.count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break
    const flags = buf.readUInt16LE(offset + 8)
    const method = buf.readUInt16LE(offset + 10)
    const compressedSize = buf.readUInt32LE(offset + 20)
    const nameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    const localOffset = buf.readUInt32LE(offset + 42)
    const name = zipEntryName(buf.subarray(offset + 46, offset + 46 + nameLen))
    if (flags & 0x1) throw Object.assign(new Error(`压缩包已加密：${name}`), { status: 400 })
    if (method !== 0 && method !== 8) throw Object.assign(new Error(`压缩包使用了不支持的压缩方式 method ${method}：${name}`), { status: 400 })
    const localNameLen = buf.readUInt16LE(localOffset + 26)
    const localExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataOffset = localOffset + 30 + localNameLen + localExtraLen
    const compressed = buf.subarray(dataOffset, dataOffset + compressedSize)
    let content: Buffer
    try {
      content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed)
    } catch {
      throw Object.assign(new Error(`解压失败：${name}`), { status: 400 })
    }
    entries.push({ name, content })
    offset += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

// ─────────────────────────────────────────────────────────────────────────────
// 统计（skillUsage 账本）
// ─────────────────────────────────────────────────────────────────────────────

function skillStats(rows: any[]): Map<string, { calls: number; tasks: number; agents: string[]; last_used: string | null }> {
  const map = new Map<string, { calls: number; tasks: number; agents: string[]; last_used: string | null }>()
  for (const row of rows) {
    if (!row.found) continue
    const key = String(row.skill)
    const cur = map.get(key) ?? { calls: 0, tasks: 0, agents: [], last_used: null }
    cur.calls += 1
    if (row.task_id != null) cur.tasks += 1
    if (row.agent_key) {
      const a = String(row.agent_key)
      if (!cur.agents.includes(a)) cur.agents.push(a)
    }
    if (row.ts && (!cur.last_used || String(row.ts) > cur.last_used)) cur.last_used = String(row.ts)
    map.set(key, cur)
  }
  return map
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由
// ─────────────────────────────────────────────────────────────────────────────

export function register(api: Hono) {
  // GET /api/skills
  api.get('/api/skills', async (c) => {
    try {
      await ensureSkillDir()
      const { rows } = await loadTable('skills')
      const { rows: usageRows } = await loadTable('skillUsage')
      const stats = skillStats(usageRows)
      const nodes: any[] = []
      for (const rec of rows) {
        const dir = skillDir(rec.name)
        const files = (await walkSkillFiles(dir)).filter((f) => !f.startsWith('.') && !f.includes('/.'))
        const st = stats.get(rec.name)
        nodes.push({
          name: rec.name,
          ...(rec.description ? { description: rec.description } : {}),
          ...(rec.license ? { license: rec.license } : {}),
          ...(rec.compatibility ? { compatibility: rec.compatibility } : {}),
          ...(Array.isArray(rec.mcps) && rec.mcps.length ? { mcps: rec.mcps } : {}),
          files,
          enabled: rec.enabled !== false,
          ...(rec.source ? { source: rec.source } : {}),
          calls: st?.calls ?? 0,
          tasks: st?.tasks ?? 0,
          usage_agents: st?.agents ?? [],
          ...(st?.last_used ? { last_used: st.last_used } : {})
        })
      }
      nodes.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      return c.json({ skills: nodes })
    } catch (e: any) { return errResponse(c, e) }
  })

  // POST /api/skills
  api.post('/api/skills', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const name = String(body.name ?? '').trim()
      const description = String(body.description ?? '').trim()
      if (!validSkillName(name)) throw Object.assign(new Error('skill name must be 1-64 lowercase alphanumeric/hyphen characters, not starting/ending/doubling hyphens'), { status: 400 })
      if (!description) throw Object.assign(new Error('description is required'), { status: 400 })
      const dir = skillDir(name)
      if (await exists(dir)) throw Object.assign(new Error('skill already exists'), { status: 409 })
      await ensureSkillDir()
      await mkdir(dir, { recursive: true, mode: 0o755 })
      const mcps = (Array.isArray(body.mcps) ? body.mcps : []).map((s: any) => String(s).trim()).filter(Boolean)
      let sb = '---\n'
      sb += `name: ${name}\n`
      sb += `description: ${description}\n`
      if (body.license) sb += `license: ${String(body.license).trim()}\n`
      if (body.compatibility) sb += `compatibility: ${String(body.compatibility).trim()}\n`
      if (mcps.length) sb += `mcps: ${mcps.join(', ')}\n`
      sb += '---\n'
      const instructions = String(body.instructions ?? '').trim()
      if (instructions) sb += instructions
      else sb += `## ${name}\n\n<!-- Describe step-by-step instructions in Markdown. -->\n\n1. \n2. \n3. \n`
      try {
        await writeFile(join(dir, 'SKILL.md'), sb, 'utf8')
      } catch (e) {
        await rm(dir, { recursive: true, force: true }).catch(() => {})
        throw e
      }
      const { tables, rows } = await loadTable('skills')
      rows.push({
        name, description,
        ...(body.license ? { license: String(body.license).trim() } : {}),
        ...(body.compatibility ? { compatibility: String(body.compatibility).trim() } : {}),
        ...(mcps.length ? { mcps } : {}),
        enabled: true, source: null, calls: 0, tasks: 0, usage_agents: [], last_used: null
      })
      await commitMeta(tables)
      return c.json({ name }, 201)
    } catch (e: any) { return errResponse(c, e) }
  })

  // POST /api/skills/upload
  api.post('/api/skills/upload', async (c) => {
    try {
      let file: any = null
      let fileName = ''
      try {
        const form = await c.req.formData()
        file = form.get('file')
      } catch {}
      if (!file || typeof file.arrayBuffer !== 'function') throw Object.assign(new Error('缺少上传文件(表单字段 file)'), { status: 400 })
      if (file.name) fileName = String(file.name)
      if ((file.size ?? 0) > maxSkillZipBytes) throw Object.assign(new Error('缺少上传文件(表单字段 file)或超出大小限制'), { status: 400 })
      const buf = Buffer.from(await file.arrayBuffer())
      const entriesAll = extractZip(buf).filter((e) => !e.name.startsWith('__MACOSX/') && !e.name.includes('/__MACOSX/') && basename(e.name) !== '.DS_Store')
      let skillMD: ZipEntry | null = null
      for (const e of entriesAll) {
        if (basename(e.name) !== 'SKILL.md') continue
        if (!skillMD || (e.name.match(/\//g)?.length ?? 0) < (skillMD.name.match(/\//g)?.length ?? 0)) skillMD = e
      }
      if (!skillMD) throw Object.assign(new Error('压缩包内未找到 SKILL.md'), { status: 400 })
      const rootDir = posix.dirname(skillMD.name)
      const prefix = rootDir === '.' ? '' : rootDir + '/'
      const md = skillMD.content.toString('utf8')
      let name = skillNameFromFrontmatter(md)
      if (!name && prefix) name = prefix.slice(0, -1).split('/').pop() || ''
      if (!name) name = fileName.replace(/\.[^.]+$/, '')
      if (!validSkillName(name)) throw Object.assign(new Error(`skill 名称无效：${name}`), { status: 400 })
      const overwrite = c.req.query('overwrite') === 'true'
      if (await exists(skillDir(name)) && !overwrite) throw Object.assign(new Error(`skill 已存在：${name}（如需覆盖请确认后重试）`), { status: 409 })
      await ensureSkillDir()
      const tmp = join(skillsRoot(), `.upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      await mkdir(tmp, { recursive: true, mode: 0o755 })
      let total = 0
      let count = 0
      try {
        for (const e of entriesAll) {
          if (prefix && !e.name.startsWith(prefix)) continue
          const rel = prefix ? e.name.slice(prefix.length) : e.name
          if (!rel) continue
          const [clean, msg] = skillRelPath(rel)
          if (msg) throw Object.assign(new Error(`压缩包含非法路径 ${e.name}：${msg}`), { status: 400 })
          if (++count > maxSkillEntries) throw Object.assign(new Error('压缩包文件过多'), { status: 400 })
          if (e.content.length > maxSkillFileBytes) throw Object.assign(new Error(`文件过大：${rel}`), { status: 400 })
          total += e.content.length
          if (total > maxSkillTotalBytes) throw Object.assign(new Error('压缩包解压后过大'), { status: 400 })
          const dst = join(tmp, clean)
          await mkdir(dirname(dst), { recursive: true, mode: 0o755 })
          await writeFile(dst, e.content)
        }
        if (!(await exists(join(tmp, 'SKILL.md')))) throw Object.assign(new Error('解压后缺少 SKILL.md'), { status: 400 })
        if (await exists(skillDir(name))) await rm(skillDir(name), { recursive: true, force: true })
        await rename(tmp, skillDir(name))
      } catch (e) {
        await rm(tmp, { recursive: true, force: true }).catch(() => {})
        throw e
      }
      const { tables, rows } = await loadTable('skills')
      const idx = rows.findIndex((r) => r.name === name)
      if (idx >= 0) rows[idx] = { ...rows[idx], source: null }
      else rows.push({ name, description: '', enabled: true, source: null, calls: 0, tasks: 0, usage_agents: [], last_used: null })
      await commitMeta(tables)
      return c.json({ name, files: count }, 201)
    } catch (e: any) { return errResponse(c, e) }
  })

  // POST /api/skills/install-github
  api.post('/api/skills/install-github', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      let link = String(body.link ?? '').trim()
      if (!link && String(body.repo ?? '').trim()) link = String(body.repo).trim()
      const { repo, ref, path } = parseMarketLink(link, body.ref ?? '', body.path ?? '')
      const branch = ref || 'main'
      const url = `https://codeload.github.com/${repo}/tar.gz/${branch}`
      const headers: Record<string, string> = { 'User-Agent': 'vexnar-skill-installer/1' }
      const tok = process.env.VEXNAR_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
      if (tok) headers['Authorization'] = `Bearer ${tok}`
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(150000) })
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`无权访问 ${repo}（私有仓库请配置 GITHUB_TOKEN）`), { status: 502 })
      if (res.status === 404) throw Object.assign(new Error(`仓库或分支不存在：${repo}@${branch}`), { status: 400 })
      if (res.status !== 200) throw Object.assign(new Error(`下载 ${repo}@${branch} 失败：HTTP ${res.status}`), { status: 502 })
      const tarball = Buffer.from(await res.arrayBuffer())
      if (tarball.length > 80 << 20) throw Object.assign(new Error('仓库包过大'), { status: 400 })
      let tar: Buffer
      try { tar = gunzipSync(tarball) } catch { throw Object.assign(new Error('下载内容不是有效的 tar.gz（仓库可能不存在或需要鉴权）'), { status: 502 }) }
      await ensureSkillDir()
      const tmp = join(skillsRoot(), `.github-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      await mkdir(tmp, { recursive: true, mode: 0o755 })
      try {
        await extractTar(tar, tmp)
        const roots = await findSkillRoots(tmp)
        const target = pickSkillRoot(roots, path)
        if (!target) throw Object.assign(new Error(path ? `仓库 ${repo} 的 ${JSON.stringify(path)} 目录下没有 SKILL.md` : `仓库 ${repo} 里没有找到 SKILL.md`), { status: 400 })
        const srcDir = join(tmp, target)
        const prov = { repo, ref: branch, ...(path ? { path } : {}), installed_at: new Date().toISOString() }
        const { name, files } = await installSkillDir(srcDir, Boolean(body.overwrite), prov)
        const md = await readFile(join(skillDir(name), 'SKILL.md'), 'utf8')
        const m = skillMetaFromFile(md)
        const { tables, rows } = await loadTable('skills')
        const idx = rows.findIndex((r) => r.name === name)
        const rec = { name, description: m.description, ...(m.license ? { license: m.license } : {}), ...(m.compatibility ? { compatibility: m.compatibility } : {}), ...(m.mcps.length ? { mcps: m.mcps } : {}), enabled: true, source: prov, calls: 0, tasks: 0, usage_agents: [], last_used: null }
        if (idx >= 0) rows[idx] = rec
        else rows.push(rec)
        await commitMeta(tables)
        return c.json({ name, files, source: prov }, 201)
      } finally {
        await rm(tmp, { recursive: true, force: true }).catch(() => {})
      }
    } catch (e: any) { return errResponse(c, e) }
  })

  // GET /api/skills/missing
  api.get('/api/skills/missing', async (c) => {
    try {
      const limit = Math.max(Number(c.req.query('limit') ?? 0) || 0, 0)
      const { rows } = await loadTable('skillUsage')
      const counts = new Map<string, number>()
      for (const row of rows) {
        if (row.found) continue
        const k = String(row.skill)
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      let out = [...counts.entries()].map(([skill, count]) => ({ skill, count })).sort((a, b) => b.count - a.count || (a.skill < b.skill ? -1 : 1))
      if (limit > 0) out = out.slice(0, limit)
      return c.json({ missing: out })
    } catch (e: any) { return errResponse(c, e) }
  })

  // DELETE /api/skills/:name
  api.delete('/api/skills/:name', async (c) => {
    const name = c.req.param('name')
    try {
      if (!validSkillName(name)) throw Object.assign(new Error('invalid skill name'), { status: 400 })
      await rm(skillDir(name), { recursive: true, force: true })
      const { tables, rows } = await loadTable('skills')
      const idx = rows.findIndex((r) => r.name === name)
      if (idx >= 0) rows.splice(idx, 1)
      await commitMeta(tables)
      return c.json({ deleted: name })
    } catch (e: any) { return errResponse(c, e) }
  })

  // PUT /api/skills/:name/enabled
  api.put('/api/skills/:name/enabled', async (c) => {
    const name = c.req.param('name')
    const body = await c.req.json().catch(() => ({}))
    try {
      if (!validSkillName(name)) throw Object.assign(new Error('invalid skill name'), { status: 400 })
      if (typeof body.enabled !== 'boolean') throw Object.assign(new Error('缺少 enabled 字段'), { status: 400 })
      const dir = skillDir(name)
      if (!(await exists(dir))) throw Object.assign(new Error('skill not found'), { status: 404 })
      const enabledMd = join(dir, 'SKILL.md')
      const disabledMd = join(dir, 'SKILL.md.disabled')
      if (body.enabled) {
        if (await exists(disabledMd) && !(await exists(enabledMd))) await rename(disabledMd, enabledMd)
      } else {
        if (await exists(enabledMd) && !(await exists(disabledMd))) await rename(enabledMd, disabledMd)
      }
      const { tables, rows } = await loadTable('skills')
      const rec = rows.find((r) => r.name === name)
      if (!rec) throw Object.assign(new Error('skill not found'), { status: 404 })
      rec.enabled = body.enabled
      await commitMeta(tables)
      return c.json({ name, enabled: body.enabled })
    } catch (e: any) { return errResponse(c, e) }
  })

  // PUT /api/skills/:name/meta
  api.put('/api/skills/:name/meta', async (c) => {
    const name = c.req.param('name')
    const body = await c.req.json().catch(() => ({}))
    try {
      if (!validSkillName(name)) throw Object.assign(new Error('invalid skill name'), { status: 400 })
      const mdPath = join(skillDir(name), 'SKILL.md')
      let raw: string
      try { raw = await readFile(mdPath, 'utf8') } catch { throw Object.assign(new Error('skill not found'), { status: 404 }) }
      const updated = rewriteSkillFrontmatter(
        raw,
        Array.isArray(body.mcps) ? body.mcps.map((s: any) => String(s)) : null,
        body.description !== undefined ? String(body.description) : null,
        body.license !== undefined ? String(body.license) : null,
        body.compatibility !== undefined ? String(body.compatibility) : null
      )
      await writeFile(mdPath, updated, 'utf8')
      const { tables, rows } = await loadTable('skills')
      const rec = rows.find((r) => r.name === name)
      if (rec) {
        if (body.description !== undefined) rec.description = String(body.description)
        if (body.license !== undefined) rec.license = String(body.license)
        if (body.compatibility !== undefined) rec.compatibility = String(body.compatibility)
        if (Array.isArray(body.mcps)) rec.mcps = body.mcps.map((s: any) => String(s).trim()).filter(Boolean)
        await commitMeta(tables)
      }
      return c.json({ ok: true })
    } catch (e: any) { return errResponse(c, e) }
  })

  // GET /api/skills/:name/files
  api.get('/api/skills/:name/files', async (c) => {
    const name = c.req.param('name')
    try {
      if (!validSkillName(name)) throw Object.assign(new Error('invalid skill name'), { status: 400 })
      const dir = skillDir(name)
      if (!(await exists(dir))) throw Object.assign(new Error('skill not found'), { status: 404 })
      const files = await walkSkillFiles(dir)
      return c.json({ files })
    } catch (e: any) { return errResponse(c, e) }
  })

  // GET /api/skills/:name/files/*
  api.get('/api/skills/:name/files/*', async (c) => {
    const name = c.req.param('name')
    try {
      if (!validSkillName(name)) throw Object.assign(new Error('invalid skill name'), { status: 400 })
      const { file, error } = fileFromReq(c)
      if (error) throw Object.assign(new Error(error), { status: 400 })
      const [clean, msg] = skillRelPath(file!)
      if (msg) throw Object.assign(new Error(msg), { status: 400 })
      let data: string
      try { data = await readFile(join(skillDir(name), clean), 'utf8') } catch { throw Object.assign(new Error('file not found'), { status: 404 }) }
      return c.json({ content: data, file: clean })
    } catch (e: any) { return errResponse(c, e) }
  })

  // PUT /api/skills/:name/files/*
  api.put('/api/skills/:name/files/*', async (c) => {
    const name = c.req.param('name')
    const body = await c.req.json().catch(() => ({}))
    try {
      if (!validSkillName(name)) throw Object.assign(new Error('invalid skill name'), { status: 400 })
      const { file, error } = fileFromReq(c)
      if (error) throw Object.assign(new Error(error), { status: 400 })
      const [clean, msg] = skillRelPath(file!)
      if (msg) throw Object.assign(new Error(msg), { status: 400 })
      const dir = skillDir(name)
      if (!(await exists(dir))) throw Object.assign(new Error('skill not found'), { status: 404 })
      const full = join(dir, clean)
      await mkdir(dirname(full), { recursive: true, mode: 0o755 })
      await writeFile(full, String(body.content ?? ''), 'utf8')
      return c.json({ ok: true })
    } catch (e: any) { return errResponse(c, e) }
  })

  // POST /api/skills/:name/dirs
  api.post('/api/skills/:name/dirs', async (c) => {
    const name = c.req.param('name')
    const body = await c.req.json().catch(() => ({}))
    try {
      if (!validSkillName(name)) throw Object.assign(new Error('invalid skill name'), { status: 400 })
      const [dir, msg] = skillRelPath(String(body.path ?? ''))
      if (msg) throw Object.assign(new Error(msg), { status: 400 })
      const dirPath = skillDir(name)
      if (!(await exists(dirPath))) throw Object.assign(new Error('skill not found'), { status: 404 })
      await mkdir(join(dirPath, dir), { recursive: true, mode: 0o755 })
      return c.json({ dir }, 201)
    } catch (e: any) { return errResponse(c, e) }
  })

  // DELETE /api/skills/:name/files/*
  api.delete('/api/skills/:name/files/*', async (c) => {
    const name = c.req.param('name')
    try {
      if (!validSkillName(name)) throw Object.assign(new Error('invalid skill name'), { status: 400 })
      const { file, error } = fileFromReq(c)
      if (error) throw Object.assign(new Error(error), { status: 400 })
      const [clean, msg] = skillRelPath(file!)
      if (msg) throw Object.assign(new Error(msg), { status: 400 })
      const full = join(skillDir(name), clean)
      if (!(await exists(full))) throw Object.assign(new Error('not found'), { status: 404 })
      await rm(full, { recursive: true, force: true })
      return c.json({ deleted: clean })
    } catch (e: any) { return errResponse(c, e) }
  })

  // GET /api/skills/:name/usage
  api.get('/api/skills/:name/usage', async (c) => {
    const name = c.req.param('name')
    try {
      if (!validSkillName(name)) throw Object.assign(new Error('非法 skill 名'), { status: 400 })
      const limit = Math.max(Number(c.req.query('limit') ?? 0) || 0, 0)
      const { rows } = await loadTable('skillUsage')
      let calls = rows.filter((r) => r.skill === name).sort((a, b) => (String(b.ts) < String(a.ts) ? -1 : 1))
      if (limit > 0) calls = calls.slice(0, limit)
      return c.json({ calls })
    } catch (e: any) { return errResponse(c, e) }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 文件路径从通配路由提取：Hono 的 `*` 不进入 param，按位置切出再解码一次。
// ─────────────────────────────────────────────────────────────────────────────

function fileFromReq(c: any): { file?: string; error?: string } {
  const segs = c.req.path.split('/')
  if (segs.length < 5) return { error: 'invalid path' }
  const raw = segs.slice(5).join('/')
  try {
    return { file: decodeURIComponent(raw) }
  } catch {
    return { error: 'invalid path encoding' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// tar.gz 解包（install-github 用）
// ─────────────────────────────────────────────────────────────────────────────

function readTarString(buf: Buffer): string {
  let end = buf.indexOf(0)
  if (end < 0) end = buf.length
  return buf.subarray(0, end).toString('utf8')
}

async function extractTar(tar: Buffer, dst: string) {
  let offset = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    const nameRaw = readTarString(header.subarray(0, 100)).replace(/^\.\//, '')
    const size = parseInt(readTarString(header.subarray(124, 136)).trim() || '0', 8) || 0
    const typeflag = String.fromCharCode(header[156])
    const dataOffset = offset + 512
    if (typeflag === '0' || typeflag === '\0' || typeflag === '') {
      if (nameRaw && !nameRaw.startsWith('__MACOSX/') && !nameRaw.includes('/__MACOSX/') && basename(nameRaw) !== '.DS_Store') {
        const [clean, msg] = skillRelPath(nameRaw)
        if (msg) throw Object.assign(new Error(`压缩包含非法路径 ${nameRaw}：${msg}`), { status: 400 })
        const full = join(dst, clean)
        await mkdir(dirname(full), { recursive: true, mode: 0o755 })
        await writeFile(full, tar.subarray(dataOffset, dataOffset + size))
      }
    }
    offset = dataOffset + Math.ceil(size / 512) * 512
  }
}

async function findSkillRoots(root: string): Promise<string[]> {
  const dirs: string[] = []
  async function walk(dir: string, prefix: string) {
    let items: any[]
    try { items = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const item of items) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name
      const full = join(dir, item.name)
      if (item.isDirectory()) await walk(full, rel)
      else if (item.name === 'SKILL.md') dirs.push(prefix)
    }
  }
  await walk(root, '')
  dirs.sort((a, b) => (a.split('/').length - b.split('/').length) || (a < b ? -1 : a > b ? 1 : 0))
  return dirs
}

function pickSkillRoot(roots: string[], sub: string): string {
  if (!roots.length) return ''
  if (!sub) {
    for (const dir of roots) if (!dir.includes('/')) return dir
    return roots[0]
  }
  for (const dir of roots) {
    const cands = [dir]
    const i = dir.indexOf('/')
    if (i > 0) cands.push(dir.slice(i + 1))
    for (const c of cands) if (c === sub || c.endsWith('/' + sub)) return dir
  }
  return ''
}

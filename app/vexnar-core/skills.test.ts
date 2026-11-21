// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Store root must be set BEFORE importing the route modules: context.ts resolves
// the store directory (SQLite file + skills/) at module load time.
const root = await mkdtemp(join(tmpdir(), 'vexnar-skills-'))
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_STORE = 'sqlite'

const { register: registerSkills } = await import('./src/routes/skills.ts')
const { register: registerMarket } = await import('./src/routes/market.ts')
const { Hono } = await import('hono')

/** 解析后的响应：`T` 由调用点（`jget<T>()`）给出，只声明断言读到的字段。 */
type JsonResponse<T> = { status: number; body: T }
type CheckResult = { name: string; ok: boolean; detail: string }
type SkillRow = { name: string; description: string; license: string; enabled: boolean; mcps: string[]; files: string[] }
type MarketSourceRow = { id: string; repo: string; kind: string; official: boolean }

const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail })

const app = new Hono()
registerSkills(app)
registerMarket(app)

// 走原文再 JSON.parse：非 JSON 的错误响应（校验失败）把原文留在 body 里，
// 所以 `as T` 只在解析成功那一支成立。
const json = async <T = unknown>(response: Response): Promise<JsonResponse<T>> => {
  const text = await response.text()
  try { return { status: response.status, body: JSON.parse(text) as T } }
  catch { return { status: response.status, body: text as unknown as T } }
}

const req = (path: string, init: RequestInit = {}) => app.request(path, init)
const jget = async <T = unknown>(path: string) => json<T>(await req(path))
const jpost = async <T = unknown>(path: string, body: unknown) => json<T>(await req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const jput = async <T = unknown>(path: string, body: unknown) => json<T>(await req(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const jdel = async <T = unknown>(path: string) => json<T>(await req(path, { method: 'DELETE' }))

// ── minimal store-only zip builder (no CRC verification in the reader) ───────
function buildZip(entries: Array<{ name: string; content: string | Buffer }>) {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const { name, content } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0, 6)
    lh.writeUInt16LE(0, 8)
    lh.writeUInt32LE(0, 14)
    lh.writeUInt32LE(data.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt32LE(0, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt32LE(offset, 42)
    parts.push(lh, nameBuf, data)
    central.push(Buffer.concat([cd, nameBuf]))
    offset += 30 + nameBuf.length + data.length
  }
  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cdBuf, eocd])
}

try {
  // ── skills: empty list ─────────────────────────────────────────────────────
  const empty = await jget<{ skills: SkillRow[] }>('/api/skills')
  check('skills list starts empty', empty.status === 200 && Array.isArray(empty.body.skills) && empty.body.skills.length === 0, JSON.stringify(empty.body))

  // ── create + duplicate + invalid name ─────────────────────────────────────
  const created = await jpost<{ name: string }>('/api/skills', { name: 'demo-skill', description: 'demo', license: 'MIT', mcps: ['mcp-one'], instructions: '# Hello' })
  check('create skill', created.status === 201 && created.body.name === 'demo-skill', JSON.stringify(created.body))

  const dup = await jpost('/api/skills', { name: 'demo-skill', description: 'x' })
  check('duplicate skill rejected', dup.status === 409, `status=${dup.status}`)

  const badName = await jpost('/api/skills', { name: 'Bad Name!', description: 'x' })
  check('invalid skill name rejected', badName.status === 400, `status=${badName.status}`)

  // ── list reflects the created skill ────────────────────────────────────────
  const listed = await jget<{ skills: SkillRow[] }>('/api/skills')
  const one = listed.body.skills.find((s) => s.name === 'demo-skill')
  check('list shows skill with meta', one !== undefined && one.description === 'demo' && one.license === 'MIT' && one.enabled === true && Array.isArray(one.mcps) && one.mcps.includes('mcp-one') && one.files.includes('SKILL.md'), JSON.stringify(one))

  // ── file read / write / dirs ───────────────────────────────────────────────
  const files0 = await jget<{ files: string[] }>('/api/skills/demo-skill/files')
  check('files lists SKILL.md', files0.status === 200 && files0.body.files.includes('SKILL.md'), JSON.stringify(files0.body))

  const md = await jget<{ content: string; file: unknown }>('/api/skills/demo-skill/files/SKILL.md')
  check('read SKILL.md content', md.status === 200 && md.body.content.includes('name: demo-skill'), JSON.stringify(md.body.file))

  const wrote = await jput<{ ok: boolean }>('/api/skills/demo-skill/files/scripts/run.sh', { content: '#!/bin/sh\necho ok\n' })
  check('write nested file', wrote.status === 200 && wrote.body.ok === true, JSON.stringify(wrote.body))

  const mkdirResp = await jpost<{ dir: string }>('/api/skills/demo-skill/dirs', { path: 'references' })
  check('create dir', mkdirResp.status === 201 && mkdirResp.body.dir === 'references', JSON.stringify(mkdirResp.body))

  const files1 = await jget<{ files: string[] }>('/api/skills/demo-skill/files')
  check('files reflect nested file + dir', files1.body.files.includes('scripts/') && files1.body.files.includes('scripts/run.sh') && files1.body.files.includes('references/'), JSON.stringify(files1.body))

  const readNested = await jget<{ content: string }>('/api/skills/demo-skill/files/scripts/run.sh')
  check('read nested file', readNested.status === 200 && readNested.body.content.includes('echo ok'), JSON.stringify(readNested.body))

  // ── meta update ────────────────────────────────────────────────────────────
  const metaPut = await jput<{ ok: boolean }>('/api/skills/demo-skill/meta', { description: 'new desc', license: 'Apache-2.0' })
  check('update meta', metaPut.status === 200 && metaPut.body.ok === true, JSON.stringify(metaPut.body))
  const relisted = await jget<{ skills: SkillRow[] }>('/api/skills')
  const updated = relisted.body.skills.find((s) => s.name === 'demo-skill')!
  check('meta update persisted', updated.description === 'new desc' && updated.license === 'Apache-2.0', JSON.stringify(updated))

  // ── enabled toggle ─────────────────────────────────────────────────────────
  const disabled = await jput<{ enabled: boolean }>('/api/skills/demo-skill/enabled', { enabled: false })
  check('disable skill', disabled.status === 200 && disabled.body.enabled === false, JSON.stringify(disabled.body))
  const afterDisable = await jget<{ skills: SkillRow[] }>('/api/skills')
  check('list shows disabled', afterDisable.body.skills.find((s) => s.name === 'demo-skill')!.enabled === false, JSON.stringify(afterDisable.body.skills.find((s) => s.name === 'demo-skill')))
  const reenabled = await jput<{ enabled: boolean }>('/api/skills/demo-skill/enabled', { enabled: true })
  check('re-enable skill', reenabled.status === 200 && reenabled.body.enabled === true, JSON.stringify(reenabled.body))

  // ── path traversal defense ─────────────────────────────────────────────────
  const trav = await jget('/api/skills/demo-skill/files/%2e%2e%2fetc%2fpasswd')
  check('path traversal rejected', trav.status === 400, `status=${trav.status} body=${JSON.stringify(trav.body)}`)

  // ── delete file + skill ────────────────────────────────────────────────────
  const delFile = await jdel<{ deleted: string }>('/api/skills/demo-skill/files/scripts/run.sh')
  check('delete nested file', delFile.status === 200 && delFile.body.deleted === 'scripts/run.sh', JSON.stringify(delFile.body))

  const delSkill = await jdel<{ deleted: string }>('/api/skills/demo-skill')
  check('delete skill', delSkill.status === 200 && delSkill.body.deleted === 'demo-skill', JSON.stringify(delSkill.body))

  const gone = await jget('/api/skills/demo-skill/files')
  check('skill gone after delete', gone.status === 404, `status=${gone.status}`)

  // ── upload (store-only zip) ────────────────────────────────────────────────
  const zip = buildZip([
    { name: 'upload-demo/SKILL.md', content: '---\nname: upload-demo\ndescription: from zip\n---\n\n# body\n' },
    { name: 'upload-demo/scripts/run.sh', content: '#!/bin/sh\n' }
  ])
  const fd = new FormData()
  fd.append('file', new Blob([zip], { type: 'application/zip' }), 'upload-demo.zip')
  const uploaded = await json<{ name: string; files: number }>(await req('/api/skills/upload', { method: 'POST', body: fd }))
  check('upload zip installs skill', uploaded.status === 201 && uploaded.body.name === 'upload-demo' && uploaded.body.files >= 2, JSON.stringify(uploaded.body))
  const upFiles = await jget<{ files: string[] }>('/api/skills/upload-demo/files')
  check('uploaded skill files present', upFiles.status === 200 && upFiles.body.files.includes('SKILL.md') && upFiles.body.files.includes('scripts/run.sh'), JSON.stringify(upFiles.body))

  const missingUpload = await json(await req('/api/skills/upload', { method: 'POST', body: new FormData() }))
  check('upload without file rejected', missingUpload.status === 400, `status=${missingUpload.status}`)

  // ── install-github: invalid link rejected (no network) ─────────────────────
  const badInstall = await jpost('/api/skills/install-github', { link: 'not-a-valid-repo' })
  check('install-github rejects invalid link', badInstall.status === 400, `status=${badInstall.status} body=${JSON.stringify(badInstall.body)}`)

  // ── market sources ─────────────────────────────────────────────────────────
  const sources0 = await jget<{ sources: MarketSourceRow[] }>('/api/market/sources')
  const official = sources0.body.sources.find((s) => s.official)!
  check('market seeds official source', sources0.status === 200 && official && official.repo === 'zhongxinxuhk/VEXNAR', JSON.stringify(sources0.body))

  const added = await jpost<{ id: string; repo: string; kind: string }>('/api/market/sources', { link: 'anthropics/skills', kind: 'skills', name: 'Anthropic Skills' })
  check('add market source', added.status === 201 && added.body.repo === 'anthropics/skills' && added.body.kind === 'skills', JSON.stringify(added.body))

  const sources1 = await jget<{ sources: MarketSourceRow[] }>('/api/market/sources')
  check('market lists added source', sources1.body.sources.length === sources0.body.sources.length + 1 && sources1.body.sources.some((s) => s.repo === 'anthropics/skills'), JSON.stringify(sources1.body.sources.map((s) => s.repo)))

  const badSource = await jpost('/api/market/sources', { link: 'https://gitlab.com/foo/bar' })
  check('market rejects non-github link', badSource.status === 400, `status=${badSource.status}`)

  const delSource = await jdel<{ deleted: string }>(`/api/market/sources/${added.body.id}`)
  check('delete market source', delSource.status === 200 && delSource.body.deleted === added.body.id, JSON.stringify(delSource.body))

  const delOfficial = await jdel(`/api/market/sources/${official.id}`)
  check('official source not deletable', delOfficial.status === 400, `status=${delOfficial.status}`)

  const badKind = await jget('/api/market/items?kind=bogus')
  check('market items rejects bad kind', badKind.status === 400, `status=${badKind.status}`)
} finally {
  // nothing to tear down; the temp dir is left for inspection
}

const pass = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
for (const r of results) {
  console.log(`${r.ok ? '[PASS]' : '[FAIL]'} ${r.name}${r.ok ? '' : ` :: ${r.detail}`}`)
}
console.log(`\nskills.test: ${pass} pass, ${fail} fail`)
console.log(`store root: ${root}`)
process.exit(fail ? 1 : 0)

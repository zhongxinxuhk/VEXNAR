// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtemp, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Set the store root and desktop token BEFORE importing the route module:
// context.ts resolves the store directory at module load time.
const root = await mkdtemp(join(tmpdir(), 'vexnar-desktop-'))
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_DESKTOP_TOKEN = 'desktop-test-token'
delete process.env.VEXNAR_GATEWAY_TOKEN

const { register } = await import('./src/routes/desktop.ts')
const { Hono } = await import('hono')

const TOKEN = process.env.VEXNAR_DESKTOP_TOKEN
const authHeaders = { 'x-vexnar-desktop-token': TOKEN }
const jsonHeaders = { 'content-type': 'application/json', ...authHeaders }

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const app = new Hono()
register(app)

const json = async (response) => {
  const text = await response.text()
  try { return { status: response.status, body: JSON.parse(text) } }
  catch { return { status: response.status, body: text } }
}

// ── mock upstream ───────────────────────────────────────────────────────────
const mock = createServer((req, res) => {
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-model', object: 'model' }] }))
    return
  }
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve))
const upstreamBase = `http://127.0.0.1:${mock.address().port}/v1`

try {
  // 1) token guard rejects a missing / wrong token
  const unauth = await json(await app.request('/api/desktop/preferences', {}))
  check('token guard rejects unauthenticated', unauth.status === 401, `status=${unauth.status}`)

  // 2) preferences: default full, then write balanced and read back
  const prefsDefault = await json(await app.request('/api/desktop/preferences', { headers: authHeaders }))
  check('preferences default access_mode=full', prefsDefault.status === 200 && prefsDefault.body.access_mode === 'full', JSON.stringify(prefsDefault.body))

  const prefsPut = await json(await app.request('/api/desktop/preferences', {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ access_mode: 'balanced' })
  }))
  check('preferences write accepted', prefsPut.status === 200 && prefsPut.body.access_mode === 'balanced', JSON.stringify(prefsPut.body))

  const prefsRead = await json(await app.request('/api/desktop/preferences', { headers: authHeaders }))
  check('preferences persists balanced', prefsRead.body.access_mode === 'balanced', JSON.stringify(prefsRead.body))

  const prefsBad = await json(await app.request('/api/desktop/preferences', {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ access_mode: 'nope' })
  }))
  check('preferences rejects invalid mode', prefsBad.status === 400, `status=${prefsBad.status}`)

  // 3) projects: empty list, then register a real directory, then list again
  const emptyProjects = await json(await app.request('/api/desktop/projects', { headers: authHeaders }))
  check('projects list starts empty', emptyProjects.status === 200 && Array.isArray(emptyProjects.body.projects) && emptyProjects.body.projects.length === 0, JSON.stringify(emptyProjects.body))

  const projectDir = join(root, 'workspace-alpha')
  await mkdir(projectDir, { recursive: true })
  const registered = await json(await app.request('/api/desktop/projects', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ root_path: projectDir })
  }))
  check('project registers', registered.status === 200 && typeof registered.body.id === 'string' && registered.body.name === 'workspace-alpha', JSON.stringify(registered.body))

  const again = await json(await app.request('/api/desktop/projects', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ root_path: projectDir })
  }))
  check('project registration is idempotent', again.status === 200 && again.body.id === registered.body.id, JSON.stringify(again.body))

  const listed = await json(await app.request('/api/desktop/projects', { headers: authHeaders }))
  check('projects list reflects registration', listed.status === 200 && listed.body.projects.length === 1 && listed.body.projects[0].id === registered.body.id, JSON.stringify(listed.body))

  // 4) model gateway: configure against the mock upstream, then list models
  const configure = await json(await app.request('/api/desktop/llm/configure', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ provider: 'openai', model: 'mock-model', base_url: upstreamBase, api_key: 'sk-mock' })
  }))
  check('llm configure persists', configure.status === 200 && configure.body.configured === true && configure.body.key_set === true, JSON.stringify(configure.body))

  const models = await json(await app.request('/api/desktop/openai/v1/models', { headers: authHeaders }))
  check('openai/v1/models proxies to upstream', models.status === 200 && Array.isArray(models.body.data) && models.body.data[0]?.id === 'mock-model', JSON.stringify(models.body))

  const llmStatus = await json(await app.request('/api/desktop/llm', { headers: authHeaders }))
  check('llm status reflects config', llmStatus.status === 200 && llmStatus.body.model === 'mock-model' && llmStatus.body.format === 'openai', JSON.stringify(llmStatus.body))
} finally {
  mock.close()
}

const pass = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
for (const r of results) {
  console.log(`${r.ok ? '[PASS]' : '[FAIL]'} ${r.name}${r.ok ? '' : ` :: ${r.detail}`}`)
}
console.log(`\ndesktop.test: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)

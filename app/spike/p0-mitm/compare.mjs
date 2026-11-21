// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * P0-4: compare the Go embedded MITM (go-mitmproxy) with a mitmproxy sidecar.
 *
 * One curl per proxy carries both the traffic and the TLS evidence, because the
 * Go proxy does not tolerate a second client after an openssl s_client probe:
 *   - status + body sha256 (proxy capture / sidecar flow / direct)
 *   - leaf subject/issuer and chain verification from curl's verbose output
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const work = '/tmp/p0-mitm'
const target = process.env.P0_MITM_TARGET || 'https://example.com/'
const goProxy = process.env.P0_GO_PROXY || 'http://127.0.0.1:8788'
const mitmPort = 8899
const goCA = join(repo, 'data', 'traffic', '_ca', 'mitmproxy-ca-cert.pem')
const confDir = join(work, 'conf')
const mitmCA = join(confDir, 'mitmproxy-ca-cert.pem')
const flowsFile = join(work, 'flows.jsonl')

rmSync(work, { recursive: true, force: true })
mkdirSync(confDir, { recursive: true })
writeFileSync(flowsFile, '')

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })


function curlVerbose(proxy, ca, out) {
  const args = ['-sS', '-v', '--max-time', '30', '-o', out, '-w', '%{http_code} %{content_type}']
  if (proxy) args.push('-x', proxy, '--cacert', ca)
  args.push(target)
  const proc = spawnSync('curl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const [status, type] = (proc.stdout ?? '').trim().split(' ')
  const verbose = proc.stderr ?? ''
  const subject = verbose.match(/\*\s+subject:\s*(.+)/)?.[1]?.trim() ?? ''
  const issuer = verbose.match(/\*\s+issuer:\s*(.+)/)?.[1]?.trim() ?? ''
  const verified = /SSL certificate verify ok/.test(verbose)
  return { status, type: type ?? '', subject, issuer, verified }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function goCapture() {
  const db = new DatabaseSync(join(repo, 'data', 'traffic', '_index', 'index.sqlite'), { readOnly: true })
  const row = db
    .prepare(`SELECT e.id, e.status, b.resp_body FROM exchanges e JOIN exchange_bodies b ON b.id = e.id WHERE e.url LIKE ? ORDER BY e.ts DESC LIMIT 1`)
    .get(`${target}%`)
  if (!row) return null
  return {
    id: row.id,
    status: String(row.status),
    sha: createHash('sha256').update(Buffer.from(row.resp_body ?? '')).digest('hex')
  }
}

function waitPort(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => { socket.destroy(); resolve() })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - started > timeoutMs) reject(new Error(`port ${port} not ready`))
        else setTimeout(attempt, 200)
      })
    }
    attempt()
  })
}

const mitmdump = spawn('mitmdump', ['-q', '-p', String(mitmPort), '--set', `confdir=${confDir}`, '-s', join(here, 'addon.py')], {
  env: { ...process.env, P0_MITM_FLOWS: flowsFile },
  stdio: 'ignore'
})

try {
  const direct = curlVerbose(null, null, join(work, 'direct.body'))
  const go = curlVerbose(goProxy, goCA, join(work, 'go.body'))
  await waitPort(mitmPort)
  const sidecar = curlVerbose(`http://127.0.0.1:${mitmPort}`, mitmCA, join(work, 'mitm.body'))

  const flows = readFileSync(flowsFile, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const flow = flows.at(-1)
  const capture = goCapture()
  const bodySha = sha256File(join(work, 'direct.body'))

  check('direct status 200', direct.status === '200', direct.status)
  check('go proxy status matches direct', go.status === direct.status, `${go.status} vs ${direct.status}`)
  check('sidecar status matches direct', sidecar.status === direct.status, `${sidecar.status} vs ${direct.status}`)
  check('go capture recorded', Boolean(capture), JSON.stringify(capture))
  check('sidecar flow recorded', Boolean(flow), JSON.stringify(flow))
  check('go body sha == direct', capture?.sha === bodySha, `${capture?.sha} vs ${bodySha}`)
  check('sidecar body sha == direct', flow?.resp_sha256 === bodySha, `${flow?.resp_sha256} vs ${bodySha}`)
  check('proxied bodies equal', sha256File(join(work, 'go.body')) === sha256File(join(work, 'mitm.body')))
  check('go chain verifies', go.verified, `${go.subject} / ${go.issuer}`)
  check('sidecar chain verifies', sidecar.verified, `${sidecar.subject} / ${sidecar.issuer}`)
  check('both leaves name the target', go.subject.includes('example.com') && sidecar.subject.includes('example.com'),
    `go=${go.subject} sidecar=${sidecar.subject}`)
} finally {
  mitmdump.kill('SIGTERM')
}

let failed = false
for (const item of results) {
  if (!item.ok) failed = true
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`)
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
process.exit(failed ? 1 : 0)

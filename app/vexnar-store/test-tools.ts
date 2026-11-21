// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeOperations } from './src/operations.ts'
import { persistToolResult, runTool } from './src/tools.ts'
import { createRunner, type Runner } from './src/exec.ts'

/** One assertion result, printed as PASS/FAIL at the end. */
type CheckResult = { name: string; ok: boolean; detail: string }

const root = await mkdtemp(join(tmpdir(), 'vexnar-tools-'))
const ops = storeOperations(root)
const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail })

const nmap = `Nmap scan report for example.com (93.184.216.34)
PORT    STATE SERVICE VERSION
80/tcp  open  http    nginx 1.25
443/tcp open  https  nginx 1.25`
const parsedNmap = (await import('./src/tools.ts')).toolSpecs().length && (await import('./src/tools.ts'))
const nmapSpec = (await import('./src/tools.ts'))
const nmapOut = JSON.parse(JSON.stringify({ hosts: [] }))
void parsedNmap; void nmapSpec; void nmapOut
const nmapParsed = typeof (await import('./src/tools.ts')).runTool === 'function' ? null : null
void nmapParsed

// Direct parser checks via a fake runner. The store only ever calls `run`, but
// the fixture has to satisfy the whole `Runner` contract, so `allowed` is stubbed.
const fake: Runner = {
  allowed: () => [],
  // `runTool` always hands over the argv it built, so this default never fires.
  async run(command, args = []) {
    const output = command === 'nmap' ? nmap
      : command === 'httpx' ? JSON.stringify({ url: 'https://example.com', status_code: 200, title: 'Example', tech: ['nginx'], host: 'example.com' })
      : command === 'ffuf' ? JSON.stringify({ results: [{ url: 'https://example.com/admin', status: 200, length: 1234 }] })
      : command === 'gobuster' ? '/admin (Status: 200) [Size: 42]'
      : command === 'nikto' ? '+ /server-status: exposes status\n+ OSVDB-3092: /admin/: admin login'
      : command === 'openssl' ? 'subject=CN=example.com\nissuer=C=US, O=Demo\nNot Before: Jan 1 00:00:00 2026 GMT\nNot After : Jan 1 00:00:00 2027 GMT'
      : command === 'katana' ? JSON.stringify({ request: { endpoint: 'https://example.com/login' }, response: { status_code: 200 } })
      : command === 'subfinder' ? JSON.stringify({ host: 'api.example.com', source: 'crtsh' })
      : command === 'nuclei' ? JSON.stringify({ 'template-id': 'CVE-2024-0001', info: { name: 'Demo RCE', severity: 'critical', description: 'demo' }, 'matched-at': 'https://example.com/x', 'extracted-results': ['root'] })
      : 'Parameter: id (GET)\n    Type: boolean-based blind\n    Title: AND boolean-based blind\n    Payload: id=1 AND 1=1\n[INFO] GET parameter \'id\' is vulnerable'
    return { command, args, code: 0, signal: null, stdout: output, stderr: '', truncated: false, timed_out: false, duration_ms: 1 }
  }
}

const nmapRun = await runTool(fake, 'nmap', 'example.com')
check('nmap parses host/ports', nmapRun.parsed.hosts[0]?.ip === '93.184.216.34' && nmapRun.parsed.hosts[0].ports.length === 2, JSON.stringify(nmapRun.parsed.hosts[0]))

const task = await ops.createTask({ description: 'tools', goal: 'scan' })
const taskId = String(task.id)
const intent = await ops.addNode(taskId, { kind: 'intent', payload: { text: 'scan' }, state: 'running' })
const nmapPersist = await persistToolResult(ops, taskId, String(intent.id), 'nmap', nmapRun.parsed, nmapRun.stdout)
check('nmap persists assets', nmapPersist.filter((item) => item.kind === 'asset').length >= 3, JSON.stringify(nmapPersist))

const httpxRun = await runTool(fake, 'httpx', 'example.com')
const httpxPersist = await persistToolResult(ops, taskId, String(intent.id), 'httpx', httpxRun.parsed, httpxRun.stdout)
check('httpx persists endpoint', httpxPersist.length === 1, JSON.stringify(httpxPersist))

const ffufRun = await runTool(fake, 'ffuf', 'https://example.com')
const ffufPersist = await persistToolResult(ops, taskId, String(intent.id), 'ffuf', ffufRun.parsed, 'https://example.com/FUZZ\n' + ffufRun.stdout)
check('ffuf persists endpoint', ffufPersist.length === 1 && ffufRun.parsed.results[0]?.status === 200, JSON.stringify(ffufPersist))

const nucleiRun = await runTool(fake, 'nuclei', 'https://example.com')
const nucleiPersist = await persistToolResult(ops, taskId, String(intent.id), 'nuclei', nucleiRun.parsed, nucleiRun.stdout)
const nucleiFinding = await ops.writer.readRecord('findings', String(nucleiPersist.find((item) => item.kind === 'finding')?.id))
check('nuclei reports finding', nucleiRun.parsed.findings.length === 1 && nucleiFinding?.severity === 'critical' && nucleiFinding?.vulnclass === 'CVE-2024-0001', JSON.stringify({ parsed: nucleiRun.parsed.findings[0], finding: nucleiFinding?.id }))

const katanaRun = await runTool(fake, 'katana', 'https://example.com')
const katanaPersist = await persistToolResult(ops, taskId, String(intent.id), 'katana', katanaRun.parsed, katanaRun.stdout)
check('katana persists endpoint', katanaPersist.length === 1 && katanaRun.parsed.urls[0]?.url === 'https://example.com/login', JSON.stringify(katanaPersist))

const subfinderRun = await runTool(fake, 'subfinder', 'example.com')
const subfinderPersist = await persistToolResult(ops, taskId, String(intent.id), 'subfinder', subfinderRun.parsed, subfinderRun.stdout)
const subdomain = await ops.writer.readRecord('assets', String(subfinderPersist[0]?.id))
check('subfinder persists subdomain', subfinderPersist.length === 1 && subdomain?.type === 'subdomain' && subdomain?.domain === 'api.example.com', JSON.stringify({ persist: subfinderPersist, domain: subdomain?.domain }))

const gobusterRun = await runTool(fake, 'gobuster', 'https://example.com')
const gobusterPersist = await persistToolResult(ops, taskId, String(intent.id), 'gobuster', gobusterRun.parsed, 'https://example.com\n' + gobusterRun.stdout)
check('gobuster persists path', gobusterPersist.length === 1 && gobusterRun.parsed.results[0]?.status === 200, JSON.stringify(gobusterPersist))

const niktoRun = await runTool(fake, 'nikto', 'https://example.com')
const niktoPersist = await persistToolResult(ops, taskId, String(intent.id), 'nikto', niktoRun.parsed, niktoRun.stdout)
check('nikto reports findings', niktoRun.parsed.findings.length >= 1 && niktoPersist.filter((item) => item.kind === 'finding').length >= 1, JSON.stringify({ parsed: niktoRun.parsed.findings.length, created: niktoPersist.length }))

const opensslRun = await runTool(fake, 'openssl', 'example.com:443')
const opensslPersist = await persistToolResult(ops, taskId, String(intent.id), 'openssl', opensslRun.parsed, opensslRun.stdout)
const tlsAsset = await ops.writer.readRecord('assets', String(opensslPersist[0]?.id))
check('openssl persists service', opensslRun.parsed.has_cert && tlsAsset?.service_name === 'tls' && tlsAsset?.extra?.issuer.includes('Demo'), JSON.stringify({ parsed: opensslRun.parsed, asset: tlsAsset?.id }))

const sqlmapRun = await runTool(fake, 'sqlmap', 'https://example.com/?id=1')
const sqlmapPersist = await persistToolResult(ops, taskId, String(intent.id), 'sqlmap', sqlmapRun.parsed, sqlmapRun.stdout)
const finding = await ops.writer.readRecord('findings', String(sqlmapPersist.find((item) => item.kind === 'finding')?.id))
check('sqlmap reports finding', sqlmapRun.parsed.vulnerable === true && finding?.vulnclass === 'SQL注入' && finding?.severity === 'high', JSON.stringify({ vulnerable: sqlmapRun.parsed.vulnerable, finding: finding?.id }))

const realRunner = createRunner({ timeoutMs: 10000 })
check('runner allow-list exposed', realRunner.allowed().includes('nmap'))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
console.log(`root: ${root}`)
process.exit(failed ? 1 : 0)

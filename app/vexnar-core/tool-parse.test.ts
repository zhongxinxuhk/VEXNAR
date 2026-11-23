// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// 外部工具输出解析自检：真实二进制的 stdout 形状（而不是理想 JSON）必须能落成资产/发现。
//
// 两条真实缺陷在这里钉住：
//   · ffuf 在 `-o /dev/stdout` 时先输出命中路径、再输出 JSON 报告，旧解析只认
//     「整段以 { 开头」，于是结果永远为空；
//   · subfinder 输出被截断时最后一行是半截 JSON，旧解析把它当纯文本主机名收下。
import assert from 'node:assert/strict'

import { runTool } from '../vexnar-store/src/index.ts'
import type { RunResult } from '../vexnar-store/src/exec.ts'

/** 固定 stdout 的假 runner：解析器只关心文本，不真正起进程。 */
const fakeRunner = (stdout: string) => ({
  async run(command: string, args: string[]): Promise<RunResult> {
    return { command, args, code: 0, signal: null, stdout, stderr: '', truncated: false, timed_out: false, duration_ms: 1 }
  }
}) as unknown as Parameters<typeof runTool>[0]

// ── ffuf：命中行 + JSON 报告混在 stdout ────────────────────────────────────
const ffufMixed = [
  'admin',
  'login',
  JSON.stringify({
    commandline: 'ffuf -u http://target/FUZZ -w words.txt -of json -o /dev/stdout -s',
    results: [
      { input: { FUZZ: 'admin' }, status: 200, length: 37, url: 'http://target/admin' },
      { input: { FUZZ: 'login' }, status: 200, length: 63, url: 'http://target/login' }
    ]
  })
].join('\n')
const ffuf = await runTool(fakeRunner(ffufMixed), 'ffuf', 'http://target')
assert.equal(ffuf.parsed.results.length, 2, 'ffuf 应解析出两条命中，而不是空数组')
assert.equal(ffuf.parsed.results[0].path, 'http://target/admin')
assert.equal(ffuf.parsed.results[0].status, 200)

// 文本兜底：没有 JSON 报告时仍按 `path [Status: n, Size: m]` 解析
const ffufText = await runTool(fakeRunner('admin [Status: 200, Size: 37, Words: 2, Lines: 1]'), 'ffuf', 'http://target')
assert.equal(ffufText.parsed.results.length, 1)
assert.equal(ffufText.parsed.results[0].path, 'admin')
assert.equal(ffufText.parsed.results[0].size, 37)

// ── subfinder：截断的半行 JSON 不能变成主机名 ──────────────────────────────
const subfinderOut = [
  '{"host":"a.example.com","source":"crtsh"}',
  '{"host":"b.example.com","source":"anubis"}',
  '{"host":"c.example.com","source":"anubis"',
  'plain.example.com'
].join('\n')
const subfinder = await runTool(fakeRunner(subfinderOut), 'subfinder', 'example.com')
assert.deepEqual(subfinder.parsed.hosts.map((row: { host: string }) => row.host), ['a.example.com', 'b.example.com', 'plain.example.com'])
assert.ok(!subfinder.parsed.hosts.some((row: { host: string }) => row.host.startsWith('{')), '半截 JSON 不应落成主机名')

// ── httpx：ProjectDiscovery 的 -json 行 ────────────────────────────────────
const httpxLine = JSON.stringify({
  url: 'http://127.0.0.1:18080', status_code: 200, title: 'ok', tech: ['Python:3.9.6'], host: '127.0.0.1'
})
const httpx = await runTool(fakeRunner(httpxLine), 'httpx', 'http://127.0.0.1:18080')
assert.equal(httpx.parsed.urls.length, 1)
assert.equal(httpx.parsed.urls[0].status, 200)
assert.deepEqual(httpx.parsed.urls[0].tech, ['Python:3.9.6'])

// ── katana：jsonl 的 request.endpoint ──────────────────────────────────────
const katanaLine = JSON.stringify({ request: { method: 'GET', endpoint: 'http://target/admin' }, response: { status_code: 200 } })
const katana = await runTool(fakeRunner(katanaLine), 'katana', 'http://target')
assert.equal(katana.parsed.urls.length, 1)
assert.equal(katana.parsed.urls[0].url, 'http://target/admin')
assert.equal(katana.parsed.urls[0].status, 200)

// ── nuclei：jsonl 命中 → findings ──────────────────────────────────────────
const nucleiLine = JSON.stringify({ 'template-id': 'tech-detect', info: { name: 'Wappalyzer', severity: 'info' }, 'matched-at': 'http://target' })
const nuclei = await runTool(fakeRunner(nucleiLine), 'nuclei', 'http://target')
assert.equal(nuclei.parsed.findings.length, 1)
assert.equal(nuclei.parsed.findings[0].template, 'tech-detect')
assert.equal(nuclei.parsed.findings[0].severity, 'info')

console.log('tool output parsing: 12 checks passed')

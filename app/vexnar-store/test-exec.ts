// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRunner } from './src/exec.ts'

type CheckResult = { name: string; ok: boolean; detail: string }
/** The runner rejects with an Error carrying an HTTP-ish status. */
type StatusError = { status?: number }

const runner = createRunner({ concurrency: 1, timeoutMs: 5000, maxOutput: 4096 })
const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail })

const version = await runner.run('curl', ['--version'])
check('runs allowed command', version.code === 0 && version.stdout.toLowerCase().includes('curl'), `code=${version.code}`)

const capped = await runner.run('curl', ['--version'], { maxOutput: 10 })
check('truncates output', capped.truncated === true && capped.stdout.length <= 10, JSON.stringify({ truncated: capped.truncated, length: capped.stdout.length }))

const timed = await runner.run('curl', ['-s', 'http://10.255.255.1/'], { timeoutMs: 80 })
check('times out', timed.timed_out === true, JSON.stringify({ timed_out: timed.timed_out, signal: timed.signal }))

let denied: StatusError | null = null
try { await runner.run('echo', ['hi']) } catch (error) { denied = error as StatusError }
check('rejects disallowed command', denied?.status === 400, String(denied))

const parallel = await Promise.all([runner.run('curl', ['--version']), runner.run('curl', ['--version'])])
check('concurrency serialises', parallel.every((item) => item.code === 0), parallel.map((item) => item.code).join(','))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)

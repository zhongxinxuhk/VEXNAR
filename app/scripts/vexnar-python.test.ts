// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 启动器的 Python 选择自检。
 *
 * 背景：`@furongjun1999/dsh-memory` 的 md_cg 在模块顶层用 PEP 604（`str | None`），
 * macOS 自带的 `/usr/bin/python3` 是 3.9，import 直接 TypeError，插件每 1/2/4/8…
 * 秒重试 8 次。启动器要给子进程一个 ≥3.10 的 `MDCG_PYTHON`，并在 PATH 最前面放
 * 一个 `python3` 垫片；这条测试钉住「选出来的解释器真的 ≥3.10」和「显式覆盖优先」。
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// runtimeEnv 会往 VEXNAR_HOME/bin 写垫片；先指到临时目录，再加载模块。
const home = await mkdtemp(join(tmpdir(), 'vexnar-python-'))
process.env.VEXNAR_HOME = home

const { modernPython, resetPythonCache, runtimeEnv } = await import('./vexnar-runtime.ts')

const atLeast310 = (python: string): boolean => {
  const probe = spawnSync(python, ['-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'], { stdio: 'ignore' })
  return probe.status === 0
}

try {
  resetPythonCache()
  const python = modernPython()
  if (python === undefined) {
    console.log('python env: 本机没有 ≥3.10 的 Python，跳过垫片断言')
  } else {
    assert.ok(atLeast310(python), `${python} 必须 ≥3.10`)
    assert.ok(!python.endsWith('/usr/bin/python3') || atLeast310(python), '不能选中系统 3.9')

    const env = runtimeEnv()
    assert.equal(env.MDCG_PYTHON, python, '子进程应拿到选中的解释器')
    // macOS 的临时目录会被解析成 /private/var/...，比较前统一 realpath。
    const shimDir = join(realpathSync(home), 'bin')
    assert.ok(env.PATH.startsWith(shimDir + ':'), `PATH 应以垫片目录开头：${env.PATH}`)

    const shim = join(home, 'bin', 'python3')
    assert.ok(existsSync(shim), '应生成 python3 垫片')
    const viaShim = spawnSync(shim, ['-c', 'import sys; print(sys.version_info[1])'], { encoding: 'utf8' })
    assert.equal(viaShim.status, 0, '垫片应可执行')
    assert.ok(Number(viaShim.stdout.trim()) >= 10, `垫片版本过低：${viaShim.stdout}`)
  }

  // 显式 MDCG_PYTHON 优先，即使它不是 ≥3.10（用户自己负责）
  process.env.MDCG_PYTHON = '/bin/echo'
  resetPythonCache()
  assert.equal(modernPython(), '/bin/echo', '显式覆盖应直接生效')
  assert.equal(runtimeEnv().MDCG_PYTHON, '/bin/echo', '显式覆盖应传给子进程')
  delete process.env.MDCG_PYTHON
} finally {
  await rm(home, { recursive: true, force: true })
}

console.log('python env: checks passed')

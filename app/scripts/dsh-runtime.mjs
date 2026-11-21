// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Resolve the dsh runtime this checkout should launch.
 *
 * Order:
 *   1. DSH_RUNTIME                     explicit runtime directory
 *   2. app/dsh                          source checkout (when built)
 *   3. /Applications/DeepSeek Harness.app packaged runtime
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const sourceRuntime = join(repo, 'app', 'dsh')
const packaged = '/Applications/DeepSeek Harness.app/Contents/Resources/app/dsh'
const binRel = join('node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

export function resolveRuntime() {
  const candidates = [process.env.DSH_RUNTIME, sourceRuntime, packaged].filter(Boolean)
  for (const dir of candidates) {
    if (existsSync(join(dir, binRel))) return dir
  }
  throw new Error(`dsh runtime not found; set DSH_RUNTIME (tried: ${candidates.join(', ')})`)
}

export function readToken(name, fallback = '') {
  try {
    return readFileSync(join(repo, 'data', name), 'utf8').trim() || fallback
  } catch {
    return fallback
  }
}

export function dshHome() {
  // The inherited DSH_HOME points at the user's installed app home; app-side
  // development must never write there. VEXNAR_DSH_HOME opts into another tree.
  return process.env.VEXNAR_DSH_HOME || join(repo, 'app', '.dsh-home')
}

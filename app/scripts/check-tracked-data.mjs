// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 运行时数据是否混进了 git 索引。
 *
 * `app/.gitignore` 拦住的是「默认不会被 add」这件事，拦不住 `git add -f`
 * 或者一次大意的手工 `git add`。一旦 store（任务 / 漏洞 / 流量 / 会话）、
 * 抓包归档、角色扮演语料或日志被提交，它们就永久留在历史里，clone 下来的人
 * 也会拿到别人机器上的测试数据。
 *
 * 这里只读、只检查 `git ls-files` 的结果，发现一条就打印一条并以 1 退出，
 * 让 CI 把「数据上传」变成一个显式的失败。
 *
 * 用 Node 内置模块写成 .mjs 而不是 .ts，是因为 CI 的 app-bundle 任务只安装
 * 两个插件的依赖闭包（没有 tsx），这条守卫必须在那之前就能跑。
 *
 * 预设 Agent 与拦截规则不在此列：它们是代码，不是数据。
 *   Agent 名册 → `vexnar/cordis.patch.yml` 的 preset 行 / `vexnar/extras.json`
 *   拦截规则   → `vexnar-core/src/intercept-seed.ts` 与 `db/db.go` 的内置种子
 */

import { execFileSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 每一条都是「本机跑出来的东西」，不是代码。 */
const DENY = [
  { pattern: /^\.vexnar-home\//, reason: '运行时 profile：store / 日志 / 会话 / 插件数据' },
  { pattern: /^\.dsh-home\//, reason: 'dsh 运行时数据：会话、记忆、抓包缓存' },
  // 锚在 app 根：`vexnar/ui/src/data/` 是源码目录，不是数据。
  { pattern: /^(data|logs|exports|storages|sessions|transcripts)\//, reason: '数据目录' },
  { pattern: /\.(sqlite|sqlite-wal|sqlite-shm|db)$/, reason: '数据库文件' },
  { pattern: /\.(jsonl|ndjson|log)$/, reason: '逐条记录 / 日志' },
  { pattern: /\.(dmg|exe)$/, reason: '安装包' },
  { pattern: /(^|\/)node_modules\//, reason: '依赖安装产物' }
]

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = join(here, '..')
const repoRoot = join(appRoot, '..')

/** `git ls-files` 的路径相对仓库根，这里统一成相对 app/ 便于阅读。 */
const tracked = execFileSync('git', ['ls-files', '-z', '--', 'app'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024
})
  .split('\0')
  .filter(Boolean)
  .map(path => relative(appRoot, join(repoRoot, path)))

const offenders = tracked.flatMap(path => {
  const hit = DENY.find(({ pattern }) => pattern.test(path))
  return hit ? [{ path, reason: hit.reason }] : []
})

if (offenders.length > 0) {
  console.error(`✗ 有 ${offenders.length} 个运行时数据文件被 git 跟踪，它们会随 push 上传：`)
  for (const { path, reason } of offenders) console.error(`  app/${path}  —  ${reason}`)
  console.error('修法：git rm --cached <path>，并确认 app/.gitignore 覆盖该路径。')
  process.exit(1)
}

console.log(`✓ git 索引干净：${tracked.length} 个跟踪文件中没有运行时数据（预设 Agent 与拦截规则属代码，不在此列）`)

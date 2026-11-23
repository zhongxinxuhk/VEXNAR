// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 客户端发版的版本号与发行说明。
 *
 * 两个子命令，都只读本地 git 状态（checkout 时 fetch-depth: 0，标签齐全，
 * 不需要打 API、也不需要 token）：
 *
 *   version  从已有 `app-v*` 标签推出这一次该发哪个版本。
 *            从 0.0.1 起，按补丁位 +1；HEAD 上已经有 `app-v*` 标签时复用该版本，
 *            这样重跑同一次 workflow 不会把版本号白白顶上去。
 *
 *   notes    生成发行说明，固定四段：重点 / 新增功能 / 修复 / 其他。
 *            区间是「上一个标签..HEAD」，类型按 conventional commit 前缀分。
 *            重点是带 `--no-ff` 的 merge 提交主题——这个仓库一条分支一个问题，
 *            merge 主题就是那次问题的名字；没有 merge 时退回 feat 主题。
 *
 * 用法：
 *   node app/scripts/release.mjs version
 *   node app/scripts/release.mjs notes --version 0.0.1 --previous app-v0.0.0 --out notes.md
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TAG_PATTERN = /^app-v(\d+)\.(\d+)\.(\d+)$/
/** 每段最多列这么多条，超出的只报数量：发行说明不是完整 changelog。 */
const SECTION_LIMIT = 12
/** 「重点」只留最重要的几条，否则首版会把几十条 merge 主题全铺上去。 */
const HIGHLIGHT_LIMIT = 6
/** 首个版本没有上一个标签，只看最近这么多条提交。 */
const FIRST_RELEASE_COMMITS = 80

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')

/** 跑一条 git 命令，返回按行切好的输出。 */
function git(...args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

/** 只留 `app-v1.2.3` 形式，按数值排序（字典序会把 0.0.10 排到 0.0.9 前面）。 */
function appVersionTags() {
  return git('tag', '--merged', 'HEAD', '-l', 'app-v*')
    .map(tag => {
      const matched = TAG_PATTERN.exec(tag)
      return matched ? { tag, parts: matched.slice(1).map(Number) } : null
    })
    .filter(Boolean)
    .sort((left, right) => {
      for (let index = 0; index < 3; index += 1) {
        if (left.parts[index] !== right.parts[index]) return left.parts[index] - right.parts[index]
      }
      return 0
    })
}

function formatVersion(parts) {
  return parts.join('.')
}

/** 版本号以 workflow 输出为主，直接打印便于本地诊断。 */
function writeOutputs(outputs) {
  for (const [key, value] of Object.entries(outputs)) console.log(`${key}=${value}`)
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join('\n') + '\n')
}

function commandVersion() {
  const tags = appVersionTags()
  const headTags = git('tag', '--points-at', 'HEAD', '-l', 'app-v*')
  const reused = headTags.map(tag => ({ tag, matched: TAG_PATTERN.exec(tag) })).find(entry => entry.matched)

  if (reused) {
    // 重跑同一次构建：版本不前进，区间退到它的前一个标签，说明才不会被清空。
    const index = tags.findIndex(entry => entry.tag === reused.tag)
    const previous = index > 0 ? tags[index - 1].tag : ''
    writeOutputs({
      version: formatVersion(reused.matched.slice(1).map(Number)),
      tag: reused.tag,
      previous,
      reused: 'true'
    })
    return
  }

  const latest = tags.at(-1)
  const next = latest ? [latest.parts[0], latest.parts[1], latest.parts[2] + 1] : [0, 0, 1]
  const version = formatVersion(next)
  writeOutputs({ version, tag: `app-v${version}`, previous: latest?.tag ?? '', reused: 'false' })
}

/** `feat(ui): 报文查看器` → `报文查看器`：只比正文，别再被前缀挡住。 */
function stripType(subject) {
  const matched = /^[a-z]+(?:\([^)]*\))?!?:\s*(.+)$/iu.exec(subject)
  return (matched ? matched[1] : subject).trim()
}

/** @returns {{ highlights: string[], features: string[], fixes: string[], others: string[] }} */
function classify(subjects) {
  const seen = new Set()
  const bucket = { highlights: [], features: [], fixes: [], others: [] }
  for (const subject of subjects) {
    if (seen.has(subject)) continue
    seen.add(subject)
    // `merge feat/x: 报文查看器共用化` → 重点是冒号后的那句话；git 自动生成的
    // `Merge branch 'main' into ...` 没有主题，整条跳过。
    const merged = /^merge\s+([^:：]+)[:：]\s*(.+)$/iu.exec(subject)
    if (merged) {
      bucket.highlights.push(merged[2].replace(/\s+into\s+\S+$/iu, '').trim())
      continue
    }
    if (/^merge\b/iu.test(subject)) continue
    if (/^feat(\(|!|:)/iu.test(subject)) bucket.features.push(subject)
    else if (/^fix(\(|!|:)/iu.test(subject)) bucket.fixes.push(subject)
    else bucket.others.push(subject)
  }
  // 分支上的提交和它的 merge 主题说的是同一件事：主题已经进「重点」的，
  // 后面三段不再重复列一遍。
  const topics = bucket.highlights.map(stripType)
  const covered = subject => {
    const body = stripType(subject)
    return topics.some(topic => topic.includes(body) || body.includes(topic))
  }
  bucket.features = bucket.features.filter(subject => !covered(subject))
  bucket.fixes = bucket.fixes.filter(subject => !covered(subject))
  bucket.others = bucket.others.filter(subject => !covered(subject))
  return bucket
}

function section(title, entries, limit = SECTION_LIMIT) {
  if (entries.length === 0) return `## ${title}\n\n- 无\n`
  const shown = entries.slice(0, limit).map(entry => `- ${entry}`)
  const hidden = entries.length - shown.length
  if (hidden > 0) shown.push(`- 另有 ${hidden} 条未展开，见 [提交记录]({{compare}})`)
  return `## ${title}\n\n${shown.join('\n')}\n`
}

function commandNotes(argv) {
  const options = { version: '', previous: '', out: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--version') options.version = argv[++index] ?? ''
    else if (flag === '--previous') options.previous = argv[++index] ?? ''
    else if (flag === '--out') options.out = argv[++index] ?? ''
  }
  if (!options.version) throw new Error('release notes: --version is required')

  const hasPrevious = options.previous && (() => {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `${options.previous}^{commit}`], { cwd: repoRoot })
      return true
    }
    catch { return false }
  })()

  const subjects = hasPrevious
    ? git('log', '--format=%s', `${options.previous}..HEAD`)
    : git('log', `--max-count=${FIRST_RELEASE_COMMITS}`, '--format=%s', 'HEAD')

  const bucket = classify(subjects)
  if (bucket.highlights.length === 0) {
    // 没有 merge 主题时，用 feat 主题兜底，避免「重点」整段空着。
    bucket.highlights.push(...bucket.features.slice(0, 3))
  }

  const compare = options.previous
    ? `https://github.com/zhongxinxuhk/VEXNAR/compare/${options.previous}...app-v${options.version}`
    : 'https://github.com/zhongxinxuhk/VEXNAR/commits'

  const body = [
    `VEXNAR 客户端 v${options.version}`,
    '',
    section('重点', bucket.highlights, HIGHLIGHT_LIMIT),
    section('新增功能', bucket.features),
    section('修复', bucket.fixes),
    section('其他', [
      ...bucket.others,
      '安装包未签名：macOS 首次打开需 `xattr -dr com.apple.quarantine /Applications/DeepSeek\\ Harness.app`，Windows 需在 SmartScreen 里选「仍要运行」',
      '安装包内部版本跟随上游 dsh（0.2.2-rc.5），本页版本号只表示本次构建序列'
    ])
  ].join('\n').replace(/\{\{compare\}\}/gu, compare)

  if (options.out) {
    writeFileSync(options.out, body)
    console.log(`release notes written to ${options.out}`)
  }
  else console.log(body)
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'version') commandVersion()
else if (command === 'notes') commandNotes(rest)
else {
  console.error('usage: release.mjs <version|notes> [--version <v>] [--previous <tag>] [--out <file>]')
  process.exit(2)
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 启动日志过滤。
 *
 * 三个插件把「启动成功」也写进 stderr：灵枢的 md_cg 会打路径/策略/自报/代校验，
 * craft-anything 打 `MCP child ready`，dsh-purge 打宿主版本兼容提示。它们不是错误，
 * 但和 Traceback 混在一起时看起来像启动失败。
 *
 * 这里只静音**逐字匹配的信息行**；`Traceback`、`TypeError`、`❌`、`⚠`、`失败`、
 * `退出`、`重试` 一律原样输出。`VEXNAR_VERBOSE=1` 时全部输出，便于排查。
 */

const INFO_PATTERNS: readonly RegExp[] = [
  // 灵枢 md_cg 的启动横幅（直接输出与经 bridge 前缀两种形态）
  /^\[mdcg-mcp\] (?:路径：记忆真源|写入策略：来源=|自报(?::|文件:)|代校验：)/,
  /^\[lingshu-bridge\] \[mdcg-mcp\] (?:路径：记忆真源|写入策略：来源=|自报(?::|文件:)|代校验：)/,
  // craft-anything 的子进程就绪
  /^\[dsh-craft-anything\] MCP child ready\b/,
  // dsh-purge 的宿主版本兼容提示：仍可应用，写入前会备份；详细诊断在插件页
  /^\[dsh-purge-community\] DSH .*未在已验证清单内/
]

/** 是否把这一行当作「启动成功的信息」静音。`verbose` 为真时一律不静音。 */
export function isStartupNoise(line: string, verbose: boolean = process.env.VEXNAR_VERBOSE === '1'): boolean {
  if (verbose) return false
  const text = line.trimEnd()
  return INFO_PATTERNS.some((pattern) => pattern.test(text))
}

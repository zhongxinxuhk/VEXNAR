// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Render a task report from findings, assets and graph counts. */
export function buildReport(input: {
  task: any
  findings: any[]
  assets: any[]
  overview?: { by_kind?: Record<string, number>; edges?: number }
}) {
  const { task, findings, assets } = input
  const bySeverity: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const finding of findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1
    byStatus[finding.status] = (byStatus[finding.status] ?? 0) + 1
  }
  const lines: string[] = []
  lines.push(`# ${task.name || `任务 ${task.id}`}`)
  lines.push('')
  lines.push(`- 目标：${task.goal || '-'}`)
  lines.push(`- 描述：${task.description || '-'}`)
  lines.push(`- 状态：${task.status}`)
  lines.push(`- 资产：${assets.length}`)
  lines.push(`- 漏洞：${findings.length}（${Object.entries(bySeverity).map(([key, value]) => `${key} ${value}`).join(' / ') || '无'}）`)
  if (input.overview?.by_kind) lines.push(`- 图谱：${Object.entries(input.overview.by_kind).map(([key, value]) => `${key} ${value}`).join(' · ')}`)
  lines.push('')
  lines.push('## 漏洞')
  if (!findings.length) lines.push('无')
  for (const finding of findings) {
    lines.push(`### [${finding.severity}] ${finding.vulnclass}${finding.name ? ` · ${finding.name}` : ''}`)
    lines.push(`- 状态：${finding.status}`)
    lines.push(`- 摘要：${finding.summary || '-'}`)
    if (finding.evidence) {
      lines.push('- 证据：')
      lines.push('```')
      lines.push(String(finding.evidence).slice(0, 4000))
      lines.push('```')
    }
    lines.push('')
  }
  lines.push('## 资产')
  if (!assets.length) lines.push('无')
  for (const asset of assets.slice(0, 200)) {
    lines.push(`- ${asset.type}：${asset.url || asset.domain || asset.ip || asset.id}`)
  }
  return { markdown: lines.join('\n'), stats: { findings: findings.length, by_severity: bySeverity, by_status: byStatus, assets: assets.length } }
}

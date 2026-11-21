// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Runner } from './exec.js'
import type { storeOperations } from './operations.js'

type Ops = ReturnType<typeof storeOperations>

export type ToolName = 'nmap' | 'httpx' | 'ffuf' | 'sqlmap' | 'nuclei' | 'katana' | 'subfinder' | 'gobuster' | 'nikto' | 'openssl'

export interface ToolSpec {
  name: ToolName
  description: string
  build(target: string, extra?: Record<string, unknown>): { command: string; args: string[] }
  parse(output: string): any
}

const templates: Record<ToolName, ToolSpec> = {
  nmap: {
    name: 'nmap',
    description: '端口与服务识别',
    build(target, extra = {}) {
      const ports = String(extra.ports ?? '1-1000')
      const args = ['-Pn', '-sV', '--open', '-T4', '-p', ports]
      if (extra.scripts) args.push('--script', String(extra.scripts))
      args.push(target)
      return { command: 'nmap', args }
    },
    parse(output) {
      const hosts: Array<{ host: string; ip?: string; ports: Array<{ port: number; state: string; service: string; version?: string }> }> = []
      let current: (typeof hosts)[number] | null = null
      for (const line of output.split('\n')) {
        const report = line.match(/^Nmap scan report for (.+?)(?: \((\d+\.\d+\.\d+\.\d+)\))?$/)
        if (report) {
          current = { host: report[1], ...(report[2] ? { ip: report[2] } : {}), ports: [] }
          hosts.push(current)
          continue
        }
        const port = line.match(/^(\d+)\/(tcp|udp)\s+(open|filtered|closed)\s+(\S+)\s*(.*)$/)
        if (port && current) current.ports.push({ port: Number(port[1]), state: port[3], service: port[4], ...(port[5] ? { version: port[5].trim() } : {}) })
      }
      return { hosts }
    }
  },
  httpx: {
    name: 'httpx',
    description: 'URL 存活与指纹',
    build(target) {
      return { command: 'httpx', args: ['-silent', '-json', '-status-code', '-title', '-tech-detect', '-u', target] }
    },
    parse(output) {
      const urls = []
      for (const line of output.split('\n')) {
        const text = line.trim()
        if (!text.startsWith('{')) continue
        try {
          const row = JSON.parse(text)
          urls.push({ url: row.url ?? row.input, status: Number(row.status_code ?? 0), title: row.title ?? '', tech: row.tech ?? row.technologies ?? [], host: row.host ?? '' })
        } catch {
          // ignore non-JSON line
        }
      }
      return { urls }
    }
  },
  ffuf: {
    name: 'ffuf',
    description: '目录/接口爆破',
    build(target, extra = {}) {
      const wordlist = String(extra.wordlist ?? '/usr/share/wordlists/dirb/common.txt')
      return { command: 'ffuf', args: ['-u', target.includes('FUZZ') ? target : `${target.replace(/\/$/, '')}/FUZZ`, '-w', wordlist, '-mc', String(extra.match ?? '200,204,301,302,403'), '-of', 'json', '-o', '/dev/stdout', '-s'] }
    },
    parse(output) {
      const results = []
      const trimmed = output.trim()
      if (trimmed.startsWith('{')) {
        try {
          const data = JSON.parse(trimmed)
          for (const row of data.results ?? []) results.push({ path: row.url ?? row.input?.FUZZ ?? '', status: Number(row.status ?? 0), size: Number(row.length ?? 0) })
          return { results }
        } catch {
          // fall through to text parsing
        }
      }
      for (const line of output.split('\n')) {
        const row = line.match(/^(\S+)\s+\[Status:\s*(\d+)(?:,\s*Size:\s*(\d+))?/)
        if (row) results.push({ path: row[1], status: Number(row[2]), size: row[3] ? Number(row[3]) : 0 })
      }
      return { results }
    }
  },
  gobuster: {
    name: 'gobuster',
    description: '目录枚举',
    build(target, extra = {}) {
      return { command: 'gobuster', args: ['dir', '-u', target, '-w', String(extra.wordlist ?? '/usr/share/wordlists/dirb/common.txt'), '-q', '--no-error'] }
    },
    parse(output) {
      const results = []
      for (const line of output.split('\n')) {
        const row = line.match(/^(\/\S*)\s+\(Status:\s*(\d+)\)(?:\s+\[Size:\s*(\d+)\])?/)
        if (row) results.push({ path: row[1], status: Number(row[2]), size: row[3] ? Number(row[3]) : 0 })
      }
      return { results }
    }
  },
  nikto: {
    name: 'nikto',
    description: 'Web 服务器扫描',
    build(target) {
      return { command: 'nikto', args: ['-h', target, '-nointeractive', '-ask', 'no'] }
    },
    parse(output) {
      const findings = []
      for (const line of output.split('\n')) {
        const text = line.replace(/^\+\s*/, '').trim()
        if (!text || text.startsWith('Target') || text.startsWith('Start Time') || text.startsWith('End Time')) continue
        const osvdb = text.match(/OSVDB-(\d+)/)
        if (text.includes(':') || osvdb) findings.push({ text, osvdb: osvdb?.[1] ?? '' })
      }
      return { findings }
    }
  },
  openssl: {
    name: 'openssl',
    description: 'TLS 证书探测',
    build(target) {
      return { command: 'openssl', args: ['s_client', '-connect', target, '-servername', target.split(':')[0], '-showcerts'] }
    },
    parse(output) {
      const subject = output.match(/subject=\s*(.+)/)?.[1]?.trim() ?? ''
      const issuer = output.match(/issuer=\s*(.+)/)?.[1]?.trim() ?? ''
      const notBefore = output.match(/Not Before:\s*(.+)/)?.[1] ?? ''
      const notAfter = output.match(/Not After\s*:\s*(.+)/)?.[1] ?? ''
      return { subject, issuer, not_before: notBefore, not_after: notAfter, has_cert: Boolean(subject) }
    }
  },
  katana: {
    name: 'katana',
    description: '爬虫收集 URL',
    build(target, extra = {}) {
      return { command: 'katana', args: ['-u', target, '-jsonl', '-silent', '-d', String(extra.depth ?? 2)] }
    },
    parse(output) {
      const urls = []
      for (const line of output.split('\n')) {
        const text = line.trim()
        if (!text.startsWith('{')) continue
        try {
          const row = JSON.parse(text)
          const url = row.request?.endpoint ?? row.url ?? ''
          if (url) urls.push({ url, status: Number(row.response?.status_code ?? 0) })
        } catch {
          // ignore
        }
      }
      return { urls }
    }
  },
  subfinder: {
    name: 'subfinder',
    description: '子域名枚举',
    build(target, extra = {}) {
      return { command: 'subfinder', args: ['-d', target, '-silent', '-json', ...(extra.all ? ['-all'] : [])] }
    },
    parse(output) {
      const hosts = []
      for (const line of output.split('\n')) {
        const text = line.trim()
        if (!text) continue
        if (text.startsWith('{')) {
          try { const row = JSON.parse(text); if (row.host) hosts.push({ host: row.host, source: row.source ?? '' }); continue } catch { /* fall through */ }
        }
        hosts.push({ host: text, source: 'subfinder' })
      }
      return { hosts }
    }
  },
  nuclei: {
    name: 'nuclei',
    description: '模板化漏洞扫描',
    build(target, extra = {}) {
      const args = ['-u', target, '-jsonl', '-silent', '-nc']
      if (extra.tags) args.push('-tags', String(extra.tags))
      if (extra.severity) args.push('-severity', String(extra.severity))
      return { command: 'nuclei', args }
    },
    parse(output) {
      const findings = []
      for (const line of output.split('\n')) {
        const text = line.trim()
        if (!text.startsWith('{')) continue
        try {
          const row = JSON.parse(text)
          findings.push({
            template: row['template-id'] ?? row.templateID ?? '',
            name: row.info?.name ?? '',
            severity: String(row.info?.severity ?? 'low').toLowerCase(),
            matched_at: row['matched-at'] ?? row.host ?? '',
            description: row.info?.description ?? '',
            extracted: row['extracted-results'] ?? []
          })
        } catch {
          // ignore malformed line
        }
      }
      return { findings }
    }
  },
  sqlmap: {
    name: 'sqlmap',
    description: 'SQL 注入验证',
    build(target, extra = {}) {
      const args = ['-u', target, '--batch', '--smart', '--level', String(extra.level ?? 2), '--risk', String(extra.risk ?? 2)]
      return { command: 'sqlmap', args }
    },
    parse(output) {
      const signals: string[] = []
      for (const line of output.split('\n')) {
        if (/is vulnerable|might be injectable|identified the following injection point|Parameter: .* \(.*\)/i.test(line)) signals.push(line.trim())
      }
      return { vulnerable: signals.length > 0, signals }
    }
  }
}

export function toolSpecs() {
  return Object.values(templates).map(({ name, description }) => ({ name, description }))
}

export async function runTool(runner: Runner, name: ToolName, target: string, extra?: Record<string, unknown>) {
  const spec = templates[name]
  if (!spec) throw Object.assign(new Error(`未知工具: ${name}`), { status: 400 })
  if (!target.trim()) throw Object.assign(new Error('target 不能为空'), { status: 400 })
  const { command, args } = spec.build(target, extra)
  const result = await runner.run(command, args, { timeoutMs: Number(extra?.timeout_ms ?? 120000) })
  return { ...result, parsed: spec.parse(result.stdout + '\n' + result.stderr) }
}

/** Persist parsed output as assets, facts and findings. */
export async function persistToolResult(ops: Ops, taskId: string, nodeId: string, name: ToolName, parsed: any, raw: string) {
  const created: Array<{ kind: string; id: string | number }> = []
  if (name === 'nmap') {
    for (const host of parsed.hosts ?? []) {
      const asset = await ops.addAsset(taskId, { type: 'ip', ...(host.ip ? { ip: host.ip } : { domain: host.host }) })
      created.push({ kind: 'asset', id: asset.id })
      for (const port of host.ports ?? []) {
        const service = await ops.addAsset(taskId, { type: 'service', ip: host.ip ?? host.host, port: port.port, service_name: port.service })
        created.push({ kind: 'asset', id: service.id })
      }
    }
  }
  if (name === 'httpx') {
    for (const row of parsed.urls ?? []) {
      const host = (() => { try { return new URL(row.url).hostname } catch { return row.host } })()
      const asset = await ops.addAsset(taskId, { type: 'endpoint', url: row.url, domain: host, root_domain: host, page_title: row.title, status_code: row.status, technologies: row.tech })
      created.push({ kind: 'asset', id: asset.id })
    }
  }
  if (name === 'ffuf') {
    for (const row of parsed.results ?? []) {
      const url = /^https?:/.test(row.path) ? row.path : `${raw.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/\/FUZZ.*$/, '') ?? ''}/${row.path.replace(/^\//, '')}`
      const asset = await ops.addAsset(taskId, { type: 'endpoint', url, status_code: row.status })
      created.push({ kind: 'asset', id: asset.id })
    }
  }
  if (name === 'nuclei') {
    for (const row of parsed.findings ?? []) {
      const severity = ['critical', 'high', 'medium', 'low'].includes(row.severity) ? row.severity : 'low'
      const finding = await ops.reportFinding({
        task_id: taskId, intent_id: nodeId, vulnclass: row.template || row.name || 'nuclei', name: row.name,
        severity, summary: row.name || row.template || 'nuclei finding',
        evidence: [row.matched_at, ...(row.extracted ?? [])].filter(Boolean).join('\n'), worker: 'engine'
      })
      created.push({ kind: 'finding', id: finding.finding_id })
    }
  }
  if (name === 'gobuster') {
    for (const row of parsed.results ?? []) {
      const url = /^https?:/.test(row.path) ? row.path : `${String(raw).match(/https?:\/\/[^\s]+/)?.[0]?.replace(/\/$/, '') ?? ''}${row.path}`
      const asset = await ops.addAsset(taskId, { type: 'endpoint', url, status_code: row.status })
      created.push({ kind: 'asset', id: asset.id })
    }
  }
  if (name === 'nikto') {
    for (const row of (parsed.findings ?? []).slice(0, 20)) {
      const finding = await ops.reportFinding({
        task_id: taskId, intent_id: nodeId, vulnclass: row.osvdb ? `OSVDB-${row.osvdb}` : 'nikto', severity: 'medium',
        summary: row.text.slice(0, 300), evidence: row.text, worker: 'engine'
      })
      created.push({ kind: 'finding', id: finding.finding_id })
    }
  }
  if (name === 'openssl' && parsed.has_cert) {
    const asset = await ops.addAsset(taskId, { type: 'service', service_name: 'tls', domain: parsed.subject.replace(/^.*CN\s*=\s*/, ''), extra: { issuer: parsed.issuer, not_before: parsed.not_before, not_after: parsed.not_after } })
    created.push({ kind: 'asset', id: asset.id })
  }
  if (name === 'katana') {
    for (const row of parsed.urls ?? []) {
      const host = (() => { try { return new URL(row.url).hostname } catch { return '' } })()
      const asset = await ops.addAsset(taskId, { type: 'endpoint', url: row.url, domain: host, root_domain: host, status_code: row.status })
      created.push({ kind: 'asset', id: asset.id })
    }
  }
  if (name === 'subfinder') {
    for (const row of parsed.hosts ?? []) {
      const root = String(row.host).split('.').slice(-2).join('.')
      const asset = await ops.addAsset(taskId, { type: 'subdomain', domain: row.host, root_domain: root })
      created.push({ kind: 'asset', id: asset.id })
    }
  }
  if (name === 'sqlmap' && parsed.vulnerable) {
    const finding = await ops.reportFinding({
      task_id: taskId, intent_id: nodeId, vulnclass: 'SQL注入', severity: 'high',
      summary: parsed.signals?.[0] ?? 'SQL 注入信号', evidence: parsed.signals?.join('\n') ?? raw.slice(0, 4000), worker: 'engine'
    })
    created.push({ kind: 'finding', id: finding.finding_id })
  }
  return created
}

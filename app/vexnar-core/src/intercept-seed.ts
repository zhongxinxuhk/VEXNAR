// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { meta } from './context.ts'

/**
 * 拦截规则的一次性迁移。
 *
 * 规则过去只存在 Go 的 PostgreSQL（`intercept_rules`）。客户端改成由 TypeScript
 * core 自己回答领域接口之后，拦截规则页读的是 core 的 meta 存储，那份是空的——
 * 页面于是显示「暂无规则」。这里把原有规则整套搬过来，**连同启用/禁用位、优先级、
 * 创建与更新时间**，之后两边不再同步（core 是客户端唯一的真相，Go 那份只作迁移源）。
 *
 * 两条来源，按顺序尝试：
 *   1. PostgreSQL 里的真实行（用户改过、删过、停过的那份）；
 *   2. 连不上或库里没有时，用 Go 的内置种子（db/db.go 的 v1+v2+v3，含各自默认启用位）。
 *
 * 迁移只发生一次：完成后在 meta 里写标记，用户之后删光或停光规则都不会被"复活"。
 */

const TABLE_RULES = 'intercept_rules'
const TABLE_SEED = 'intercept_seed'
const SEED_KEY = 'intercept_rules'

export interface SeedRuleRow {
  id: number
  name: string
  enabled: boolean
  priority: number
  match_target: string
  match_type: string
  pattern: string
  action: string
  message: string
  timeout_enabled: boolean
  timeout_seconds: number
  timeout_action: string
  created_at: string
  updated_at: string
}

/** 与 Go 的 rfc3339 同形：本地偏移带上，页面按原样显示时间。 */
function rfc3339(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return `${date.toISOString().slice(0, 23)}${sign}${pad(offset / 60)}:${pad(offset % 60)}`.replace('Z', '')
}

const text = (value: unknown, fallback = ''): string => (value == null ? fallback : String(value))

function rowOf(source: Record<string, any>, id: number): SeedRuleRow {
  const stamp = (value: unknown): string => {
    if (value instanceof Date) return rfc3339(value)
    const parsed = value == null || value === '' ? null : new Date(String(value))
    return parsed !== null && Number.isFinite(parsed.getTime()) ? rfc3339(parsed) : rfc3339(new Date())
  }
  return {
    id,
    name: text(source.name),
    enabled: Boolean(source.enabled),
    priority: Number(source.priority ?? 0) || 0,
    match_target: text(source.match_target, 'tool_input'),
    match_type: text(source.match_type, 'string'),
    pattern: text(source.pattern),
    action: text(source.action, 'deny'),
    message: text(source.message),
    timeout_enabled: Boolean(source.timeout_enabled),
    timeout_seconds: Number(source.timeout_seconds ?? 0) || 0,
    timeout_action: text(source.timeout_action, 'deny'),
    created_at: stamp(source.created_at),
    updated_at: stamp(source.updated_at)
  }
}

/**
 * 找 config.json。
 *
 * 单机 core 里它就是仓库根的那份；在 dsh 宿主里跑的是打包后的 core-embedded.js，
 * 相对路径不再指仓库，所以再从工作目录向上找——`dsh` 通常从 `app/` 起，往上一级
 * 就是仓库根。都没有时返回 null，由调用方退回内置种子。
 */
function findConfig(): string | null {
  const explicit = process.env.VEXNAR_CONFIG
  if (explicit && existsSync(explicit)) return resolve(explicit)
  const candidates: string[] = []
  let dir = process.cwd()
  for (let depth = 0; depth < 6; depth += 1) {
    candidates.push(join(dir, 'config.json'))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  candidates.push(join(dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'config.json'))
  return candidates.find((path) => existsSync(path)) ?? null
}

/**
 * 从 PostgreSQL 读原来的规则。表不存在、库连不上、找不到 config.json 都只当作
 * 「没有可迁移的行」，由调用方退回内置种子——迁移不该因为迁移源不可用就把整条
 * API 拖死，更不该让 dsh 宿主因为导入这个模块而起不来。
 */
export async function loadRulesFromPostgres(): Promise<SeedRuleRow[]> {
  const configPath = findConfig()
  if (!configPath) throw new Error('找不到 config.json，无法连接 PostgreSQL')
  const raw = JSON.parse(await readFile(configPath, 'utf8')) as { database?: Record<string, any> }
  const cfg = raw.database ?? {}
  const pg = await import('pg')
  const Client = (pg as any).Client ?? (pg as any).default?.Client
  const client = new Client({
    host: cfg.host ?? '127.0.0.1',
    port: Number(cfg.port ?? 5432),
    user: cfg.user,
    password: cfg.password,
    database: cfg.dbname ?? cfg.database,
    ssl: cfg.sslmode === 'disable' ? false : { rejectUnauthorized: false }
  })
  await client.connect()
  try {
    const result = await client.query(
      `SELECT id, name, enabled, priority, match_target, match_type, pattern, action, message,
              timeout_enabled, timeout_seconds, timeout_action, created_at, updated_at
         FROM intercept_rules
        ORDER BY id`
    )
    return (result.rows as Array<Record<string, any>>).map((row, index) => rowOf(row, Number(row.id) || index + 1))
  } finally {
    await client.end().catch(() => {})
  }
}

/** Go 的内置种子（db/db.go seedDefaultInterceptRules v1+v2+v3），顺序即 id 顺序。 */
const BUILTIN_SEED: Array<Omit<SeedRuleRow, 'id' | 'created_at' | 'updated_at'>> = [
  {
    name: '[内置] 递归强制删除 rm -rf',
    enabled: true,
    priority: 100,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)\\brm\\b.{0,80}(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*|--recursive|--no-preserve-root)',
    action: 'deny',
    message: '禁止执行递归强制删除（rm -rf / rm --recursive），可能永久损坏系统或靶机环境',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 删除系统关键目录',
    enabled: true,
    priority: 100,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '\\brm\\b[^"\\\'\\n]{0,60}["\\\'\\s](/|/etc|/bin|/usr|/boot|/var|/lib|/sys|/proc|/dev|/sbin|/root)',
    action: 'deny',
    message: '禁止删除系统关键路径',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 磁盘格式化 mkfs',
    enabled: true,
    priority: 100,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '\\bmkfs\\b',
    action: 'deny',
    message: '禁止格式化磁盘（mkfs）',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 覆写磁盘设备 dd',
    enabled: true,
    priority: 100,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '\\bdd\\b[^|\\n]{0,100}\\bof=\\s*/dev/[a-zA-Z]',
    action: 'deny',
    message: '禁止使用 dd 覆写磁盘设备',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] Fork 炸弹',
    enabled: true,
    priority: 100,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: ':\\(\\)\\s*\\{[^}]*:\\|:',
    action: 'deny',
    message: '禁止执行 Fork 炸弹',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 关机 / 重启',
    enabled: true,
    priority: 100,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '\\b(?:shutdown|reboot|halt|poweroff|init\\s+[06])\\b',
    action: 'deny',
    message: '禁止执行关机或重启命令',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 杀死全部进程',
    enabled: true,
    priority: 100,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '\\bkill\\s+-9\\s+-1\\b|\\bkillall\\s+-9\\b',
    action: 'deny',
    message: '禁止 kill -9 -1 或 killall -9（杀死所有进程）',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 磁盘擦除 shred / wipe',
    enabled: true,
    priority: 100,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '\\b(?:shred|wipe)\\b[^|\\n]{0,80}/dev/[a-zA-Z]',
    action: 'deny',
    message: '禁止对磁盘设备执行 shred/wipe 擦除',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 清空防火墙规则',
    enabled: true,
    priority: 100,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '\\biptables\\s+(?:-F|--flush)\\b|\\bnft\\s+flush\\s+ruleset\\b',
    action: 'deny',
    message: '禁止清空防火墙规则（iptables -F / nft flush）',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] SQL DROP DATABASE / TABLE / SCHEMA',
    enabled: true,
    priority: 90,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)\\bDROP\\s+(?:DATABASE|TABLE|SCHEMA|INDEX|VIEW|TABLESPACE|USER|ROLE)\\b',
    action: 'deny',
    message: '禁止执行 DROP 操作，可能不可逆地销毁数据库对象',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] SQL TRUNCATE',
    enabled: true,
    priority: 90,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)\\bTRUNCATE\\s+(?:TABLE\\s+)?\\w',
    action: 'deny',
    message: '禁止执行 TRUNCATE，可能清空数据表所有数据',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] MongoDB drop / dropDatabase',
    enabled: true,
    priority: 90,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)\\.(?:dropDatabase|dropCollection|drop)\\s*\\(',
    action: 'deny',
    message: '禁止执行 MongoDB drop 操作',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] Redis FLUSHALL / FLUSHDB',
    enabled: true,
    priority: 90,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)\\b(?:FLUSHALL|FLUSHDB)\\b',
    action: 'deny',
    message: '禁止执行 Redis FLUSHALL / FLUSHDB，可能清空全部缓存数据',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] curl / wget 发送 DELETE 请求',
    enabled: true,
    priority: 80,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)\\bcurl\\b[^|\\n&;"]{0,300}(?:-X\\s*DELETE|--request\\s+DELETE|-XDELETE)|\\bwget\\b[^|\\n&;"]{0,300}--method[=\\s]+DELETE',
    action: 'deny',
    message: '禁止通过 curl/wget 发送 HTTP DELETE 请求，可能删除目标系统数据',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] Python HTTP 客户端 DELETE（requests/httpx/aiohttp）',
    enabled: true,
    priority: 80,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)\\b(?:requests|httpx|aiohttp|urllib\\.request)\\.delete\\s*\\(|session\\.delete\\s*\\(|client\\.delete\\s*\\(',
    action: 'deny',
    message: '禁止使用 Python HTTP 客户端发送 DELETE 请求',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 脚本中声明 HTTP DELETE 方法（JS/通用）',
    enabled: true,
    priority: 80,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)axios\\.delete\\s*\\(|method\\s*[:=]\\s*[\'"]DELETE[\'"]',
    action: 'deny',
    message: '禁止在脚本中声明并发送 HTTP DELETE 请求',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 批量清空 / 清除接口路径',
    enabled: true,
    priority: 80,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)/(?:clear|wipe|flush|purge|truncate|drop|destroy|factory[-_]reset|reset[-_]all)(?:[/?#"\'\\s]|$)',
    action: 'deny',
    message: '禁止调用批量清空或销毁类接口（/clear /wipe /flush /purge 等）',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 破坏性系统命令',
    enabled: true,
    priority: 100,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)\\b(rm\\s+-rf\\s+/|mkfs|dd\\s+if=|:\\(\\)\\s*\\{|shutdown|reboot|>\\s*/dev/sd)',
    action: 'deny',
    message: '破坏性命令被拒绝（rm -rf / / mkfs / dd / fork bomb / 关机重启 / 覆写磁盘设备）',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    // 这条 Go 侧默认关闭：curl/wget/nc 管道在正常渗透的反弹 shell 与传数据时会误伤。
    name: '[内置] 数据外泄管道',
    enabled: false,
    priority: 80,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)(curl|wget|nc|ncat)\\b[^|]*\\b(\\|\\s*(curl|wget|nc))',
    action: 'deny',
    message: '疑似数据外泄管道被拒绝（命令输出经 curl/wget/nc 外传）',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  },
  {
    name: '[内置] 删除类接口路径',
    enabled: true,
    priority: 80,
    match_target: 'tool_input',
    match_type: 'regex',
    pattern: '(?i)/(?:(?:delete|remove|unlink|erase|destroy)[-\\w]*|del)(?:[/?#"\'\\s]|$)',
    action: 'deny',
    message: '禁止调用删除类接口（/delete /remove /unlink /erase 等），不论使用哪种 HTTP 方法——多数应用的删除接口用 GET/POST 就能触发，同样会真实删除目标数据',
    timeout_enabled: false,
    timeout_seconds: 60,
    timeout_action: 'deny'
  }
]

/** 内置种子 → 可直接落库的行（id 1..N，时间为当前）。 */
export function builtinSeedRows(now = new Date()): SeedRuleRow[] {
  const stamp = rfc3339(now)
  return BUILTIN_SEED.map((rule, index) => ({ ...rule, id: index + 1, created_at: stamp, updated_at: stamp }))
}

export interface SeedOutcome {
  seeded: number
  source: 'postgres' | 'builtin' | 'existing' | 'done'
}

async function readTables(): Promise<Record<string, any[] | Record<string, unknown>>> {
  meta.reload()
  return (await meta.load()) as Record<string, any[] | Record<string, unknown>>
}

/**
 * 跑一次迁移。`loadRows` 可注入，测试里不需要真的连 PostgreSQL。
 * 任何一步失败都抛给调用方，由入口决定是否只记日志（迁移不该阻断 API）。
 */
export async function ensureInterceptRulesSeeded(
  loadRows: () => Promise<SeedRuleRow[]> = process.env.VEXNAR_CLIENT_SQLITE === '1'
    ? async () => []
    : loadRulesFromPostgres
): Promise<SeedOutcome> {
  const tables = await readTables()
  const seededAlready = Array.isArray(tables[TABLE_SEED]) && (tables[TABLE_SEED] as any[]).some((row) => row?.key === SEED_KEY)
  if (seededAlready) return { seeded: 0, source: 'done' }

  const existing = Array.isArray(tables[TABLE_RULES]) ? (tables[TABLE_RULES] as any[]) : []
  if (existing.length > 0) {
    // 已经有规则（用户在客户端新建过）：不覆盖，只补标记，避免下次再判一次迁移。
    tables[TABLE_SEED] = [{ key: SEED_KEY, source: 'existing', count: existing.length, at: rfc3339(new Date()) }]
    await meta.save(tables)
    return { seeded: 0, source: 'existing' }
  }

  let rows: SeedRuleRow[] = []
  let source: 'postgres' | 'builtin' = 'postgres'
  try {
    rows = await loadRows()
  } catch (error) {
    console.warn('[vexnar] 拦截规则迁移：PostgreSQL 不可读，改用内置种子', error)
    rows = []
  }
  if (rows.length === 0) {
    rows = builtinSeedRows()
    source = 'builtin'
  }

  tables[TABLE_RULES] = rows
  tables[TABLE_SEED] = [{ key: SEED_KEY, source, count: rows.length, at: rfc3339(new Date()) }]
  await meta.save(tables)
  return { seeded: rows.length, source }
}

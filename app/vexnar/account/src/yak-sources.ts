// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Yak 流量来源配置：每个工作区绑定一个本地 Yak 内核 socket 与项目。
// 配置落在 VEXNAR_YAK_HISTORY_CONFIG，未设置时落在 VEXNAR_HOME/yak-history.json。
// 该文件只保存路径与项目号，不保存内核令牌；令牌仍由 Yak 以 0600 文件放在私有目录。
import { chmod, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, normalize } from 'node:path'

export interface YakSourceRow {
  name: string
  workspace: string
  socket: string
  token_file: string
  project_id: number
}

function fields(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function yakHistoryConfigPath(): string {
  const configured = String(process.env.VEXNAR_YAK_HISTORY_CONFIG ?? '').trim()
  if (configured) return configured
  const home = String(process.env.VEXNAR_HOME ?? '').trim() ||
    String(process.env.DSH_HOME ?? '').trim() ||
    join(homedir(), '.vexnar')
  return join(home, 'yak-history.json')
}

async function canonical(path: string): Promise<string> {
  return realpath(path).catch(() => normalize(path))
}

/** Validate one source row; throws a Chinese message the UI can show directly. */
async function normalizeRow(value: unknown): Promise<YakSourceRow> {
  const row = fields(value)
  if (!row) throw new Error('来源必须是对象')
  const name = String(row.name ?? '').trim()
  if (!name) throw new Error('来源名称不能为空')
  for (const key of ['workspace', 'socket', 'token_file'] as const) {
    if (typeof row[key] !== 'string' || !isAbsolute(row[key] as string)) {
      throw new Error(`${key} 必须是绝对路径`)
    }
  }
  const projectID = Number(row.project_id)
  if (!Number.isSafeInteger(projectID) || projectID <= 0) throw new Error('project_id 必须是正整数')
  return {
    name,
    workspace: await canonical(String(row.workspace)),
    socket: await canonical(String(row.socket)),
    token_file: String(row.token_file),
    project_id: projectID
  }
}

export async function readYakSources(): Promise<YakSourceRow[]> {
  const path = yakHistoryConfigPath()
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error('Yak 流量来源配置不可读')
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Yak 流量来源配置不是合法 JSON')
  }
  if (!Array.isArray(raw)) throw new Error('Yak 流量来源配置必须是数组')
  const rows: YakSourceRow[] = []
  for (const item of raw) rows.push(await normalizeRow(item))
  if (new Set(rows.map(row => row.name)).size !== rows.length) throw new Error('来源名称重复')
  if (new Set(rows.map(row => row.socket)).size !== rows.length) throw new Error('来源 socket 重复')
  return rows
}

export async function writeYakSources(input: unknown): Promise<YakSourceRow[]> {
  if (!Array.isArray(input)) throw new Error('sources 必须是数组')
  const rows: YakSourceRow[] = []
  for (const item of input) rows.push(await normalizeRow(item))
  if (new Set(rows.map(row => row.name)).size !== rows.length) throw new Error('来源名称重复')
  if (new Set(rows.map(row => row.socket)).size !== rows.length) throw new Error('来源 socket 重复')
  const path = yakHistoryConfigPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 })
  await chmod(temp, 0o600)
  await rename(temp, path)
  return rows
}

/** GET → current rows; PUT {sources:[...]} → validated replacement. */
export async function handleYakSources(request: Request): Promise<Response> {
  try {
    if (request.method === 'GET') {
      return Response.json({ sources: await readYakSources(), path: yakHistoryConfigPath() }, {
        headers: { 'Cache-Control': 'no-store' }
      })
    }
    if (request.method !== 'PUT') {
      return Response.json({ error: 'method not allowed' }, { status: 405 })
    }
    const body = await request.json().catch(() => undefined)
    const rows = await writeYakSources(fields(body)?.sources)
    return Response.json({ sources: rows, path: yakHistoryConfigPath() }, {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (error) {
    return Response.json({ error: String((error as Error)?.message ?? error) }, {
      status: 400, headers: { 'Cache-Control': 'no-store' }
    })
  }
}

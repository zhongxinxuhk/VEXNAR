// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Client, credentials, Metadata } from '@grpc/grpc-js'
import { constants, readFileSync } from 'node:fs'
import { lstat, open, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, normalize } from 'node:path'
import protobuf from 'protobufjs'
import { readYakSources } from './yak-sources.js'

type Fields = Record<string, unknown>
interface Source {
  name: string
  workspace: string
  socket: string
  tokenFile: string
  projectID: string
}

class HistoryError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

const textKeys = ['action', 'workspace', 'source', 'id', 'url', 'method', 'status', 'content_type',
  'capture_source', 'keyword', 'tag', 'order_by'] as const
type Query = Partial<Record<(typeof textKeys)[number], string>> & {
  page?: number
  ascending?: boolean
  websocket?: boolean
}

const strings = new Set<string>(textKeys)
const sorting = new Set(['id', 'status_code', 'body_length', 'created_at'])
const responseOptions = { headers: { 'Cache-Control': 'no-store' } }
const wireFile = new URL('../lib/yak-history.proto', import.meta.url)
let schema: protobuf.Root | undefined

function fields(value: unknown): Fields | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Fields : undefined
}

function readQuery(value: unknown): Query {
  const body = fields(value)
  if (!body || !Object.entries(body).every(([key, item]) =>
    strings.has(key) ? typeof item === 'string'
      : key === 'page' ? Number.isSafeInteger(item)
        : (key === 'websocket' || key === 'ascending') && typeof item === 'boolean')) {
    throw new HistoryError(400, '无效的流量查询')
  }
  const query = body as Query
  if (query.action !== 'sources' && query.action !== 'list' && query.action !== 'detail') {
    throw new HistoryError(400, '无效的流量操作')
  }
  return query
}

async function boundedFile(path: string, limit: number, privateFile = false): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | (privateFile ? constants.O_NOFOLLOW : 0))
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size > limit || (privateFile && (info.mode & 0o077) !== 0)) {
      throw new Error('Invalid local file')
    }
    const data = Buffer.alloc(limit + 1)
    let offset = 0
    while (offset < data.length) {
      const { bytesRead } = await file.read(data, offset, data.length - offset, null)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    if (offset > limit) throw new Error('Local file exceeds limit')
    return data.subarray(0, offset).toString('utf8')
  } finally {
    await file.close()
  }
}

async function canonical(path: string): Promise<string> {
  return realpath(path).catch(() => normalize(path))
}

async function sources(): Promise<Source[]> {
  try {
    const rows = await readYakSources()
    return rows.map(row => ({
      name: row.name,
      workspace: row.workspace,
      socket: row.socket,
      tokenFile: row.token_file,
      projectID: String(row.project_id)
    }))
  } catch {
    throw new HistoryError(503, 'Yak 流量来源配置不可用')
  }
}

async function sourceOf(rows: Source[], query: Query): Promise<Source> {
  const workspace = query.workspace ? await canonical(query.workspace) : undefined
  const row = workspace
    ? rows.find(item => item.workspace === workspace && (!query.source || item.name === query.source))
    : rows.find(item => item.name === query.source)
  if (!row) {
    throw new HistoryError(409, workspace
      ? '此会话的本地项目没有配置对应的 Yak 流量来源'
      : '请选择已配置的 Yak 流量来源')
  }
  return row
}

async function localToken(source: Source): Promise<string> {
  try {
    const parent = await stat(dirname(source.socket))
    const socket = await lstat(source.socket)
    if (!parent.isDirectory() || (parent.mode & 0o077) !== 0 || !socket.isSocket() || (socket.mode & 0o077) !== 0) {
      throw new Error('Invalid socket')
    }
    const token = (await boundedFile(source.tokenFile, 512, true)).trim()
    if (!token) throw new Error('Empty token')
    return token
  } catch {
    throw new HistoryError(502, 'Yak 私有 socket 或认证文件不可用')
  }
}

function summary(flow: Fields) {
  return {
    id: String(flow.id ?? '0'), url: String(flow.url ?? ''), method: String(flow.method ?? ''),
    status: Number(flow.status_code ?? 0), bytes: Number(flow.body_length ?? 0),
    content_type: String(flow.content_type ?? ''), source: String(flow.source_type ?? ''),
    ip: String(flow.ip_address ?? ''), title: String(flow.title ?? ''), tags: String(flow.tags ?? ''),
    time: Number(flow.created_at ?? 0), websocket: Boolean(flow.is_websocket)
  }
}

function packet(raw: unknown) {
  const payload = raw instanceof Uint8Array ? Buffer.from(raw) : Buffer.alloc(0)
  const preview = payload.subarray(0, 128 << 10)
  return {
    text: preview.toString('utf8'), bytes: payload.length, truncated: preview.length < payload.length,
    ...(preview.length ? { base64: preview.toString('base64') } : {})
  }
}

async function readLocalHistory(source: Source, query: Query) {
  const token = await localToken(source)
  const headers = new Metadata()
  headers.set('authorization', 'Bearer ' + token)
  schema ??= protobuf.parse(readFileSync(wireFile, 'utf8'), { keepCase: true }).root
  const proto = schema
  const conn = new Client('unix:' + source.socket, credentials.createInsecure(), {
    'grpc.max_receive_message_length': 16 << 20,
    'grpc.enable_http_proxy': 0,
    'grpc.enable_retries': 0
  })
  const deadline = Date.now() + 12_000

  const rpc = (method: string, incoming: string, outgoing: string, input: Fields) => new Promise<Fields>((resolve, reject) => {
    const request = proto.lookupType('ypb.' + incoming)
    const response = proto.lookupType('ypb.' + outgoing)
    conn.makeUnaryRequest('/ypb.Yak/' + method,
      data => Buffer.from(request.encode(request.fromObject(data)).finish()),
      data => response.toObject(response.decode(data), { longs: String }),
      input, headers, { deadline }, (error, result) => {
        if (error || !result) reject(new HistoryError(502, 'Yak 流量读取失败，请检查内核版本、连接与项目'))
        else resolve(result)
      })
  })

  async function checkProject() {
    const actual = await rpc('GetCurrentProjectEx', 'GetCurrentProjectExRequest', 'ProjectDescription', { type: 'project' })
    if (String(actual.id) !== source.projectID) throw new HistoryError(409, 'Yak 内核当前项目与流量来源配置不一致')
  }

  try {
    await checkProject()
    if (query.action === 'list') {
      const orderBy = query.order_by && sorting.has(query.order_by) ? query.order_by : 'id'
      const result = await rpc('QueryHTTPFlows', 'QueryHTTPFlowRequest', 'QueryHTTPFlowResponse', {
        pagination: { page: Math.max(1, Math.min(query.page ?? 1, 1_000_000)), limit: 50,
          order_by: orderBy, order: query.ascending ? 'asc' : 'desc' },
        source_type: query.capture_source, methods: query.method, search_url: query.url,
        status_code: query.status, search_content_type: query.content_type, keyword: query.keyword,
        only_websocket: query.websocket, tags: query.tag ? [query.tag] : []
      })
      await checkProject()
      const rows = Array.isArray(result.data) ? result.data : []
      return { rows: rows.map(summary), total: Number(result.total ?? 0), size: 50 }
    }
    if (!query.id || !/^[1-9]\d{0,18}$/.test(query.id) || BigInt(query.id) > 9223372036854775807n) {
      throw new HistoryError(400, '无效的流量记录 ID')
    }
    const flow = await rpc('GetHTTPFlowById', 'GetHTTPFlowByIdRequest', 'HTTPFlow', { id: query.id })
    await checkProject()
    return { flow: summary(flow), request: packet(flow.request), response: packet(flow.response) }
  } finally {
    conn.close()
  }
}

export async function handleYakHistory(request: Request): Promise<Response> {
  try {
    const query = readQuery(await request.json().catch(() => undefined))
    const rows = await sources()
    if (query.action === 'sources') return Response.json({ sources: rows.map(row => row.name) }, responseOptions)
    const payload = await readLocalHistory(await sourceOf(rows, query), query)
    return Response.json(payload, responseOptions)
  } catch (error) {
    return Response.json({ error: error instanceof HistoryError ? error.message : 'Yak 流量读取失败' }, {
      ...responseOptions, status: error instanceof HistoryError ? error.status : 502
    })
  }
}

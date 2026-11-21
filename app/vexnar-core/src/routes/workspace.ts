// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { Hono } from 'hono'
import { storeRoot } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 工作区文件管理：浏览 / 查看 / 编辑 / 下载 / 上传 / 删除共享工作目录
// （storeRoot()/workspace，所有 agent 的产物都写在这里）。所有路径都被约束在
// 工作目录根内（".." 会被 neutralise），语义对齐 server/workspace.go。
// ─────────────────────────────────────────────────────────────────────────────

const maxWorkspaceRead = 2 << 20 // 2 MiB：超过则不内联，改走 download
const maxWorkspaceUpload = 512 << 20 // 512 MiB / 请求

function workspaceRoot(): string {
  return resolve(storeRoot(), 'workspace')
}

// wsResolve 把用户给的相对路径映射到工作目录内的绝对路径；逃逸根则 ok=false。
function wsResolve(rel: unknown): { abs: string; ok: boolean } {
  const base = workspaceRoot()
  const r = String(rel ?? '').trim().replace(/^\/+/, '')
  const clean = resolve('/', r) // "/a/../../etc" → "/etc"（仍锚定在根）
  const abs = resolve(base, `.${clean}`)
  if (abs !== base && !abs.startsWith(base + sep)) return { abs: '', ok: false }
  return { abs, ok: true }
}

// wsRel 把绝对路径还原为工作区相对路径（正斜杠）。
function wsRel(abs: string): string {
  const base = workspaceRoot()
  const rel = relative(base, abs)
  if (!rel || rel.startsWith('..') || resolve(rel) === resolve('/')) return ''
  return rel.split(sep).join('/')
}

function isBinary(data: Buffer): boolean {
  if (data.includes(0)) return true
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data)
    return false
  } catch {
    return true
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/["\\\n\r]/g, '')
}

function errJson(c: any, e: any) {
  return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
}

export function register(api: Hono) {
  // GET /api/workspace/list?path=<rel>
  api.get('/api/workspace/list', async (c) => {
    const { abs, ok } = wsResolve(c.req.query('path'))
    if (!ok) return c.json({ error: '非法路径' }, 400)
    let fi
    try {
      fi = await stat(abs)
    } catch {
      return c.json({ error: '路径不存在' }, 404)
    }
    if (!fi.isDirectory()) return c.json({ error: '不是目录' }, 400)
    let ents
    try {
      ents = await readdir(abs, { withFileTypes: true })
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, 500)
    }
    const out: any[] = []
    for (const entry of ents) {
      let info
      try {
        info = await stat(join(abs, entry.name))
      } catch {
        continue
      }
      out.push({
        name: entry.name,
        path: wsRel(join(abs, entry.name)),
        dir: entry.isDirectory(),
        size: info.size,
        mtime: Math.round(info.mtimeMs)
      })
    }
    // 目录在前，各自按名称排序。
    out.sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0))
    return c.json({ path: wsRel(abs), entries: out })
  })

  // GET /api/workspace/read?path=<rel> — 文本内联；二进制/超限返回 {binary}/{too_large}。
  api.get('/api/workspace/read', async (c) => {
    const { abs, ok } = wsResolve(c.req.query('path'))
    if (!ok) return c.json({ error: '非法路径' }, 400)
    let fi
    try {
      fi = await stat(abs)
    } catch {
      return c.json({ error: '文件不存在' }, 404)
    }
    if (fi.isDirectory()) return c.json({ error: '是目录，不能作为文件读取' }, 400)
    if (fi.size > maxWorkspaceRead) return c.json({ path: wsRel(abs), size: fi.size, too_large: true, binary: true })
    let data: Buffer
    try {
      data = await readFile(abs)
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, 500)
    }
    if (isBinary(data)) return c.json({ path: wsRel(abs), size: fi.size, binary: true })
    return c.json({ path: wsRel(abs), size: fi.size, binary: false, content: data.toString('utf8') })
  })

  // POST /api/workspace/write {path, content} — 创建/覆盖文本文件。
  api.post('/api/workspace/write', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const { abs, ok } = wsResolve(body.path)
    if (!ok || abs === workspaceRoot()) return c.json({ error: '非法路径' }, 400)
    try {
      const fi = await stat(abs).catch(() => null)
      if (fi && fi.isDirectory()) return c.json({ error: '目标是目录' }, 400)
      await mkdir(dirname(abs), { recursive: true, mode: 0o755 })
      await writeFile(abs, String(body.content ?? ''), { mode: 0o644 })
      return c.json({ ok: true, path: wsRel(abs) })
    } catch (e: any) {
      return errJson(c, e)
    }
  })

  // POST /api/workspace/mkdir {path}
  api.post('/api/workspace/mkdir', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const { abs, ok } = wsResolve(body.path)
    if (!ok || abs === workspaceRoot()) return c.json({ error: '非法路径' }, 400)
    try {
      await mkdir(abs, { recursive: true, mode: 0o755 })
      return c.json({ ok: true, path: wsRel(abs) })
    } catch (e: any) {
      return errJson(c, e)
    }
  })

  // POST /api/workspace/upload?path=<dir> — multipart 表单字段 "file"（可多个）。
  api.post('/api/workspace/upload', async (c) => {
    const { abs, ok } = wsResolve(c.req.query('path'))
    if (!ok) return c.json({ error: '非法路径' }, 400)
    const dirFi = await stat(abs).catch(() => null)
    if (!dirFi || !dirFi.isDirectory()) return c.json({ error: '目标目录不存在' }, 400)
    let form
    try {
      form = await c.req.formData()
    } catch (e: any) {
      return c.json({ error: '解析上传失败或超出大小限制：' + String(e?.message ?? e) }, 400)
    }
    // getAll 的静态类型是 FormDataEntryValue[]（string | File）；过滤后按 File 使用。
    const files = form.getAll('file').filter((f): f is File => f != null && typeof f === 'object' && typeof f.arrayBuffer === 'function')
    if (!files.length) return c.json({ error: '缺少上传文件(表单字段 file)' }, 400)
    let saved = 0
    let totalBytes = 0
    for (const f of files) {
      const name = basename(String(f.name ?? ''))
      if (!name || name === '.' || name === '..') continue
      const buf = Buffer.from(await f.arrayBuffer())
      totalBytes += buf.length
      if (totalBytes > maxWorkspaceUpload) return c.json({ error: '上传超出大小限制' }, 400)
      const { abs: dest, ok: okd } = wsResolve(join(wsRel(abs), name))
      if (!okd) continue
      try {
        await writeFile(dest, buf)
        saved++
      } catch (e: any) {
        return c.json({ error: String(e?.message ?? e) }, 500)
      }
    }
    return c.json({ uploaded: saved })
  })

  // GET /api/workspace/download?path=<rel> — 以附件形式流式返回。
  api.get('/api/workspace/download', async (c) => {
    const { abs, ok } = wsResolve(c.req.query('path'))
    if (!ok) return c.json({ error: '非法路径' }, 400)
    let fi
    try {
      fi = await stat(abs)
    } catch {
      return c.json({ error: '文件不存在' }, 404)
    }
    if (fi.isDirectory()) return c.json({ error: '文件不存在' }, 404)
    const name = basename(abs)
    const safe = sanitizeFilename(name)
    return new Response(Readable.toWeb(createReadStream(abs)) as any, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'content-length': String(fi.size)
      }
    })
  })

  // DELETE /api/workspace/delete?path=<rel> — 删除文件或目录树（根不可删）。
  api.delete('/api/workspace/delete', async (c) => {
    const { abs, ok } = wsResolve(c.req.query('path'))
    if (!ok) return c.json({ error: '非法路径' }, 400)
    if (abs === workspaceRoot()) return c.json({ error: '不能删除工作区根目录' }, 400)
    try {
      await stat(abs)
    } catch {
      return c.json({ error: '路径不存在' }, 404)
    }
    try {
      await rm(abs, { recursive: true, force: true })
      return c.json({ ok: true })
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, 500)
    }
  })
}

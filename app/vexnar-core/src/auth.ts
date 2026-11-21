// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import jwt from 'jsonwebtoken'
import type { MiddlewareHandler } from 'hono'
import { repo } from './db.js'
import { trafficIngestAuthorized } from './traffic-key.ts'

const key = readFileSync(join(repo, 'jwt.key'))

/** Service token used when the shared-token caller is proxied to Go. */
export function serviceToken() {
  return jwt.sign({}, key, { algorithm: 'HS256', subject: 'VEXNAR', expiresIn: '5m' })
}

/** Same HS256 contract as the Go service: Bearer header or cookie. */
export const auth: MiddlewareHandler = async (c, next) => {
  // Public: health, and the auth namespace (login/init/status self-guard;
  // change-password verifies the caller's token inside its handler).
  if (c.req.path === '/api/health' || c.req.path.startsWith('/api/auth/')) return next()
  // External capture planes authenticate with the per-launch ingest key, not a
  // browser JWT (Yakit MITM hook / worker sidecar).
  if (c.req.path === '/api/traffic/ingest' && trafficIngestAuthorized(c.req.raw.headers)) return next()
  const shared = process.env.VEXNAR_API_TOKEN || ''
  if (shared && c.req.header('x-vexnar-token') === shared) return next()
  const header = c.req.header('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const cookie = c.req.header('cookie') ?? ''
  const match = cookie.match(/vexnar_token=([^;]+)/)
  const token = bearer || match?.[1] || c.req.query('token') || ''
  try {
    jwt.verify(token, key, { algorithms: ['HS256'] })
  } catch {
    return c.json({ error: 'unauthorized' }, 401)
  }
  return next()
}

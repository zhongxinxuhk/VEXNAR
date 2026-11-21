// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import jwt from 'jsonwebtoken'
import type { MiddlewareHandler } from 'hono'
import { repo } from './db.js'

const key = readFileSync(join(repo, 'jwt.key'))

/** Same HS256 contract as the Go service: Bearer header or cookie. */
export const auth: MiddlewareHandler = async (c, next) => {
  if (c.req.path === '/api/health') return next()
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

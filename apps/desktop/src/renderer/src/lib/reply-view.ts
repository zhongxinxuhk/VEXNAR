// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from 'zod'

const title = z.string().trim().min(1).max(200)
const text = z.string().max(12_000)
const body = z.string().max(65_536)
const value = z.union([text, z.number(), z.boolean(), z.null()])
const change = z.object({ field: title, before: value, after: value })
const schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('artifact'), title, versions: z.array(z.object({ title, body, note: text.optional() })).min(1).max(10) }),
  z.object({ kind: z.literal('diff'), title, before: body, after: body }),
  z.object({ kind: z.literal('diff-table'), title, rows: z.array(change).min(1).max(100) }),
  z.object({ kind: z.literal('structured-data'), title, columns: z.array(title).min(1).max(12), rows: z.array(z.array(value).max(12)).max(100) }),
  z.object({ kind: z.literal('insight'), title, summary: text, metrics: z.array(z.object({ label: title, value })).max(12).optional() }),
  z.object({ kind: z.literal('comparison'), title, left: title, right: title, rows: z.array(change).min(1).max(100) })
])

export type ReplyView = z.infer<typeof schema>

export function parseReplyView(code: string): ReplyView | null {
  if (code.length > 256 * 1024) return null
  try {
    const parsed = schema.safeParse(JSON.parse(code))
    if (!parsed.success) return null
    const view = parsed.data
    if (view.kind === 'structured-data' && view.rows.some((row) => row.length !== view.columns.length)) return null
    return view
  } catch {
    return null
  }
}

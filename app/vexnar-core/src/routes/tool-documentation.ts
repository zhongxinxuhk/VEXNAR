// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Hono } from 'hono'
import { defaultTool } from '../catalog/register.ts'
import { meta } from '../context.ts'

function fields(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function withDescriptions(schema: unknown, descriptions: Record<string, unknown>): unknown {
  const root = fields(schema)
  const properties = fields(root?.properties)
  if (!root || !properties) return schema
  const entries = Object.entries(properties).map(([key, value]) => {
    const property = fields(value)
    if (!property || !Object.hasOwn(descriptions, key)) return [key, value] as const
    const next = { ...property }
    const description = descriptions[key]
    if (typeof description === 'string' && description !== '') next.description = description
    else delete next.description
    return [key, next] as const
  })
  return { ...root, properties: Object.fromEntries(entries) }
}

export function registerToolDocumentation(api: Hono): void {
  api.put('/api/tools/:key/documentation', async (c) => {
    const input = fields(await c.req.json().catch(() => undefined))
    const parameters = fields(input?.parameters)
    if (typeof input?.description !== 'string' || !parameters ||
        Object.keys(input).some(key => key !== 'description' && key !== 'parameters') ||
        Object.values(parameters).some(description => typeof description !== 'string')) {
      return c.json({ error: '工具和参数说明必须是文本' }, 400)
    }
    const description = input.description
    const found = await meta.editBuiltinToolDocumentation(c.req.param('key'), current => ({
      description, schema: withDescriptions(current.schema, parameters)
    }))
    return found ? c.json({ ok: true }) : c.json({ error: '内置工具不存在' }, 404)
  })

  api.post('/api/tools/:key/documentation/reset', async (c) => {
    const key = c.req.param('key')
    const builtin = defaultTool(key)
    if (!builtin) return c.json({ error: '此工具没有预设说明' }, 404)
    const properties = fields(fields(builtin.schema)?.properties) ?? {}
    const descriptions = Object.fromEntries(Object.entries(properties).map(([name, value]) => [
      name, fields(value)?.description
    ]))
    const found = await meta.editBuiltinToolDocumentation(key, current => ({
      description: builtin.description, schema: withDescriptions(current.schema, descriptions)
    }))
    return found ? c.json({ ok: true }) : c.json({ error: '内置工具不存在' }, 404)
  })
}

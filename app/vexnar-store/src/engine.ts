// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Store } from './types.js'
import type { storeOperations } from './operations.js'

export type Complete = (messages: Array<{ role: 'system' | 'user'; content: string }>) => Promise<string>

type Ops = ReturnType<typeof storeOperations>

function parseJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
    throw new Error('模型输出不是 JSON')
  }
}

/**
 * E2 engine slice: planner turns a task goal into intents, a worker claims one
 * intent and executes a bounded tool loop. The model is injected, so the
 * transport (Go loopback gateway) stays outside the engine and tests use a fake.
 */
const claimChains = new Map<string, Promise<unknown>>()

function serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = claimChains.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  claimChains.set(key, run.catch(() => {}))
  return run
}

export function createEngine(store: Store, ops: Ops) {
  async function plan(taskId: string, complete: Complete, maxIntents = 5) {
    const task = await store.tasks.get(taskId)
    if (!task) throw new Error('task 不存在')
    const page = await store.nodes.page({ taskId, page: 1, size: 200, order: 'asc', kinds: ['fact', 'intent'] })
    const root = page.items.find((node: any) => node.kind === 'fact' && node.state === 'origin') ?? page.items.find((node: any) => node.kind === 'fact')
    const existing = page.items.filter((node: any) => node.kind === 'intent').map((node: any) => (typeof node.payload === 'string' ? JSON.parse(node.payload) : node.payload)?.text).filter(Boolean)

    const reply = await complete([
      { role: 'system', content: '你是渗透测试任务的规划者。把目标拆成可独立验证的意图，只输出 JSON：{"intents":[{"text":"...","priority":0}]}。不要重复已有意图。' },
      { role: 'user', content: `任务目标：${task.goal}\n任务描述：${task.description}\n已有意图：${existing.join(' | ') || '无'}\n最多 ${maxIntents} 条。` }
    ])
    const data = parseJson(reply)
    const intents = Array.isArray(data.intents) ? data.intents.slice(0, maxIntents) : []
    const created = []
    for (const intent of intents) {
      const text = String(intent.text ?? '').trim()
      if (!text) continue
      created.push(await ops.addNode(taskId, {
        kind: 'intent',
        payload: { text },
        state: 'open',
        priority: Number(intent.priority ?? 0),
        origin: 'planner',
        parent_id: root ? String(root.id) : undefined,
        rel: 'spawns'
      }))
    }
    await ops.appendActivity(taskId, { kind: 'plan', worker: 'planner', summary: `规划出 ${created.length} 条意图` })
    return created
  }

  async function work(taskId: string, complete: Complete, worker = 'work#1', maxTurns = 4) {
    const claimed = await serialized(taskId, () => ops.claimIntent(taskId, worker))
    if (!claimed) return null
    const intent = typeof claimed.payload === 'string' ? JSON.parse(claimed.payload) : claimed.payload
    const task = await store.tasks.get(taskId)
    const facts: string[] = []
    let lastAsset: number | null = null
    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        const reply = await complete([
          { role: 'system', content: `你是渗透测试执行者。每回合只输出一个 JSON 动作，可用工具：
- add_fact {"text"}
- add_asset {"type","domain","ip","url","port"}
- link_assets {"asset_ids":[...]}
- list_assets {"type"?,"limit"?}
- graph_overview {}
- report_finding {"vulnclass","severity","summary","evidence"}
- finish {"summary"}
只输出 {"tool":"...","args":{...}}，不要解释。` },
          { role: 'user', content: `任务：${task?.goal}\n当前意图：${intent?.text}\n已得事实：${facts.join(' | ') || '无'}` }
        ])
        const action = parseJson(reply)
        if (action.tool === 'finish') {
          await ops.setNodeState(taskId, String(claimed.id), 'done')
          await ops.appendActivity(taskId, { kind: 'intent_done', worker, node_id: String(claimed.id), summary: String(action.args?.summary ?? '') })
          return { intent: Number(claimed.id), state: 'done', summary: String(action.args?.summary ?? '') }
        }
        if (action.tool === 'add_fact') {
          const text = String(action.args?.text ?? '').trim()
          if (!text) throw new Error('add_fact 缺少 text')
          await ops.addNode(taskId, { kind: 'fact', payload: { text }, state: 'confirmed', origin: worker, parent_id: String(claimed.id), rel: 'yields' })
          facts.push(text)
          await ops.appendActivity(taskId, { kind: 'tool_result', worker, tool: 'add_fact', node_id: String(claimed.id), summary: text })
          continue
        }
        if (action.tool === 'list_assets') {
          const page = await store.assets.list({ taskId, type: action.args?.type, limit: Math.min(Number(action.args?.limit ?? 20) || 20, 100), offset: 0 })
          const summary = page.rows.map((asset: any) => `${asset.type}:${asset.domain ?? asset.ip ?? asset.url ?? asset.id}`).join(', ')
          facts.push(summary || 'no assets')
          await ops.appendActivity(taskId, { kind: 'tool_result', worker, tool: 'list_assets', node_id: String(claimed.id), summary: `${page.total} assets` })
          continue
        }
        if (action.tool === 'graph_overview') {
          const overview = await ops.graphOverview(taskId)
          facts.push(`graph ${JSON.stringify(overview.by_kind)} edges=${overview.edges}`)
          await ops.appendActivity(taskId, { kind: 'tool_result', worker, tool: 'graph_overview', node_id: String(claimed.id), summary: JSON.stringify(overview.by_kind) })
          continue
        }
        if (action.tool === 'add_asset') {
          const asset = await ops.addAsset(taskId, action.args ?? {})
          lastAsset = Number(asset.id)
          await ops.appendActivity(taskId, { kind: 'tool_result', worker, tool: 'add_asset', node_id: String(claimed.id), summary: `${asset.type} ${asset.domain ?? asset.ip ?? asset.url ?? asset.id}` })
          continue
        }
        if (action.tool === 'link_assets') {
          const ids = Array.isArray(action.args?.asset_ids) && action.args.asset_ids.length ? action.args.asset_ids : lastAsset ? [lastAsset] : []
          if (!ids.length) throw new Error('link_assets 缺少 asset_ids')
          const linked = await ops.linkAssets(taskId, String(claimed.id), ids)
          await ops.appendActivity(taskId, { kind: 'tool_result', worker, tool: 'link_assets', node_id: String(claimed.id), summary: `linked ${linked.linked}` })
          continue
        }
        if (action.tool === 'report_finding') {
          await ops.reportFinding({ task_id: taskId, intent_id: String(claimed.id), ...action.args, worker })
          await ops.appendActivity(taskId, { kind: 'tool_result', worker, tool: 'report_finding', node_id: String(claimed.id), summary: String(action.args?.summary ?? '') })
          continue
        }
        throw new Error(`未知工具: ${String(action.tool)}`)
      }
      await ops.setNodeState(taskId, String(claimed.id), 'blocked')
      await ops.appendActivity(taskId, { kind: 'intent_blocked', worker, node_id: String(claimed.id), summary: '达到回合上限' })
      return { intent: Number(claimed.id), state: 'blocked' }
    } catch (error: any) {
      await ops.setNodeState(taskId, String(claimed.id), 'blocked').catch(() => {})
      await ops.appendActivity(taskId, { kind: 'intent_blocked', worker, node_id: String(claimed.id), is_error: true, summary: String(error?.message ?? error) })
      return { intent: Number(claimed.id), state: 'blocked', error: String(error?.message ?? error) }
    }
  }

  async function workMany(taskId: string, complete: Complete, workers = 3, maxTurns = 4) {
    const results = await Promise.allSettled(Array.from({ length: Math.max(Number(workers) || 1, 1) }, (_, index) => work(taskId, complete, `work#${index + 1}`, maxTurns)))
    return results.map((result) => result.status === 'fulfilled' ? result.value : { state: 'error', error: String(result.reason) })
  }

  async function retryBlocked(taskId: string, complete: Complete, maxTurns = 4) {
    const reopened = await ops.rerunBlocked(taskId)
    if (!reopened.reopened) return { reopened: 0, results: [] }
    const results = await workMany(taskId, complete, reopened.reopened, maxTurns)
    return { reopened: reopened.reopened, results }
  }

  return { plan, work, workMany, retryBlocked }
}

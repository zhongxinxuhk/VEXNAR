// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Store } from './types.js'
import type { storeOperations } from './operations.js'
import { persistToolResult, runTool } from './tools.js'

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
/** Keep the head and tail of long context so a run cannot grow unbounded. */
export function compact(texts: string[], maxChars = 4000) {
  const joined = texts.join(' | ')
  if (joined.length <= maxChars) return joined
  const head = joined.slice(0, Math.floor(maxChars * 0.3))
  const tail = joined.slice(-Math.floor(maxChars * 0.6))
  return `${head} … [${joined.length - head.length - tail.length} chars compacted] … ${tail}`
}

const claimChains = new Map<string, Promise<unknown>>()

function serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = claimChains.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  claimChains.set(key, run.catch(() => {}))
  return run
}

export function createEngine(store: Store, ops: Ops, options: { runner?: import('./exec.js').Runner } = {}) {
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

  async function work(taskId: string, complete: Complete, worker = 'work#1', maxTurns = 4, options: { isCancelled?: () => boolean; continueOnLimit?: boolean; maxAttempts?: number } = {}) {
    const claimed = await serialized(taskId, () => ops.claimIntent(taskId, worker))
    if (!claimed) return null
    let intent = typeof claimed.payload === 'string' ? JSON.parse(claimed.payload) : claimed.payload
    const memory: string[] = Array.isArray(intent?.memory) ? [...intent.memory] : []
    const task = await store.tasks.get(taskId)
    const facts: string[] = []
    let lastAsset: number | null = null
    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        if (options.isCancelled?.()) {
          await ops.setNodeState(taskId, String(claimed.id), 'stopped').catch(() => {})
          await ops.appendActivity(taskId, { kind: 'intent_stopped', worker, node_id: String(claimed.id), summary: 'cancelled' })
          return { intent: Number(claimed.id), state: 'stopped' }
        }
        const reply = await complete([
          { role: 'system', content: `你是渗透测试执行者。每回合只输出一个 JSON 动作，可用工具：
- add_fact {"text"}
- add_asset {"type","domain","ip","url","port"}
- link_assets {"asset_ids":[...]}
- list_assets {"type"?,"limit"?}
- graph_overview {}
- report_finding {"vulnclass","severity","summary","evidence"}
- run_command {"command","args":[...]}（仅限允许列表）
- run_tool {"name":"nmap|httpx|ffuf|sqlmap","target":"...","extra":{}}（结果自动落资产/发现）
- finish {"summary"}
只输出 {"tool":"...","args":{...}}，不要解释。` },
          { role: 'user', content: `任务：${compact([String(task?.goal ?? '')], 1000)}\n当前意图：${compact([String(intent?.text ?? '')], 1000)}\n已得事实：${compact(facts) || '无'}\n历史记忆：${compact(memory, 2000) || '无'}` }
        ])
        const action = parseJson(reply)
        if (action.tool === 'finish') {
          memory.push(`done: ${String(action.args?.summary ?? '')}`)
          await ops.updateNodePayload(taskId, String(claimed.id), { memory: memory.slice(-5), attempts: 0, worker })
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
        if (action.tool === 'run_tool') {
          if (!options.runner) throw new Error('run_tool 未启用')
          const name = String(action.args?.name ?? '')
          const target = String(action.args?.target ?? '')
          const result = await runTool(options.runner, name as any, target, action.args?.extra ?? {})
          const created = await persistToolResult(ops, taskId, String(claimed.id), name as any, result.parsed, result.stdout)
          await ops.appendActivity(taskId, { kind: 'tool_result', worker, tool: `run_tool:${name}`, node_id: String(claimed.id), summary: `created ${created.length}` })
          facts.push(`${name} ${target} → ${created.length} records`)
          continue
        }
        if (action.tool === 'run_command') {
          if (!options.runner) throw new Error('run_command 未启用')
          const result = await options.runner.run(String(action.args?.command ?? ''), Array.isArray(action.args?.args) ? action.args.args.map(String) : [], { timeoutMs: Number(action.args?.timeout_ms ?? 30000) })
          const text = `$ ${result.command} ${result.args.join(' ')} → code=${result.code} ${result.truncated ? '[truncated]' : ''}\n${result.stdout.slice(0, 4000)}${result.stderr ? `\n${result.stderr.slice(0, 2000)}` : ''}`
          await ops.addNode(taskId, { kind: 'fact', payload: { text, command: result.command, code: result.code }, state: 'confirmed', origin: worker, parent_id: String(claimed.id), rel: 'yields' })
          await ops.appendActivity(taskId, { kind: 'tool_result', worker, tool: 'run_command', node_id: String(claimed.id), is_error: result.code !== 0, summary: `${result.command} code=${result.code}` })
          facts.push(text.slice(0, 500))
          continue
        }
        if (action.tool === 'report_finding') {
          await ops.reportFinding({ task_id: taskId, intent_id: String(claimed.id), ...action.args, worker })
          await ops.appendActivity(taskId, { kind: 'tool_result', worker, tool: 'report_finding', node_id: String(claimed.id), summary: String(action.args?.summary ?? '') })
          continue
        }
        throw new Error(`未知工具: ${String(action.tool)}`)
      }
      if (options.continueOnLimit === false) {
        await ops.setNodeState(taskId, String(claimed.id), 'blocked')
        await ops.appendActivity(taskId, { kind: 'intent_blocked', worker, node_id: String(claimed.id), summary: '达到回合上限' })
        return { intent: Number(claimed.id), state: 'blocked' }
      }
      memory.push(`yielded after ${maxTurns} turns`)
      await ops.updateNodePayload(taskId, String(claimed.id), { memory: memory.slice(-5), worker })
      await ops.setNodeState(taskId, String(claimed.id), 'open').catch(() => {})
      await ops.appendActivity(taskId, { kind: 'intent_yielded', worker, node_id: String(claimed.id), summary: '回合上限，交回队列续跑' })
      return { intent: Number(claimed.id), state: 'open', yielded: true }
    } catch (error: any) {
      const attempts = Number(intent?.attempts ?? 0) + 1
      const maxAttempts = Math.max(Number(options.maxAttempts ?? 3), 1)
      const message = String(error?.message ?? error)
      memory.push(`error(${attempts}/${maxAttempts}): ${message}`)
      await ops.updateNodePayload(taskId, String(claimed.id), { memory: memory.slice(-5), attempts, worker }).catch(() => {})
      const retry = attempts < maxAttempts
      await ops.setNodeState(taskId, String(claimed.id), retry ? 'open' : 'blocked').catch(() => {})
      await ops.appendActivity(taskId, { kind: retry ? 'intent_retry' : 'intent_blocked', worker, node_id: String(claimed.id), is_error: true, summary: message })
      return { intent: Number(claimed.id), state: retry ? 'open' : 'blocked', attempts, error: message }
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

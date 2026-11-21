// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Scheduler } from './scheduler.js'
import type { Store } from './types.js'
import type { storeOperations } from './operations.js'

type Ops = ReturnType<typeof storeOperations>

export interface TriggerFire {
  trigger: any
  event: string
  message: string
  payload?: unknown
}

const EVENT_FLAGS: Array<[string, string, string]> = [
  ['finding_created', 'on_finding', 'finding_message'],
  ['goal_met', 'on_goal_met', 'goal_message'],
  ['task_timeout', 'on_task_timeout', 'task_timeout_message'],
  ['tool_call', 'on_tool_call', 'tool_call_message'],
  ['task_created', 'on_task_create', 'task_create_message']
]

/** Bind persisted agent triggers to a scheduler; returns a stop function. */
export async function startTriggers(store: Store, scheduler: Scheduler, ops: Ops, agentKey: string, handler: (fire: TriggerFire) => void | Promise<void>) {
  const triggers = (await store.triggers.list(agentKey)).filter((trigger) => trigger.enabled !== false)
  const stops: Array<() => void> = []

  const fire = async (trigger: any, event: string, message: string, payload?: unknown) => {
    await handler({ trigger, event, message: String(message ?? ''), payload })
    await ops.updateTrigger(agentKey, String(trigger.id), { last_fire: new Date().toISOString() }).catch(() => {})
  }

  for (const trigger of triggers) {
    if (Number(trigger.interval_sec) > 0) {
      stops.push(scheduler.every(Number(trigger.interval_sec) * 1000, () => fire(trigger, 'interval', trigger.interval_message)))
    }
    for (const [event, flag, messageKey] of EVENT_FLAGS) {
      if (!trigger[flag]) continue
      const off = scheduler.on(event, async (payload: any) => {
        if (event === 'tool_call' && Array.isArray(trigger.tool_names) && trigger.tool_names.length && !trigger.tool_names.includes(payload?.tool)) return
        await fire(trigger, event, trigger[messageKey], payload)
      })
      stops.push(off)
    }
  }

  return () => { for (const stop of stops) stop() }
}

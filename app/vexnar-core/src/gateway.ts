// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Model transport for the engine — a function call, not an endpoint.
 *
 * The engine runs inside the dsh process next to the account plugin that owns
 * the provider catalog, so a loopback HTTP gateway in between bought nothing
 * and cost a listening port on every launch. The host plugin installs the
 * completion here at startup (`setModelCompletion`), and the engine calls it
 * directly: no URL, no token, no socket.
 *
 * Nothing is registered until the user signs in, which is exactly the "model
 * channel not ready" state the engine must treat as "do not start planning".
 */

/** One chat message the engine hands to the model. */
export interface ChatMessage {
  role: string
  content: string
}

/**
 * Complete one chat turn in-process.
 * @param messages - the conversation so far.
 * @returns the assistant text.
 */
export type ModelCompletion = (messages: readonly ChatMessage[]) => Promise<string>

let completion: ModelCompletion | undefined

/**
 * Install (or clear) the in-process model channel.
 * @param next - the completion the host plugin owns, or undefined on sign-out.
 */
export function setModelCompletion(next: ModelCompletion | undefined): void {
  completion = next
}

/** Whether a model channel is installed; the engine only plans when it is. */
export function modelCompletionReady(): boolean {
  return completion !== undefined
}

/**
 * Complete one chat turn through the installed channel.
 * @param messages - the conversation so far.
 * @returns the assistant text.
 * @throws a 503-shaped error while no channel is installed.
 */
export async function gatewayComplete(messages: readonly ChatMessage[]): Promise<string> {
  if (completion === undefined) {
    throw Object.assign(new Error('模型通道未就绪：请先登录 VEXNAR'), { status: 503 })
  }
  return await completion(messages)
}

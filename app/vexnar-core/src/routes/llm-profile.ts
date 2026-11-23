// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * LLM 配置行的对外 DTO 与重试规则裁剪（对齐 Go `server/dto.go` 的
 * `llmProfileDTO` 与 `db/llmretry.go` 的 clamp 语义）。
 *
 * `GET /api/llm/profiles` 有两个宿主：完整 core 与设置产物
 * （`settings-embedded.js`）都由 `registerSettingsCatalog` 提供这一条。DTO 只留
 * 一份，两边就不会各自演化——旧版 core 里 `llm.ts` 也注册了一份 GET，被先注册
 * 的目录版遮蔽，脱敏（不返回 `api_key`）从未生效。`llm.ts` 的写接口继续复用
 * 这里的 `profileDTO`，保证读写同一契约。
 */

const MAX_RETRY_ATTEMPTS = 20
const MAX_RETRY_INTERVAL_MS = 3_600_000

/** 单条重试规则：attempts ∈ [-1, 20]，interval_ms ∈ [0, 3600000]。 */
export function clampRule(rule: any): { attempts: number; interval_ms: number } {
  let attempts = Number(rule?.attempts ?? 0)
  let intervalMs = Number(rule?.interval_ms ?? 0)
  if (!Number.isFinite(attempts)) attempts = 0
  if (attempts < -1) attempts = -1
  if (attempts > MAX_RETRY_ATTEMPTS) attempts = MAX_RETRY_ATTEMPTS
  if (!Number.isFinite(intervalMs)) intervalMs = 0
  if (intervalMs < 0) intervalMs = 0
  if (intervalMs > MAX_RETRY_INTERVAL_MS) intervalMs = MAX_RETRY_INTERVAL_MS
  return { attempts, interval_ms: intervalMs }
}

/** 配置上的三条重试规则（connect / empty / stream）。 */
export function clampOverride(override: any) {
  return { connect: clampRule(override?.connect), empty: clampRule(override?.empty), stream: clampRule(override?.stream) }
}

/** 读一条配置的重试覆盖：对象形态优先，否则退回平铺列。 */
export function readRetryOverride(row: any) {
  if (row?.retry && typeof row.retry === 'object') return clampOverride(row.retry)
  return {
    connect: { attempts: Number(row?.retry_connect_attempts ?? 0), interval_ms: Number(row?.retry_connect_interval_ms ?? 0) },
    empty: { attempts: Number(row?.retry_empty_attempts ?? 0), interval_ms: Number(row?.retry_empty_interval_ms ?? 0) },
    stream: { attempts: Number(row?.retry_stream_attempts ?? 0), interval_ms: Number(row?.retry_stream_interval_ms ?? 0) }
  }
}

/**
 * 配置行的对外形状。
 *
 * 有意不返回 `api_key`：列表接口只给线索（`api_key_hint`），密钥留在 meta 行里，
 * 由写接口与模型通道使用。
 */
export function profileDTO(row: any) {
  const dto: Record<string, any> = {
    id: String(row.id),
    name: String(row.name ?? ''),
    format: String(row.format ?? ''),
    model: String(row.model ?? ''),
    rate_per_second: Number(row.rate_per_second ?? 0),
    rate_per_minute: Number(row.rate_per_minute ?? 0),
    context_window_k: Number(row.context_window_k ?? 0),
    thinking_type: String(row.thinking_type ?? ''),
    reasoning_effort: String(row.reasoning_effort ?? ''),
    is_default: Boolean(row.is_default),
    priority: Number(row.priority ?? 0),
    pool_exclude: Boolean(row.pool_exclude),
    streaming: row.streaming == null ? true : Boolean(row.streaming),
    max_tokens: Number(row.max_tokens ?? 0),
    max_tokens_field: String(row.max_tokens_field ?? ''),
    session_header_key: String(row.session_header_key ?? ''),
    retry: readRetryOverride(row)
  }
  if (row.base_url != null && row.base_url !== '') dto.base_url = row.base_url
  if (row.proxy != null && row.proxy !== '') dto.proxy = row.proxy
  if (row.api_key_hint != null && row.api_key_hint !== '') dto.api_key_hint = row.api_key_hint
  return dto
}

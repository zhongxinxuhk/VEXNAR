// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Ingest key for external capture planes (a Yakit MITM hook or, later, the
// vexnar-worker MITM sidecar). They are not browsers and cannot hold a user
// JWT, so this per-launch shared secret authenticates `POST /api/traffic/ingest`.
import { randomBytes, timingSafeEqual } from 'node:crypto'

/** Fixed key via env for tests/deployments; random per process otherwise. */
export const trafficIngestKey =
  String(process.env.VEXNAR_INGEST_KEY ?? '').trim() || randomBytes(24).toString('hex')

/** Constant-time check of the `x-vexnar-ingest-key` header. */
export function trafficIngestAuthorized(headers: Headers): boolean {
  const got = Buffer.from(String(headers.get('x-vexnar-ingest-key') ?? '').trim())
  const want = Buffer.from(trafficIngestKey)
  if (!got.length || got.length !== want.length) return false
  return timingSafeEqual(got, want)
}

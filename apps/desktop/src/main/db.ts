// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import type {
  Message,
  MessageAppendInput,
  Session,
  SessionCreateInput
} from '@shared/contracts'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) throw new Error('数据库尚未初始化')
  return pool
}

export async function initDb(dsn: string): Promise<void> {
  if (pool) await pool.end()
  const next = new Pool({
    connectionString: dsn,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  })
  next.on('error', (error) => {
    console.error('[db] idle PostgreSQL client error', error)
  })
  await next.query('SELECT 1')
  await next.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace TEXT NOT NULL DEFAULT '',
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

    ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS messages_session_created_idx
      ON messages (session_id, created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  pool = next
}

export async function closeDb(): Promise<void> {
  const current = pool
  pool = null
  if (current) await current.end()
}

type SessionRow = {
  id: string
  title: string
  workspace: string
  pinned: boolean
  created_at: string | number
  updated_at: string | number
}

type MessageRow = {
  id: string
  session_id: string
  role: Message['role']
  content: string
  attachments: Message['attachments']
  tool_calls: Message['toolCalls']
  created_at: string | number
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    workspace: row.workspace,
    pinned: Boolean(row.pinned),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    attachments: row.attachments ?? [],
    toolCalls: row.tool_calls ?? [],
    createdAt: Number(row.created_at)
  }
}

export async function listSessions(): Promise<Session[]> {
  const result = await getPool().query<SessionRow>(
    'SELECT id, title, workspace, pinned, created_at, updated_at FROM sessions ORDER BY pinned DESC, updated_at DESC'
  )
  return result.rows.map(toSession)
}

export async function createSession(
  input: SessionCreateInput
): Promise<Session> {
  const now = Date.now()
  const id = randomUUID()
  const result = await getPool().query<SessionRow>(
    `INSERT INTO sessions (id, title, workspace, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, title, workspace, pinned, created_at, updated_at`,
    [id, input.title, input.workspace, now, now]
  )
  return toSession(result.rows[0])
}

export async function renameSession(
  id: string,
  title: string
): Promise<Session> {
  const result = await getPool().query<SessionRow>(
    `UPDATE sessions SET title = $2, updated_at = $3
     WHERE id = $1
     RETURNING id, title, workspace, pinned, created_at, updated_at`,
    [id, title, Date.now()]
  )
  if (!result.rows[0]) throw new Error('会话不存在')
  return toSession(result.rows[0])
}

export async function setSessionPinned(
  id: string,
  pinned: boolean
): Promise<Session> {
  const result = await getPool().query<SessionRow>(
    `UPDATE sessions SET pinned = $2 WHERE id = $1
     RETURNING id, title, workspace, pinned, created_at, updated_at`,
    [id, pinned]
  )
  if (!result.rows[0]) throw new Error('会话不存在')
  return toSession(result.rows[0])
}

export async function removeSession(id: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE id = $1', [id])
}

export async function listMessages(sessionId: string): Promise<Message[]> {
  const result = await getPool().query<MessageRow>(
    `SELECT id, session_id, role, content, attachments, tool_calls, created_at
     FROM messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  )
  return result.rows.map(toMessage)
}

export async function appendMessage(
  input: MessageAppendInput
): Promise<Message> {
  const now = Date.now()
  const id = randomUUID()
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<MessageRow>(
      `INSERT INTO messages (id, session_id, role, content, created_at, attachments, tool_calls)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       RETURNING id, session_id, role, content, attachments, tool_calls, created_at`,
      [
        id,
        input.sessionId,
        input.role,
        input.content,
        now,
        JSON.stringify(input.attachments ?? []),
        JSON.stringify(input.toolCalls ?? [])
      ]
    )
    await client.query('UPDATE sessions SET updated_at = $2 WHERE id = $1', [
      input.sessionId,
      now
    ])
    await client.query('COMMIT')
    return toMessage(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function readSetting(key: string): Promise<string | null> {
  const result = await getPool().query<{ value: string }>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  )
  return result.rows[0]?.value ?? null
}

export async function writeSetting(key: string, value: string): Promise<void> {
  await getPool().query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  )
}

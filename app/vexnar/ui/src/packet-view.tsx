// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 报文查看器（请求 / 响应成对出现）。
 *
 * 两件事在这里一次做对：
 *
 *   1. **不割裂**：请求与响应是同一个对象的两面，默认并排显示，可切上下；
 *      任何一侧缺失都给出明确占位，而不是留一片空白让人以为"没抓到"。
 *   2. **按词法着色**：起始行、头部名、头部值、Cookie/会话、正文分别取不同颜色，
 *      正文按 JSON/HTML/form/二进制各自分词——这一套 `http-packet.ts` 里已经有了，
 *      之前只有 Yak 那个面板在用，流量页的详情是纯文本，所以同一个产品里两种观感。
 *
 * 行号固定在左侧一列：换行时正文从第二列继续，像编辑器而不是像一段被折断的文本。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  detectBodyKind,
  hexDump,
  packetHeader,
  parseHttpPacket,
  prettyJsonBody,
  tokenizeBodyLine,
  tokenizeHeader,
  tokenizeStartLine,
  type PacketSide,
  type Token
} from './http-packet.ts'

export type Packet = {
  text: string
  base64?: string | undefined
  bytes: number
  truncated: boolean
}

export type PacketFormat = 'pretty' | 'raw' | 'hex'
type HitCounter = { value: number }

/** 把一段文本按搜索词切开，命中处包 <mark>，并给出全篇序号供"上一个/下一个"定位。 */
function splitOnQuery(text: string, query: string, counter: HitCounter): ReactNode {
  if (!query) return text
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  let at = haystack.indexOf(needle)
  if (at < 0) return text
  const parts: ReactNode[] = []
  let cursor = 0
  while (at >= 0) {
    if (at > cursor) parts.push(text.slice(cursor, at))
    const ordinal = counter.value++
    parts.push(
      <mark key={`${at}-${ordinal}`} className="vx-hit" data-match={ordinal}>
        {text.slice(at, at + needle.length)}
      </mark>
    )
    cursor = at + needle.length
    at = haystack.indexOf(needle, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

function Tokens({ tokens, query, counter }: { tokens: Token[]; query: string; counter: HitCounter }): ReactNode {
  return (
    <>
      {tokens.map((token, index) =>
        token.tone ? (
          <span key={index} className={`vx-tone vx-tone--${token.tone}`}>
            {splitOnQuery(token.text, query, counter)}
          </span>
        ) : (
          <span key={index}>{splitOnQuery(token.text, query, counter)}</span>
        )
      )}
    </>
  )
}

/** 一行：行号 + 内容。行号不参与复制（复制走原文），也不参与搜索命中。 */
function Line({ no, tone, children }: { no: number; tone?: 'start' | 'note'; children: ReactNode }): ReactNode {
  return (
    <div className="vx-yak-line" data-tone={tone}>
      <span className="vx-pkt-ln" aria-hidden="true">{no}</span>
      <code>{children}</code>
    </div>
  )
}

/** 报文按四段骨架渲染：起始行、头部、空行、正文。 */
function PacketBody({ packet, side, format, query }: {
  packet: Packet
  side: PacketSide
  format: PacketFormat
  query: string
}): ReactNode {
  if (format === 'hex') {
    const dump = hexDump(atob(packet.base64 ?? ''), 4096)
    return (
      <div className="vx-yak-code">
        {dump.rows.map((row, index) => (
          <Line key={row.offset} no={index + 1}>
            <span className="vx-tone vx-tone--muted">{row.offset}</span>
            {'  '}
            <span className="vx-tone vx-tone--value">{row.hex}</span>
            {'  │'}
            <span className="vx-tone vx-tone--comment">{row.ascii}</span>│
          </Line>
        ))}
      </div>
    )
  }

  const parsed = parseHttpPacket(packet.text)
  const contentType = packetHeader(parsed, 'content-type')
  const kind = detectBodyKind(contentType, parsed.body)
  const pretty = format === 'pretty' ? prettyJsonBody(parsed.body) : null
  const bodyText = pretty ?? parsed.body
  const bodyKind = pretty ? 'json' : kind

  const counter: HitCounter = { value: 0 }
  const rows: ReactNode[] = []
  let no = 0
  if (parsed.startLine) {
    rows.push(
      <Line key="start" no={++no} tone="start">
        <Tokens tokens={tokenizeStartLine(parsed, side)} query={query} counter={counter} />
      </Line>
    )
  }
  for (const header of parsed.headers) {
    rows.push(
      <Line key={`h${no}`} no={++no}>
        <Tokens tokens={tokenizeHeader(header)} query={query} counter={counter} />
      </Line>
    )
  }
  if (parsed.body) {
    rows.push(<div key="sep" className="vx-yak-separator" />)
    // 正文单独包一层：头部与正文在视觉上是两个块，这是"请求头一个颜色、正文一个颜色"
    // 最直接的落地方式——不靠颜色数量，靠块的边界。
    const bodyRows: ReactNode[] = []
    if (bodyKind === 'binary') {
      const dump = hexDump(parsed.body)
      bodyRows.push(
        <div key="note" className="vx-yak-note">
          二进制正文 · {parsed.body.length} B{dump.truncated ? '（仅显示前 512 字节）' : ''}
        </div>
      )
      for (const row of dump.rows) {
        bodyRows.push(
          <Line key={`d${row.offset}`} no={++no}>
            <span className="vx-tone vx-tone--muted">{row.offset}</span>
            {'  '}
            <span className="vx-tone vx-tone--value">{row.hex}</span>
            {'  │'}
            <span className="vx-tone vx-tone--comment">{row.ascii}</span>│
          </Line>
        )
      }
    } else {
      for (const line of bodyText.split('\n')) {
        bodyRows.push(
          <Line key={`b${no}`} no={++no}>
            <Tokens tokens={tokenizeBodyLine(bodyKind, line)} query={query} counter={counter} />
          </Line>
        )
      }
    }
    rows.push(<div key="body" className="vx-pkt-body">{bodyRows}</div>)
  }
  return <div className="vx-yak-code">{rows}</div>
}

export interface PacketPaneProps {
  label: string
  packet: Packet
  side: PacketSide
  /** 这一侧没有采集到报文时显示的说明（不是"空"，而是"没抓到"）。 */
  missing?: string | undefined
  maxHeight?: number | undefined
}

/** 单侧报文面板：搜索、格式切换（美化/原文/HEX）、复制、着色、行号。 */
export function PacketPane({ label, packet, side, missing, maxHeight }: PacketPaneProps): ReactNode {
  const [format, setFormat] = useState<PacketFormat>('pretty')
  const [copied, setCopied] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState(0)
  const [active, setActive] = useState(-1)
  const bodyRef = useRef<HTMLDivElement>(null)

  // 命中数量与当前序号都从渲染结果里数，避免着色/美化切换后和 DOM 对不上。
  useEffect(() => {
    const nodes = bodyRef.current?.querySelectorAll('.vx-hit') ?? []
    setHits(nodes.length)
    setActive(nodes.length > 0 ? 0 : -1)
  }, [query, format, packet])

  useEffect(() => {
    const nodes = bodyRef.current?.querySelectorAll<HTMLElement>('.vx-hit') ?? []
    nodes.forEach((node, index) => node.toggleAttribute('data-active', index === active))
    if (active >= 0) nodes[active]?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [active, hits])

  const step = (delta: number): void => {
    if (hits === 0) return
    setActive((current) => (current + delta + hits) % hits)
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(packet.text)
      setCopied('已复制')
    } catch {
      setCopied('剪贴板不可用')
    }
  }

  const empty = packet.text.trim() === ''

  return (
    <section className="vx-yak-packet" data-side={side} aria-label={label}>
      <header>
        <span className={`vx-yak-chip vx-yak-chip--${side}`}>{side === 'response' ? '响应' : '请求'}</span>
        <strong>{label}</strong>
        <span className="vx-yak-size">{packet.bytes.toLocaleString()} B</span>
        {empty ? null : (
          <span className="vx-yak-search">
            <input
              aria-label={`在${label}里搜索`}
              placeholder="搜索"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  step(event.shiftKey ? -1 : 1)
                }
                if (event.key === 'Escape') setQuery('')
              }}
            />
            <small>{query ? (hits > 0 ? `${active + 1}/${hits}` : '0') : ''}</small>
            <button type="button" aria-label="上一个命中" disabled={hits === 0} onClick={() => step(-1)}>↑</button>
            <button type="button" aria-label="下一个命中" disabled={hits === 0} onClick={() => step(1)}>↓</button>
          </span>
        )}
        {empty ? null : (
          <div className="vx-yak-segmented" role="group" aria-label={`${label}显示格式`}>
            {([['pretty', '美化'], ['raw', '原文'], ['hex', 'HEX']] as const).map(([value, text]) => (
              <button
                key={value}
                type="button"
                aria-pressed={format === value}
                onClick={() => { setFormat(value); setCopied('') }}
              >
                {text}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="vx-yak-copy" onClick={() => void copy()} disabled={empty}>
          {copied || '复制'}
        </button>
      </header>
      <div ref={bodyRef}>
        {empty
          ? <div className="vx-pkt-missing">{missing ?? `这条记录没有${side === 'response' ? '响应' : '请求'}报文`}</div>
          : (
            <div style={maxHeight === undefined ? undefined : { maxHeight }}>
              <PacketBody packet={packet} side={side} format={format} query={query} />
            </div>
          )}
      </div>
      {packet.truncated && <small className="vx-yak-hint">显示前 128 KiB</small>}
    </section>
  )
}

/**
 * 请求 + 响应并排。
 *
 * 默认并排（宽屏下各占一半，直接对照）；窄屏自动叠放，另有手动切换。
 * 两侧共用同一套着色与行号，所以"请求头是什么颜色、正文是什么颜色"在两边一致。
 */
export function PacketPair({ request, response, requestLabel = 'HTTP 请求', responseLabel = 'HTTP 响应' }: {
  request: Packet
  response: Packet
  requestLabel?: string | undefined
  responseLabel?: string | undefined
}): ReactNode {
  const [layout, setLayout] = useState<'split' | 'stack'>('split')
  return (
    <div className="vx-pkt-pair-wrap">
      <div className="vx-pkt-pair-bar">
        <span className="vx-ui-muted">报文对照</span>
        <span className="vx-ui-spacer" />
        <div className="vx-ui-seg" role="group" aria-label="报文布局">
          <button type="button" aria-pressed={layout === 'split'} onClick={() => setLayout('split')}>并排</button>
          <button type="button" aria-pressed={layout === 'stack'} onClick={() => setLayout('stack')}>上下</button>
        </div>
      </div>
      <div className="vx-pkt-pair" data-layout={layout}>
        <PacketPane label={requestLabel} packet={request} side="request" missing="这条记录没有保存请求报文（采集器只收到响应）" />
        <PacketPane label={responseLabel} packet={response} side="response" missing="这条记录没有保存响应报文（请求未完成或已被中断）" />
      </div>
    </div>
  )
}

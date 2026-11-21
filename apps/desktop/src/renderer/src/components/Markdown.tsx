// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ReplyViewCard } from './chat/ReplyViewCard'
import { parseReplyView } from '@/lib/reply-view'
import { memo, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import sqlFns from 'highlight.js/lib/languages/sql'
import { Check, Copy } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function Inline({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code
              key={index}
              className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[0.92em] text-ink"
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <strong key={index} className="font-semibold text-ink">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return <span key={index}>{part}</span>
      })}
    </>
  )
}

// 只注册常用语言，按需加载保持包体积可控
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('python', python)
hljs.registerLanguage('go', go)
hljs.registerLanguage('css', css)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('sql', sqlFns)
hljs.registerLanguage('yaml', yaml)

const LANG_ALIAS: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  py: 'python',
  yml: 'yaml',
  html: 'xml',
  vue: 'xml'
}

function highlight(code: string, language: string): string {
  const name = LANG_ALIAS[language.toLowerCase()] ?? language.toLowerCase()
  if (!name || !hljs.getLanguage(name)) return escapeHtml(code)
  try {
    return hljs.highlight(code, { language: name, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function CodeBlock({ language, code }: { language: string; code: string }): React.JSX.Element {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-line bg-panel/30">
      <div className="flex items-center gap-2 border-b border-line-soft bg-panel/70 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] text-muted hover:bg-panel-3 hover:text-ink"
        >
          {copied ? <Check className="h-3 w-3 text-accent-2" /> : <Copy className="h-3 w-3" />}
          {copied ? t('app.copied') : t('app.copy')}
        </button>
      </div>
      <pre className="hljs max-h-[360px] overflow-auto bg-transparent p-3.5 font-mono text-[11.5px] leading-5 text-ink-soft">
        <code
          className="hljs-code"
          // highlight.js 输出已转义的安全 HTML
          dangerouslySetInnerHTML={{ __html: highlight(code, language) }}
        />
      </pre>
    </div>
  )
}


type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'hr' }
  | { kind: 'table'; head: string[]; rows: string[][] }

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ kind: 'h', level: heading[1].length, text: heading[2] })
      i += 1
      continue
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      blocks.push({ kind: 'hr' })
      i += 1
      continue
    }
    // 表格：表头 + 分隔行
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]*-[\s|:-]*$/.test(lines[i + 1])) {
      const head = splitRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      blocks.push({ kind: 'table', head, rows })
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ kind: 'quote', lines: quoted })
      continue
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i += 1
      }
      blocks.push({ kind: 'ul', items })
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i += 1
      }
      blocks.push({ kind: 'ol', items })
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !lines[i].includes('|')
    ) {
      para.push(lines[i])
      i += 1
    }
    blocks.push({ kind: 'p', lines: para })
  }
  return blocks
}

function BlockView({ block }: { block: Block }): React.JSX.Element | null {
  switch (block.kind) {
    case 'h': {
      const size =
        block.level === 1
          ? 'text-[17px] font-semibold'
          : block.level === 2
            ? 'text-[15px] font-semibold'
            : 'text-[13.5px] font-semibold'
      return (
        <div className={cn('mt-4 mb-1.5 text-ink first:mt-0', size)}>
          <Inline text={block.text} />
        </div>
      )
    }
    case 'ul':
      return (
        <ul className="my-2 list-disc space-y-1 pl-5">
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="my-2 list-decimal space-y-1 pl-5">
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline text={item} />
            </li>
          ))}
        </ol>
      )
    case 'quote':
      return (
        <blockquote className="my-2 border-l-2 border-line pl-3 text-muted">
          {block.lines.map((line, index) => (
            <div key={index}>
              <Inline text={line} />
            </div>
          ))}
        </blockquote>
      )
    case 'hr':
      return <hr className="my-4 border-line-soft" />
    case 'table':
      return (
        <div className="my-3 overflow-x-auto rounded-xl border border-line-soft">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-panel/60">
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index} className="border-b border-line-soft px-3 py-1.5 text-left font-medium text-ink">
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-line-soft last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-1.5 align-top text-ink-soft">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'p':
      return (
        <p className="my-1.5 whitespace-pre-wrap break-words leading-6 first:mt-0 last:mb-0">
          <Inline text={block.lines.join('\n')} />
        </p>
      )
    default:
      return null
  }
}


/**
 * Small, dependency-free Markdown renderer for agent messages.
 * It intentionally handles only fenced code, inline code and bold text so the
 * transcript stays readable without shipping a full Markdown pipeline.
 */
export const Markdown = memo(function Markdown({
  content,
  className,
  replyViews = false
}: {
  content: string
  /** 仅用于承载展示态（如流式光标 .answer-streaming），不参与解析。 */
  className?: string
  replyViews?: boolean
}): React.JSX.Element {
  const segments = content.split('```')
  return (
    <div className={cn('min-w-0', className)}>
      {segments.map((segment, index) => {
        if (index % 2 === 1) {
          const newline = segment.indexOf('\n')
          const language = (newline >= 0 ? segment.slice(0, newline) : '').trim()
          const code = newline >= 0 ? segment.slice(newline + 1) : segment
          if (replyViews && language === 'vexnar-view' && index < segments.length - 1) {
            const view = parseReplyView(code)
            if (view) return <ReplyViewCard key={index} view={view} render={(body) => <Markdown content={body} />} />
          }
          return <CodeBlock key={index} language={language} code={code.replace(/\n$/, '')} />
        }
        if (!segment) return null
        return (
          <div key={index} className="min-w-0">
            {parseBlocks(segment).map((block, blockIndex) => (
              <BlockView key={blockIndex} block={block} />
            ))}
          </div>
        )
      })}
    </div>
  )
})

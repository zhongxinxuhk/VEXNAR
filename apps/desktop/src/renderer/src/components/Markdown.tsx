// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
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

/**
 * Small, dependency-free Markdown renderer for agent messages.
 * It intentionally handles only fenced code, inline code and bold text so the
 * transcript stays readable without shipping a full Markdown pipeline.
 */
export function Markdown({ content }: { content: string }): React.JSX.Element {
  const segments = content.split('```')
  return (
    <div className="min-w-0">
      {segments.map((segment, index) => {
        if (index % 2 === 1) {
          const newline = segment.indexOf('\n')
          const language = (newline >= 0 ? segment.slice(0, newline) : '').trim()
          const code = newline >= 0 ? segment.slice(newline + 1) : segment
          return <CodeBlock key={index} language={language} code={code.replace(/\n$/, '')} />
        }
        if (!segment) return null
        return (
          <div key={index} className={cn('whitespace-pre-wrap break-words leading-6')}>
            <Inline text={segment} />
          </div>
        )
      })}
    </div>
  )
}

import { useState } from 'react'
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
              className="rounded border border-line bg-panel-2 px-1 py-0.5 font-mono text-[0.92em] text-accent-2"
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

function CodeBlock({ language, code }: { language: string; code: string }): React.JSX.Element {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-line bg-bg">
      <div className="flex items-center gap-2 border-b border-line-soft bg-panel-2/60 px-3 py-1.5">
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
      <pre className="max-h-[360px] overflow-auto p-3.5 font-mono text-[11.5px] leading-5 text-ink-soft">
        <code>{code}</code>
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

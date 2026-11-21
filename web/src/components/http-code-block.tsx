"use client";

import { ArrowDownLeftIcon, ArrowUpRightIcon, BracesIcon, CheckIcon, CopyIcon, WrapTextIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type BodyKind,
  detectBodyKind,
  hexDump,
  methodTextTone,
  type PacketSide,
  packetBytes,
  packetHeader,
  parseHttpPacket,
  prettyJsonBody,
  type SyntaxTone,
  statusTone,
  type Token,
  tokenizeBodyLine,
  tokenizeHeader,
  tokenizeStartLine,
} from "@/lib/http-packet";
import { cn, copyText } from "@/lib/utils";

/** token 语义 → 颜色。请求行、头部、正文各有一套，和 Burp 的分段感一致。 */
const TONE_CLASS: Record<SyntaxTone, string> = {
  method: "font-semibold",
  url: "text-cyan-700 dark:text-cyan-300",
  "query-key": "text-teal-700 dark:text-teal-300",
  "query-value": "text-emerald-700 dark:text-emerald-300",
  proto: "text-muted-foreground",
  status: "font-semibold",
  reason: "text-muted-foreground",
  header: "font-medium text-indigo-700 dark:text-indigo-300",
  value: "text-slate-600 dark:text-slate-300",
  "cookie-key": "text-indigo-700 dark:text-indigo-300",
  "cookie-value": "text-slate-600 dark:text-slate-300",
  key: "text-sky-700 dark:text-sky-300",
  string: "text-emerald-700 dark:text-emerald-300",
  number: "text-amber-700 dark:text-amber-300",
  literal: "text-fuchsia-700 dark:text-fuchsia-300",
  tag: "text-rose-700 dark:text-rose-300",
  attr: "text-violet-700 dark:text-violet-300",
  comment: "text-muted-foreground italic",
  punct: "text-slate-400 dark:text-slate-500",
  muted: "text-muted-foreground",
};

const SIDE_META: Record<PacketSide, { label: string; chip: string; icon: typeof ArrowUpRightIcon }> = {
  request: {
    label: "请求",
    chip: "bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300",
    icon: ArrowUpRightIcon,
  },
  response: {
    label: "响应",
    chip: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
    icon: ArrowDownLeftIcon,
  },
  unknown: {
    label: "报文",
    chip: "bg-muted text-muted-foreground ring-border",
    icon: ArrowUpRightIcon,
  },
};

/** 单页最多渲染的行数：几十 KB 的响应一次全画会拖慢抽屉。 */
const MAX_ROWS = 2000;

type PacketRow =
  | { kind: "start"; tokens: Token[] }
  | { kind: "header"; tokens: Token[] }
  | { kind: "separator" }
  | { kind: "body"; tokens: Token[] }
  | { kind: "note"; text: string };

function TokenRun({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        // 起始行里的方法和状态码要按自身取值上色，而不是整份 token 表固定一种色。
        if (token.tone === "method") {
          return (
            <span key={index} className={cn(TONE_CLASS.method, methodTextTone(token.text))}>
              {token.text}
            </span>
          );
        }
        if (token.tone === "status") {
          return (
            <span key={index} className={cn(TONE_CLASS.status, statusTone(Number(token.text)))}>
              {token.text}
            </span>
          );
        }
        if (!token.tone) {
          return <React.Fragment key={index}>{token.text}</React.Fragment>;
        }
        return (
          <span key={index} className={TONE_CLASS[token.tone]}>
            {token.text}
          </span>
        );
      })}
    </>
  );
}

function formatBytes(n: number): string {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / 1024 ** i;
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

function buildRows(
  packet: ReturnType<typeof parseHttpPacket>,
  kind: BodyKind,
  bodyText: string,
  side: PacketSide,
): PacketRow[] {
  const rows: PacketRow[] = [];
  if (packet.startLine) rows.push({ kind: "start", tokens: tokenizeStartLine(packet, side) });
  for (const header of packet.headers) rows.push({ kind: "header", tokens: tokenizeHeader(header) });
  if (!packet.body) return rows;

  rows.push({ kind: "separator" });
  if (kind === "binary") {
    const dump = hexDump(packet.body);
    rows.push({
      kind: "note",
      text: `二进制正文 · ${formatBytes(packetBytes(packet.body))}${dump.truncated ? "（仅显示前 512 字节）" : ""}`,
    });
    for (const row of dump.rows) {
      rows.push({
        kind: "body",
        tokens: [
          { text: row.offset, tone: "muted" },
          { text: "  " },
          { text: row.hex, tone: "value" },
          { text: "  │" },
          { text: row.ascii, tone: "comment" },
          { text: "│" },
        ],
      });
    }
    return rows;
  }
  for (const line of bodyText.split("\n")) rows.push({ kind: "body", tokens: tokenizeBodyLine(kind, line) });
  return rows;
}

export function HttpCodeBlock({
  raw,
  contentType,
  side: forceSide,
  className,
}: {
  raw: string;
  /** 列表里的 content-type；报文自身带 content-type 时以报文为准。 */
  contentType?: string;
  /** 调用方已知这条报文属于请求还是响应时直接指定，起始行畸形也不会认错。 */
  side?: PacketSide;
  className?: string;
}) {
  const [wrapLines, setWrapLines] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [pretty, setPretty] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);

  const packet = React.useMemo(() => parseHttpPacket(raw), [raw]);
  const effectiveType = packetHeader(packet, "content-type") || contentType || "";
  const kind = React.useMemo(() => detectBodyKind(effectiveType, packet.body), [effectiveType, packet.body]);
  const prettyBody = React.useMemo(() => (kind === "json" ? prettyJsonBody(packet.body) : null), [kind, packet.body]);
  const bodyText = pretty && prettyBody ? prettyBody : packet.body;

  const side: PacketSide = forceSide ?? packet.side;
  const rows = React.useMemo(() => buildRows(packet, kind, bodyText, side), [packet, kind, bodyText, side]);
  const visibleRows = expanded ? rows : rows.slice(0, MAX_ROWS);
  const hiddenRows = rows.length - visibleRows.length;

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  // 换一条报文时收起「显示全部」，避免上一条的展开状态串到下一条。
  React.useEffect(() => setExpanded(false), [raw]);

  const copyPacket = async () => {
    const ok = await copyText(packet.raw);
    if (ok) {
      setCopied(true);
      return;
    }
    toast.error("复制失败，请使用 Ctrl/Cmd+A 后复制");
  };

  const sideMeta = SIDE_META[side];
  const SideIcon = sideMeta.icon;
  const empty = !raw.trim();

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card shadow-xs", className)}>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-2 py-1.5">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
            sideMeta.chip,
          )}
        >
          <SideIcon className="size-3" />
          {sideMeta.label}
        </span>
        {effectiveType ? (
          <span className="hidden shrink-0 rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            {effectiveType}
          </span>
        ) : null}
        <span className="truncate text-[11px] text-muted-foreground tabular-nums">
          {packet.headers.length} 个头部 · {rows.length} 行 · {formatBytes(packetBytes(packet.raw))}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {prettyBody ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={pretty ? "显示原始正文" : "格式化 JSON 正文"}
                  aria-pressed={pretty}
                  onClick={() => setPretty((current) => !current)}
                  className={cn(pretty && "bg-accent text-accent-foreground")}
                >
                  <BracesIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{pretty ? "显示原始正文" : "格式化 JSON 正文"}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={wrapLines ? "关闭自动换行" : "开启自动换行"}
                aria-pressed={wrapLines}
                onClick={() => setWrapLines((current) => !current)}
                className={cn(wrapLines && "bg-accent text-accent-foreground")}
              >
                <WrapTextIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{wrapLines ? "关闭自动换行" : "开启自动换行"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={copied ? "已复制报文" : "复制报文"}
                onClick={() => void copyPacket()}
              >
                {copied ? <CheckIcon className="text-emerald-600" /> : <CopyIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{copied ? "已复制" : "复制报文"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {empty ? (
        <div className="px-3 py-8 text-center font-mono text-xs text-muted-foreground">（空报文）</div>
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: textarea 无法同时保留行号与语法着色。
        <div
          role="textbox"
          aria-label="HTTP 报文代码"
          aria-multiline="true"
          aria-readonly="true"
          tabIndex={0}
          className="max-h-[calc(100vh-17rem)] min-w-0 overflow-auto bg-card py-2 font-mono text-xs leading-[1.7] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onKeyDown={(event) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a") return;
            event.preventDefault();
            const selection = window.getSelection();
            if (!selection) return;
            const range = document.createRange();
            range.selectNodeContents(event.currentTarget);
            selection.removeAllRanges();
            selection.addRange(range);
          }}
        >
          {visibleRows.map((row, index) => (
            <div
              key={index}
              data-line={index + 1}
              className={cn(
                "grid grid-cols-[3.25rem_minmax(0,1fr)]",
                "before:sticky before:left-0 before:z-10 before:self-stretch before:border-r before:border-border/50 before:bg-card before:px-2 before:text-right before:text-[10px] before:text-muted-foreground/45 before:content-[attr(data-line)]",
                row.kind === "start" && "bg-muted/40",
                row.kind === "note" && "bg-amber-500/5",
                row.kind !== "start" && row.kind !== "separator" && "hover:bg-accent/40",
              )}
            >
              {row.kind === "separator" ? (
                <div className="col-start-2 my-1 border-t border-dashed border-border/70" />
              ) : row.kind === "note" ? (
                <code className="col-start-2 pr-4 text-[11px] text-muted-foreground">{row.text}</code>
              ) : (
                <code
                  className={cn(
                    "min-w-0 pr-6 pl-1.5 [tab-size:2]",
                    wrapLines ? "break-words whitespace-pre-wrap" : "whitespace-pre",
                  )}
                >
                  <TokenRun tokens={row.tokens} />
                </code>
              )}
            </div>
          ))}
          {hiddenRows > 0 ? (
            <div className="px-3 py-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setExpanded(true)}>
                显示其余 {hiddenRows} 行
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

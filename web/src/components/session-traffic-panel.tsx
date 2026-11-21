// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import * as React from "react";

import {
  ArrowUpRightIcon,
  CircleStopIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PlayIcon,
  RadioIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { HttpCodeBlock } from "@/components/http-code-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionTrafficState } from "@/hooks/use-session-traffic";
import { api } from "@/lib/api";
import type { ConversationTrafficFlow, TrafficDetail } from "@/lib/types";
import { cn, copyText } from "@/lib/utils";

function fmtBytes(n: number): string {
  if (!n) return "0B";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function fmtTime(ts: number): string {
  if (!ts) return "--:--:--";
  return new Date(ts * 1000).toLocaleTimeString([], { hour12: false });
}

function statusTone(status: number): string {
  if (status >= 500) return "text-red-500";
  if (status >= 400) return "text-amber-500";
  if (status >= 300) return "text-blue-500";
  if (status >= 200) return "text-emerald-500";
  return "text-muted-foreground";
}

function methodTone(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-muted-foreground";
    case "POST":
      return "text-blue-500";
    case "PUT":
    case "PATCH":
      return "text-amber-500";
    case "DELETE":
      return "text-red-500";
    default:
      return "text-foreground";
  }
}

function pathOf(flow: ConversationTrafficFlow): string {
  try {
    const u = new URL(flow.url);
    return u.pathname + u.search;
  } catch {
    return flow.url || flow.url_template || "/";
  }
}

// toCurl rebuilds a copy-ready curl command from the captured raw request.
function toCurl(raw: string, fallbackURL: string): string {
  const lines = raw.replaceAll("\r\n", "\n").split("\n");
  const start = /^([A-Z]+)\s+(\S+)\s+HTTP\//.exec(lines[0] ?? "");
  if (!start) return `curl '${fallbackURL}'`;
  const method = start[1];
  const headers: [string, string][] = [];
  let i = 1;
  for (; i < lines.length && lines[i] !== ""; i++) {
    const idx = lines[i].indexOf(":");
    if (idx > 0) headers.push([lines[i].slice(0, idx).trim(), lines[i].slice(idx + 1).trim()]);
  }
  const body = lines.slice(i + 1).join("\n");
  const host = headers.find(([k]) => k.toLowerCase() === "host")?.[1] ?? "";
  const target = /^https?:\/\//.test(start[2])
    ? start[2]
    : `${fallbackURL.startsWith("https://") ? "https" : "http"}://${host}${start[2]}`;
  const parts = [`curl -X ${method} '${target}'`];
  for (const [k, v] of headers) {
    if (k.toLowerCase() === "host" || k.toLowerCase() === "content-length") continue;
    parts.push(`  -H '${k}: ${v.replaceAll("'", "'\\''")}'`);
  }
  if (body.trim()) parts.push(`  --data-raw '${body.replaceAll("'", "'\\''")}'`);
  return parts.join(" \\\n");
}

export function SessionTrafficPanel({
  convId,
  traffic,
  onClose,
}: {
  convId: number;
  traffic: SessionTrafficState;
  onClose: () => void;
}) {
  const [filter, setFilter] = React.useState<"all" | "failed">("all");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<TrafficDetail | null>(null);
  const [detailErr, setDetailErr] = React.useState("");
  const [detailLoading, setDetailLoading] = React.useState(false);
  const viewport = React.useRef<HTMLDivElement>(null);
  const pinned = React.useRef(true);

  const items = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return traffic.items.filter((f) => {
      if (filter === "failed" && !(f.status >= 400 || f.phase === "error")) return false;
      if (!q) return true;
      return `${f.method} ${f.url}`.toLowerCase().includes(q);
    });
  }, [traffic.items, filter, query]);

  React.useEffect(() => {
    if (pinned.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, []);

  React.useEffect(() => {
    setSelected(null);
    setDetail(null);
  }, []);

  React.useEffect(() => {
    if (!selected) return;
    let active = true;
    setDetailLoading(true);
    setDetailErr("");
    api
      .conversationTrafficExchange(convId, selected)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e: Error) => {
        if (active) setDetailErr(e.message);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [convId, selected]);

  const selectedFlow = items.find((f) => f.id === selected) ?? traffic.items.find((f) => f.id === selected) ?? null;

  const copyCurl = async () => {
    if (!detail || !selectedFlow) return;
    const ok = await copyText(toCurl(detail.req, selectedFlow.url));
    if (ok) toast.success("已复制 cURL");
    else toast.error("复制失败");
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label="本会话流量">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <RadioIcon className={cn("size-4", traffic.connected ? "text-emerald-500" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">本会话流量</p>
          <p className="text-muted-foreground text-xs">
            {traffic.enabled ? "抓包中" : "未发起抓包"} · {traffic.items.length} 条
            {!traffic.connected && traffic.items.length > 0 ? " · 实时已断开，重连中" : ""}
          </p>
        </div>
        <Button
          variant={traffic.enabled ? "ghost" : "secondary"}
          size="sm"
          disabled={traffic.captureBusy}
          onClick={() => {
            if (traffic.captureBusy) return;
            const task = traffic.enabled ? traffic.stopCapture() : traffic.startCapture();
            void task.then(() =>
              toast.success(traffic.enabled ? "已停止抓包" : "已发起抓包，粘贴脚本到 Yakit 后开始回传"),
            );
          }}
        >
          {traffic.captureBusy ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : traffic.enabled ? (
            <CircleStopIcon className="size-3.5" />
          ) : (
            <PlayIcon className="size-3.5" />
          )}
          {traffic.enabled ? "停止抓包" : "发起抓包"}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭流量面板">
          <XIcon />
        </Button>
      </div>

      {traffic.proxy && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">MITM 代理</span>
          <code className="font-mono">{traffic.proxy}</code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void copyText(traffic.proxy).then((ok) =>
                ok ? toast.success("已复制代理地址") : toast.error("复制失败"),
              );
            }}
          >
            <CopyIcon className="size-3.5" /> 复制
          </Button>
          {traffic.caPemUrl && (
            <a className="text-primary underline underline-offset-2" href={traffic.caPemUrl} download>
              下载 CA
            </a>
          )}
          <span className="text-muted-foreground">工具设置 HTTP_PROXY 并信任 CA 即可抓到本会话流量</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <Button variant={filter === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("all")}>
          全部
        </Button>
        <Button variant={filter === "failed" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("failed")}>
          失败
        </Button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="筛选 method / url"
          className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-1"
        />
      </div>

      <div
        ref={viewport}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {traffic.loading && (
          <div className="flex items-center justify-center gap-2 p-6 text-muted-foreground text-sm">
            <Spinner /> 加载中…
          </div>
        )}
        {!traffic.loading && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-muted-foreground text-sm">
            {traffic.enabled ? (
              <span>本会话已发起抓包，还没有回传的请求/响应。</span>
            ) : (
              <span>本会话还没有发起抓包。抓包按会话开启，不会影响其它会话。</span>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {!traffic.enabled && (
                <Button
                  size="sm"
                  disabled={traffic.captureBusy}
                  onClick={() => {
                    void traffic.startCapture().then(() => toast.success("已发起抓包"));
                  }}
                >
                  <PlayIcon className="size-3.5" /> 发起抓包
                </Button>
              )}
              {traffic.hook !== "" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void copyText(traffic.hook).then((ok) =>
                      ok ? toast.success("已复制 Yakit 抓包脚本") : toast.error("复制失败"),
                    );
                  }}
                >
                  <CopyIcon className="size-3.5" /> 复制抓包脚本
                </Button>
              )}
            </div>
            {traffic.hook !== "" && (
              <p className="max-w-[42ch] text-xs leading-relaxed">
                把脚本粘贴到 Yakit（MITM → 热加载）后，过滤到的报文会自动归到本会话
                {traffic.ingestUrl !== "" ? `（回传地址 ${traffic.ingestUrl}）` : ""}。
              </p>
            )}
          </div>
        )}
        {items.map((f) => {
          const pending = f.phase === "request";
          const failed = f.phase === "error";
          return (
            <button
              type="button"
              key={f.id}
              onClick={() => setSelected(f.id)}
              className={cn(
                "flex w-full items-center gap-2 border-b px-3 py-2 text-left text-xs hover:bg-muted/60",
                selected === f.id && "bg-muted",
              )}
            >
              <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{fmtTime(f.ts)}</span>
              <span className={cn("w-11 shrink-0 font-mono font-semibold", methodTone(f.method))}>{f.method}</span>
              <span className="min-w-0 flex-1 truncate font-mono" title={f.url}>
                {pathOf(f)}
              </span>
              {pending ? (
                <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="等待响应" />
              ) : (
                <span className={cn("w-8 shrink-0 text-right tabular-nums", statusTone(f.status))}>
                  {f.status || "-"}
                </span>
              )}
              <span className="w-12 shrink-0 text-right text-muted-foreground tabular-nums">
                {failed ? "失败" : fmtBytes(f.resp_len)}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="flex min-h-0 basis-[46%] flex-col border-t">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={selectedFlow?.url}>
              {selectedFlow ? `${selectedFlow.method} ${selectedFlow.url}` : selected}
            </span>
            {selectedFlow && selectedFlow.phase === "request" && (
              <Badge variant="secondary" className="shrink-0">
                等待响应…
              </Badge>
            )}
            {selectedFlow && selectedFlow.duration_ms > 0 && (
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">{selectedFlow.duration_ms}ms</span>
            )}
            <Button variant="ghost" size="icon-sm" onClick={copyCurl} aria-label="复制 cURL" title="复制 cURL">
              <CopyIcon />
            </Button>
            {selectedFlow && (
              <a
                href={`/function/traffic?host=${encodeURIComponent(selectedFlow.host)}`}
                className="text-muted-foreground hover:text-foreground"
                aria-label="在流量页打开"
                title="在流量页打开"
              >
                <ExternalLinkIcon className="size-4" />
              </a>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => setSelected(null)} aria-label="收起详情">
              <ArrowUpRightIcon className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden border-t">
            {detailLoading && (
              <div className="flex items-center justify-center gap-2 p-6 text-muted-foreground text-sm">
                <Spinner /> 读取报文…
              </div>
            )}
            {detailErr && <p className="p-3 text-destructive text-xs">{detailErr}</p>}
            {detail && !detailLoading && (
              <Tabs defaultValue="request" className="flex h-full min-h-0 flex-col">
                <TabsList className="mx-3 mt-2 w-fit">
                  <TabsTrigger value="request">请求</TabsTrigger>
                  <TabsTrigger value="response">响应</TabsTrigger>
                </TabsList>
                <TabsContent value="request" className="min-h-0 flex-1 overflow-auto px-3 pb-3">
                  <HttpCodeBlock raw={detail.req} />
                </TabsContent>
                <TabsContent value="response" className="min-h-0 flex-1 overflow-auto px-3 pb-3">
                  <HttpCodeBlock raw={detail.resp} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

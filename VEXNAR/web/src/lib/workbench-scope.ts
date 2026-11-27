// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import * as React from "react";

// The three surfaces that describe one task's execution read the same task scope
// from the URL query (`?task=<id>`), so they behave as one workbench: pick a task
// on any of them and the other two open already narrowed to it. The URL is the
// only carrier — it survives a reload, a shared link and a browser back/forward.
export type WorkbenchTab = "tasks" | "findings" | "commands";

export interface WorkbenchTabDef {
  id: WorkbenchTab;
  label: string;
  url: string;
  hint: string;
}

export const WORKBENCH_TABS: readonly WorkbenchTabDef[] = [
  { id: "tasks", label: "任务", url: "/function/tasks", hint: "任务清单与运行状态" },
  { id: "findings", label: "发现", url: "/function/findings", hint: "已确认漏洞与证据" },
  { id: "commands", label: "工具执行", url: "/function/commands", hint: "每一次工具调用与输出" },
];

const SCOPE_PARAM = "task";

// readTaskScope returns the scope currently in the URL, "" when unscoped.
export function readTaskScope(): string {
  if (typeof window === "undefined") return "";
  return (new URLSearchParams(window.location.search).get(SCOPE_PARAM) ?? "").trim();
}

// writeTaskScope mirrors the scope into the address bar with replaceState: tab
// switches and filter changes must not pile up history entries, and a replace
// keeps the browser back button meaning "leave the workbench".
export function writeTaskScope(task: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const next = task.trim();
  if (next) url.searchParams.set(SCOPE_PARAM, next);
  else url.searchParams.delete(SCOPE_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

// workbenchHref builds a tab link that carries the current scope.
export function workbenchHref(tab: WorkbenchTab, task?: string): string {
  const base = WORKBENCH_TABS.find((item) => item.id === tab)?.url ?? "/function/tasks";
  const value = (task ?? "").trim();
  return value ? `${base}?${SCOPE_PARAM}=${encodeURIComponent(value)}` : base;
}

// useWorkbenchScope keeps one page's filter state and the URL scope in step.
// The URL is read once on mount (it is the entry point, not a live source), and
// every later change flows state → URL.
export function useWorkbenchScope(): [string, (next: string) => void] {
  const [scope, setScopeState] = React.useState(() => readTaskScope());

  const setScope = React.useCallback((next: string) => {
    setScopeState(next);
    writeTaskScope(next);
  }, []);

  return [scope, setScope];
}

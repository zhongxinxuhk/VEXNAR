// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import Link from "next/link";

import { ChevronRightIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WORKBENCH_TABS, type WorkbenchTab, workbenchHref } from "@/lib/workbench-scope";
import { cn } from "@/lib/utils";

// WorkbenchTabs is the shared header of 任务 / 发现 / 工具执行. The three pages
// are one surface: the strip carries the task scope across them, so a task
// picked on any of the three narrows the other two instead of being re-typed.
interface WorkbenchTabsProps {
  readonly active: WorkbenchTab;
  readonly scope: string;
  // scopeLabel names the scoped task when the page already knows it (a name beats
  // a bare id). Falls back to #id.
  readonly scopeLabel?: string;
  readonly onClearScope?: () => void;
  readonly className?: string;
}

export function WorkbenchTabs({ active, scope, scopeLabel, onClearScope, className }: WorkbenchTabsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Tabs value={active}>
        <TabsList variant="default">
          {WORKBENCH_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} asChild title={tab.hint}>
              <Link href={workbenchHref(tab.id, scope)} prefetch={false}>
                {tab.label}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {scope ? (
        <span className="flex min-w-0 items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-1 pl-2 text-xs">
          <span className="text-muted-foreground">任务范围</span>
          <span className="max-w-[18rem] truncate font-mono" title={scopeLabel ?? `#${scope}`}>
            {scopeLabel ?? `#${scope}`}
          </span>
          {onClearScope && (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="清除任务范围"
              title="清除任务范围"
              onClick={onClearScope}
            >
              <XIcon />
            </Button>
          )}
        </span>
      ) : (
        <span className="hidden items-center gap-1 text-muted-foreground text-xs sm:flex">
          任选任务
          <ChevronRightIcon className="size-3" aria-hidden="true" />
          在三个视图间保持同一任务范围
        </span>
      )}
    </div>
  );
}

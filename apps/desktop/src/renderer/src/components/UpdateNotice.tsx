// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { ArrowDownToLine, Loader2, RotateCw, AlertCircle } from 'lucide-react'
import { useUpdates, updateAction, updateLabel } from '@/store/updates'
import { Button } from './ui'

export function UpdateSubscription(): null {
  useEffect(() => {
    let changed = false
    const unsubscribe = window.vexnar.updates.onChange((state) => {
      changed = true
      useUpdates.getState().set(state)
    })
    void window.vexnar.updates.status().then((result) => {
      if (!changed && result.ok) useUpdates.getState().set(result.data)
    })
    return unsubscribe
  }, [])
  return null
}

export function UpdateDetails(): React.JSX.Element {
  const state = useUpdates((store) => store.state)
  return (
    <div className="space-y-3">
      <div className="font-medium">
        {state.version ? `VEXNAR ${state.version}` : 'VEXNAR 软件更新'}
      </div>
      <p className="text-xs text-muted">
        当前版本 {state.currentVersion || '—'} · GitHub Releases
      </p>
      {state.publishedAt && (
        <p className="text-xs text-muted">
          发布于 {new Date(state.publishedAt).toLocaleDateString()}
        </p>
      )}
      {state.notes && (
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-ink-soft">
          {state.notes.replace(/<[^>]*>/g, '')}
        </div>
      )}
      {state.phase === 'downloading' && (
        <div>
          <progress
            aria-label="更新下载进度"
            max={100}
            value={state.percent}
            className="h-1.5 w-full accent-current"
          />
          <p className="mt-1 text-xs text-muted">
            {Math.floor(state.percent)}% ·{' '}
            {((state.transferred ?? 0) / 1048576).toFixed(1)} /{' '}
            {((state.total ?? 0) / 1048576).toFixed(1)} MB
          </p>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-xs leading-5 text-danger">
          {state.error}
        </p>
      )}
      {state.phase === 'disabled' && (
        <p className="text-xs leading-5 text-muted">
          请在已安装的发行版中检查和安装更新。
        </p>
      )}
      {state.checkedAt && (
        <p className="text-xs text-muted">
          上次检查 {new Date(state.checkedAt).toLocaleString()}
        </p>
      )}
    </div>
  )
}

export function UpdateButton(): React.JSX.Element {
  const state = useUpdates((store) => store.state)
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={['checking', 'downloading', 'installing', 'disabled'].includes(
        state.phase
      )}
      onClick={() =>
        void updateAction(
          state.phase === 'downloaded'
            ? 'install'
            : state.phase === 'available'
              ? 'download'
              : 'check'
        )
      }
    >
      {['checking', 'downloading', 'installing'].includes(state.phase) && (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      )}
      {updateLabel(state)}
    </Button>
  )
}

export function UpdateNotice(): React.JSX.Element | null {
  const state = useUpdates((store) => store.state)
  if (
    !['available', 'downloading', 'downloaded', 'installing', 'error'].includes(
      state.phase
    )
  )
    return null
  const busy = ['downloading', 'installing'].includes(state.phase)
  const Icon = busy
    ? Loader2
    : state.phase === 'downloaded'
      ? RotateCw
      : state.phase === 'error'
        ? AlertCircle
        : ArrowDownToLine
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          aria-label={updateLabel(state)}
          aria-disabled={busy}
          className="no-drag relative grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-panel-3 focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() =>
            !busy && void updateAction(
              state.phase === 'downloaded'
                ? 'install'
                : state.phase === 'error'
                  ? 'check'
                  : 'download'
            )
          }
        >
          <Icon className={`h-[19px] w-[19px] ${busy ? 'animate-spin' : ''}`} />
          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          align="end"
          sideOffset={12}
          className="z-[80] w-80 rounded-2xl border border-line bg-bg p-4 text-ink shadow-xl"
        >
          <UpdateDetails />
          <p className="mt-3 text-xs font-medium">{updateLabel(state)}</p>
          <Tooltip.Arrow className="fill-bg" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

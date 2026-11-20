// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { create } from 'zustand'
import type { UpdateState } from '@shared/api'
import type { IpcResult } from '@shared/contracts'

export const useUpdates = create<{
  state: UpdateState
  set: (state: UpdateState) => void
}>((set) => ({
  state: { phase: 'idle', currentVersion: '', percent: 0 },
  set: (state) => set({ state })
}))

export async function updateAction(
  action: 'check' | 'download' | 'install'
): Promise<void> {
  try {
    const before = useUpdates.getState().state
    const result: IpcResult<UpdateState> = await window.vexnar.updates[action]()
    if (result.ok) {
      if (useUpdates.getState().state === before)
        useUpdates.getState().set(result.data)
    } else throw new Error(result.error)
  } catch (error) {
    const state = useUpdates.getState().state
    useUpdates
      .getState()
      .set({ ...state, phase: 'error', error: String(error) })
  }
}

export function updateLabel(state: UpdateState): string {
  switch (state.phase) {
    case 'checking':
      return '正在检查更新…'
    case 'available':
      return '下载更新并重启'
    case 'downloading':
      return `正在下载 ${Math.floor(state.percent)}%`
    case 'downloaded':
      return '重启并安装更新'
    case 'installing':
      return '正在准备重启…'
    case 'error':
      return '重试检查更新'
    case 'disabled':
      return '开发模式不安装更新'
    case 'current':
      return '已是最新版本'
    default:
      return '检查更新'
  }
}

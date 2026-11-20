// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { create } from 'zustand'

type SendMode = 'enter' | 'ctrl-enter'
const key = 'vexnar.desktop.chat-send-mode'
export const useChatSendMode = create<{
  mode: SendMode
  setMode: (mode: SendMode) => void
}>((set) => ({
  mode: localStorage.getItem(key) === 'ctrl-enter' ? 'ctrl-enter' : 'enter',
  setMode: (mode) => {
    localStorage.setItem(key, mode)
    set({ mode })
  }
}))

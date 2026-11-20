// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { create } from 'zustand'

const stored = Number(localStorage.getItem('vexnar.sidebar-width')) || 248
export const useLayout = create<{
  sidebarWidth: number
  sidebarOpen: boolean
  setWidth: (width: number) => void
  toggleSidebar: () => void
}>((set) => ({
  sidebarWidth: Math.min(420, Math.max(200, stored)),
  sidebarOpen: true,
  setWidth: (width) => {
    const bounded = Math.round(Math.min(420, Math.max(200, width)))
    localStorage.setItem('vexnar.sidebar-width', String(bounded))
    set({ sidebarWidth: bounded })
  },
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen }))
}))

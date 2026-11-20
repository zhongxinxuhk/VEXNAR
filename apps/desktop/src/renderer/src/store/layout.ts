// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { create } from 'zustand'

const stored = Number(localStorage.getItem('vexnar.sidebar-width')) || 248
const storedPins = localStorage.getItem('vexnar.rail-pins')
export const railPins = (Array.isArray(JSON.parse(storedPins || '[]'))
  ? (JSON.parse(storedPins || '[]') as string[])
  : []
).filter((v, i, arr) => typeof v === 'string' && arr.indexOf(v) === i)

export const useLayout = create<{
  sidebarWidth: number
  sidebarOpen: boolean
  railPins: string[]
  setWidth: (width: number) => void
  toggleSidebar: () => void
  toggleRailPin: (id: string) => void
}>((set) => ({
  railPins,
  // 图钉：钉住顺序即图标栏从上到下的顺序；取消后剩余项向上靠齐
  toggleRailPin: (id) =>
    set((state) => {
      const pins = state.railPins.includes(id)
        ? state.railPins.filter((pin) => pin !== id)
        : [...state.railPins, id]
      localStorage.setItem('vexnar.rail-pins', JSON.stringify(pins))
      return { railPins: pins }
    }),
  sidebarWidth: Math.min(420, Math.max(200, stored)),
  sidebarOpen: true,
  setWidth: (width) => {
    const bounded = Math.round(Math.min(420, Math.max(200, width)))
    localStorage.setItem('vexnar.sidebar-width', String(bounded))
    set({ sidebarWidth: bounded })
  },
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen }))
}))

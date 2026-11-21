// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { create } from 'zustand'
import type { ImageAttachment } from '@shared/contracts'
export type ComposerDraft = { text: string; images: ImageAttachment[] }
export function draftKeyFor(workspace: string): string {
  return workspace ? `new:${workspace}` : 'new'
}

export const emptyDraft: ComposerDraft = { text: '', images: [] }
export const useDrafts = create<{
  drafts: Record<string, ComposerDraft>
  patch: (id: string, patch: Partial<ComposerDraft>) => void
}>((set) => ({
  drafts: {},
  patch: (id, patch) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [id]: { ...(state.drafts[id] ?? emptyDraft), ...patch }
      }
    }))
}))

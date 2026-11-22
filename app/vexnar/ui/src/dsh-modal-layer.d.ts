// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { RefObject } from 'react'
  export function useModalLayer(dialog: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void
}

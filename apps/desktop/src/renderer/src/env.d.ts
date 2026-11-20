// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/// <reference types="vite/client" />

import type { VexnarApi } from '@shared/api'

declare global {
  interface Window {
    vexnar: VexnarApi
  }
}

export {}

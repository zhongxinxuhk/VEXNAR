/// <reference types="vite/client" />

import type { VexnarApi } from '@shared/api'

declare global {
  interface Window {
    vexnar: VexnarApi
  }
}

export {}

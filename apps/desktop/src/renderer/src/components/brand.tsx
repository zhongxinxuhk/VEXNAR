// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { cn } from '@/lib/utils'

/**
 * Codex-style cloud mark used on the empty conversation canvas.
 * Drawn locally so the shell has no external image dependency.
 */
export function CloudMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 64 52"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('h-12 w-12', className)}
    >
      <path d="M19.4 43.5h26.9c7.2 0 13.1-5.8 13.1-13 0-6.8-5.1-12.3-11.6-13C45.8 9.9 39.4 4.5 31.9 4.5c-8.7 0-15.9 6.4-16.8 14.8C9.3 20 5.2 25.3 5.2 31.4c0 6.7 5.3 12.1 11.9 12.1h2.3Z" />
      <path d="m25.2 22.4 6.3 5.1-6.3 5.1" />
      <path d="M36.2 32.6h6.1" />
    </svg>
  )
}

/** Compact geometric mark used in the rail footer and window chrome. */
export function BrandGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('h-5 w-5', className)}
    >
      <path d="M12 2.6 20.1 7.3v9.4L12 21.4 3.9 16.7V7.3L12 2.6Z" />
      <path d="M12 7.2v9.6M8.1 9.5 12 7.2l3.9 2.3v4.8L12 16.8l-3.9-2.5V9.5Z" />
    </svg>
  )
}
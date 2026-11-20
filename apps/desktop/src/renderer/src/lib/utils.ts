import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/).filter(Boolean)
  return parts.pop() || filePath
}

export function dirname(filePath: string): string {
  const parts = filePath.split('/')
  parts.pop()
  return parts.join('/') || '.'
}

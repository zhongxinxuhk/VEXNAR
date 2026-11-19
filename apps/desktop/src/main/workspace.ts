import { dialog } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FileNode, WorkspaceListInput } from '@shared/contracts'
import { ensureInside, isProbablyBinary, relativeTo } from './paths'
import { getSettings } from './settings'

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'out',
  'release',
  'dist',
  '.next',
  '.turbo',
  '.idea',
  '.pg-build',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  'coverage',
  '.pnpm-store',
  '.yarn',
  '.gradle',
  '.DS_Store'
])

function workspaceRoot(): string {
  return getSettings().workspaceRoot
}

export async function listWorkspace(input: WorkspaceListInput = {}): Promise<FileNode[]> {
  const root = workspaceRoot()
  if (!root) return []
  const start = ensureInside(root, input.path ?? '.')
  const stat = await fs.stat(start)
  if (!stat.isDirectory()) throw new Error('不是目录')

  const nodes: FileNode[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (nodes.length >= 600 || depth > 4) return
    const entries = await fs.readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const entry of entries) {
      if (nodes.length >= 600) return
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
      if (entry.name === '.DS_Store') continue
      const absolute = path.join(dir, entry.name)
      const rel = relativeTo(root, absolute)
      if (entry.isDirectory()) {
        nodes.push({ name: entry.name, path: rel, type: 'dir', depth })
        await walk(absolute, depth + 1)
      } else if (entry.isFile()) {
        nodes.push({ name: entry.name, path: rel, type: 'file', depth })
      }
    }
  }

  await walk(start, 0)
  return nodes
}

export async function readWorkspaceFile(filePath: string): Promise<{ path: string; content: string }> {
  const root = workspaceRoot()
  const absolute = ensureInside(root, filePath)
  const stat = await fs.stat(absolute)
  if (!stat.isFile()) throw new Error('不是文件')
  if (stat.size > 1_500_000) throw new Error('文件超过 1.5 MB，暂不在桌面端打开')
  const buffer = await fs.readFile(absolute)
  if (isProbablyBinary(buffer)) throw new Error('二进制文件暂不支持预览')
  return { path: relativeTo(root, absolute), content: buffer.toString('utf8') }
}

export async function chooseWorkspace(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: '选择 VEXNAR 工作区',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

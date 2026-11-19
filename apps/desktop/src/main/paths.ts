import { app } from 'electron'
import path from 'node:path'

export function userDataDir(): string {
  return app.getPath('userData')
}

export function defaultWorkspace(): string {
  return process.env.VEXNAR_WORKSPACE ?? ''
}

/**
 * Resolve a workspace-relative path and reject traversal / absolute escapes.
 * All file and git IPC handlers go through this before touching disk.
 */
export function ensureInside(root: string, target: string): string {
  if (!root) throw new Error('尚未选择工作区')
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, target)
  const rel = path.relative(resolvedRoot, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('路径超出当前工作区')
  }
  return resolved
}

export function relativeTo(root: string, absolute: string): string {
  return path.relative(path.resolve(root), absolute).split(path.sep).join('/')
}

export function isProbablyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  return sample.includes(0)
}

export function languageFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.md': 'markdown',
    '.css': 'css',
    '.html': 'html',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.toml': 'ini',
    '.rs': 'rust',
    '.go': 'go',
    '.sql': 'sql',
    '.sh': 'shell',
    '.py': 'python'
  }
  return map[ext] ?? 'plaintext'
}

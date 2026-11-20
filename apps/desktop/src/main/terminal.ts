// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { existsSync } from 'node:fs'
import * as pty from 'node-pty'
import type { TerminalCreateInput, TerminalDataEvent, TerminalExitEvent } from '@shared/contracts'
import { ensureInside } from './paths'
import { getSettings } from './settings'

type TerminalCallbacks = {
  onData: (event: TerminalDataEvent) => void
  onExit: (event: TerminalExitEvent) => void
}

type TerminalHandle = {
  process: pty.IPty
  dispose: () => void
}

export class TerminalManager {
  private readonly terminals = new Map<string, TerminalHandle>()

  constructor(private readonly callbacks: TerminalCallbacks) {}

  create(input: TerminalCreateInput): { id: string } {
    const settings = getSettings()
    const cwd = input.cwd
      ? ensureInside(settings.workspaceRoot, input.cwd)
      : settings.workspaceRoot || process.env.HOME || process.cwd()
    const shell = this.resolveShell(settings.shell)

    const terminal = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: input.cols,
      rows: input.rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    })

    const id = crypto.randomUUID()
    const dataDisposable = terminal.onData((data) => {
      this.callbacks.onData({ id, data })
    })
    const exitDisposable = terminal.onExit(({ exitCode, signal }) => {
      this.callbacks.onExit({ id, exitCode, signal })
      this.terminals.delete(id)
      dataDisposable.dispose()
      exitDisposable.dispose()
    })

    this.terminals.set(id, {
      process: terminal,
      dispose: () => {
        dataDisposable.dispose()
        exitDisposable.dispose()
        terminal.kill()
      }
    })
    return { id }
  }

  write(id: string, data: string): void {
    const terminal = this.terminals.get(id)
    if (!terminal) throw new Error('终端不存在')
    terminal.process.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id)
    if (!terminal) throw new Error('终端不存在')
    terminal.process.resize(cols, rows)
  }

  dispose(id: string): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return
    this.terminals.delete(id)
    terminal.dispose()
  }

  disposeAll(): void {
    for (const terminal of this.terminals.values()) terminal.dispose()
    this.terminals.clear()
  }

  private resolveShell(configured: string): string {
    if (process.platform === 'win32') {
      const candidates = [configured, process.env.ComSpec, 'powershell.exe', 'cmd.exe'].filter(
        Boolean
      ) as string[]
      return candidates.find((candidate) => existsSync(candidate)) ?? process.env.ComSpec ?? 'cmd.exe'
    }
    const candidates = [configured, process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(
      Boolean
    ) as string[]
    return candidates.find((candidate) => existsSync(candidate)) ?? '/bin/sh'
  }
}

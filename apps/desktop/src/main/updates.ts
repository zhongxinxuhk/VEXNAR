// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AppUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'
import type { UpdateState } from '@shared/api'

/** One updater per main process. Only metadata and progress cross the IPC boundary. */
export class UpdateManager {
  private state: UpdateState
  private timer?: ReturnType<typeof setInterval>
  private operation: Promise<UpdateState> | null = null
  private restartAfterDownload = false

  constructor(
    private readonly updater: AppUpdater,
    version: string,
    enabled: boolean,
    private readonly emit: (state: UpdateState) => void,
    private readonly prepareInstall: () => Promise<void>
  ) {
    this.state = {
      phase: enabled ? 'idle' : 'disabled',
      currentVersion: version,
      percent: 0
    }
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowPrerelease = false
    updater.allowDowngrade = false
    updater.on('checking-for-update', () =>
      this.patch({ phase: 'checking', error: undefined })
    )
    updater.on('update-available', (info: UpdateInfo) =>
      this.patch({
        phase: 'available',
        version: info.version,
        notes:
          typeof info.releaseNotes === 'string'
            ? info.releaseNotes
            : (info.releaseNotes
                ?.map((note) => `${note.version}\n${note.note}`)
                .join('\n\n') ?? ''),
        publishedAt: info.releaseDate,
        checkedAt: Date.now(),
        percent: 0,
        error: undefined
      })
    )
    updater.on('update-not-available', () =>
      this.patch({
        phase: 'current',
        checkedAt: Date.now(),
        version: undefined,
        notes: undefined,
        error: undefined
      })
    )
    updater.on('download-progress', (progress: ProgressInfo) =>
      this.patch({
        phase: 'downloading',
        percent: Math.min(100, Math.max(0, progress.percent)),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      })
    )
    updater.on('update-downloaded', () => {
      this.patch({ phase: 'downloaded', percent: 100, error: undefined })
    })
    updater.on('error', (error: Error) => this.fail(error))
  }

  status(): UpdateState {
    return { ...this.state }
  }

  start(): void {
    if (this.state.phase === 'disabled' || this.timer) return
    void this.check()
    this.timer = setInterval(() => void this.check(), 4 * 60 * 60 * 1000)
    this.timer.unref()
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async check(): Promise<UpdateState> {
    if (this.operation) return this.operation
    if (
      ['disabled', 'downloaded', 'installing', 'downloading'].includes(
        this.state.phase
      )
    )
      return this.status()
    this.operation = (async () => {
      this.patch({ phase: 'checking', error: undefined })
      try {
        await this.updater.checkForUpdates()
      } catch (error) {
        this.fail(error)
      }
      return this.status()
    })()
    try {
      return await this.operation
    } finally {
      this.operation = null
    }
  }

  async download(): Promise<UpdateState> {
    if (this.operation) return this.operation
    if (this.state.phase === 'downloaded') return this.install()
    // Always recheck after errors: never install stale or incomplete downloads.
    if (this.state.phase === 'error') await this.check()
    if (this.state.phase !== 'available') return this.status()
    this.restartAfterDownload = true
    this.operation = (async () => {
      this.patch({ phase: 'downloading', percent: 0, error: undefined })
      try {
        await this.updater.downloadUpdate()
      } catch (error) {
        this.fail(error)
      }
      return this.status()
    })()
    try {
      await this.operation
    } finally {
      this.operation = null
    }
    if (this.restartAfterDownload && this.status().phase === 'downloaded')
      return this.install()
    return this.status()
  }

  async install(): Promise<UpdateState> {
    if (this.state.phase !== 'downloaded') return this.status()
    this.patch({ phase: 'installing', error: undefined })
    try {
      // Flush storage and stop Go / PostgreSQL before handing control to the installer.
      await this.prepareInstall()
      this.updater.quitAndInstall(false, true)
    } catch (error) {
      // A running task can defer restart without throwing away the verified download.
      this.patch({
        phase: 'downloaded',
        error: error instanceof Error ? error.message : String(error)
      })
    }
    return this.status()
  }

  private patch(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.emit(this.status())
  }

  private fail(error: unknown): void {
    this.restartAfterDownload = false
    this.patch({
      phase: 'error',
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

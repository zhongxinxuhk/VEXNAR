// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { EventEmitter } from 'node:events'
import type { AppUpdater } from 'electron-updater'
import { describe, expect, it, vi } from 'vitest'
import { UpdateManager } from '../src/main/updates'

function fixture(
  enabled = true,
  prepare = vi.fn(async (): Promise<void> => undefined)
) {
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(async () => {
      updater.emit('checking-for-update')
      updater.emit('update-available', {
        version: '1.2.0',
        releaseNotes: '修复设置',
        releaseDate: '2026-11-20'
      })
    }),
    downloadUpdate: vi.fn(async () => {
      updater.emit('download-progress', {
        percent: 50,
        transferred: 50,
        total: 100,
        bytesPerSecond: 20
      })
      updater.emit('update-downloaded')
      return []
    }),
    quitAndInstall: vi.fn()
  })
  const changed = vi.fn()
  const manager = new UpdateManager(
    updater as unknown as AppUpdater,
    '1.0.0',
    enabled,
    changed,
    prepare
  )
  return { updater, changed, manager, prepare }
}

describe('desktop update lifecycle', () => {
  it('does not check or download in development', async () => {
    const { manager, updater } = fixture(false)
    manager.start()
    await manager.check()
    await manager.download()
    expect(manager.status().phase).toBe('disabled')
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
  })
  it('checks metadata without downloading, then installs only after cleanup', async () => {
    const { manager, updater, prepare, changed } = fixture()
    await manager.check()
    expect(manager.status()).toMatchObject({
      phase: 'available',
      version: '1.2.0',
      notes: '修复设置'
    })
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    await manager.download()
    expect(
      changed.mock.calls.some(
        ([state]) => state.phase === 'downloading' && state.percent === 50
      )
    ).toBe(true)
    expect(prepare).toHaveBeenCalledOnce()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(
      updater.quitAndInstall.mock.invocationCallOrder[0]
    )
  })
  it('serializes repeated download clicks', async () => {
    const { manager, updater } = fixture()
    await manager.check()
    await Promise.all([
      manager.download(),
      manager.download(),
      manager.download()
    ])
    expect(updater.downloadUpdate).toHaveBeenCalledOnce()
    expect(updater.quitAndInstall).toHaveBeenCalledOnce()
  })
  it('keeps verified downloads when running work defers restart', async () => {
    const prepare = vi.fn(async (): Promise<void> => {
      throw new Error('任务运行中')
    })
    const { manager, updater } = fixture(true, prepare)
    await manager.check()
    await manager.download()
    expect(manager.status()).toMatchObject({
      phase: 'downloaded',
      error: '任务运行中',
      percent: 100
    })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    prepare.mockImplementation(async () => undefined)
    await manager.install()
    expect(updater.downloadUpdate).toHaveBeenCalledOnce()
    expect(updater.quitAndInstall).toHaveBeenCalledOnce()
  })
  it('never installs failed or corrupt downloads and supports retry', async () => {
    const { manager, updater } = fixture()
    updater.downloadUpdate.mockImplementationOnce(async () => {
      throw new Error('SHA512 mismatch')
    })
    await manager.check()
    await manager.download()
    expect(manager.status()).toMatchObject({
      phase: 'error',
      error: 'SHA512 mismatch'
    })
    await manager.install()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    await manager.download()
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(2)
    expect(updater.quitAndInstall).toHaveBeenCalledOnce()
  })
  it('handles offline checks, current versions and checks while downloaded', async () => {
    const { manager, updater } = fixture()
    updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    await manager.check()
    expect(manager.status()).toMatchObject({ phase: 'error', error: 'offline' })
    updater.checkForUpdates.mockImplementationOnce(async () => {
      updater.emit('update-not-available')
    })
    await manager.check()
    expect(manager.status().phase).toBe('current')
    await manager.install()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })
})

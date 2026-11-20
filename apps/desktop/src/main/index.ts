import { app, BrowserWindow, Menu, dialog, shell } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { AgentManager } from './agent'
import { NewApiManager } from './newapi'
import { closeDb, initDb } from './db'
import { registerIpc } from './ipc'
import { startPortablePostgres, type PostgresRuntime } from './pg'
import { loadSettings } from './settings'
import { TerminalManager } from './terminal'
import { runSmoke } from './smoke'
import { IPC } from '@shared/contracts'

const smoke = process.env.VEXNAR_SMOKE === '1'

if (smoke) {
  app.setPath('userData', path.join(os.tmpdir(), `vexnar-desktop-smoke-${process.pid}`))
}

app.setName('VEXNAR')

let mainWindow: BrowserWindow | null = null
let postgres: PostgresRuntime | null = null
let shuttingDown = false

function emit(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

const terminal = new TerminalManager({
  onData: (event) => emit(IPC.terminalData, event),
  onExit: (event) => emit(IPC.terminalExit, event)
})

const agent = new AgentManager((event) => emit(IPC.agentEvent, event))
const newapi = new NewApiManager(emit)

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    title: 'VEXNAR',
    backgroundColor: '#f7f7f8',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 16 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow = window

  window.once('ready-to-show', () => window.show())

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function boot(): Promise<void> {
  postgres = await startPortablePostgres()
  await initDb(postgres.dsn)
  await loadSettings()

  if (smoke) {
    Menu.setApplicationMenu(null)
    await runSmoke(postgres)
    return
  }

  registerIpc({
    agent,
    terminal,
    newapi,
    getWindow: () => mainWindow
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  agent.dispose()
  terminal.disposeAll()
  newapi.dispose()
  await closeDb().catch(() => undefined)
  await postgres?.stop().catch(() => undefined)
  postgres = null
}

if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(boot).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[desktop] startup failed', error)
    dialog.showErrorBox('VEXNAR 启动失败', message)
    await shutdown()
    app.exit(1)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', (event) => {
    if (shuttingDown) return
    event.preventDefault()
    void shutdown().finally(() => app.exit(0))
  })

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown().finally(() => app.exit(0))
    })
  }
}

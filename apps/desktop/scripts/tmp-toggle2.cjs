const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const root = '/Users/xuzhongxin/GolandProjects/HKXsec VEXNAR/apps/desktop'
setTimeout(() => { app.exit(1) }, 40000)
app.whenReady().then(async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vexnar-tg2-'))
  app.setPath('userData', path.join(output, 'user-data'))
  const w = new BrowserWindow({ width: 1064, height: 828, show: false, backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(root, 'tests/fixtures/ui-preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  const run = (c) => w.webContents.executeJavaScript(c)
  const wait = async (c) => { for (let i = 0; i < 50; i++) { if (await run(c)) return true; await new Promise((r) => setTimeout(r, 100)) } return false }
  await w.loadFile(path.join(root, 'out/renderer/index.html'))
  await wait(`!!document.querySelector('[aria-label="切换聊天列表"]')`)
  await new Promise((r) => setTimeout(r, 400))
  // 模拟真实指针点击开关（elementFromPoint 确认命中）
  const clickToggle = () => run(`(() => {
    const b = document.querySelector('[aria-label="切换聊天列表"]').getBoundingClientRect()
    const x = Math.round(b.left + 15), y = Math.round(b.top + 15)
    const el = document.elementFromPoint(x, y)
    const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }
    el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerType: 'mouse', isPrimary: true }))
    el.dispatchEvent(new MouseEvent('mousedown', o))
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerType: 'mouse', isPrimary: true }))
    el.dispatchEvent(new MouseEvent('mouseup', o))
    el.dispatchEvent(new MouseEvent('click', o))
    return { hit: el.closest('button') ? el.closest('button').getAttribute('aria-label') : el.tagName }
  })()`)
  const expanded0 = await run(`document.querySelector('[aria-label="切换聊天列表"]').getAttribute('aria-expanded')`)
  await run(`document.querySelector('[aria-label="切换聊天列表"]').click()`)  // 先收起
  await new Promise((r) => setTimeout(r, 500))
  const hit = await clickToggle()
  await new Promise((r) => setTimeout(r, 500))
  const expanded1 = await run(`document.querySelector('[aria-label="切换聊天列表"]').getAttribute('aria-expanded')`)
  console.log('TOGGLE', expanded0, '->collapsed->', hit, '->', expanded1)
  // PanelRight 是否回到最右
  const pos = await run(`(() => {
    const b = document.querySelector('[aria-label="切换右侧面板"]').getBoundingClientRect()
    return { x: Math.round(b.left), winW: window.innerWidth }
  })()`)
  console.log('PANELRIGHT', JSON.stringify(pos))
  fs.writeFileSync('/tmp/tg2.png', (await w.webContents.capturePage()).toPNG())
  app.exit(0)
})

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const root = '/Users/xuzhongxin/GolandProjects/HKXsec VEXNAR/apps/desktop'
setTimeout(() => { app.exit(1) }, 40000)
app.whenReady().then(async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vexnar-dump-'))
  app.setPath('userData', path.join(output, 'user-data'))
  const w = new BrowserWindow({ width: 1064, height: 828, show: false, backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(root, 'tests/fixtures/ui-preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  const run = (c) => w.webContents.executeJavaScript(c)
  const wait = async (c) => { for (let i = 0; i < 50; i++) { if (await run(c)) return true; await new Promise((r) => setTimeout(r, 100)) } return false }
  await w.loadFile(path.join(root, 'out/renderer/index.html'))
  await wait(`!!document.querySelector('[aria-label="切换聊天列表"]')`)
  await new Promise((r) => setTimeout(r, 400))
  await run(`document.querySelector('[aria-label="切换聊天列表"]').click()`)
  await new Promise((r) => setTimeout(r, 500))
  const dump = await run(`(() => {
    const header = document.querySelector('[aria-label="会话工具栏"]')
    const items = []
    const walk = (el, depth) => {
      if (depth > 3) return
      const b = el.getBoundingClientRect()
      if (depth <= 1 || (b.left > 230 && b.left < 320)) items.push({ d: depth, tag: el.tagName, cls: el.className.toString().slice(0, 70), x: Math.round(b.left), w: Math.round(b.width), label: el.getAttribute('aria-label') || '', parent: el.parentElement?.getAttribute('aria-label') || '' })
      for (const c of el.children) walk(c, depth + 1)
    }
    walk(header, 0)
    const chrome = document.querySelector('[aria-label="窗口工具栏"]')
    const cItems = []
    const walk2 = (el, depth) => {
      if (depth > 2) return
      const b = el.getBoundingClientRect()
      cItems.push({ d: depth, tag: el.tagName, cls: el.className.toString().slice(0, 50), x: Math.round(b.left), w: Math.round(b.width), label: el.getAttribute('aria-label') || '' })
      for (const c of el.children) walk2(c, depth + 1)
    }
    walk2(chrome, 0)
    return { header: items, chrome: cItems }
  })()`)
  console.log(JSON.stringify(dump, null, 1))
  app.exit(0)
})

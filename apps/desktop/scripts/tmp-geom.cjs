const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const root = '/Users/xuzhongxin/GolandProjects/HKXsec VEXNAR/apps/desktop'
setTimeout(() => { app.exit(1) }, 40000)
app.whenReady().then(async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vexnar-geom-'))
  app.setPath('userData', path.join(output, 'user-data'))
  const w = new BrowserWindow({ width: 1064, height: 828, show: false, backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(root, 'tests/fixtures/ui-preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  const run = (c) => w.webContents.executeJavaScript(c)
  const wait = async (c) => { for (let i = 0; i < 50; i++) { if (await run(c)) return true; await new Promise((r) => setTimeout(r, 100)) } return false }
  await w.loadFile(path.join(root, 'out/renderer/index.html'))
  await wait(`!!document.querySelector('[data-testid="chat-sidebar"]')`)
  await new Promise((r) => setTimeout(r, 400))
  const info = await run(`(() => {
    const rail = document.querySelector('aside')
    const shell = document.querySelector('.sidebar-shell')
    const aside = document.querySelector('[data-testid="chat-sidebar"]')
    const section = document.querySelector('[aria-label="会话工具栏"]').closest('section')
    const handle = document.querySelector('[role="separator"]')
    const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.height)] }
    // 侧栏列表底部以下是什么元素
    const probe = document.elementFromPoint(150, 700)
    return {
      rail: r(rail), shell: r(shell), aside: r(aside), section: r(section),
      handle: handle ? r(handle) : null,
      probeAt150_700: probe ? probe.className.toString().slice(0, 60) || probe.tagName : null,
      probeBg: probe ? getComputedStyle(probe).backgroundColor : null
    }
  })()`)
  console.log('GEOM', JSON.stringify(info, null, 1))
  app.exit(0)
})

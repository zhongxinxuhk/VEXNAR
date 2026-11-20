const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vexnar-carousel-'))
app.setPath('userData', path.join(out, 'u'))
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { preload: path.resolve(__dirname, '../tests/fixtures/ui-preload.cjs'), contextIsolation: true } })
  const run = (c) => w.webContents.executeJavaScript(c)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = async (label) => run(`(() => { const b=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')||'')===${JSON.stringify(label)}); if(!b)return false; b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); b.click(); return true })()`)
  const shot = async (name) => {
    const r = await run(`(() => { const d=[...document.querySelectorAll('[role="dialog"]')].find(n=>n.textContent.includes('充值中心')); const b=d.getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height} })()`)
    fs.writeFileSync(path.join(out, name + '.png'), (await w.webContents.capturePage({ x: Math.round(r.x - 20), y: Math.round(r.y - 20), width: Math.round(r.width + 40), height: Math.round(r.height + 40) })).toPNG())
  }
  try {
    await w.loadFile(process.cwd() + '/out/renderer/index.html')
    for (let i=0;i<80;i++){ if(await run(`!!document.querySelector('aside')`)) break; await sleep(100) }
    await run(`(() => { const b=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('title')||'').startsWith('额度来源')); b.click() })()`)
    await sleep(300)
    await run(`(() => { const b=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='充值'); b.click() })()`)
    await sleep(700)
    await run(`(() => { const b=[...document.querySelectorAll('button')].find(n=>n.textContent.includes('订阅套餐')); b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); b.click() })()`)
    await sleep(500)
    console.log('next?', await click('下一组套餐'))
    await sleep(700)
    console.log(await run(`(() => { const t=[...document.querySelectorAll('div')].find(n=>n.className&&n.className.includes('snap-x')); return t?{scrollLeft:t.scrollLeft,scrollWidth:t.scrollWidth,clientWidth:t.clientWidth}:null })()`))
    await shot('01-page2')
    console.log(JSON.stringify({ out }))
  } catch (e) { console.error(e); fs.writeFileSync(path.join(out,'error.png'),(await w.webContents.capturePage()).toPNG()); console.log(JSON.stringify({out,error:String(e)})); app.exit(1) }
  app.quit()
})

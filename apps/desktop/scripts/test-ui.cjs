// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vexnar-ui-check-'))
app.setPath('userData', path.join(output, 'user-data'))
app.whenReady().then(async () => {
  const w = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, '../tests/fixtures/ui-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  w.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.error('renderer:', event.message)
  })
  try {
    await w.loadFile(process.cwd() + '/out/renderer/index.html')
    const run = (code) => w.webContents.executeJavaScript(code)
    const saveScreenshot = async (filename) => {
      if (process.env.VEXNAR_UI_SKIP_SCREENSHOTS === '1') return
      fs.writeFileSync(path.join(output, filename), (await w.webContents.capturePage()).toPNG())
    }
    const wait = async (code) => {
      for (let i = 0; i < 80; i++) {
        if (await run(code)) return
        await new Promise((r) => setTimeout(r, 100))
      }
      throw Error('Timeout ' + code)
    }
    await wait(`!!document.querySelector('aside')`)
    const scope = '[data-testid="project-sessions"]'
    const clickProject = (root) => run(
      `document.querySelector('[data-testid="chat-sidebar"] button[title="${root}"]').click()`
    )
    const waitSession = (title) => wait(
      `document.querySelector('[aria-label="会话工具栏"]').textContent.includes('${title}')`
    )
    const verifyProjectWorkspace = async () => {
      await clickProject('/fixture/project-a')
      await waitSession('项目聊天')
      await wait(`document.querySelector('${scope}')?.textContent.includes('项目聊天')`)
      if (await run(`document.querySelector('[data-testid="chat-sidebar"]').textContent.includes('项目聊天')`))
        throw Error('Pinned session is visible in global project navigation')
      if (await run(`document.querySelector('${scope}').textContent.includes('另一项目会话')`))
        throw Error('Another project session is visible in the current project')
      await run(`document.querySelector('${scope} button[title="项目备用会话"]').click()`)
      await waitSession('项目备用会话')
      await clickProject('/other/project-a')
      await waitSession('另一项目会话')
      await wait(`document.querySelector('${scope}')?.textContent.includes('/other/project-a')`)
      if (await run(`document.querySelector('${scope}').textContent.includes('项目聊天')`))
        throw Error('Same-name directories share sessions')
      await clickProject('/fixture/project-a')
      await waitSession('项目备用会话')
      await run(`Array.from(document.querySelectorAll('[data-testid="chat-sidebar"] button')).find(b=>b.textContent==='待归属').click()`)
      await wait(`document.querySelector('${scope}')?.querySelector('button[title="新聊天"]') != null && document.querySelector('${scope}')?.textContent.includes('待归属')`)
      await run(`document.querySelector('[data-testid="chat-sidebar"] button[aria-label="搜索"]').click()`)
      await run(`(()=>{const x=document.querySelector('[data-testid="chat-sidebar"] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(x,'项目聊天');x.dispatchEvent(new Event('input',{bubbles:true}));})()`)
      await wait(`!!document.querySelector('[data-testid="chat-sidebar"] button[title="项目聊天 · /fixture/project-a"]')`)
      await run(`document.querySelector('[data-testid="chat-sidebar"] button[title="项目聊天 · /fixture/project-a"]').click()`)
      await waitSession('项目聊天')
      await run(`document.querySelector('[data-testid="chat-sidebar"] input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
    }
    const verifyProjectTasks = async () => {
      const tasks = '[data-testid="project-tasks"]'
      const taskTabs = 'aside button[aria-pressed]'
      const openTasks = () => run(`Array.from(document.querySelectorAll('${taskTabs}')).find(b=>b.textContent==='任务').click()`)
      const bind = async () => {
        await run(`(()=>{const input=document.querySelector('${tasks} input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1237');input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
        await wait(`document.querySelector('${tasks} button[type="submit"]')?.disabled===false`)
        await run(`document.querySelector('${tasks} form').requestSubmit()`)
      }
      await openTasks()
      await wait(`document.querySelector('${tasks}')?.textContent.includes('当前项目暂无已绑定任务')`)
      await bind()
      await wait(`document.querySelector('${tasks}')?.textContent.includes('查看已有任务目标')`)
      const history = '[data-testid="project-task-history"]'
      const waitHistory = (text) => wait(`document.querySelector('${history}')?.textContent.includes('${text}')`)
      const chooseTaskSession = (title) => run(`Array.from(document.querySelectorAll('${tasks} button[aria-pressed]')).find(b=>b.textContent.includes('${title}')).click()`)
      await waitHistory('主 Agent 最新活动')
      await run(`Array.from(document.querySelectorAll('${history} button')).find(b=>b.textContent==='加载更早的记录').click()`)
      await waitHistory('主 Agent 较早活动')
      await wait(`document.querySelector('${tasks}')?.textContent.includes('验证分支')`)
      await chooseTaskSession('验证分支')
      await waitHistory('分支验证结果')
      if (await run(`document.querySelector('${history}').textContent.includes('主 Agent 最新活动')`))
        throw Error('Main history is visible in a branch session')
      await chooseTaskSession('历史会话')
      await waitHistory('历史主会话活动')
      await chooseTaskSession('主 Agent')
      await waitHistory('主 Agent 最新活动')
      await clickProject('/other/project-a')
      await waitSession('另一项目会话')
      await wait(`!document.querySelector('${history}')`)
      await openTasks()
      await wait(`document.querySelector('${tasks}')?.textContent.includes('当前项目暂无已绑定任务')`)
      await bind()
      await wait(`document.querySelector('${tasks} [role="alert"]')?.textContent.includes('already belongs')`)
      await clickProject('/fixture/project-a')
      await waitSession('项目聊天')
      await openTasks()
      await wait(`document.querySelector('${tasks}')?.textContent.includes('项目任务示例')`)
    }
    if (process.argv.includes('--project-workspace')) {
      await verifyProjectWorkspace()
      await verifyProjectTasks()
      console.log('PASS: project navigation, scoped sessions, last session restoration, cross-project search, task binding and session history')
      app.exit(0)
      return
    }
    await run(
      `window.dispatchEvent(new KeyboardEvent('keydown',{key:',',metaKey:true,bubbles:true}))`
    )
    await wait(`!!document.querySelector('[role="dialog"]')`)
    await run(
      `Array.from(document.querySelectorAll('nav[aria-label="设置分类"] button')).find(b=>b.textContent==='账户').click()`
    )
    await wait(
      `Array.from(document.querySelectorAll('h2')).some(e=>e.textContent==='账户')`
    )
    await new Promise((r) => setTimeout(r, 150))
    await saveScreenshot('settings-account.png')
    await run(
      `Array.from(document.querySelectorAll('nav[aria-label="设置分类"] button')).find(b=>b.textContent==='Agent 与并发').click()`
    )
    await wait(`!!document.querySelector('#system-workers')`)
    await run(
      `(()=>{const x=document.querySelector('#system-workers');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(x,'5');x.dispatchEvent(new Event('input',{bubbles:true}));})()`
    )
    await run(
      `document.querySelector('#system-workers').closest('form').requestSubmit()`
    )
    await wait(
      `Array.from(document.querySelectorAll('[role="status"]')).some(e=>e.textContent.includes('已保存'))`
    )
    await run(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='刷新').click()`
    )
    await wait(`document.querySelector('#system-workers')?.value==='5'`)
    await run(
      `Array.from(document.querySelectorAll('nav[aria-label="设置分类"] button')).find(b=>b.textContent==='关于与更新').click()`
    )
    await wait(
      `Array.from(document.querySelectorAll('h2')).some(e=>e.textContent==='关于与更新')`
    )
    await saveScreenshot('settings-update.png')
    const layout = await run(
      `(()=>{const d=document.querySelector('[role="dialog"]');return {width:d.clientWidth,viewport:innerWidth,overflow:d.scrollWidth>d.clientWidth}})()`
    )
    if (layout.overflow) throw Error('Dialog overflow')
    await run(
      `Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.querySelector('.sr-only')?.textContent==='Close').click()`
    )
    await wait(`!document.querySelector('[role="dialog"]')`)
    const target = await run(
      `(()=>{const r=document.querySelector('[aria-label="下载更新并重启"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`
    )
    w.webContents.sendInputEvent({ type: 'mouseMove', ...target })
    await wait(`!!document.querySelector('[role="tooltip"]')`)
    if (
      !(await run(
        `document.querySelector('[role="tooltip"]').textContent.includes('1.1.0')`
      ))
    )
      throw Error('Missing release version in tooltip')
    await saveScreenshot('update-tooltip.png')
    w.webContents.sendInputEvent({ type: 'mouseMove', x: 900, y: 400 })
    const openMenu = async (label) => {
      await run(
        `document.querySelector('[aria-label="${label}"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,ctrlKey:false,pointerType:'mouse'}))`
      )
    }
    const clickMenu = async (text) => {
      await run(
        `Array.from(document.querySelectorAll('[role="menuitem"]')).find(e=>e.textContent.includes('${text}')).click()`
      )
    }
    await run(
      `document.querySelector('[aria-label="调整聊天列表宽度"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`
    )
    await wait(
      `document.querySelector('[data-testid="chat-sidebar"]').style.width==='264px'`
    )
    const grip = await run(
      `(()=>{const r=document.querySelector('[aria-label="调整聊天列表宽度"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:300}})()`
    )
    w.webContents.sendInputEvent({ type: 'mouseMove', ...grip })
    w.webContents.sendInputEvent({
      type: 'mouseDown',
      button: 'left',
      clickCount: 1,
      ...grip
    })
    w.webContents.sendInputEvent({
      type: 'mouseMove',
      x: grip.x + 45,
      y: grip.y
    })
    w.webContents.sendInputEvent({
      type: 'mouseUp',
      button: 'left',
      clickCount: 1,
      x: grip.x + 45,
      y: grip.y
    })
    await wait(
      `Number(document.querySelector('[data-testid="chat-sidebar"]').style.width.replace('px',''))>280`
    )
    await openMenu('访问权限')
    await wait(`!!document.querySelector('[role="menu"]')`)
    await new Promise((resolve)=>setTimeout(resolve,150))
    await saveScreenshot('access-menu.png')
    await clickMenu('请求批准')
    await wait(
      `document.querySelector('[aria-label="访问权限"]').textContent.includes('请求批准')`
    )
    if (!(await run(`window.__uiFixture.snapshot().accessMode==='request'`)))
      throw Error('Access mode not persisted')
    const compactHeight = await run(`document.querySelector('[data-testid="chat-composer"]').clientHeight`)
    if (compactHeight > 89) throw Error('Empty composer is too tall')
    await verifyProjectWorkspace()
    await wait(`Array.from(document.querySelectorAll('summary')).some(e=>e.textContent.includes('工具活动'))`)
    await run(`Array.from(document.querySelectorAll('summary')).find(e=>e.textContent.includes('工具活动')).click()`)
    await run(`Array.from(document.querySelectorAll('summary')).find(e=>e.textContent.includes('git status')).click()`)
    if (!(await run(`Array.from(document.querySelectorAll('pre')).some(e=>e.textContent.includes('## main') && e.checkVisibility())`))) throw Error('Git output did not expand')
    await new Promise((resolve) => setTimeout(resolve, 150))
    await saveScreenshot('chat-activity.png')
    await openMenu('选择模型')
    await wait(`Array.from(document.querySelectorAll('[role="menuitemradio"]')).some(e=>e.textContent==='高')`)
    await run(`Array.from(document.querySelectorAll('[role="menuitemradio"]')).find(e=>e.textContent==='高').click()`)
    await run(
      `(()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'clipboard.png',{type:'image/png'}));document.querySelector('textarea[aria-label="聊天消息"]').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))})()`
    )
    await wait(
      `document.querySelectorAll('[aria-label="待发送图片"] img').length===1`
    )
    await clickProject('/other/project-a')
    await waitSession('另一项目会话')
    await wait(`!document.querySelector('[aria-label="待发送图片"]')`)
    await clickProject('/fixture/project-a')
    await waitSession('项目聊天')
    await wait(`document.querySelectorAll('[aria-label="待发送图片"] img').length===1`)
    await new Promise((resolve)=>setTimeout(resolve,150))
    await saveScreenshot('composer-paste.png')
    if (!(await run(`document.querySelector('[data-testid="chat-composer"]').clientHeight>${compactHeight}`))) throw Error('Pasted image did not grow composer')
    const shell = await run(
      `(()=>{const header=document.querySelector('[aria-label="窗口工具栏"]').getBoundingClientRect();const side=document.querySelector('[data-testid="chat-sidebar"]').getBoundingClientRect();const editor=document.querySelector('[data-testid="chat-composer"]');return {headerHeight:header.height,sidebarTop:side.top,overflow:editor.scrollWidth>editor.clientWidth}})()`
    )
    if (shell.sidebarTop < shell.headerHeight || shell.overflow)
      throw Error('Invalid shell/composer geometry')
    await run(`document.querySelector('button[aria-label="发送"]').click()`)
    await wait(
      `window.__uiFixture.snapshot().lastSend?.attachments?.length===1`
    )
    if (
      !(await run(
        `window.__uiFixture.snapshot().lastSend.sessionId==='project-a' && window.__uiFixture.snapshot().lastSend.reasoningEffort==='high' && window.__uiFixture.snapshot().savedMessages.some(m=>m.attachments?.length===1)`
      ))
    )
      throw Error('Image persistence/send context mismatch')
    w.setSize(1000,760)
    await new Promise((resolve)=>setTimeout(resolve,200))
    if(await run(`document.querySelector('[data-testid="chat-composer"]').scrollWidth>document.querySelector('[data-testid="chat-composer"]').clientWidth`)) throw Error('Composer overflows at minimum window width')
    if (process.env.VEXNAR_UI_SKIP_SCREENSHOTS !== '1') console.log('Screenshots:', output)
    console.log(
      'UI OK: settings, release tooltip, sidebar drag, access mode, workspace, pasted image persistence/send',
      JSON.stringify(layout)
    )
    app.exit(0)
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})

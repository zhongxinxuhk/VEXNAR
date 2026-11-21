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
    // 失败时把报错的脚本片段带出来，便于定位是哪一步的选择器失效。
    const run = (code) =>
      w.webContents.executeJavaScript(code).catch((error) => {
        throw Error(`${String(error.message || error)} :: ${code.slice(0, 140)}`)
      })
    const wait = async (code) => {
      for (let i = 0; i < 80; i++) {
        if (await run(code)) return
        await new Promise((r) => setTimeout(r, 100))
      }
      throw Error('Timeout ' + code)
    }
    await wait(`!!document.querySelector('aside')`)
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
    fs.writeFileSync(
      path.join(output, 'settings-account.png'),
      (await w.webContents.capturePage()).toPNG()
    )
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
    fs.writeFileSync(
      path.join(output, 'settings-update.png'),
      (await w.webContents.capturePage()).toPNG()
    )
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
    fs.writeFileSync(
      path.join(output, 'update-tooltip.png'),
      (await w.webContents.capturePage()).toPNG()
    )
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
    fs.writeFileSync(path.join(output,'access-menu.png'),(await w.webContents.capturePage()).toPNG())
    await clickMenu('请求批准')
    await wait(
      `document.querySelector('[aria-label="访问权限"]').textContent.includes('请求批准')`
    )
    if (!(await run(`window.__uiFixture.snapshot().accessMode==='request'`)))
      throw Error('Access mode not persisted')
    const compactHeight = await run(`document.querySelector('[data-testid="chat-composer"]').clientHeight`)
    // 空输入框 = textarea 60px + 工具行 36px；超过 100 说明有元素把工具行撑高了。
    if (compactHeight > 100) throw Error('Empty composer is too tall: ' + compactHeight)
    await openMenu('选择会话工作区')
    await clickMenu('project-a')
    await wait(
      `document.querySelector('[aria-label="选择会话工作区"]').textContent.includes('project-a')`
    )
    await wait(`document.querySelector('[aria-label="会话工具栏"]').textContent.includes('project-a')`)
    // 工作区菜单切到的是该工作区的最新会话；带工具活动的会话从侧栏进入。
    await run(`Array.from(document.querySelectorAll('[data-testid="chat-sidebar"] button')).find(b=>b.title==='搭建 VEXNAR 官网').click()`)
    await wait(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='加载更早消息')`)
    await run(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='加载更早消息').click()`)
    await wait(`document.body.textContent.includes('已经搭好官网骨架')`)
    await wait(`document.querySelector('article[aria-label="助手消息"] section[aria-label="最终答复"]').textContent.includes('已经搭好官网骨架')`)
    await wait(`document.querySelector('article[aria-label="助手消息"] header').textContent.includes('observed-model-fixture')`)


    if (await run(`document.body.textContent.includes('先看目录结构')`)) throw Error('Private reasoning appeared in chat')
    await wait(`document.querySelectorAll('article[aria-label="助手消息"] [data-flow="call"]').length===119`)
    if (await run(`[...document.querySelectorAll('article[aria-label="助手消息"] summary')].some(e=>e.textContent.includes('工具活动 ·'))`)) {
      throw Error('Chat displayed the aggregate tool activity')
    }
    const changeDraft = (value) => run(`(()=>{const field=document.querySelector('[data-testid="chat-composer"] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}))})()`)

    await changeDraft('保留这份草稿')
    const showWork = `[...document.querySelectorAll('[aria-label="会话视图"] button')].find(e=>e.textContent==='执行记录').click()`
    const showChat = `[...document.querySelectorAll('[aria-label="会话视图"] button')].find(e=>e.textContent==='对话').click()`
    await run(showWork)

    const activity = `[...document.querySelectorAll('section[aria-label="执行记录"] summary')].find(e=>e.textContent.includes('工具活动 · 120 项'))`
    await wait(`!!(${activity})`)
    await wait(`(${activity}).textContent.includes('回合已完成') && (${activity}).textContent.includes('118 项成功') && /10\\s*秒/.test((${activity}).textContent)`)

    if (await run(`(${activity}).parentElement.querySelector('details') !== null`)) throw Error('Collapsed trace mounted tool rows')
    await wait(`(${activity}).textContent.includes('1 项失败') && (${activity}).textContent.includes('1 项未记录结果')`)
    await run(`(${activity}).click()`)
    const traceSelector = (label) => `(${activity}).parentElement.querySelector('select[aria-label="${label}"]')`
    const changeSelect = async (selector, value) => run(
      `(()=>{const select=${selector};select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}))})()`
    )
    await wait(`!!${traceSelector('按类别筛选')}`)
    await changeSelect(traceSelector('按类别筛选'), 'mcp')
    await wait(`(${activity}).parentElement.textContent.includes('mcp__files__read_file') && (${activity}).parentElement.querySelectorAll('details summary').length > 1`)
    await run(`[...(${activity}).parentElement.querySelectorAll('button')].find(e=>e.textContent==='折叠全部分组').click()`)
    await wait(`!(${activity}).parentElement.querySelector('div[tabindex="0"] > details').open`)
    await run(`[...(${activity}).parentElement.querySelectorAll('button')].find(e=>e.textContent==='展开全部分组').click()`)
    await wait(`(${activity}).parentElement.querySelector('div[tabindex="0"] > details').open`)
    const initialTraceReads = await run(`window.__uiFixture.snapshot().traceReads`)
    for (const [category, expected] of [
      ['skill', 'documentation-review'], ['planning', '核对说明文档'],
      ['browser', 'browser-fixture'], ['software', 'editor-fixture']
    ]) {
      await changeSelect(traceSelector('按类别筛选'), category)
      const toolPanel = `(${activity}).parentElement.querySelector('details[data-tool-category="${category}"]')`
      await wait(`!!(${toolPanel})`)
      await run(`(${toolPanel}).querySelector('summary').click()`)
      await wait(`(${toolPanel}).textContent.includes(${JSON.stringify(expected)})`)
    }
    await changeSelect(traceSelector('按类别筛选'), 'all')
    await run(`[...(${activity}).parentElement.querySelectorAll('button')].find(e=>e.textContent==='按调用查看').click()`)
    await changeSelect(traceSelector('活动排序'), 'duration')
    await wait(`(${activity}).parentElement.querySelector('div[tabindex="0"] > details').dataset.callSequence==='9'`)
    await changeSelect(traceSelector('活动排序'), 'sequence')
    const searchTools = async (value) => run(`(()=>{const input=(${activity}).parentElement.querySelector('input[type="search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await searchTools('reader')
    await wait(`(${activity}).parentElement.querySelectorAll('details[data-call-sequence]').length===1 && (${activity}).parentElement.querySelector('details[data-call-sequence="4"]')!==null`)
    await searchTools('')


    await wait(`(${activity}).parentElement.querySelectorAll('details').length === 25`)
    await wait(`(${activity}).parentElement.textContent.includes('未记录结果')`)
    await run(`[...(${activity}).parentElement.querySelectorAll('button')].find(e=>e.textContent==='下一页').click()`)
    await wait(`(${activity}).parentElement.textContent.includes('第 26–50 项')`)
    const selectStatus = async (summary, value) => run(
      `(()=>{const select=(${summary}).parentElement.querySelector('select');select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}))})()`
    )
    await selectStatus(activity, 'error')
    await wait(`(${activity}).parentElement.querySelectorAll('details').length===1 && (${activity}).parentElement.querySelector('details').textContent.includes('read_file')`)
    await selectStatus(activity, 'running')
    await wait(`(${activity}).parentElement.textContent.includes('没有符合当前状态的调用')`)
    await selectStatus(activity, 'unreported')
    await wait(`(${activity}).parentElement.querySelectorAll('details').length===1 && (${activity}).parentElement.querySelector('details').dataset.callSequence==='7'`)
    await selectStatus(activity, 'all')
    await wait(`(${activity}).parentElement.textContent.includes('第 1–25 项')`)
    await wait(`Array.from(document.querySelectorAll('summary')).some(e=>e.textContent.includes('Bash') && e.textContent.includes('成功'))`)
    if (await run(`(${activity}).parentElement.querySelector('pre') !== null`)) throw Error('Collapsed tool mounted its payload')
    const readsAfterInspection = await run(`window.__uiFixture.snapshot().traceReads`)
    if (readsAfterInspection !== initialTraceReads + 8) throw Error('Tool rows eagerly fetched payloads')
    await run(`Array.from(document.querySelectorAll('summary')).find(e=>e.textContent.includes('Bash') && e.textContent.includes('成功')).click()`)
    const terminalCall = `document.querySelector('details[data-call-sequence="3"]')`
    await wait(`(${terminalCall})?.querySelector('section[aria-label="终端命令"]')?.textContent.includes('ls')`)
    await wait(`Array.from(document.querySelectorAll('pre')).some(e=>e.textContent.includes('README.md') && e.checkVisibility())`)
    await wait(`window.__uiFixture.snapshot().traceReads===${readsAfterInspection + 2}`)
    const outputPanel = `[...document.querySelectorAll('section[aria-label="执行记录"] article section')].find(e=>e.querySelector('h4')?.textContent==='输出')`
    if (await run(`(${outputPanel}).querySelector('pre').textContent.includes('END_OF_OUTPUT')`)) throw Error('Large output rendered beyond its preview')
    await run(`[...(${outputPanel}).querySelectorAll('button')].find(e=>e.textContent==='下一页').click()`)
    await wait(`(${outputPanel}).textContent.includes('第 8193–16384 项')`)
    await run(`[...(${outputPanel}).querySelectorAll('button')].find(e=>e.textContent==='下一页').click()`)
    await wait(`(${outputPanel}).querySelector('pre').textContent.includes('END_OF_OUTPUT')`)
    await run(`[...(${outputPanel}).querySelectorAll('button')].find(e=>e.textContent==='复制完整内容').click()`)
    await wait(`window.__uiFixture.snapshot().copiedTrace.length>20000 && window.__uiFixture.snapshot().copiedTrace.startsWith('README.md') && window.__uiFixture.snapshot().copiedTrace.endsWith('END_OF_OUTPUT')`)
    await wait(`[...document.querySelectorAll('dl[aria-label="调用记录"]')].some(e=>e.textContent.includes('auto') && /375\\s*毫秒/.test(e.textContent) && e.querySelectorAll('time').length===2)`)
    await new Promise((resolve) => setTimeout(resolve, 150))
    fs.writeFileSync(path.join(output, 'chat-activity.png'), (await w.webContents.capturePage()).toPNG())
    await run(`[...(${activity}).parentElement.querySelectorAll('button')].find(e=>e.textContent==='按时间线查看').click()`)
    const auditFilter = `(${activity}).parentElement.querySelector('select[aria-label="筛选审计结果"]')`
    await wait(`!!(${auditFilter})`)
    await changeSelect(auditFilter, 'error')
    await wait(`(${activity}).parentElement.querySelector('ol')?.textContent.includes('结果 · 失败') && (${activity}).parentElement.querySelectorAll('ol li').length===1`)
    await changeSelect(auditFilter, 'all')
    const viewport = `(${activity}).parentElement.querySelector('[role="region"][aria-label="按时间线查看"]')`
    const timeline = `(${viewport}).querySelector('ol')`
    await wait(`(${viewport})?.querySelectorAll('li').length===15`)
    await wait(`(()=>{const [a,b,c,d]=[...(${timeline}).children].map(e=>e.textContent);return a.includes('调用Bash') && b.includes('调用read_filereader') && c.includes('结果 · 成功read_filereader') && c.includes('对应调用 #4') && d.includes('结果 · 成功Bash') && d.includes('对应调用 #3')})()`)
    await run(`(${viewport}).scrollTop=25*32`)
    await wait(`(${activity}).parentElement.textContent.includes('第 26–35 项，共 240 项') && (${timeline}).children.length<=19`)
    await run(`[...(${timeline}).querySelectorAll('button')].find(e=>e.textContent==='对应调用 #8').click()`)
    await wait(`document.activeElement.matches('ol > li') && document.activeElement.firstElementChild.textContent==='#8'`)
    await run(`(${viewport}).scrollTop=(${viewport}).scrollHeight`)
    await wait(`(${timeline}).lastElementChild.getAttribute('aria-posinset')==='240' && (${timeline}).lastElementChild.querySelector('button')?.title==='未找到对应调用' && (${timeline}).children.length<=19`)
    await run(`[...(${activity}).parentElement.querySelectorAll('button')].find(e=>e.textContent==='按调用查看').click()`)
    await wait(`(${activity}).parentElement.textContent.includes('第 1–25 项，共 120 项')`)
    await wait(`[...document.querySelectorAll('section[aria-label="执行记录"] summary')].some(e=>e.textContent.includes('工具活动 · 120 项'))`)
    const checkpoint = `document.querySelector('section[aria-label="计划检查点（只读）"]')`
    await wait(`!!(${checkpoint})`)
    await run(`(${checkpoint}).querySelector('summary').click()`)
    await wait(`(${checkpoint}).textContent.includes('核对说明文档') && (${checkpoint}).textContent.includes('已完成 1/2')`)
    await run(`[...(${checkpoint}).querySelectorAll('button')].find(e=>e.textContent==='任务板').click()`)
    await wait(`(${checkpoint}).querySelector('[aria-label="任务板"]')?.querySelectorAll('section').length===3`)
    if (await run(`document.querySelector('[data-testid="chat-composer"], section[aria-label="最终答复"]') !== null`)) throw Error('Execution work view includes conversation controls or answer body')
    await run(`[...document.querySelectorAll('[aria-label="会话视图"] button')].find(e=>e.textContent==='对话').click()`)
    await wait(`document.querySelector('section[aria-label="最终答复"]')?.textContent.includes('已经搭好官网骨架')`)
    await wait(`document.querySelector('[data-testid="chat-composer"] textarea')?.value==='保留这份草稿'`)
    await changeDraft('')
    await run(`[...document.querySelectorAll('article[aria-label="用户消息"] button')].find(e=>e.textContent.includes('在输入框编辑')).click()`)
    await wait(`document.activeElement.id==='conversation-composer-input' && document.activeElement.value==='把官网搭起来'`)
    await changeDraft('')
    await run(`[...document.querySelectorAll('article[aria-label="助手消息"] button')].find(e=>e.textContent.includes('复制消息')).click()`)
    await wait(`window.__uiFixture.snapshot().copiedTrace.includes('已经搭好官网骨架')`)


    await openMenu('选择推理强度与模型')
    await wait(`!!document.querySelector('[role="slider"]')`)
    await run(
      `document.querySelector('[role="slider"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`
    )
    await wait(`window.__uiFixture.snapshot().effort==='medium'`)
    await run(
      `document.querySelector('[role="slider"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`
    )
    await wait(`window.__uiFixture.snapshot().effort==='high'`)
    if (
      !(await run(
        `document.querySelector('[aria-label="选择推理强度与模型"]').textContent.includes('高')`
      ))
    )
      throw Error('Effort label missing on picker trigger')
    await run(
      `document.querySelector('[aria-label="展开模型列表"]').click()`
    )
    await wait(
      `Array.from(document.querySelectorAll('[role="menu"] button')).some(e=>e.textContent==='GPT-6.1 Sol')`
    )
    await new Promise((resolve) => setTimeout(resolve, 420))
    fs.writeFileSync(
      path.join(output, 'model-picker.png'),
      (await w.webContents.capturePage()).toPNG()
    )
    await run(
      `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`
    )
    await wait(`!document.querySelector('[role="menu"]')`)
    await run(
      `(()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'clipboard.png',{type:'image/png'}));document.querySelector('textarea[aria-label="聊天消息"]').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))})()`
    )
    await wait(
      `document.querySelectorAll('[aria-label="待发送图片"] img').length===1`
    )
    await run(`Array.from(document.querySelectorAll('[data-testid="chat-sidebar"] button')).find(b=>b.textContent.trim()==='新聊天').click()`)
    await wait(`!document.querySelector('[aria-label="待发送图片"]')`)
    await run(`Array.from(document.querySelectorAll('[data-testid="chat-sidebar"] button')).find(b=>b.title==='搭建 VEXNAR 官网').click()`)
    await wait(`document.querySelectorAll('[aria-label="待发送图片"] img').length===1`)
    await new Promise((resolve)=>setTimeout(resolve,150))
    fs.writeFileSync(
      path.join(output, 'composer-paste.png'),
      (await w.webContents.capturePage()).toPNG()
    )
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
        `window.__uiFixture.snapshot().lastSend?.attachments?.length===1 && window.__uiFixture.snapshot().savedMessages.some(m=>m.attachments?.length===1) && window.__uiFixture.snapshot().effort==='high'`
      ))
    )
      throw Error('Image persistence/send context mismatch')
    w.setSize(1000,760)
    await new Promise((resolve)=>setTimeout(resolve,200))
    if(await run(`document.querySelector('[data-testid="chat-composer"]').scrollWidth>document.querySelector('[data-testid="chat-composer"]').clientWidth`)) throw Error('Composer overflows at minimum window width')
    const openHistoryFixture = `Array.from(document.querySelectorAll('[data-testid="chat-sidebar"] button')).find(b=>b.title==='检查 LLM 网关').click()`
    await run(`window.__uiFixture.seedOrdered()`)
    await run(openHistoryFixture)
    await wait(`[...document.querySelectorAll('[data-flow]')].map(row=>row.dataset.flow).join(',')==='reasoning,call,call,text,reasoning,call,text'`)
    if (await run(`document.body.textContent.includes('PRIVATE_FLOW_FIXTURE')`)) throw Error('Ordered transcript rendered raw reasoning')
    await run(`document.querySelector('[data-flow="call"] summary').click()`)
    await wait(`document.querySelector('[data-flow="call"] details[data-call-sequence] summary')?.textContent.includes('Bash')`)
    const inlineTerminal = `document.querySelector('[data-flow="call"] details[data-call-sequence]')`
    await wait(`(${inlineTerminal}).querySelector('section[aria-label="终端命令"] pre')?.textContent.includes('$ ls') && (${inlineTerminal}).textContent.includes('README.md') && (${inlineTerminal}).querySelector('footer')?.textContent==='成功'`)
    await run(`(${inlineTerminal}).scrollIntoView({block:'center'})`)
    fs.writeFileSync(path.join(output, 'chat-terminal-details.png'), (await w.webContents.capturePage()).toPNG())
    const delegatedCall = `[...document.querySelectorAll('[data-flow="call"] details[data-call-sequence]')].find(row=>row.querySelector('summary').textContent.includes('ExecuteExtraTool'))`
    await run(`(${delegatedCall}).querySelector('summary').click()`)
    await wait(`[...document.querySelectorAll('[data-flow="call"] details[data-call-sequence]')].some(row=>row.textContent.includes('mcp__files__read_file') && row.textContent.includes('README.md') && row.textContent.includes('无法读取调用详情'))`)
    const openDelegated = `[...document.querySelectorAll('[data-flow="call"] details[data-call-sequence]')].find(row=>row.textContent.includes('mcp__files__read_file'))`
    await run(`[...(${openDelegated}).querySelectorAll('button')].find(e=>e.textContent==='重新读取').click()`)
    await wait(`(${openDelegated}).textContent.includes('文档内容') && (${openDelegated}).textContent.includes('README.md')`)

    for (const label of ['制品', '差异视图', '差异表', '结构化数据', '洞察卡', '比较']) {
      await wait(`!!document.querySelector('section[aria-label="${label}"]')`)
    }
    const artifact = `document.querySelector('section[aria-label="制品"]')`
    await wait(`(${artifact}).textContent.includes('修订内容')`)
    await run(`[...(${artifact}).querySelectorAll('button')].find(e=>e.textContent==='上一页').click()`)
    await wait(`(${artifact}).textContent.includes('初版内容')`)

    fs.writeFileSync(path.join(output, 'chat-ordered.png'), (await w.webContents.capturePage()).toPNG())
    await run(`window.__uiFixture.seedHistoricalCall()`)
    await run(openHistoryFixture)
    await wait(`!!document.querySelector('[data-flow="result"] summary')`)
    await run(`document.querySelector('[data-flow="result"] summary').click()`)
    await wait(`document.querySelector('[data-flow="result"] pre')?.textContent==='archived result'`)
    await run(showWork)
    const oldResult = `[...document.querySelectorAll('summary')].find(el=>el.textContent.includes('工具事件 · 1 条'))`
    await wait(`!!(${oldResult})`)
    await run(`(${oldResult}).click()`)
    await wait(`!!(${oldResult}).parentElement.querySelector('ol button')`)
    await run(`(${oldResult}).parentElement.querySelector('ol button').click()`)
    const historicalPanel = `document.querySelector('section[aria-label="历史调用"]')`
    await wait(`(${historicalPanel})?.textContent.includes('archivist')`)
    await run(`(${historicalPanel}).querySelector('summary').click()`)
    await wait(`(${historicalPanel})?.textContent.includes('archived result')`)
    await wait(`(${historicalPanel})?.textContent.includes('archive.md')`)
    await run(showChat)
    await run(`window.__uiFixture.seedThinking()`)
    await run(openHistoryFixture)
    await wait(`document.querySelector('[data-execution-phase="reasoning"]')?.textContent.includes('正在思考')`)
    if (await run(`document.body.textContent.includes('PRIVATE_REASONING_FIXTURE')`)) throw Error('Private reasoning entered the chat UI')
    fs.writeFileSync(path.join(output, 'chat-reasoning.png'), (await w.webContents.capturePage()).toPNG())
    await run(`window.__uiFixture.startDraft()`)
    await run(`Array.from(document.querySelectorAll('[data-testid="chat-sidebar"] button')).find(b=>b.title==='检查 LLM 网关').click()`)
    await wait(`document.body.textContent.includes('你好，正在生成答复')`)
    await wait(`document.querySelector('aside[aria-label="1 项等待审批"] button')?.textContent==='查看审批'`)

    await run(showWork)
    const liveActivity = `[...document.querySelectorAll('summary')].find(e=>e.textContent.includes('工具活动 · 1 项'))`
    await wait(`(${liveActivity})?.textContent.includes('1 项运行中')`)
    await run(`(${liveActivity}).click()`)
    await wait(`!!(${liveActivity}).parentElement.querySelector('select')`)
    await selectStatus(liveActivity, 'running')
    await wait(`(${liveActivity}).parentElement.querySelector('details')?.textContent.includes('read_file')`)
    await run(`window.__uiFixture.finishDraft()`)
    await wait(`!document.querySelector('aside[aria-label="1 项等待审批"]')`)

    await wait(`(${liveActivity})?.textContent.includes('1 项失败') && (${liveActivity}).parentElement.textContent.includes('没有符合当前状态的调用')`)
    await selectStatus(liveActivity, 'error')
    await wait(`(${liveActivity}).parentElement.querySelector('details')?.textContent.includes('read_file')`)
    await run(showChat)
    await wait(`document.body.textContent.includes('你好，已恢复到完整答复。')`)
    await openMenu('通知')
    await wait(`[...document.querySelectorAll('[role="menuitem"]')].some(e=>e.textContent.includes('等待会话审批'))`)
    await run(`[...document.querySelectorAll('[role="menu"] button')].find(e=>e.textContent==='会话摘要').click()`)
    await wait(`document.querySelector('[aria-label="会话摘要"]')?.textContent.includes('回合已完成1')`)
    await run(`[...document.querySelectorAll('[role="menu"] button')].find(e=>e.textContent==='全部标为已读').click()`)
    await wait(`JSON.parse(localStorage.getItem('vexnar-chat-notice-read-v1')).length===2`)
    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
    await wait(`!document.querySelector('[role="menu"]')`)
    const listSize = await run(`window.__uiFixture.sessionIndex().length`)
    const sidebar = `document.querySelector('[data-testid="chat-sidebar"]')`
    if (await run(`(${sidebar}).textContent.includes('空会话夹具')`)) throw Error('Legacy blank chats are visible')
    const expandRecent = `[...(${sidebar}).querySelectorAll('button')].find(el=>el.textContent.includes('展开其余'))`
    await wait(`!!(${expandRecent})`)
    await run(`(${expandRecent}).click()`)
    await wait(`[...(${sidebar}).querySelectorAll('button')].filter(el=>el.title?.startsWith('旧会话 ')).length===6`)
    const newLooseDraft = `[...(${sidebar}).querySelectorAll('button')].find(el=>el.textContent.trim()==='新聊天').click()`
    for (let i = 0; i < 4; i++) await run(newLooseDraft)
    await wait(`window.__uiFixture.sessionIndex().length===${listSize}`)

    await run(`document.querySelector('[data-testid="chat-sidebar"] button[aria-label="新建项目"]').click()`)
    await wait(`[...document.querySelectorAll('[data-project-id]')].some(e=>e.textContent.includes('empty-project') && e.textContent.includes('暂无聊天'))`)
    await run(`document.querySelector('button[aria-label="在 empty-project 中新聊天"]').click()`)
    await wait(`document.querySelector('[aria-label="选择会话工作区"]').textContent.includes('empty-project')`)
    await changeDraft('项目草稿')
    await run(`[...document.querySelectorAll('[data-testid="chat-sidebar"] button')].find(e=>e.textContent.trim()==='新聊天').click()`)
    await wait(`document.querySelector('[aria-label="选择会话工作区"]').textContent.includes('未选择工作区')`)
    await wait(`document.querySelector('[data-testid="chat-composer"] textarea').value===''`)
    if (await run(`window.__uiFixture.sessionIndex().length!==${listSize}`)) throw Error('Draft navigation created a persisted chat')
    await changeDraft('独立草稿')
    await openMenu('选择会话工作区')
    await clickMenu('empty-project')
    await wait(`document.querySelector('[data-testid="chat-composer"] textarea').value==='项目草稿'`)
    await run(`document.querySelector('button[aria-label="发送"]').click()`)
    await wait(`window.__uiFixture.snapshot().lastSend?.message==='项目草稿'`)
    await wait(`window.__uiFixture.sessionIndex().length===${listSize + 1} && window.__uiFixture.sessionIndex().some(row=>String(row.id)===window.__uiFixture.snapshot().lastSend.sessionId && row.workspace==='/fixture/empty-project' && row.project_id!=null)`)
    await run(`[...document.querySelectorAll('[data-testid="chat-sidebar"] button')].find(e=>e.textContent.trim()==='新聊天').click()`)
    await wait(`document.querySelector('[data-testid="chat-composer"] textarea').value==='独立草稿'`)
    await run(`document.querySelector('button[aria-label="发送"]').click()`)
    await wait(`window.__uiFixture.snapshot().lastSend?.message==='独立草稿'`)
    await wait(`window.__uiFixture.sessionIndex().length===${listSize + 2} && window.__uiFixture.sessionIndex().some(row=>String(row.id)===window.__uiFixture.snapshot().lastSend.sessionId && row.workspace==='' && row.project_id==null)`)
    await wait(`window.__uiFixture.sessionIndex().find(row=>row.id===1).project_id===1`)
    await wait(`[...(${sidebar}).querySelectorAll('button')].some(el=>el.title==='独立草稿')`)
    w.setSize(1440, 1000)
    await wait(`document.querySelector('[data-chat-workspace]').getBoundingClientRect().width > 780`)
    await wait(`!!document.querySelector('button[aria-label="发送"]')`)
    await changeDraft('第二轮核对')
    await run(`document.querySelector('button[aria-label="发送"]').click()`)
    await wait(`window.__uiFixture.snapshot().lastSend?.message==='第二轮核对' && document.querySelectorAll('[data-workspace-turn]').length===2`)
    await run(`document.querySelector('[data-workspace-turn]').click()`)
    await wait(`document.querySelector('article[aria-label="用户消息"]').textContent.includes('独立草稿')`)
    await wait(`!!document.querySelector('button[aria-label="发送"]')`)
    await new Promise(resolve => setTimeout(resolve, 220))
    fs.writeFileSync(path.join(output, 'dsh-workspace-conversation.png'), (await w.webContents.capturePage()).toPNG())
    const createdRow = `[...(${sidebar}).querySelectorAll('button')].find(el=>el.title==='独立草稿')`
    await run(`(${createdRow}).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`)
    await wait(`!!document.querySelector('[role="dialog"] input[aria-label="会话标题"]')`)
    await run(`(()=>{const input=document.querySelector('[role="dialog"] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'验收会话');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await run(`document.querySelector('[role="dialog"] button[type="submit"]').click()`)
    await wait(`!document.querySelector('[role="dialog"]') && [...(${sidebar}).querySelectorAll('button')].some(el=>el.title==='验收会话')`)
    const renamedRow = `[...(${sidebar}).querySelectorAll('button')].find(el=>el.title==='验收会话')`
    const askDelete = async () => {
      await run(`(${renamedRow}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,button:2}))`)
      await wait(`[...document.querySelectorAll('[role="menuitem"]')].some(el=>el.textContent.trim()==='删除')`)
      await clickMenu('删除')
      await wait(`document.querySelector('[role="dialog"]')?.textContent.includes('验收会话')`)
    }
    await askDelete()
    await run(`[...document.querySelectorAll('[role="dialog"] button')].find(el=>el.textContent==='取消').click()`)
    await wait(`!document.querySelector('[role="dialog"]') && !!(${renamedRow})`)
    await askDelete()
    await run(`document.querySelector('[role="dialog"] button[type="submit"]').click()`)
    await wait(`!document.querySelector('[role="dialog"]') && !(${renamedRow}) && window.__uiFixture.sessionIndex().length===${listSize + 1}`)
    await wait(`!!document.querySelector('[data-chat-workspace] h1')`)
    await new Promise(resolve => setTimeout(resolve, 220))
    fs.writeFileSync(path.join(output, 'dsh-workspace-empty.png'), (await w.webContents.capturePage()).toPNG())
    const lightSurface = await run(`getComputedStyle(document.querySelector('[data-testid="chat-composer"]')).backgroundColor`)
    await run(`document.documentElement.dataset.theme='dark'`)
    await wait(`getComputedStyle(document.querySelector('[data-testid="chat-composer"]')).backgroundColor!==${JSON.stringify(lightSurface)}`)
    fs.writeFileSync(path.join(output, 'dsh-workspace-dark.png'), (await w.webContents.capturePage()).toPNG())
    await run(`document.documentElement.dataset.theme='light'`)

    const stopCount = await run(`window.__uiFixture.snapshot().stopConversationCalls`)
    await run(`window.__uiFixture.seedThinking()`)
    await run(openHistoryFixture)
    await wait(`!!document.querySelector('[data-execution-phase="reasoning"]')`)
    await run(`[...document.querySelectorAll('[data-testid="chat-sidebar"] button')].find(e=>e.textContent.trim()==='新聊天').click()`)
    await wait(`document.querySelector('[aria-label="选择会话工作区"]').textContent.includes('未选择工作区')`)
    if (await run(`window.__uiFixture.snapshot().stopConversationCalls!==${stopCount}`)) throw Error('Opening another draft cancelled the previous conversation')
    await run(openHistoryFixture)
    await wait(`!!document.querySelector('[data-execution-phase="reasoning"]')`)

    console.log('Screenshots:', output)
    console.log(
      'UI OK: chat workspace, rename and confirmed deletion, turn navigation, paged chat history, chat actions and phases, individual chronological tool rows and expanded details, virtual audit log, notifications, approvals and execution work view, reopened reply, reasoning display, project and loose draft lifecycle, settings, release tooltip, sidebar drag, access mode, workspace, pasted image persistence/send',
      JSON.stringify(layout)
    )
    app.exit(0)
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})

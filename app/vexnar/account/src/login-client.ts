// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

const api = '/vexnar-api/platform'

/** 端点返回的 JSON 对象；字段形状由服务端决定，逐个在使用点收窄。 */
type Fields = Record<string, unknown>

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 服务端的文本字段（`error` / `message`）：只有真值才当消息用，非字符串按字符串化结果报。 */
function textOf(value: unknown): string {
  return value ? String(value) : ''
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** `methods` 的来源列表；服务端没给数组就留空。 */
function listOf(value: unknown): string {
  return Array.isArray(value) ? value.join(' · ') : ''
}

const entry = document.getElementById('vexnar-sign-in')
// 响应不一定是 JSON（例如某个反向代理或旧后端回了一段纯文本）。先取文本再解析，
// 解析失败时给出人话错误，而不是把解析器的 "Unexpected ..." 原文显示到登录页。
const read = async (path: string, method = 'GET', data?: unknown): Promise<Fields> => {
  let response: Response
  try {
    const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
    if (data !== undefined) init.body = JSON.stringify(data)
    response = await fetch(api + path, init)
  } catch {
    throw new Error('无法连接 VEXNAR 服务，请确认客户端仍在运行')
  }
  const raw = await response.text().catch(() => '')
  let body: unknown
  try {
    body = raw.trim() === '' ? {} : JSON.parse(raw)
  } catch {
    body = undefined
  }
  if (!response.ok) {
    const failure = textOf(isFields(body) ? body.error : undefined)
    throw new Error(failure !== '' ? failure : (response.status === 404
      ? 'VEXNAR 服务缺少账号接口（HTTP 404），请重启客户端'
      : `请求失败（HTTP ${response.status}）`))
  }
  if (body === undefined) throw new Error('VEXNAR 服务返回了无法解析的响应，请重启客户端')
  return isFields(body) ? body : {}
}

if (entry) {
  /** 这个页面的 DOM 由 login-page.ts 的模板固定给出；缺元素说明模板与脚本不同步。 */
  const node = (id: string): HTMLElement => {
    const found = document.getElementById(id)
    if (found === null) throw new Error(`登录页缺少 #${id}`)
    return found
  }
  const form = (id: string): HTMLFormElement => {
    const found = document.getElementById(id)
    if (!(found instanceof HTMLFormElement)) throw new Error(`登录页缺少表单 #${id}`)
    return found
  }
  /** 表单字段按 name 取：模板里的用户名、密码、验证码名称固定。 */
  const input = (owner: HTMLFormElement, name: string): HTMLInputElement => {
    const control = owner.elements.namedItem(name)
    if (!(control instanceof HTMLInputElement)) throw new Error(`登录表单缺少 ${name} 字段`)
    return control
  }
  const password = form('password-login')
  const verify = form('verify-login')
  const browser = node('browser-options')
  const browserButton = node('browser-login')
  const retry = node('retry')
  const notice = node('notice')
  let challenge: unknown
  let running = false
  const message = (text: string, error = false) => {
    notice.textContent = text
    notice.dataset.error = String(error)
  }
  // 只要有身份就进工作区：模型不可用属于「设置 → 模型」里能修的问题，
  // 不该把用户挡在登录页上反复登录。
  const present = (account: Fields): boolean => {
    if (account.signed_in) {
      location.replace('/')
      return true
    }
    return false
  }
  const showError = (error: unknown) => message(errorText(error), true)

  async function initialize(): Promise<void> {
    try {
      retry.hidden = true
      const account = await read('/account')
      if (present(account)) return
      const methods = await read('/methods')
      challenge = undefined
      verify.hidden = true
      password.hidden = !methods.password
      browser.hidden = false
      node('methods').textContent = listOf(methods.methods)
      if (account.reauth_required) message('请重新验证平台身份，以初始化 VEXNAR 的访问令牌。')
      else if (account.signed_in) message('平台未能提供可用的模型凭据。请重新登录以重试。', true)
      else message('')
    } catch (error) {
      retry.hidden = false
      showError(error)
    }
  }

  const work = async (action: () => Promise<void>): Promise<void> => {
    if (running) return
    running = true
    for (const button of entry.querySelectorAll<HTMLButtonElement>('button')) button.disabled = true
    try {
      await action()
    } catch (error) {
      showError(error)
    } finally {
      running = false
      for (const button of entry.querySelectorAll<HTMLButtonElement>('button')) button.disabled = false
    }
  }

  password.addEventListener('submit', event => {
    event.preventDefault()
    void work(async () => {
      message('正在验证账号…')
      const data = Object.fromEntries(new FormData(password))
      input(password, 'password').value = ''
      const response = await read('/login/password', 'POST', data)
      if (response.challenge) {
        challenge = response.challenge
        password.hidden = true
        verify.hidden = false
        input(verify, 'code').focus()
        message('请输入平台两步验证码，或使用平台窗口完成验证。')
      } else if (!present(response)) await initialize()
    })
  })

  verify.addEventListener('submit', event => {
    event.preventDefault()
    void work(async () => {
      message('正在验证验证码…')
      const code = input(verify, 'code').value
      input(verify, 'code').value = ''
      if (!present(await read('/login/verify', 'POST', { challenge, code }))) await initialize()
    })
  })

  browserButton.addEventListener('click', () => void work(async () => {
    let state = await read('/login', 'POST', {})
    while (state.state === 'waiting') {
      message(textOf(state.message))
      await new Promise<void>(resolve => setTimeout(resolve, 800))
      state = await read('/login')
    }
    if (state.state === 'done') await initialize()
    else message(textOf(state.message) || '平台登录未完成。', true)
  }))

  node('back').addEventListener('click', () => void work(initialize))
  retry.addEventListener('click', () => void work(initialize))
  void initialize()
} else {
  let checking = false
  async function checkSession(): Promise<void> {
    if (checking || document.hidden) return
    checking = true
    try {
      const session = await read('/ready')
      if (!session.ready) location.replace('/')
    } catch {
      // A temporary transport outage does not discard the current view.
    } finally {
      checking = false
    }
  }
  setInterval(checkSession, 10_000)
  document.addEventListener('visibilitychange', checkSession)
}

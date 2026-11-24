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
  return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean).join(' · ') : ''
}

const entry = document.getElementById('vexnar-sign-in')
// 响应不一定是 JSON（例如某个反向代理或旧后端回了一段纯文本）。先取文本再解析，
// 解析失败时给出人话错误，而不是把解析器的 "Unexpected ..." 原文显示到登录页。
const read = async (path: string, method = 'GET', data?: unknown): Promise<Fields> => {
  let response: Response
  let raw: string
  const signal = method === 'GET' ? AbortSignal.timeout(15_000) : undefined
  try {
    const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
    if (signal) init.signal = signal
    if (data !== undefined) init.body = JSON.stringify(data)
    response = await fetch(api + path, init)
    raw = await response.text()
  } catch {
    if (signal?.aborted) throw new Error('等待 VEXNAR 响应超时，请重试')
    throw new Error('无法连接 VEXNAR 服务，请确认客户端仍在运行')
  }
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
  /**
   * 登录页 DOM 由 login-page.ts 的模板给出；脚本可能与模板不是同一版（热替换、
   * 缓存、或者插件文件刚被 setup 换过）。所以：
   *   - 必需元素（表单、令牌输入、状态行）缺一个就整体报错，并把原因写到状态行；
   *   - 可选元素（显示/隐藏、重试、方法列表）缺了只是少一个按钮，不让登录失效。
   */
  const node = <T extends HTMLElement>(id: string): T | null =>
    document.getElementById(id) as T | null

  const notice = node<HTMLParagraphElement>('notice')
  const message = (text: string, state: 'busy' | 'ready' | 'error' = 'ready') => {
    if (notice === null) return
    notice.textContent = text
    notice.dataset.state = state
    notice.dataset.error = String(state === 'error')
  }

  try {
    const form = document.getElementById('token-login')
    if (!(form instanceof HTMLFormElement)) throw new Error('登录表单 #token-login')
    const control = form.elements.namedItem('access_token')
    if (!(control instanceof HTMLInputElement)) throw new Error('访问令牌输入框')
    const tokenForm = form
    const token = control
    const reveal = node<HTMLButtonElement>('reveal')
    const retry = node<HTMLButtonElement>('retry')
    const methods = node<HTMLElement>('methods')
    let running = false

    // 从退出登录跳回来时，登录页要说清楚"为什么回到这里、删掉了什么"。
    if (new URLSearchParams(location.search).get('signed-out') === '1') {
      message('已退出登录：访问令牌与保存的 APIKEY 已删除。', 'ready')
    }

    // 有效的平台身份即可进入工作区，旧凭据按宿主门禁要求重新验证。
    const present = (account: Fields): boolean => {
      if (account.signed_in && !account.reauth_required) {
        location.replace('/')
        return true
      }
      return false
    }
    const showError = (error: unknown) => message(errorText(error), 'error')

    async function initialize(): Promise<void> {
      try {
        if (retry !== null) retry.hidden = true
        if (new URLSearchParams(location.search).get('signed-out') === '1') return
        message('正在检查账户状态…', 'busy')
        const account = await read('/account')
        if (present(account)) return
        message(account.reauth_required ? '账户凭据已失效，请用访问令牌重新验证。' : '已连接 VEXNAR，请粘贴访问令牌继续。')
        void read('/methods').then(result => {
          if (methods === null) return
          const text = listOf(result.methods)
          methods.textContent = text === '' ? '' : `平台登录方式：${text}`
        }).catch(() => {})
      } catch (error) {
        if (retry !== null) retry.hidden = false
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

    tokenForm.addEventListener('submit', event => {
      event.preventDefault()
      void work(async () => {
        if (token.value.trim() === '') {
          message('请先粘贴访问令牌。', 'error')
          token.focus()
          return
        }
        message('正在验证访问令牌并同步模型…', 'busy')
        const secret = token.value.trim()
        token.value = ''
        if (!present(await read('/login/token', 'POST', { access_token: secret }))) await initialize()
      })
    })

    /**
     * 账号密码登录：走网关的 /api/user/login。开启两步验证的账号先拿到 challenge，
     * 这时把密码表单换成验证码输入，验证通过后同样落到工作区。
     */
    const passwordForm = node<HTMLFormElement>('password-login')
    const verifyForm = node<HTMLFormElement>('verify-login')
    let challenge = ''

    const field = (form: HTMLFormElement, name: string): string => {
      const control = form.elements.namedItem(name)
      return control instanceof HTMLInputElement ? control.value : ''
    }

    if (passwordForm !== null) {
      passwordForm.addEventListener('submit', event => {
        event.preventDefault()
        const form = passwordForm
        void work(async () => {
          const username = field(form, 'username').trim()
          const secret = field(form, 'password')
          if (username === '' || secret === '') {
            message('请填写账号与密码。', 'error')
            return
          }
          message('正在登录…', 'busy')
          const result = await read('/login/password', 'POST', { username, password: secret })
          const pending = typeof result.challenge === 'string' ? result.challenge : ''
          if (pending !== '') {
            challenge = pending
            form.hidden = true
            if (verifyForm !== null) {
              verifyForm.hidden = false
              const code = verifyForm.elements.namedItem('code')
              if (code instanceof HTMLInputElement) code.focus()
            }
            message('需要两步验证码才能完成登录。')
            return
          }
          if (!present(result)) message('登录未完成，请检查账号与密码。', 'error')
        })
      })
    }

    if (verifyForm !== null) {
      verifyForm.addEventListener('submit', event => {
        event.preventDefault()
        const form = verifyForm
        void work(async () => {
          const code = field(form, 'code').trim()
          if (code === '') {
            message('请输入验证码。', 'error')
            return
          }
          message('正在验证…', 'busy')
          if (!present(await read('/login/verify', 'POST', { challenge, code }))) {
            message('验证码不正确或已过期。', 'error')
          }
        })
      })
    }

    if (reveal !== null) {
      reveal.addEventListener('click', () => {
        const shown = token.type === 'text'
        token.type = shown ? 'password' : 'text'
        reveal.textContent = shown ? '显示' : '隐藏'
        reveal.setAttribute('aria-pressed', String(!shown))
        reveal.setAttribute('aria-label', shown ? '显示访问令牌' : '隐藏访问令牌')
        token.focus()
      })
    }

    if (retry !== null) retry.addEventListener('click', () => void work(initialize))
    void initialize()
  } catch (error) {
    message(`登录页加载失败（${errorText(error)}），请重启 VEXNAR 后重试。`, 'error')
  }
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

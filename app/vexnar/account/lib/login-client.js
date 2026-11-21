// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

const api = '/vexnar-api/platform'
const entry = document.getElementById('vexnar-sign-in')
const read = async (path, method = 'GET', data) => {
  const response = await fetch(api + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data)
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

if (entry) {
  const node = id => document.getElementById(id)
  const password = node('password-login')
  const verify = node('verify-login')
  const browser = node('browser-options')
  const browserButton = node('browser-login')
  const retry = node('retry')
  const notice = node('notice')
  let challenge
  let running = false
  const message = (text, error = false) => {
    notice.textContent = text
    notice.dataset.error = String(error)
  }
  const present = account => {
    if (account.ready) {
      location.replace('/')
      return true
    }
    return false
  }
  const showError = error => message(error.message, true)

  async function initialize() {
    try {
      retry.hidden = true
      const account = await read('/account')
      if (present(account)) return
      const methods = await read('/methods')
      challenge = undefined
      verify.hidden = true
      password.hidden = !methods.password
      browser.hidden = false
      node('methods').textContent = methods.methods.join(' · ')
      if (account.reauth_required) message('请重新验证平台身份，以初始化 VEXNAR 的访问令牌。')
      else if (account.signed_in) message('平台未能提供可用的模型凭据。请重新登录以重试。', true)
      else message('')
    } catch (error) {
      retry.hidden = false
      showError(error)
    }
  }

  async function work(action) {
    if (running) return
    running = true
    for (const button of entry.querySelectorAll('button')) button.disabled = true
    try {
      await action()
    } catch (error) {
      showError(error)
    } finally {
      running = false
      for (const button of entry.querySelectorAll('button')) button.disabled = false
    }
  }

  password.addEventListener('submit', event => {
    event.preventDefault()
    void work(async () => {
      message('正在验证账号…')
      const data = Object.fromEntries(new FormData(password))
      password.elements.password.value = ''
      const response = await read('/login/password', 'POST', data)
      if (response.challenge) {
        challenge = response.challenge
        password.hidden = true
        verify.hidden = false
        verify.elements.code.focus()
        message('请输入平台两步验证码，或使用平台窗口完成验证。')
      } else if (!present(response)) await initialize()
    })
  })

  verify.addEventListener('submit', event => {
    event.preventDefault()
    void work(async () => {
      message('正在验证验证码…')
      const code = verify.elements.code.value
      verify.elements.code.value = ''
      if (!present(await read('/login/verify', 'POST', { challenge, code }))) await initialize()
    })
  })

  browserButton.addEventListener('click', () => void work(async () => {
    let state = await read('/login', 'POST', {})
    while (state.state === 'waiting') {
      message(state.message)
      await new Promise(resolve => setTimeout(resolve, 800))
      state = await read('/login')
    }
    if (state.state === 'done') await initialize()
    else message(state.message || '平台登录未完成。', true)
  }))

  node('back').addEventListener('click', () => void work(initialize))
  retry.addEventListener('click', () => void work(initialize))
  void initialize()
} else {
  let checking = false
  async function checkSession() {
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

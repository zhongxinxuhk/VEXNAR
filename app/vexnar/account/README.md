<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# @vexnar/dsh-account

VEXNAR 在 dsh 设置面板里的「账户」页。上游 DeepSeek 账户组件由 profile patch 禁用，
本插件接管登录与状态展示。

## 登录方式 = NewAPI 上启用的全部方式

不重复实现 provider，而是读 NewAPI 自己的配置再决定怎么登：

- **发现**：`GET {api}/api/status` → `password_login_enabled`、`github_oauth`、
  `custom_oauth_providers`、`linuxdo_oauth`、`oidc_enabled`、`wechat_login`、
  `telegram_oauth`、`passkey_login`、`email_verification`、`turnstile_check`。
- **密码**：走 NewAPI `POST {api}/api/user/login`，用会话 cookie 创建 API Key。
- **其它全部方式**（GitHub / GitLab / Gitee / Modelscope / GitCode / LinuxDO /
  OIDC / 微信 / Telegram / Discord / Passkey / 2FA）：打开一个真正的 Chrome 窗口到
  `{platform}/login`，用户用任意方式完成登录，Host 读取会话 cookie、创建 API Key、关闭窗口。
  这是唯一能覆盖"所有已配置方式"且不用逐个实现 provider 的做法。
- **手动**：API 根地址 + Key，适配关闭网页登录的部署。

登录成功后：

1. `ctx.credentials.set('VEXNAR_NEWAPI_KEY', key)` 写入 dsh 凭据库；
2. `ctx.settings.update('llm-pi-ai', { providers: { vexnar: { baseURL, apiKeyEnv, models } } })`
   注册 provider 路由；
3. 账户信息写入 `$DSH_HOME/vexnar-account.json`（0600），重启后自动恢复。

**模型请求由 dsh 的 pi-ai 适配器直连 NewAPI，不经过 Go 网关。** 浏览器只拿到
`/vexnar-account/*` 的同源结果，key 只在 Host 的凭据库里。

## 路由（Host 半）

| 路由 | 作用 |
|---|---|
| `GET  /vexnar-account/methods` | 发现 NewAPI 登录方式 |
| `POST /vexnar-account/login/password` | 用户名密码登录 + 建 Key + 配 Go |
| `POST /vexnar-account/login/browser` | 启动浏览器登录（异步） |
| `GET  /vexnar-account/login/browser/status` | 轮询登录状态 |
| `POST /vexnar-account/login` | 手动 base_url/key/model |
| `GET  /vexnar-account/status` | Go 侧当前配置 |
| `POST /vexnar-account/logout` | 清除 Go 侧凭据 |

## 环境变量

| 变量 | 默认 | 用途 |
|---|---|---|
| `VEXNAR_NEWAPI_API` | `https://api.sec.hn.cn` | API 与 `/v1`（模型请求） |
| `VEXNAR_NEWAPI_PLATFORM` | `https://platform.sec.hn.cn` | 登录页（浏览器登录打开这里） |


| `VEXNAR_BROWSER_PROFILE` | `app/.dsh-home/browser` | 浏览器登录的持久化 profile |

## 边界

- 不改 dsh 上游账户组件，只禁用其 profile 行；
- API Key 不落浏览器存储，浏览器只拿到登录结果；
- 浏览器窗口只访问 NewAPI 站点，登录完成后立即关闭。

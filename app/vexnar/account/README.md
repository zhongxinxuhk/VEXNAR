<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR 账户与模型

启动 Web 或桌面客户端时，VEXNAR 先检查已验证的账号与可用模型，通过后才打开工作区；
未登录时整个工作区被登录页替换，其他请求一律 401，不存在"能进但全是空数据"的中间状态。
退出登录会清除本机账号、模型密钥与已注册的提供方，并回到登录页。

登录、令牌申请、模型目录全部在 TypeScript 侧完成（`lib/platform-account.js`），
不依赖 Go 服务，也不依赖它的部署版本。支持在登录页直接输入平台密码和两步验证码；
OAuth、Passkey 及要求平台页面验证的方式使用独立浏览器窗口，由
[HXSEC AI Platform](https://platform.sec.hn.cn/login) 完成认证，VEXNAR 在同一次会话里
接收登录结果并在本机校验身份。前端不接收上游会话凭据或 API Key。

登录成功后，VEXNAR 用平台身份申请一个专用模型令牌，从
`https://api.sec.hn.cn/v1/models` 读取模型目录。平台模型使用 Responses，DeepSeek 与自定义
OpenAI 兼容提供方使用 Chat Completions。平台拒绝签发令牌或未返回可用模型时保留登录状态，
并在登录页给出重新登录入口；平台访问令牌未获签发时，个人资料页会显示令牌状态。

模型提供方直接写进 dsh 的 `llm-pi-ai`：`baseURL` 指向真实上游，`apiKeyEnv` 指向本插件
写进 dsh 凭据库的键，模型请求由 dsh 自己发往上游。因此用户可以用自己的
DeepSeek API Key（一键填入）或任意 OpenAI 兼容接口，不必经过平台。

「设置 → 个人资料」显示平台身份、模型目录、协议、访问令牌状态和平台返回的请求计数。
「设置 → 模型」提供 DeepSeek API Key 预设与自定义 OpenAI 兼容接口导入，并可移除已添加的提供方。

| 接口 | 作用 |
|---|---|
| `GET /vexnar-api/platform/account` | 读取账号、凭据配置状态和模型目录 |
| `GET /vexnar-api/platform/methods` | 读取平台启用的登录方式 |
| `POST /vexnar-api/platform/login/password` | 使用平台密码登录 |
| `POST /vexnar-api/platform/login/verify` | 提交两步验证码 |
| `POST /vexnar-api/platform/login` | 启动平台登录窗口 |
| `GET /vexnar-api/platform/login` | 读取平台窗口交接状态 |
| `DELETE /vexnar-api/platform/account` | 退出 VEXNAR |
| `POST /vexnar-api/platform/providers` | 验证并保存自定义或 DeepSeek 模型提供方 |
| `DELETE /vexnar-api/platform/providers` | 移除指定提供方 |

账号与模型密钥保存在 `VEXNAR_HOME/vexnar-account.json`（权限 `0600`），运行时再镜像到
dsh 凭据库供请求解析。本机登录绑定与自动创建的模型令牌期限为 30 天；平台的 API 令牌页面
支持提前撤销已签发令牌。

| 环境变量 | 默认值或含义 |
|---|---|
| `VEXNAR_NEWAPI_PLATFORM` | 平台登录域名，默认 `https://platform.sec.hn.cn` |
| `VEXNAR_NEWAPI_API` | 平台模型 API 根地址，默认 `https://api.sec.hn.cn/v1` |
| `VEXNAR_DEEPSEEK_API` | DeepSeek 模型根地址，默认 `https://api.deepseek.com/v1` |
| `VEXNAR_LOGIN_BROWSER` | Playwright 浏览器通道，默认 `chrome` |

[HXSEC AI Platform API 文档](https://docs.sec.hn.cn/)

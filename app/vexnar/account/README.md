<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR 账户与模型

启动 Web 或桌面客户端时，VEXNAR 检查已验证的账号与模型配置，通过后打开工作区。
旧版本的账号首次升级时需重新验证身份，同一平台账号已添加的自定义模型会保留。
退出登录会回到启动页，并清除本机 Go 服务保存的账号和模型凭据。

支持在启动页直接输入平台密码和两步验证码。OAuth、Passkey 及要求平台页面验证的方式
使用独立的浏览器窗口，由 [HXSEC AI Platform](https://platform.sec.hn.cn/login) 完成认证。
第三方仍使用平台注册的回调地址。VEXNAR 通过同一次浏览器会话接收平台的登录结果，
在本机校验身份，完成后关闭窗口并恢复 App。前端不接收上游会话凭据或 API Key。

Go 使用平台会话校验用户并初始化访问令牌，自动申请模型 API Key，再从
`https://api.sec.hn.cn/v1/models` 读取模型。平台模型使用 Responses，DeepSeek 和自定义
OpenAI 兼容提供方继续使用 Chat Completions。
平台拒绝签发 API Key 或未返回可用模型时，启动页会保留登录状态并提供重新登录。
模型可用但平台访问令牌未获签发时，个人资料页会显示令牌状态。

「设置 → 个人资料」显示平台身份、模型目录、协议、访问令牌状态和平台返回的请求计数。
「设置 → 模型」提供 DeepSeek API Key 预设与自定义 OpenAI 兼容接口导入。

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

Go 模型路由 `/api/desktop/vexnar/openai/vexnar/v1/responses` 由本机启动令牌保护。
上游模型密钥和平台访问令牌保存在 Go 数据目录的 `vexnar-platform.json`，权限为 `0600`。
本机登录绑定和自动创建的模型令牌期限为 30 天。平台的 API 令牌页面支持提前撤销已签发令牌。

| 环境变量 | 默认值或含义 |
|---|---|
| `VEXNAR_DESKTOP_TOKEN` | Go 服务与客户端共用的随机本机启动令牌 |
| `VEXNAR_GO_URL` | 客户端连接的 Go 服务，默认 `http://127.0.0.1:8787` |
| `VEXNAR_NEWAPI_PLATFORM` | Go 与客户端共同的登录域名，默认 `https://platform.sec.hn.cn` |
| `VEXNAR_NEWAPI_API` | Go 使用的模型 API 根地址，默认 `https://api.sec.hn.cn/v1` |
| `VEXNAR_LOGIN_BROWSER` | Playwright 浏览器通道，默认 `chrome` |

[HXSEC AI Platform API 文档](https://docs.sec.hn.cn/)

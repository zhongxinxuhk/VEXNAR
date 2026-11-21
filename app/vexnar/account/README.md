<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR 账户与模型

「设置 → 账户」打开独立的浏览器会话，在 [HXSEC AI Platform](https://platform.sec.hn.cn/login)
完成登录。登录方式随平台配置更新，密码、Passkey、OAuth 和二次验证都在平台页面完成。
本机 Go 服务重新校验平台身份，记录最长 30 天的 VEXNAR 登录状态，并尝试创建同期有效的模型令牌。
若平台要求进一步授权或账号没有可用模型，登录后可以在「设置 → 模型」关联平台 API Key。

「设置 → 模型」提供 DeepSeek API Key 预设和自定义 OpenAI 兼容接口导入。
所有模型提供方的添加、移除和访问都依赖已验证的 VEXNAR 会话。退出登录清除本机 Go 账号和模型凭据。
已签发的平台令牌可以在平台的 API 令牌页面提前撤销，到期后由平台停用。

## 接口

| 接口 | 作用 |
|---|---|
| `GET /vexnar-api/platform/methods` | 读取平台启用的登录方式 |
| `POST /vexnar-api/platform/login` | 启动平台登录窗口 |
| `GET /vexnar-api/platform/login` | 查询浏览器登录进度 |
| `GET /vexnar-api/platform/account` | 读取已验证账号与模型目录 |
| `DELETE /vexnar-api/platform/account` | 退出 VEXNAR |
| `POST /vexnar-api/platform/providers` | 验证并保存模型提供方 |
| `DELETE /vexnar-api/platform/providers` | 移除请求中指定的提供方 |

模型请求走 `/api/desktop/vexnar/openai/{provider}/v1/chat/completions`。
Go 服务使用本机启动令牌验证请求，并在转发时加入上游模型凭据。
账号凭据保存在 Go 数据目录的 `vexnar-platform.json`，权限为 `0600`。网页和客户端模型目录只含提供方和模型信息。

| 环境变量 | 默认值或含义 |
|---|---|
| `VEXNAR_DESKTOP_TOKEN` | Go 服务与两个客户端启动器使用的相同随机令牌 |
| `VEXNAR_GO_URL` | Host 连接的 Go 服务，默认 `http://127.0.0.1:8787` |
| `VEXNAR_NEWAPI_PLATFORM` | Go 与客户端共同的登录域名，默认 `https://platform.sec.hn.cn` |
| `VEXNAR_NEWAPI_API` | Go 使用的模型 API 域名，默认 `https://api.sec.hn.cn` |
| `VEXNAR_LOGIN_BROWSER` | Playwright 浏览器通道，默认 `chrome` |

平台接口见 [HXSEC AI Platform API 文档](https://docs.sec.hn.cn/)。

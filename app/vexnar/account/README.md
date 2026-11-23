<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR 账户与模型

启动 Web 或桌面客户端时，VEXNAR 先检查希灵 AI 账户。未登录时显示登录页，工作区请求返回 401。
退出登录会清除本机账号、模型密钥与已注册的提供方，并回到登录页。

已有平台访问令牌可直接输入。在线登录入口在 Web 版打开新标签，在桌面版打开系统浏览器。
密码、Passkey 和各 OAuth 登录方式由平台配置。在线认证后，在平台个人设置创建或选用
`VERNAX-<UUID>` 访问令牌，粘贴回 VEXNAR 完成登录。

本地 dsh 使用访问令牌校验身份，读取可用的 `VERNAX-<UUID>` 模型 API Key，没有时创建，
并从 `https://api.sec.hn.cn/v1/models` 读取模型目录。平台模型使用 Responses，DeepSeek 与自定义
OpenAI 兼容提供方使用 Chat Completions。访问令牌授权需要覆盖个人资料、模型密钥管理以及余额和订阅读取。

模型提供方直接写进 dsh 的 `llm-pi-ai`：`baseURL` 指向真实上游，`apiKeyEnv` 指向本插件
写进 dsh 凭据库的键，模型请求由 dsh 自己发往上游。因此用户可以用自己的
DeepSeek API Key（一键填入）或任意 OpenAI 兼容接口，不必经过平台。

「设置 → 个人资料」显示平台身份、模型目录、协议、访问令牌状态和平台返回的请求计数。
左下角账户菜单显示希灵 AI 和 DeepSeek 余额，并打开各自的官方充值页。个人资料页显示
希灵 AI 的充值方式与订阅套餐。订阅购买在希灵 AI 钱包中确认。
「设置 → 模型」提供 DeepSeek API Key 预设与自定义 OpenAI 兼容接口导入，并可移除已添加的提供方。

| 接口 | 作用 |
|---|---|
| `GET /vexnar-api/platform/account` | 读取账号、凭据配置状态和模型目录 |
| `GET /vexnar-api/platform/methods` | 读取平台启用的登录方式 |
| `POST /vexnar-api/platform/login/token` | 校验平台访问令牌并同步模型 |
| `GET /vexnar-api/platform/wallet` | 读取两边余额、平台充值方式和订阅 |
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
| `VEXNAR_DEEPSEEK_API` | DeepSeek 模型根地址，默认 `https://api.deepseek.com` |

[HXSEC AI Platform API 文档](https://docs.sec.hn.cn/)

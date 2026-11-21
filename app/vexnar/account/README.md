<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# @vexnar/dsh-account

VEXNAR 在 dsh 设置面板里的「账户」页。上游 DeepSeek 账户组件已由 profile patch 禁用，
本插件接管登录与状态展示。

## 数据流

```text
客户端 settings.section
  → 同源 /vexnar-account/status|login|logout   （本包 Host 半注册）
  → Go /api/desktop/llm[/configure|/clear]     （X-VEXNAR-Desktop-Token）
  → 上游模型服务（key 只在 Go 进程）
```

客户端拿不到 Go token，也拿不到上游 API Key；host 半从环境变量
`VEXNAR_DESKTOP_TOKEN` 注入，`VEXNAR_API_BASE` 覆盖 Go 地址（默认 8787）。

## 页面能力

- 状态：协议、模型、API 根地址、凭据是否已设置；
- 登录/更新：API 根地址、API Key、模型 ID、协议（openai-responses / openai）；
- 退出：清空 Go 侧凭据与内存 provider。

## 构建

```sh
npm install
npm run build     # src/client.tsx -> lib/client.js（loader 工厂格式）
```

Host 半 `lib/index.js` 是普通 ESM，无需构建；路由依赖 dsh 的 `webServer` 服务。

## 边界

- 不改 dsh 上游账户组件，只禁用其 profile 行；
- 不保存任何凭据到浏览器存储；
- 账户状态以 Go 返回为准，不做本地缓存。

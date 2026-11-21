<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# app — dsh 客户端工作区

这里放 **app 端**：DeepSeek Harness（dsh）的本地源码树，加上 VEXNAR 自己的
bundle 层。Go 服务仍是产品本体，app 只通过两个接口消费它：

| 方向 | 接口 | 鉴权 |
|---|---|---|
| 模型推理 | `POST /api/desktop/openai/v1/chat/completions` | `X-VEXNAR-Desktop-Token` |
| 模型目录 | `GET /api/desktop/openai/v1/models` | 同上 |
| 领域工具 | `POST /mcp`（MCP Streamable HTTP） | `Authorization: Bearer <data/mcp.token>` |

## 目录

```text
app/
├─ dsh/                 # 上游源码（gitignored，由 scripts/fetch-dsh.sh 拉取）
├─ scripts/
│  └─ fetch-dsh.sh      # 固定 tag 重新拉取/校验上游
└─ vexnar/
   ├─ cordis.patch.yml  # provider + MCP 的 profile 覆盖层
   ├─ package.json      # dsh bundle 声明
   └─ src/client.ts     # 客户端插件（toolview / 侧栏面板）待实现
```

## 上游版本

- tag：`dsh-v0.2.2-rc.5`
- commit：`9c2670d3bce5275e0d1610272958121af87787bb`
- 许可：MIT（见 `dsh/LICENSE`），上游文件一律不加本仓库的 AGPL 头。

重新拉取或校验：

```sh
bash app/scripts/fetch-dsh.sh
git -C app/dsh rev-parse --short HEAD   # 9c2670d3
```

## 本地跑起来

```sh
cd app/dsh
pnpm install
pnpm --filter @deepseek-ai/dsh build     # 首次需要构建 CLI/web 产物
DSH_HOME="$PWD/.dsh-home" pnpm dsh web   # 起 web profile（默认 127.0.0.1）
```

VEXNAR 侧需要：

1. `data/mcp.token` 存在（MCP 端点启用，默认 loopback）；
2. 启动时导出 `VEXNAR_DESKTOP_TOKEN=<token>`（模型网关）；
3. Go 服务监听 `127.0.0.1:8787`。

app 层通过 `app/vexnar/cordis.patch.yml` 把 provider 指向 Go 网关、把 MCP 指向
`/mcp`；它只是 patch 层，不修改 dsh 上游代码，升级上游只需改 tag 与 patch。

## 边界

- 不把 Go 的会话/任务真相复制到 dsh：dsh 的 session 是客户端本地状态，任务、
  漏洞、流量、资产以 Go 的 PostgreSQL 为准。
- 不在 app 里另建模型目录：模型来自 `GET /api/desktop/openai/v1/models`。
- 上游 `dsh/` 目录内的文件保持 MIT 原样；本目录内 VEXNAR 自己写的文件带 AGPL 头。

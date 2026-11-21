<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# @vexnar/dsh-ui

dsh web 客户端里的 VEXNAR 工具卡片。

| 工具 | 卡片 |
|---|---|
| `mcp__vexnar__report_finding` | 严重级徽标、漏洞类目、finding id、证据流量条数、摘要 |
| `mcp__vexnar__traffic_get` | HTTP 头/正文切换、字节数、一键复制 |

## 构建

```sh
npm install          # 仅首次：esbuild
npm run build        # src/client.tsx -> lib/client.js
```

产物是 dsh Client 模块表要求的闭包工厂：

```js
window.__ModuleLoader__.load({ id: "@vexnar/dsh-ui", factory: (require) => { … } })
```

React 与 `@deepseek-ai/dsh-client-*` 全部 external，由 loader 的 `require` 解析。

## 挂载

```sh
node ../../scripts/setup-app-profile.mjs   # 安装到 dsh profile 并写入 vexnar-ui 行
node ../../scripts/dsh-web.mjs             # 启动后卡片随 tool 调用出现
```

`package.json` 的 `dsh.client.inject` 声明了 `dsh-client-ui-tool` 与
`dsh-client-ui-renderer`，保证槽位声明先于卡片注册。

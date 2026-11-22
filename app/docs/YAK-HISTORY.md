<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Yak 内核流量 History

侧栏「流量」在 VEXNAR 内打开 History。每个来源绑定一个本地工作区和一个独立运行的 Yak 项目。默认客户端由 dsh 进程内的 TypeScript 查询器通过私有 Unix socket 读取已保存流量。Yak 内核由使用方按官方渠道安装和升级，VEXNAR 通过 gRPC 的字段和方法契约连接。 [History 手册](https://www.yaklang.com/products/chapter-2/2-3/2-3-6/) · [Yak gRPC 定义](https://github.com/yaklang/yaklang/blob/1.4.9-beta8/common/yakgrpc/yakgrpc.proto)

## 配置

为每个工作区准备独立的 Yak 实例和项目库。内核按需由使用方启动并维持在绑定的项目。用环境变量 `VEXNAR_YAK_HISTORY_CONFIG` 指定来源配置文件的绝对路径。示例中的 socket 父目录权限为 `0700`，socket 与一行口令文件权限为 `0600`。 `project_id` 取该内核的当前项目 ID。多个会话打开同一个目录时会读同一项目。

```json
[
  {
    "name": "本地项目 A",
    "workspace": "/path/to/workspace-a",
    "socket": "/path/to/private/engine.sock",
    "token_file": "/path/to/private/engine.token",
    "project_id": 1
  }
]
```

独立内核需要已经保存流量记录。侧栏可选上述配置中的来源。会话打开「流量」时，dsh Host 从会话原始工作区解析来源。查询器在读取前后都核对 Yak 当前项目编号，项目不一致时返回冲突。每次查询使用一个专用 IPC 对端，历史浏览只读取所选项目。

## 页面与 Agent

- 查询支持方法、URL、报文关键词、状态码、内容类型、来源、标签和仅 WebSocket 记录。列表可翻页、按列排序、查看本页站点和导出本页 CSV。
- 详情在同一页面显示请求与响应。提供原文、报文头、JSON 格式化及前 4 KiB 的 HEX 视图。单侧原文预览最多 128 KiB。WebSocket 筛选展示握手记录。
- 旧 Go 模式中的 dsh Agent 可通过 `yak_traffic_list` 和 `yak_traffic_get` 查询原有会话项目。TypeScript 查询器服务于本机浏览器。

本工作台覆盖已保存流量的审查。它通过 `GetCurrentProjectEx`、`QueryHTTPFlows` 和 `GetHTTPFlowById` 读取数据。旧 Go 流量与 HAR 导入 API 继续用于 Web 控制台和已绑定证据。

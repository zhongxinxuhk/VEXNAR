<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR Harness 容器镜像

与桌面安装包同一套产物：`overlay:prepare` 生成的覆盖层（VEXNAR 五个插件 + 预装
profile + `extras.json` 里的第三方插件）加上锁定版本的 `@deepseek-ai/dsh` 运行时。
容器首启由 `app/desktop/vexnar-bootstrap.js` 把覆盖层落到 `$DSH_HOME`，随后
`dsh web` 对外提供服务。

## 构建

```sh
docker build -f docker/harness.Dockerfile -t vexnar-harness .
```

构建阶段要联网：装 VEXNAR 插件、第三方插件和运行时，`koffi`/`node-pty` 等原生
模块现场编译（镜像里带 `python3`、`make`、`g++`）。运行镜像只留 Node、运行时和
覆盖层，不带 pnpm 和源码工作树。

## 运行

```sh
docker run -d --name vexnar -p 3142:3142 -v vexnar-data:/data vexnar-harness
```

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3142` | 监听端口 |
| `DSH_HOME` | `/data` | profile 与运行时状态目录，必须挂卷 |
| `HOME` | `/data` | dsh 的 `~/.dsh`（插件数据）跟着进卷 |
| `HOST` | 自动 | 入口脚本取容器第一块非回环 IPv4 网卡地址 |

`dsh` 拒绝绑定 `0.0.0.0`（会把远程代码执行暴露到整个网络），所以入口脚本绑的是
容器自己的网卡地址；Docker 的 `-p` 转发和 Kubernetes 的 pod 网络都落在这个地址上。
容器里没有 Electron，profile 名用 `vexnar`（`desktop` 是 dsh 留给 Electron 的保留名）。

首次访问会跳到 VEXNAR 平台登录页；登录态与桌面客户端共用同一套账号。

## 升级

镜像升级后重启容器即可：`vexnar-bootstrap.js` 按 `overlay.json` 的指纹比对，只
替换插件文件，profile 里的用户数据（会话、配置）保留。镜像回退同样有效。

```sh
docker pull ghcr.io/zhongxinxuhk/vexnar-harness:latest
docker rm -f vexnar && docker run -d --name vexnar -p 3142:3142 -v vexnar-data:/data \
  ghcr.io/zhongxinxuhk/vexnar-harness:latest
```

## 发布

`.github/workflows/harness-image.yml` 在 `app-v*` tag 推送时构建 `linux/amd64` 与
`linux/arm64` 两个架构，合成多架构 manifest 推到 `ghcr.io`，标签为
`<版本号>`、`latest`、`sha-<短提交>`；也可以手动 `workflow_dispatch`，用 `tag`
输入指定额外标签。仓库是公开的，拉取不需要登录。

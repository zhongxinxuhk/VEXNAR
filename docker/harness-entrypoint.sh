#!/bin/sh
# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# 容器入口：先把覆盖层就位，再把进程交给 dsh web。
#
# `vexnar-bootstrap.js` 与桌面安装包用的是同一份逻辑（幂等）：profile 已存在且
# 指纹一致时什么都不做，镜像升级后按指纹替换插件。`VEXNAR_OVERLAY_ONLY=1`
# 让它停在就位这一步，不去加载 Electron 的 main。

set -eu

: "${DSH_HOME:=/data}"
: "${PORT:=3142}"
export DSH_HOME PORT

mkdir -p "$DSH_HOME"
# dsh 把 `desktop` 这个 profile 名留给 Electron 专用，容器里改用普通 profile。
VEXNAR_PROFILE=vexnar \
  VEXNAR_OVERLAY_ONLY=1 VEXNAR_RESOURCES="${VEXNAR_RESOURCES:-/opt/vexnar}" \
  node /opt/vexnar/vexnar-bootstrap.js

# dsh 拒绝绑定 0.0.0.0（会把 RCE 暴露到整个网络）。容器里改绑容器自己的
# 网卡地址：docker 的 -p 转发和 k8s 的 pod 网络都落在这个地址上。
if [ -z "${HOST:-}" ]; then
  HOST="$(node -e "const n=require('os').networkInterfaces();for(const l of Object.values(n))for(const a of l||[])if(a.family==='IPv4'&&!a.internal){console.log(a.address);process.exit(0)}" || true)"
fi
: "${HOST:=127.0.0.1}"
export HOST

exec node /opt/vexnar/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile vexnar --host "$HOST" --port "$PORT" --no-open

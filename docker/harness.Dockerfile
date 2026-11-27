# syntax=docker/dockerfile:1
# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# VEXNAR Harness 容器镜像。
#
# 与桌面安装包同一套产物：`overlay:prepare` 生成的覆盖层（VEXNAR 插件 + 预装
# profile）加锁定版本的 `@deepseek-ai/dsh` 运行时。首启由 `vexnar-bootstrap.js`
# 把覆盖层落到 `$DSH_HOME`，随后 `dsh web` 监听 0.0.0.0。
#
#   docker build -f docker/harness.Dockerfile -t vexnar-harness .
#   docker run --rm -p 3142:3142 -v vexnar-data:/data vexnar-harness
#
# builder 需要联网：要装 VEXNAR 插件、extras.json 里的第三方插件，以及运行时；
# 运行镜像只留 Node 与三份产物，不带 pnpm、编译器或源码工作树。

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.21.0

FROM node:${NODE_VERSION}-bookworm AS build
ARG PNPM_VERSION
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
# koffi / node-pty 等原生模块要现场编译；profile 里也有带原生依赖的插件。
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src/app
COPY app/ ./
COPY assets/logo.png /src/assets/logo.png
# account 的构建要把协议定义拷进 lib（app/vexnar/account/build.ts 里的 ../../../yakhistory）。
COPY yakhistory/ /src/yakhistory/
# 只装 VEXNAR 五个包的闭包，与 .github/workflows/app-build.yml 的 app-bundle 作业一致。
RUN pnpm install --frozen-lockfile \
      --filter @vexnar/dsh-ui... \
      --filter @vexnar/dsh-account... \
      --filter @vexnar/dsh-egress... \
      --filter @vexnar/dsh-tools... \
      --filter @vexnar/core...
RUN pnpm run clean:outputs \
    && pnpm run build \
    && node scripts/check-built-artifacts.mjs
RUN cp /src/assets/logo.png vexnar/account/assets/logo.png
RUN pnpm run overlay:prepare
RUN node scripts/install-dsh-runtime.mjs /opt/vexnar/runtime

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG VEXNAR_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/zhongxinxuhk/VEXNAR" \
      org.opencontainers.image.description="VEXNAR Harness（dsh web）容器镜像" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.version="${VEXNAR_VERSION}"
ENV NODE_ENV=production \
    DSH_HOME=/data \
    HOME=/data \
    VEXNAR_RESOURCES=/opt/vexnar \
    PORT=3142
WORKDIR /opt/vexnar
# lingshu-bridge 插件用 python3 起子进程；slim 镜像默认没有，缺了只在日志里报
# spawn python3 ENOENT，页面上的灵枢入口会静默失效。
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*
# 覆盖层里目录是 0700、文件是 0600（构建机上按用户目录收紧的），不换归属
# 的话非 root 的 node 用户连 profile 都读不到。
COPY --chown=node:node --from=build /opt/vexnar/runtime ./runtime
COPY --chown=node:node --from=build /src/app/.desktop-overlay ./vexnar-overlay
COPY --chown=node:node app/desktop/vexnar-bootstrap.js ./vexnar-bootstrap.js
COPY docker/harness-entrypoint.sh /usr/local/bin/vexnar-entrypoint
RUN chmod 0755 /usr/local/bin/vexnar-entrypoint \
    && mkdir -p /data \
    && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3142
# 未登录时 `/` 返回 401，这是服务正常在跑而不是挂了；只看它有没有回 HTTP。
# dsh 绑的是容器网卡地址而不是回环，探测地址要和入口脚本一致。
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
  CMD node -e "const os=require('os');let h='127.0.0.1';for(const l of Object.values(os.networkInterfaces()))for(const a of l||[])if(a.family==='IPv4'&&!a.internal)h=a.address;fetch('http://'+h+':'+(process.env.PORT||3142)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/vexnar-entrypoint"]

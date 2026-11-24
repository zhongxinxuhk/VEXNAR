// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * VEXNAR Harness 的 electron-builder 配置。
 *
 * 打的是我们自己的壳，不是 vendored 上游那个：上游桌面有 DeepSeek 平台的登录
 * 门禁，装出来只能看到「欢迎使用 / 登录 / 添加 API Key」。这里的主进程直接起
 * `dsh web --profile vexnar` 再开窗，登录由 `@vexnar/dsh-account` 接管。
 *
 * 包内布局：
 *   app.asar                  dist/main.js + package.json
 *   Resources/app/            运行时与插件（extraResources）
 *     runtime/node_modules/   @deepseek-ai/dsh 及其依赖
 *     vexnar/ vexnar-egress/  VEXNAR 插件源
 *     profile/                装好 extras 全部插件的 profile
 */

export default {
  appId: 'com.vexnar.harness',
  productName: 'VEXNAR Harness',
  copyright: 'Copyright © 2026 xuzhongxin',
  directories: {
    output: 'dist-desktop'
  },
  // 只打主进程。运行时依赖走 extraResources，不参与 asar 收集——否则
  // electron-builder 会把 app/node_modules 里那 1.3 GB 的构建依赖全拖进去。
  files: ['desktop/dist/main.js', 'package.json', '!node_modules/**'],
  extraMetadata: { main: 'desktop/dist/main.js' },
  extraResources: [
    { from: 'desktop-resources/app', to: 'app' },
    { from: '../assets/logo.png', to: 'app-icon.png' }
  ],
  asar: true,
  mac: {
    target: [{ target: 'dmg', arch: ['arm64'] }],
    icon: '../assets/app-icon-1024.png',
    category: 'public.app-category.developer-tools',
    // 没有 Developer ID，那就明确不签：ad-hoc 签名至少让 macOS 能跑，
    // 用户首次打开需要右键或去隔离属性。
    identity: null
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: '../assets/app-icon.ico'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'VEXNAR Harness'
  },
  dmg: { title: 'VEXNAR Harness' }
}

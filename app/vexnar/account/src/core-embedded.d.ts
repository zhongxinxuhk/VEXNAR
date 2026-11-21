// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 被 `vexnar-core/build-embedded.ts` 打包出来的 `/vexnar-api` 处理器。
 *
 * 产物是 `lib/core-embedded.js`（生成的，不手写、不加头注释）；这里只声明
 * `src/index.ts` 用到的那个面，让动态 import 有类型可依。
 */
export function handle(request: Request, localPeer: boolean): Promise<Response>
export function isGoDataRequest(method: string | undefined, pathname: string): boolean

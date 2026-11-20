'use strict'

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

const fs = require('node:fs/promises')
const path = require('node:path')

/** Canonical paths prevent a workspace symlink from silently expanding consent. */
async function resolveReadPath(workspace, target, mode, approve) {
  if (!workspace) throw new Error('尚未选择工作区')
  const root = await fs.realpath(workspace)
  const resolved = await fs.realpath(path.resolve(root, target || '.'))
  const relative = path.relative(root, resolved)
  const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  if (outside && mode !== 'full' && !await approve(resolved)) throw new Error('用户未批准工作区外文件读取')
  return resolved
}
module.exports = { resolveReadPath }

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Host half of @vexnar/dsh-ui.
 *
 * All presentation lives in the client bundle (`./client`). The Host side has
 * no services to contribute, but dsh still needs a mountable package row, so
 * this module is an intentionally empty plugin.
 */

export const name = '@vexnar/dsh-ui'

export function apply() {}

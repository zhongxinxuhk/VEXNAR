// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from 'vite';
export default defineConfig({ base: './', publicDir: false, build: { target: 'es2022' } });

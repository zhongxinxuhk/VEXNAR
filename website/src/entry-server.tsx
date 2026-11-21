// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { renderToString } from 'react-dom/server';
import App from './App.tsx';
import type { PageId } from './content.ts';

/** Render one pre-rendered document body for the given route. */
export function render(page: PageId): string { return renderToString(<App initialPage={page} />); }

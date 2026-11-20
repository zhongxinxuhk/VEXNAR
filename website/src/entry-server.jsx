// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App.jsx';
export function render(page) { return renderToString(<App initialPage={page} />); }

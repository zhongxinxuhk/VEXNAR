// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { hydrateRoot } from 'react-dom/client';
import App from './App.tsx';
import { pageFromPath } from './content.ts';
import './style.css';
import './styles/home.css';
import './styles/console.css';
import './styles/architecture.css';
import './styles/credits.css';
import './styles/polish.css';

// index.html owns the mount node, so it is present whenever the bundle runs.
hydrateRoot(document.getElementById('root')!, <App initialPage={pageFromPath(window.location.pathname)} />);

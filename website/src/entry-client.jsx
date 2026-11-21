// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import App from './App.jsx';
import { pageFromPath } from './content.js';
import './style.css';
import './styles/home.css';
import './styles/console.css';
import './styles/architecture.css';

hydrateRoot(document.getElementById('root'), <App initialPage={pageFromPath(window.location.pathname)} />);

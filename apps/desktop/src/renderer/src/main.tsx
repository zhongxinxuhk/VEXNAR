// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { useI18n } from './lib/i18n'

document.documentElement.lang = useI18n.getState().locale === 'zh' ? 'zh-CN' : 'en'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

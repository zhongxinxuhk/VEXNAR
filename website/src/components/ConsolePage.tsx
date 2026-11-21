// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import AgentConsole from '../console/Console.tsx';

// The client page is deliberately bare: no marketing header, footer, search or
// page padding. Opening /console.html should feel like launching the client,
// not like reading a section of the website.
export default function ConsolePage() {
  return <main id="main" className="client-root">
    <h1 className="client-sr">VEXNAR 客户端 · Agent 控制台</h1>
    <AgentConsole mode="client" initialView="chat" />
  </main>;
}

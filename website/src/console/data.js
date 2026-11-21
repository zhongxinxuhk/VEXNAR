// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

// Every value below is demo content rendered by React in the browser. Hosts use
// the reserved .test TLD, nothing here is fetched, measured or transmitted.
export const task = {
  id: 'T-2407',
  name: 'acme.test 外部渗透（Web + API）',
  template: 't-acme-web',
  profile: '默认（Claude Opus 4.8）',
  goal: '拿到 admin.acme.test 后台管理权限，确认可否越权读取用户数据',
  status: '探索中',
  elapsed: '34m08s',
  workers: 3,
  intents: 12,
  facts: 8,
  findings: 4,
  assets: 18
};

export const dashboardStats = [
  { id: 'tasks', label: '活跃任务', value: '2 / 4', sub: '探索 2 · 暂停 1 · 完成 1', tone: 'blue', icon: 'target' },
  { id: 'findings', label: '确认发现', value: '10', sub: '高危 4 · 中危 4 · 低危 2', tone: 'red', icon: 'bug' },
  { id: 'assets', label: '资产节点', value: '18', sub: '跨任务共享', tone: 'green', icon: 'network' },
  { id: 'traffic', label: '流量交互', value: '1,412', sub: '证据录制中', tone: 'cyan', icon: 'activity' },
  { id: 'tokens', label: 'Token 用量', value: '2.9M', sub: '入 2.7M · 出 211.7k', tone: 'violet', icon: 'cpu' }
];

export const tokenBreakdown = [
  { label: '输入（未命中）', value: '985.4k', share: 34, tone: 'blue' },
  { label: '缓存命中', value: '1.7M', share: 58, tone: 'green' },
  { label: '输出', value: '211.7k', share: 8, tone: 'violet' }
];

export const tokenRanges = {
  '7天': [['07-18', 0.62, 0.44, 0.06], ['07-22', 0.38, 0.2, 0.04], ['07-24', 1.24, 0.72, 0.12], ['07-25', 0.78, 0.34, 0.09]],
  '30天': [['07-02', 0.42, 0.24, 0.05], ['07-08', 0.56, 0.4, 0.05], ['07-14', 0.71, 0.52, 0.08], ['07-18', 0.62, 0.44, 0.06], ['07-22', 0.38, 0.2, 0.04], ['07-24', 1.24, 0.72, 0.12], ['07-25', 0.78, 0.34, 0.09]],
  '3月': [['05-05', 0.31, 0.16, 0.03], ['05-20', 0.46, 0.28, 0.04], ['06-04', 0.66, 0.42, 0.07], ['06-18', 0.52, 0.36, 0.05], ['07-04', 0.88, 0.58, 0.08], ['07-18', 0.62, 0.44, 0.06], ['07-24', 1.24, 0.72, 0.12], ['07-25', 0.78, 0.34, 0.09]],
  '6月': [['02-10', 0.18, 0.06, 0.02], ['03-06', 0.26, 0.12, 0.03], ['04-02', 0.34, 0.18, 0.04], ['04-24', 0.48, 0.3, 0.05], ['05-20', 0.46, 0.28, 0.04], ['06-18', 0.52, 0.36, 0.05], ['07-24', 1.24, 0.72, 0.12], ['07-25', 0.78, 0.34, 0.09]],
  '一年': [['09-12', 0.12, 0.04, 0.01], ['10-18', 0.16, 0.06, 0.02], ['11-22', 0.22, 0.1, 0.02], ['01-08', 0.28, 0.14, 0.03], ['02-20', 0.34, 0.2, 0.04], ['04-11', 0.5, 0.32, 0.05], ['06-02', 0.58, 0.4, 0.06], ['07-24', 1.24, 0.72, 0.12], ['07-25', 0.78, 0.34, 0.09]]
};

export const activityKinds = ['全部', 'tool_use', 'tool_result', 'text', 'thinking'];

export const activity = [
  { id: 1, worker: 'mainagent', kind: 'tool_use', title: 'bash', text: 'subfinder -d acme.test -silent | httpx -sc -title', time: '5h 前' },
  { id: 2, worker: 'mainagent', kind: 'tool_result', title: 'bash', text: '发现 5 个存活子域，admin.acme.test 返回 Element-UI 后台登录页', time: '5h 前' },
  { id: 3, worker: 'planner', kind: 'thinking', title: '态势研判', text: '后台类目标优先验证默认口令；写操作全部需要审批。', time: '5h 前' },
  { id: 4, worker: 'work#3', kind: 'tool_use', title: 'http_request', text: 'GET https://admin.acme.test/api/menus', time: '4h 前' },
  { id: 5, worker: 'work#3', kind: 'text', title: '结论', text: '菜单接口未校验权限，返回了导出与用户管理入口。', time: '4h 前' },
  { id: 6, worker: 'work#4', kind: 'tool_use', title: 'report_finding', text: 'SQL Injection（error-based）候选，已进入独立复验。', time: '3h 前' },
  { id: 7, worker: 'work#5', kind: 'tool_result', title: 'http_request', text: 'api.acme.test /api/orders/1042 返回他人订单，确认 IDOR。', time: '2h 前' },
  { id: 8, worker: 'planner', kind: 'thinking', title: '下一轮', text: '把「读取用户敏感数据」拆成导出接口与列表分页两条并行意图。', time: '1h 前' }
];

export const findings = [
  { id: 'F-101', title: '后台默认口令', severity: '高危', status: '已验证', target: 'admin.acme.test', scope: 'Acme 官网与后台外部渗透', detail: 'admin.acme.test 的后台登录接口接受 admin / admin123。登录后可访问用户列表与导出功能，全程只读验证，未导出真实数据。', evidence: 'HTTPS 200 · /api/login · token 已脱敏', cwe: 'CWE-1392', time: '5h 前', agent: 'work#3' },
  { id: 'F-102', title: 'Weak JWT 签名', severity: '高危', status: '已提交', target: 'api.acme.test', scope: 'API 越权面梳理', detail: 'JWT 使用弱口令可离线爆破，签名密钥空间不足。已用测试账号验证可伪造普通用户身份。', evidence: 'HS256 · 口令字典命中', cwe: 'CWE-326', time: '5h 前', agent: 'work#5' },
  { id: 'F-103', title: 'IDOR 订单越权读取', severity: '高危', status: '验证中', target: 'api.acme.test', scope: 'API 越权面梳理', detail: 'GET /api/orders/{id} 未校验归属，普通账号可读取他人订单与收货信息。', evidence: 'GET /api/orders/1042 → 他人订单 JSON', cwe: 'CWE-639', time: '6h 前', agent: 'work#5' },
  { id: 'F-104', title: 'SQL 注入（报错型）', severity: '高危', status: '已验证', target: 'www.acme.test', scope: 'Acme 官网与后台外部渗透', detail: 'search 页 q 参数在拼接查询时触发数据库报错，可读取 acme_prod 库结构。验证阶段仅执行 version() 与库名查询。', evidence: 'q=%27%20and%20extractvalue(1,concat(0x7e,version()))', cwe: 'CWE-89', time: '7h 前', agent: 'work#4' },
  { id: 'F-105', title: '错误页泄露堆栈', severity: '中危', status: '待复验', target: 'api.acme.test', scope: 'API 越权面梳理', detail: '未捕获异常返回完整堆栈与框架版本，可作为后续利用的信息面。', evidence: 'HTTP 500 · X-Debug-Token', cwe: 'CWE-209', time: '9h 前', agent: 'work#5' },
  { id: 'F-106', title: '缺少安全响应头', severity: '中危', status: '已修复', target: 'www.acme.test', scope: 'Acme 官网与后台外部渗透', detail: '缺少 CSP、X-Content-Type-Options 与 HSTS，降低浏览器侧纵深。', evidence: '响应头缺失', cwe: 'CWE-693', time: '11h 前', agent: 'work#1' },
  { id: 'F-107', title: '目录列表可浏览', severity: '低危', status: '已修复', target: 'static.acme.test', scope: 'Acme 官网与后台外部渗透', detail: '静态目录开启 autoindex，可枚举历史版本资源。', evidence: 'HTTP 200 · autoindex', cwe: 'CWE-548', time: '12h 前', agent: 'work#1' },
  { id: 'F-108', title: 'TLS 弱加密套件', severity: '低危', status: '已提交', target: 'legacy.acme.test', scope: 'Acme 官网与后台外部渗透', detail: '仍支持 TLS 1.0 与 CBC 套件。', evidence: 'TLS 1.0 · TLS_RSA_WITH_AES_128_CBC_SHA', cwe: 'CWE-326', time: '1d 前', agent: 'work#1' },
  { id: 'F-109', title: 'SSRF 出网读取', severity: '高危', status: '已提交', target: 'api.acme.test', scope: 'API 越权面梳理', detail: 'fetch 接口可访问回环地址，返回内容被截断但状态码与长度可观测。', evidence: 'url=http://127.0.0.1:8080/health → 200', cwe: 'CWE-918', time: '1d 前', agent: 'work#5' },
  { id: 'F-110', title: '监控端点未授权', severity: '中危', status: '待复验', target: 'admin.acme.test', scope: 'API 越权面梳理', detail: '/metrics 无需认证返回进程与连接数指标。', evidence: 'GET /metrics → 200 text/plain', cwe: 'CWE-306', time: '1d 前', agent: 'work#3' }
];

export const tasks = [
  { id: 'T-2407', name: 'acme.test 外部渗透（Web + API）', category: '外部渗透', status: '探索中', profile: 'Claude Opus 4.8', intents: 12, facts: 8, findings: 4, assets: 18, elapsed: '34m08s', created: '07-25 06:00' },
  { id: 'T-2406', name: 'corp.test 内网横向与凭据复用', category: '内网横向', status: '暂停', profile: 'DeepSeek V4', intents: 9, facts: 5, findings: 1, assets: 12, elapsed: '1h12m', created: '07-25 04:20' },
  { id: 'T-2405', name: 'shop.acme.test 支付流程复核', category: '业务复核', status: '已完成', profile: 'Claude Opus 4.8', intents: 22, facts: 31, findings: 6, assets: 24, elapsed: '2h41m', created: '07-24 21:10' },
  { id: 'T-2404', name: 'api.acme.test 只读复核', category: '复核', status: '已完成', profile: 'DeepSeek V4', intents: 7, facts: 12, findings: 2, assets: 9, elapsed: '48m02s', created: '07-24 18:02' }
];

export const conversations = [
  { id: 'main', rail: '主 Agent', name: '主 Agent · 编排会话', state: 'live', meta: '34m08s' },
  { id: 'planner', rail: '规划 Planner', name: '规划 Planner · 态势研判', state: 'live', meta: '12 轮' },
  { id: 'w1', rail: 'Workers', name: '#1 acme.test 子域枚举与端口扫描', state: 'done' },
  { id: 'w2', rail: 'Workers', name: '#2 admin 后台默认口令 / 弱口令测试', state: 'done' },
  { id: 'w3', rail: 'Workers', name: '#3 枚举后台功能与用户数据接口', state: 'live' },
  { id: 'w4', rail: 'Workers', name: '#4 www.acme.test/search 页 SQL 注入探测', state: 'done' },
  { id: 'w5', rail: 'Workers', name: '#5 api.acme.test 订单接口越权(IDOR) 测试', state: 'live' }
];

const ok = (extra = {}) => ({ status: 'ok', duration: '1.2s', ...extra });

export const transcripts = {
  main: [
    { id: 'm1', kind: 'user', text: '目标 acme.test，范围只包含 Web 与 API。优先拿后台权限，注意不要改动生产数据。' },
    { id: 'm2', kind: 'thinking', label: '思考', text: '先确认可达面：子域、端口、指纹。后台类目标优先验证默认口令与未授权接口；任何写操作都走审批。把候选面拆成并行意图交给 Worker。' },
    {
      id: 'm3', kind: 'tool', tool: 'bash', title: '子域枚举与存活探测',
      summary: 'subfinder → httpx，5 个子域存活',
      input: 'subfinder -d acme.test -silent | httpx -silent -sc -title -td',
      output: [
        'https://www.acme.test      [200] Acme · 让交易更简单',
        'https://admin.acme.test    [200] Acme 管理后台',
        'https://api.acme.test      [401] {"error":"unauthorized"}',
        'https://static.acme.test   [403] Forbidden',
        'https://legacy.acme.test   [200] Acme 旧版入口'
      ],
      ...ok({ duration: '8.4s' })
    },
    {
      id: 'm4', kind: 'tool', tool: 'http_request', title: '后台登录页指纹',
      summary: 'GET /login → 200 · Vue 3 + Element UI',
      input: 'GET https://admin.acme.test/login',
      output: [
        'HTTP/2 200',
        'server: nginx',
        'x-powered-by: Acme Admin v2.4.1',
        'set-cookie: acme_admin_session=***; HttpOnly; SameSite=Lax',
        '<title>Acme 管理后台 · 登录</title>',
        '<div id="app" data-vue-version="3.4.21" data-ui="element-plus">'
      ],
      ...ok({ duration: '412ms' })
    },
    { id: 'm5', kind: 'tool', tool: 'record_fact', title: '写入事实', summary: '探索图事实 #f01：后台技术栈', input: { summary: 'admin.acme.test 为 Vue3 + Element Plus 后台，登录接口 /api/login', anchor: 'asset:admin.acme.test' }, output: ['fact #f01 已写入', 'anchor → asset 42 (admin.acme.test)'], ...ok({ duration: '86ms' }) },
    {
      id: 'm6', kind: 'tool', tool: 'http_request', title: '默认口令验证（只读）',
      summary: 'POST /api/login → 200 · 拿到会话 token',
      input: 'POST https://admin.acme.test/api/login\n{"username":"admin","password":"admin123"}',
      output: ['HTTP/2 200', '{"token":"eyJhbGciOiJIUzI1NiJ9.***","role":"superadmin"}', '// 只读取 /api/me 确认身份，未执行任何写操作'],
      ...ok({ duration: '268ms' })
    },
    {
      id: 'm7', kind: 'approval', title: '导出接口需要人工确认',
      summary: 'POST https://admin.acme.test/api/export · 将读取 200 条用户记录',
      risk: '高风险读取',
      reason: '该请求会访问用户敏感数据，按拦截规则需要审批后才执行。审批范围仅限本次调用。',
      state: 'pending'
    },
    { id: 'm8', kind: 'text', text: '后台已可访问，默认口令成立（F-101）。导出接口会触及用户数据，已挂起等待审批；同时把搜索页注入与订单越权拆成两条并行意图。' },
    { id: 'm9', kind: 'tool', tool: 'delegate_worker', title: '委派并行意图', summary: '#4 SQLi 探测 · #5 IDOR 验证', input: [{ worker: 'work#4', intent: 'www.acme.test/search 页 SQL 注入探测' }, { worker: 'work#5', intent: 'api.acme.test 订单接口越权测试' }], output: ['work#4 claimed intent #i4', 'work#5 claimed intent #i5'], ...ok({ duration: '34ms' }) },
    { id: 'm10', kind: 'text', text: '当前 3 个 Worker 并行：后台功能枚举、搜索页注入、订单越权。发现写入后会由独立会话复验，确认结论与候选分开记录。' }
  ],
  planner: [
    { id: 'p1', kind: 'thinking', label: '态势研判', text: '目标「获取后台管理权限」已达成。剩余目标是把后台能力映射到用户数据读取面，优先读接口而不是导出。' },
    { id: 'p2', kind: 'tool', tool: 'graph_overview', title: '读取探索图概览', summary: '12 意图 / 8 事实 / 4 漏洞', input: { scope: 'task:T-2407' }, output: ['intents: 12 (done 9, running 3)', 'facts: 8', 'findings: 4 (verified 2)', 'frontier: [i3 后台功能枚举, i5 订单越权]'], ...ok({ duration: '61ms' }) },
    { id: 'p3', kind: 'tool', tool: 'add_hint', title: '写入规划提示', summary: '提示 #h3：优先只读接口', input: { text: '导出与删除接口先不要触发；优先枚举只读列表接口，确认越权后再考虑导出。' }, output: ['hint #h3 已写入'], ...ok({ duration: '44ms' }) },
    { id: 'p4', kind: 'text', text: '下一轮计划：① 确认 /api/export 的审批结果；② 让 #3 枚举后台只读列表接口；③ 若订单越权可复现，升级为高危并进入复验。' }
  ],
  w3: [
    { id: 'w31', kind: 'thinking', label: '执行', text: '拿到后台会话后先枚举菜单接口，判断哪些接口没有做角色校验。' },
    { id: 'w32', kind: 'tool', tool: 'http_request', title: '枚举后台菜单', summary: 'GET /api/menus → 200 · 9 个入口', input: 'GET https://admin.acme.test/api/menus\nCookie: acme_admin_session=***', output: ['HTTP/2 200', '{"items":[{"key":"user.list","role":"admin"},{"key":"user.export","role":"superadmin"},{"key":"order.list","role":"viewer"},{"key":"settings.write","role":"superadmin"}]}', '// 使用普通账号重放同一请求'], ...ok({ duration: '318ms' }) },
    { id: 'w33', kind: 'tool', tool: 'http_request', title: '普通账号重放菜单接口', summary: '200 · 菜单未按角色裁剪', input: 'GET https://admin.acme.test/api/menus\nCookie: acme_admin_session=***（viewer 账号）', output: ['HTTP/2 200', '{"items":[ … 同样 9 个入口 … ]}', '// 说明菜单只做前端隐藏，不是授权边界'], ...ok({ duration: '296ms' }) },
    { id: 'w34', kind: 'tool', tool: 'record_fact', title: '写入事实', summary: '事实 #f04：菜单接口不区分角色', input: { summary: 'viewer 账号可读取完整菜单，含设置与导出入口', anchor: 'asset:admin.acme.test' }, output: ['fact #f04 已写入'], ...ok({ duration: '52ms' }) },
    { id: 'w35', kind: 'tool', tool: 'report_finding', title: '提交候选发现', summary: 'F-110 · 中危 · 监控端点未授权', input: { title: '监控端点未授权', severity: '中危', target: 'admin.acme.test', evidence: 'GET /metrics → 200 text/plain' }, output: ['finding F-110 已提交', 'verification queued: session v-88'], ...ok({ duration: '104ms' }) },
    { id: 'w36', kind: 'text', text: '菜单接口只在前端做隐藏，普通账号仍能拿到全部入口。#F-110 已提交并排队复验，下一步验证导出接口的角色校验。' }
  ]
};

Object.assign(transcripts, {
  w1: [
    { id: 'w11', kind: 'user', text: '意图 P6：acme.test 子域枚举与端口扫描。只做被动收集与常见端口，不跑全端口扫描。' },
    { id: 'w12', kind: 'tool', tool: 'bash', title: '被动子域收集', summary: 'subfinder 返回 7 条候选', input: 'subfinder -d acme.test -silent', output: ['www.acme.test', 'admin.acme.test', 'api.acme.test', 'static.acme.test', 'legacy.acme.test', 'mail.acme.test', 'vpn.acme.test'], ...ok({ duration: '6.1s' }) },
    { id: 'w13', kind: 'tool', tool: 'bash', title: '存活与指纹', summary: '5 个存活，2 个超时', input: 'httpx -silent -sc -title -td -ports 80,443,8080,8443', output: ['https://www.acme.test      [200] Acme · 让交易更简单', 'https://admin.acme.test    [200] Acme 管理后台', 'https://api.acme.test      [401] {"error":"unauthorized"}', 'https://static.acme.test   [403] Forbidden', 'https://legacy.acme.test   [200] Acme 旧版入口'], ...ok({ duration: '8.4s' }) },
    { id: 'w14', kind: 'tool', tool: 'insert_assets', title: '写入资产图', summary: '5 个域名 · 7 个服务', input: { domain: 'acme.test', children: ['www', 'admin', 'api', 'static', 'legacy'] }, output: ['asset 40 acme.test created', 'asset 41..45 domain children merged', 'anchors: 5'], ...ok({ duration: '72ms' }) },
    { id: 'w15', kind: 'text', text: '子域面收敛完成：后台、API、官网各一处入口。mail 与 vpn 未在范围内，未继续探测。' }
  ],
  w2: [
    { id: 'w21', kind: 'user', text: '意图 P9：admin 后台默认口令 / 弱口令测试，只读，不写数据。' },
    { id: 'w22', kind: 'tool', tool: 'http_request', title: '登录页与接口探测', summary: 'GET /login → 200 · /api/login 接受 JSON', input: 'GET https://admin.acme.test/login\nGET https://admin.acme.test/api/login', output: ['HTTP/2 200 text/html (Element Plus)', 'HTTP/2 405 allow: POST'], ...ok({ duration: '188ms' }) },
    { id: 'w23', kind: 'tool', tool: 'http_request', title: '默认口令对照', summary: 'admin/admin123 → 200', input: 'POST https://admin.acme.test/api/login\n{"username":"admin","password":"admin123"}', output: ['HTTP/2 200', '{"token":"***","role":"superadmin"}'], ...ok({ duration: '268ms' }) },
    { id: 'w24', kind: 'tool', tool: 'report_finding', title: '提交发现', summary: 'F-101 · 高危 · 后台默认口令', input: { title: '后台默认口令', severity: '高危', evidence: 'POST /api/login admin/admin123 → 200' }, output: ['finding F-101 已提交', 'verification queued: session v-82'], ...ok({ duration: '96ms' }) },
    { id: 'w25', kind: 'text', text: '默认口令成立，验证仅读取 /api/me 确认身份。已提交 F-101 并排队复验。' }
  ],
  w4: [
    { id: 'w41', kind: 'user', text: '意图 P8：www.acme.test/search 页 SQL 注入探测，只读，禁止导出数据。' },
    { id: 'w42', kind: 'tool', tool: 'http_request', title: '参数与基线', summary: 'q=normal → 200 · 结果 12 条', input: 'GET https://www.acme.test/search?q=acme', output: ['HTTP/2 200', 'results: 12', 'server: nginx'], ...ok({ duration: '203ms' }) },
    { id: 'w43', kind: 'tool', tool: 'http_request', title: '单引号与报错探测', summary: 'q=%27 → 500 · XPATH 报错', input: "GET /search?q=%27%20and%20extractvalue(1,concat(0x7e,version()))--%20-", output: ['HTTP/1.1 500 Internal Server Error', "XPATH syntax error: '~8.0.36'  at query/search.go:142"], ...ok({ duration: '512ms' }) },
    { id: 'w44', kind: 'tool', tool: 'report_finding', title: '提交发现', summary: 'F-104 · 高危 · SQL 注入', input: { title: 'SQL 注入（报错型）', severity: '高危', evidence: "search q 参数 extractvalue 报错回显" }, output: ['finding F-104 已提交', 'verification queued: session v-91'], ...ok({ duration: '104ms' }) },
    { id: 'w45', kind: 'text', text: '注入成立，验证阶段只执行 version() 与库名查询，没有导出数据。' }
  ],
  w5: [
    { id: 'w51', kind: 'user', text: '意图 P8：api.acme.test 订单接口越权(IDOR) 测试，使用两个测试账号做对照。' },
    { id: 'w52', kind: 'tool', tool: 'http_request', title: '自己的订单', summary: 'GET /api/orders/1041 → 200', input: 'GET https://api.acme.test/api/orders/1041\nAuthorization: Bearer ***', output: ['HTTP/2 200', '{"id":1041,"owner":"viewer-2"}'], ...ok({ duration: '128ms' }) },
    { id: 'w53', kind: 'tool', tool: 'http_request', title: '相邻 ID 对照', summary: 'GET /api/orders/1042 → 他人订单', input: 'GET https://api.acme.test/api/orders/1042\nAuthorization: Bearer ***', output: ['HTTP/2 200', '{"id":1042,"owner":"another-user","items":[{"sku":"A-19","qty":2}]}'], ...ok({ duration: '141ms' }) },
    { id: 'w54', kind: 'tool', tool: 'record_fact', title: '写入事实', summary: '事实 #f05：订单接口缺少归属校验', input: { summary: '相邻 ID 可读到他人订单，缺少 owner 校验', anchor: 'asset:api.acme.test' }, output: ['fact #f05 已写入'], ...ok({ duration: '48ms' }) },
    { id: 'w55', kind: 'text', text: '越权可复现，候选发现 F-103 已提交。建议复验时同时检查导出与批量查询接口。' }
  ]
});

export const graph = {
  nodes: [
    { id: 'root', type: '起点', label: 'acme.test 外部渗透', sub: '起点', x: 54, y: 208, reached: true, detail: '任务根节点：范围仅包含 acme.test 的 Web 与 API 面。' },
    { id: 'hint', type: '提示', label: '「后台是 Element-UI，优先跑默认口令表」', sub: '提示', x: 54, y: 318, detail: '来自用户在对话中的补充说明，规划时优先考虑后台类目标。' },
    { id: 'g1', type: '目标', label: '获取后台管理权限', sub: '目标', x: 322, y: 196, reached: true, detail: '第一目标：确认后台入口与口令强度。已通过 F-101 达成。' },
    { id: 'g2', type: '目标', label: '读取用户敏感数据', sub: '目标', x: 322, y: 292, detail: '第二目标：确认越权可读的用户数据面。持续推进中。' },
    { id: 'i1', type: '意图', label: 'acme.test 子域枚举与端口扫描', sub: '意图 P6', x: 596, y: 92, reached: true, detail: 'Worker #1 执行完成，产出 5 个存活子域事实。' },
    { id: 'i2', type: '意图', label: 'admin 后台默认口令 / 弱口令测试', sub: '意图 P9', x: 596, y: 180, reached: true, detail: 'Worker #2 执行完成，产出默认口令发现 F-101。' },
    { id: 'i3', type: '意图', label: '枚举后台功能与用户数据接口', sub: '意图 P8', x: 596, y: 268, detail: 'Worker #3 执行中，已验证菜单接口不做角色裁剪。' },
    { id: 'i4', type: '意图', label: 'www.acme.test/search 页 SQL 注入探测', sub: '意图 P8', x: 596, y: 356, reached: true, detail: 'Worker #4 执行完成，产出 F-104 报错注入。' },
    { id: 'i5', type: '意图', label: 'api.acme.test 订单接口越权(IDOR) 测试', sub: '意图 P8', x: 596, y: 444, detail: 'Worker #5 执行中，已复现他人订单读取。' },
    { id: 'f1', type: '事实', label: '发现子域 admin.acme.test（Element-UI 后台）', sub: '事实 #f01', x: 840, y: 116, detail: '指纹：Vue 3.4.21 + Element Plus，登录接口 /api/login。' },
    { id: 'v1', type: '漏洞', label: '后台默认口令 admin/admin123', sub: '漏洞 F-101', x: 840, y: 204, detail: '已通过独立会话验证；修复建议：强制改密与登录限速。' },
    { id: 'f2', type: '事实', label: 'search q 参数为 error-based 注入点', sub: '事实 #f02', x: 840, y: 292, detail: '报错回显包含数据库版本，可用于确认注入类型。' },
    { id: 'v2', type: '漏洞', label: 'SQL 注入 → 可读取 acme_prod 库', sub: '漏洞 F-104', x: 840, y: 380, detail: '验证阶段仅读取库名与 version()，未做数据导出。' }
  ],
  edges: [
    ['root', 'g1', '派生'], ['root', 'g2', '派生'], ['hint', 'g2', '提示'],
    ['g1', 'i1', '意图链'], ['g1', 'i2', '意图链'], ['g2', 'i3', '意图链'], ['g2', 'i4', '意图链'], ['g2', 'i5', '意图链'],
    ['i1', 'f1', '产出'], ['i2', 'v1', '产出'], ['i4', 'f2', '产出'], ['i5', 'v2', '产出'],
    ['f1', 'v1', '证明']
  ]
};

export const graphLegend = [
  { type: '起点', tone: 'slate' },
  { type: '目标', tone: 'green' },
  { type: '意图', tone: 'blue' },
  { type: '事实', tone: 'amber' },
  { type: '漏洞', tone: 'red' },
  { type: '提示', tone: 'violet' }
];

export const assetTree = [
  {
    id: 'acme.test', name: 'acme.test', kind: '域名', tone: 'blue', detail: '主域，ICP 与证书均指向同一组织。首次发现于任务 T-2407。',
    children: [
      {
        id: 'www', name: 'www.acme.test', kind: '站点', tone: 'cyan', detail: '官网。Go 1.23 + 反向代理，搜索页存在报错注入（F-104）。',
        children: [
          { id: 'www.https', name: '443/tcp HTTPS', kind: '服务', tone: 'slate', detail: 'nginx 1.26，HSTS 缺失（F-106 已修复）。' },
          { id: 'www.search', name: '/search?q=', kind: '端点', tone: 'amber', detail: 'error-based SQL 注入点，已由 #4 验证。' }
        ]
      },
      {
        id: 'admin', name: 'admin.acme.test', kind: '站点', tone: 'red', detail: '管理后台。Vue 3 + Element Plus，默认口令成立（F-101）。',
        children: [
          { id: 'admin.api', name: '/api/*', kind: '接口组', tone: 'violet', detail: '登录、菜单、导出、指标接口；菜单不按角色裁剪。' },
          { id: 'admin.export', name: '/api/export', kind: '端点', tone: 'red', detail: '导出 200 条用户记录，当前挂起等待审批（AP-88）。' },
          { id: 'admin.metrics', name: '/metrics', kind: '端点', tone: 'amber', detail: '未授权指标端点（F-110），复验排队中。' }
        ]
      },
      {
        id: 'api', name: 'api.acme.test', kind: '站点', tone: 'violet', detail: 'Go API 网关，JWT 认证，签名密钥薄弱（F-102）。',
        children: [
          { id: 'api.orders', name: '/api/orders/{id}', kind: '端点', tone: 'red', detail: '缺少归属校验，可读取他人订单（F-103）。' },
          { id: 'api.fetch', name: '/api/fetch', kind: '端点', tone: 'amber', detail: 'SSRF：可访问回环地址（F-109）。' }
        ]
      },
      { id: 'static', name: 'static.acme.test', kind: '站点', tone: 'slate', detail: '静态资源，autoindex 已关闭（F-107 已修复）。' },
      { id: 'legacy', name: 'legacy.acme.test', kind: '站点', tone: 'slate', detail: '旧版入口，仍支持 TLS 1.0（F-108）。' }
    ]
  }
];

export const traffic = [
  { id: 'tx1', method: 'GET', host: 'admin.acme.test', path: '/api/menus', status: 200, size: '1.4 KB', ms: 318, agent: 'work#3', finding: 'F-110', request: 'GET /api/menus HTTP/1.1\nHost: admin.acme.test\nCookie: acme_admin_session=***\nAccept: application/json', response: 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"items":[{"key":"user.list"},{"key":"user.export"},{"key":"settings.write"}]}' },
  { id: 'tx2', method: 'POST', host: 'admin.acme.test', path: '/api/login', status: 200, size: '684 B', ms: 268, agent: 'mainagent', finding: 'F-101', request: 'POST /api/login HTTP/1.1\nHost: admin.acme.test\nContent-Type: application/json\n\n{"username":"admin","password":"admin123"}', response: 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"token":"eyJhbGciOiJIUzI1NiJ9.***","role":"superadmin"}' },
  { id: 'tx3', method: 'GET', host: 'api.acme.test', path: '/api/orders/1042', status: 200, size: '2.1 KB', ms: 141, agent: 'work#5', finding: 'F-103', request: 'GET /api/orders/1042 HTTP/1.1\nHost: api.acme.test\nAuthorization: Bearer ***\nX-Test-Account: viewer-2', response: 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"id":1042,"owner":"another-user","items":[{"sku":"A-19","qty":2}],"address":"***"}' },
  { id: 'tx4', method: 'GET', host: 'www.acme.test', path: '/search', status: 500, size: '3.8 KB', ms: 512, agent: 'work#4', finding: 'F-104', request: "GET /search?q=%27%20and%20extractvalue(1,concat(0x7e,version()))--%20- HTTP/1.1\nHost: www.acme.test", response: 'HTTP/1.1 500 Internal Server Error\n\nXPATH syntax error: \'~8.0.36\'  at query/search.go:142' },
  { id: 'tx5', method: 'GET', host: 'api.acme.test', path: '/api/fetch?url=http://127.0.0.1:8080/health', status: 200, size: '142 B', ms: 96, agent: 'work#5', finding: 'F-109', request: 'GET /api/fetch?url=http%3A%2F%2F127.0.0.1%3A8080%2Fhealth HTTP/1.1\nHost: api.acme.test', response: 'HTTP/1.1 200 OK\n\n{"status":"ok","uptime":"72h"}' },
  { id: 'tx6', method: 'GET', host: 'admin.acme.test', path: '/metrics', status: 200, size: '6.2 KB', ms: 88, agent: 'work#3', finding: 'F-110', request: 'GET /metrics HTTP/1.1\nHost: admin.acme.test', response: 'HTTP/1.1 200 OK\nContent-Type: text/plain\n\nprocess_open_fds 42\npg_pool_in_use 3' },
  { id: 'tx7', method: 'GET', host: 'www.acme.test', path: '/', status: 200, size: '48 KB', ms: 203, agent: 'work#1', finding: '', request: 'GET / HTTP/1.1\nHost: www.acme.test', response: 'HTTP/1.1 200 OK\nserver: nginx\ncontent-security-policy: (missing)' },
  { id: 'tx8', method: 'OPTIONS', host: 'legacy.acme.test', path: '/', status: 200, size: '0 B', ms: 154, agent: 'work#1', finding: 'F-108', request: 'OPTIONS / HTTP/1.1\nHost: legacy.acme.test', response: 'HTTP/1.1 200 OK\nAllow: GET, HEAD\nTLS: TLS1.0 / AES128-SHA' }
];

export const commandRuns = [
  { id: 'c1', tool: 'bash', agent: 'work#1', summary: 'subfinder -d acme.test -silent | httpx -sc -title', status: 'ok', duration: '8.4s', output: '5 个子域存活；admin.acme.test 暴露后台登录页', time: '5h 前' },
  { id: 'c2', tool: 'http_request', agent: 'mainagent', summary: 'POST https://admin.acme.test/api/login', status: 'ok', duration: '268ms', output: '200 · 会话 token 已脱敏', time: '5h 前' },
  { id: 'c3', tool: 'http_request', agent: 'work#3', summary: 'GET https://admin.acme.test/api/menus', status: 'ok', duration: '318ms', output: '200 · 9 个菜单入口（未按角色裁剪）', time: '4h 前' },
  { id: 'c4', tool: 'report_finding', agent: 'work#4', summary: 'F-104 SQL Injection', status: 'ok', duration: '104ms', output: 'finding 已提交，复验会话 v-91 排队', time: '3h 前' },
  { id: 'c5', tool: 'http_request', agent: 'work#5', summary: 'GET https://api.acme.test/api/orders/1042', status: 'ok', duration: '141ms', output: '200 · 他人订单 JSON', time: '2h 前' },
  { id: 'c6', tool: 'mcp__probe__scan', agent: 'work#1', summary: 'mcp probe scan --target admin.acme.test', status: 'error', duration: '30s', output: 'timeout: context deadline exceeded（已按 MCP 错误返回，未中断任务）', time: '1h 前' }
];

export const llmRecords = [
  { id: 'r1', profile: 'Claude Opus 4.8', model: 'claude-opus-4-8', agent: 'mainagent', input: '184.2k', cached: '142.9k', output: '12.4k', latency: '6.2s', retries: 0, time: '5h 前' },
  { id: 'r2', profile: 'Claude Opus 4.8', model: 'claude-opus-4-8', agent: 'planner', input: '96.4k', cached: '71.2k', output: '4.1k', latency: '3.8s', retries: 0, time: '5h 前' },
  { id: 'r3', profile: 'DeepSeek V4', model: 'deepseek-v4', agent: 'work#4', input: '212.7k', cached: '168.3k', output: '9.8k', latency: '4.4s', retries: 1, time: '3h 前' },
  { id: 'r4', profile: 'DeepSeek V4', model: 'deepseek-v4', agent: 'work#5', input: '88.1k', cached: '61.4k', output: '3.2k', latency: '2.9s', retries: 0, time: '2h 前' }
];

export const profiles = [
  { id: 'p1', name: '默认（Claude Opus 4.8）', provider: 'Anthropic', model: 'claude-opus-4-8', default: true, chain: ['DeepSeek V4'], state: '已配置' },
  { id: 'p2', name: 'DeepSeek V4', provider: 'DeepSeek', model: 'deepseek-v4', default: false, chain: [], state: '已配置' },
  { id: 'p3', name: '本地 Qwen（离线）', provider: 'OpenAI 兼容', model: 'qwen3-coder', default: false, chain: [], state: '未验证' }
];

export const agentsList = [
  { id: 'main', name: '主 Agent', role: '编排', model: '默认（Claude Opus 4.8）', tools: ['http_request', 'bash', 'record_fact', 'insert_assets', 'delegate_worker', 'graph_overview'], skills: ['web-recon'], enabled: true, note: '对用户消息做出响应，决定是否委派 Worker。' },
  { id: 'planner', name: '规划 Planner', role: '规划', model: '默认（Claude Opus 4.8）', tools: ['graph_overview', 'add_hint', 'record_fact'], skills: ['web-recon'], enabled: true, note: '读取探索图，生成意图并维护跨轮待办。' },
  { id: 'worker', name: 'Worker 池', role: '执行', model: 'DeepSeek V4', tools: ['http_request', 'bash', 'record_fact', 'insert_assets', 'report_finding', 'mcp__probe__scan'], skills: ['api-authz', 'web-recon'], enabled: true, note: '领取意图执行，结果写回探索图与资产图。' },
  { id: 'verifier', name: '复验会话', role: '验证', model: '默认（Claude Opus 4.8）', tools: ['http_request', 'record_fact', 'list_findings'], skills: ['report-writer'], enabled: true, note: '发现提交后独立复现，结论与候选分开记录。' }
];

export const mcpServers = [
  { id: 'm1', name: 'probe-kit', transport: 'Streamable HTTP', state: '已连接', tools: 7, url: 'http://127.0.0.1:7331/mcp', latency: '12ms' },
  { id: 'm2', name: 'filesystem', transport: 'stdio', state: '已连接', tools: 4, url: 'npx @modelcontextprotocol/server-filesystem', latency: '—' },
  { id: 'm3', name: 'scan-kit', transport: 'SSE', state: '未连接', tools: 3, url: 'https://mcp.example.test/sse', latency: '—' }
];

export const skillsList = [
  { id: 's1', name: 'web-recon', kind: '内置', unlocked: true, note: '子域、指纹、目录与参数收集的执行套路。' },
  { id: 's2', name: 'api-authz', kind: '内置', unlocked: true, note: '越权对照实验：水平、垂直与对象级权限。' },
  { id: 's3', name: 'report-writer', kind: '内置', unlocked: false, note: '把已验证发现整理为报告结构。' },
  { id: 's4', name: 'sqlmap-helper', kind: '扩展', unlocked: false, note: '封装 sqlmap 的只读参数模板。' }
];

export const toolCatalog = [
  { id: 't1', name: 'http_request', source: '内置', policy: 'allow', note: '发起 HTTP 请求并保留请求/响应证据。' },
  { id: 't2', name: 'bash', source: '内置', policy: 'ask', note: '在工作目录内执行命令，输出并入会话。' },
  { id: 't3', name: 'record_fact', source: '内置', policy: 'allow', note: '把事实写入探索图并挂到资产锚点。' },
  { id: 't4', name: 'insert_assets', source: '内置', policy: 'allow', note: '归并域名、服务与端点，建立资产锚点。' },
  { id: 't5', name: 'report_finding', source: '内置', policy: 'allow', note: '提交候选发现，触发独立复验会话。' },
  { id: 't6', name: 'delegate_worker', source: '内置', policy: 'allow', note: '把意图委派给空闲 Worker。' },
  { id: 't10', name: 'graph_overview', source: '内置', policy: 'allow', note: '读取探索图概览：意图、事实与发现计数。' },
  { id: 't11', name: 'add_hint', source: '内置', policy: 'allow', note: '写入一条规划提示，供下一轮规划参考。' },
  { id: 't7', name: 'mcp__probe__scan', source: 'MCP · probe-kit', policy: 'ask', note: '端口与指纹扫描，超时按工具错误返回。' },
  { id: 't8', name: 'mcp__probe__tls', source: 'MCP · probe-kit', policy: 'allow', note: '读取 TLS 配置与套件。' },
  { id: 't9', name: 'skill:sqlmap-helper', source: 'Skill', policy: 'deny', note: '未解锁的扩展技能，调用会被拦截。' }
];

export const interceptRules = [
  { id: 'ir1', name: '生产写请求需审批', pattern: 'method in (POST, PUT, PATCH, DELETE) and host ~ *.acme.test', action: 'ask', enabled: true, hits: 18 },
  { id: 'ir2', name: '后台管理路径限速', pattern: 'path ^/admin/ and rps > 5', action: 'deny', enabled: true, hits: 4 },
  { id: 'ir3', name: '大文件下载拦截', pattern: 'response.size > 10MB', action: 'deny', enabled: true, hits: 0 },
  { id: 'ir4', name: '出网白名单', pattern: 'egress not in (acme.test, api.acme.test)', action: 'deny', enabled: false, hits: 0 }
];

export const assetScopes = [
  { id: 'as1', target: 'acme.test', mode: '允许', note: '本次任务主目标域。', enabled: true },
  { id: 'as2', target: 'corp.test', mode: '只读', note: '跨任务资产，仅允许 GET / HEAD。', enabled: true },
  { id: 'as3', target: '169.254.169.254', mode: '拦截', note: '云元数据地址，禁止访问。', enabled: true },
  { id: 'as4', target: '*.internal.test', mode: '拦截', note: '内网域，未经授权不得探测。', enabled: false }
];

export const approvals = [
  { id: 'AP-88', tool: 'http_request', target: 'POST https://admin.acme.test/api/export', risk: '高风险读取', agent: 'mainagent', state: 'pending', reason: '将读取 200 条用户记录', time: '2m 前' },
  { id: 'AP-87', tool: 'bash', target: 'nmap -sV -p- admin.acme.test', risk: '中等', agent: 'work#1', state: 'pending', reason: '全端口扫描可能触发告警', time: '6m 前' },
  { id: 'AP-86', tool: 'http_request', target: 'POST https://admin.acme.test/api/login', risk: '低', agent: 'mainagent', state: 'approved', reason: '默认口令验证（只读）', time: '5h 前' },
  { id: 'AP-85', tool: 'http_request', target: 'GET https://api.acme.test/api/orders/1042', risk: '低', agent: 'work#5', state: 'approved', reason: '越权对照测试', time: '6h 前' },
  { id: 'AP-84', tool: 'bash', target: 'rm -rf /tmp/acme-cache', risk: '高', agent: 'work#2', state: 'denied', reason: '超出任务范围的破坏性命令', time: '7h 前' }
];

export const logs = [
  { id: 'l1', level: 'INFO', source: 'engine', text: 'task T-2407 planner round 12 started (frontier 3)', time: '20:38:02' },
  { id: 'l2', level: 'INFO', source: 'guard', text: 'PreToolUse http_request action=ask rule=ir1 reason=production-write', time: '20:37:55' },
  { id: 'l3', level: 'WARN', source: 'llm', text: 'provider anthropic retry 1/2 after 429 (retry-after 3s)', time: '20:37:41' },
  { id: 'l4', level: 'INFO', source: 'mcp', text: 'probe-kit tools/list ok tools=7 latency=12ms', time: '20:36:18' },
  { id: 'l5', level: 'INFO', source: 'pg', text: 'insert node fact #f04 version=7 anchor=asset:admin.acme.test', time: '20:35:44' },
  { id: 'l6', level: 'WARN', source: 'worker#1', text: 'mcp scan timeout after 30s, returned as tool error', time: '20:34:02' },
  { id: 'l7', level: 'INFO', source: 'verify', text: 'finding F-104 verification queued session v-91', time: '20:32:51' },
  { id: 'l8', level: 'ERROR', source: 'update', text: 'release feed unreachable: dial tcp timeout (will retry in 2m)', time: '20:31:20' },
  { id: 'l9', level: 'INFO', source: 'sse', text: 'broadcast task T-2407 activity tool_result to 2 subscribers', time: '20:30:11' },
  { id: 'l10', level: 'INFO', source: 'db', text: 'assets merge domain acme.test children=5', time: '20:29:04' }
];

export const syncSources = [
  { id: 'sy1', name: 'acme.test 资产清单', kind: 'CSV', rows: 42, state: '已同步', time: '12m 前' },
  { id: 'sy2', name: '历史任务资产（T-2401…T-2406）', kind: 'PostgreSQL', rows: 186, state: '已同步', time: '1h 前' },
  { id: 'sy3', name: '第三方测绘导出', kind: 'JSON', rows: 0, state: '未同步', time: '—' }
];

export const workspaceFiles = [
  { id: 'ws1', name: 'notes/acme-recon.md', kind: '文档', size: '12 KB', time: '20:14' },
  { id: 'ws2', name: 'evidence/tx-1042.http', kind: '证据', size: '2 KB', time: '19:58' },
  { id: 'ws3', name: 'reports/acme-draft.md', kind: '报告', size: '28 KB', time: '19:40' }
];

export const notifyChannels = [
  { id: 'n1', name: 'Webhook · 团队频道', kind: 'webhook', enabled: true, note: '任务暂停、发现确认、审批待处理' },
  { id: 'n2', name: '邮件摘要（每日）', kind: 'email', enabled: false, note: '每天 09:00 汇总发现与 Token 用量' },
  { id: 'n3', name: '桌面通知', kind: 'desktop', enabled: true, note: '浏览器通知，需用户授权' }
];

export const reportDraft = `# acme.test 外部渗透报告（草稿）

## 范围
- Web: www.acme.test, admin.acme.test
- API: api.acme.test
- 排除：生产数据导出、任何写操作

## 结论
1. F-101 后台默认口令（高危，已验证）
2. F-104 搜索页 SQL 注入（高危，已验证）
3. F-103 订单越权（高危，验证中）
4. F-102 JWT 弱签名（高危，已提交）

## 复现要点
默认口令验证仅使用只读接口；注入验证仅执行 version() 与库名查询。
`;

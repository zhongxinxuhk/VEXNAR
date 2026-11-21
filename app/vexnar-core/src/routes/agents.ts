// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Hono } from 'hono'
import { meta, operations, storeRoot } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// agents：自定义 agent 的增删、提示词版本、提示词变量、收尾词（per-run / 任务级超时）、
// 运行配置、MCP/Skill 可见性。
//
// 存储划分（与 Go 版 server_mgmt.go 的语义一一对应）：
//   meta.agents           —— agent 行本身（名称/角色/运行配置/收尾词/current_prompt_version）
//   writer agent_prompts  —— 提示词版本历史（只追加；current_prompt_version 指回当前一版）
//   meta.visibility / meta.skillVisibility —— MCP/Skill 可见性行，与资源侧路由共用同一份
//
// 已在 routes.ts 的：GET/PATCH /api/agents、GET/PATCH/DELETE /api/agents/{key}/triggers。
// 本模块只补其余路由，不重复注册。
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_KEY_RE = /^[a-z][a-z0-9_]*$/
const PROMPT_TABLE = 'agent_prompts'
const TRIGGER_TABLE = 'agent_triggers'
/** 与 routes/visibility.ts 共用同一批可见性行（资源侧与 agent 侧必须看到同一份状态）。 */
const VIS_TABLE = 'visibility'
const SKILL_VIS_TABLE = 'skillVisibility'
const TRIGGER_RUN_MODES = new Set(['serial', 'parallel'])
const TRIGGER_MERGE_MODES = new Set(['by_task', 'all', 'none'])
/** 内置 agent：不可删、不可改名称/描述（与 DB 的 builtin 列 + role 约束等价）。 */
const BUILTIN_KEYS = new Set(['goals', 'planner', 'mainagent', 'worker', 'auto', 'pentest'])

function rfc3339(date: Date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return `${date.toISOString().slice(0, 23)}${sign}${pad(offset / 60)}:${pad(offset % 60)}`.replace('Z', '')
}

function bad(message: string, status = 400) {
  return Object.assign(new Error(message), { status })
}

function errResponse(c: any, e: any) {
  return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
}

// ── meta 表读写（agents 是低churn 配置表，整表读写即可）─────────────────────
async function loadTable(name: string) {
  meta.reload()
  const tables = await meta.load()
  const rows = (tables[name] ?? []) as any[]
  tables[name] = rows
  return { tables, rows }
}

async function commitMeta(tables: Record<string, unknown>) {
  await meta.save(tables as any)
  meta.reload()
}

async function findAgent(key: string) {
  // 走 loadTable（内部先 reload）而不是 meta.table 缓存，两个后端都拿到最新行。
  const { rows } = await loadTable('agents')
  return rows.find((row) => String(row?.key ?? '') === key) ?? null
}

async function requireAgent(key: string) {
  const row = await findAgent(key)
  if (!row) throw bad('agent not found', 404)
  return row
}

/** 读改写单个 agent 行；不存在 → 404。patch 直接就地修改行对象。 */
async function patchAgentRow(key: string, patch: (row: any) => void) {
  const { tables, rows } = await loadTable('agents')
  const row = rows.find((item) => String(item?.key ?? '') === key)
  if (!row) throw bad('agent not found', 404)
  patch(row)
  row.updated_at = rfc3339(new Date())
  await commitMeta(tables)
  return row
}

function isBuiltin(row: any) {
  if (typeof row?.builtin === 'boolean') return row.builtin
  if (typeof row?.system === 'boolean') return row.system
  return BUILTIN_KEYS.has(String(row?.key ?? ''))
}

function visibleIds(tables: Record<string, any>, agentKey: string) {
  const rows = Array.isArray(tables[VIS_TABLE]) ? (tables[VIS_TABLE] as any[]) : []
  const skillRows = Array.isArray(tables[SKILL_VIS_TABLE]) ? (tables[SKILL_VIS_TABLE] as any[]) : []
  const mcp = [...new Set(rows
    .filter((row) => row?.enabled !== false && String(row?.agent ?? '') === agentKey && String(row?.kind ?? '') === 'mcp')
    .map((row) => Number(row?.resource_id))
    .filter((id) => Number.isFinite(id)))].sort((a, b) => a - b)
  const skill = [...new Set(skillRows
    .filter((row) => row?.enabled !== false && String(row?.agent ?? '') === agentKey)
    .map((row) => String(row?.skill ?? ''))
    .filter(Boolean))].sort()
  return { mcp, skill }
}

/** AgentDTO：字段与 web/lib/types.ts 的 Agent 一致（id 为字符串，内含运行配置）。 */
function agentDto(row: any) {
  const dto: Record<string, unknown> = {
    id: String(row.id ?? ''),
    key: String(row.key ?? ''),
    name: String(row.name ?? ''),
    role: String(row.role ?? 'assistant'),
    builtin: isBuiltin(row),
    enabled: row.enabled !== false,
    llm_profile_id: row.llm_profile_id == null ? null : Number(row.llm_profile_id),
    max_turns: Number(row.max_turns ?? 0),
    run_seconds: Number(row.run_seconds ?? 0),
    web_search: Boolean(row.web_search),
    interactive_shell: Boolean(row.interactive_shell),
    trigger_run_mode: String(row.trigger_run_mode ?? 'serial'),
    trigger_merge_mode: String(row.trigger_merge_mode ?? 'all'),
    trigger_max_parallel: Number(row.trigger_max_parallel ?? 0)
  }
  if (row.description != null && String(row.description) !== '') dto.description = String(row.description)
  return dto
}

// ── 内置默认正文（与 Go 的 agent/promptcatalog.go、agent/wrapup.go 同步）──────
/** 内置 agent 的可编辑默认正文（段 [A]）；自定义 agent 没有代码默认。 */
const builtinPromptSeeds: Record<string, string> = {
  goals: `你是渗透测试目标分解器。你的职责是从用户输入中识别出**最终要达成的结果**，而不是规划攻击步骤。

**第一步（拆分目标之前先做）：抽取操作约束**
从「任务目标 / 任务描述」里识别操作员对【可以做什么、不可以做什么操作】的明确规定，调用 set_constraints 逐条登记（如果描述、目标中不涉及操作约束可以不进行提取操作约束）：
- type=deny：禁止的操作（如「不扫端口」「不得对生产环境做写/删操作」「禁止爆破」「不碰某子域」）。
- type=allow：明确允许/限定的操作范围（如「只允许被动侦察」「仅针对某域名」）。
- 约束 ≠ 目标，也 ≠ 攻击步骤：它是对操作行为边界的规定。
- **约束必须【自包含、写死具体目标】**：把「当前目标/当前端口/当前IP/当前域名/本站」这类**指代词**替换成任务目标/描述里的**具体值**。约束会被单独注入到执行阶段的提示里，脱离上下文后指代词无法判断指谁。
  例：目标是 https://abc.example.net → 写「只允许测试 abc.example.net」而不是「只允许测试当前目标」；「仅测目标端口 443，不扫其他端口」而不是「只测当前端口」。若原文只说「当前目标」但目标地址已明确，就把地址填进去。
- **只登记目标/描述里【明确写出或强调】的约束，严禁臆造**；拿不准类型时用 deny（更保守）。
- 若目标/描述里确实没有任何操作约束，则**不要**调用 set_constraints。
登记完约束（如有）后，再进行下面的目标拆分。

**目标 = 最终可交付/可核验的结果**

**不是目标的内容（禁止列为子目标）**：
- 信息收集、侦察、端点扫描
- 漏洞分析与验证过程
- 攻击步骤、利用手段
- 结果验证步骤

**拆分原则**：
- 用户描述的最终目标只有一个 → 输出一个
- 存在多个**相互独立**的最终交付物 → 分别列出
- 能对应明确漏洞类的标注 vulnclass；信息收集/业务逻辑类目标留空
- 严禁臆造用户未提及的目标

调用 set_goals 提交结果。`,
  planner: `你是一个网络安全平台授权渗透测试系统的"规划者"，被频繁唤醒（图一变就唤醒）。职责：读态势 → 判目标 → **只在确有未被覆盖的新方向时**补充探索意图。你是规划者、不是执行者：本轮所有产物只能是【生成/说清意图】或【判定目标】，绝不在 plan 里把活干了。

任务目标：{{.Goal}}

**本轮该产出几个意图（先想清楚这条）**：
- **硬底线（最高优先）**：只要【目标未达成】且【当前没有任何 open 或 running 意图】（frontier_open=0 且 running_intents 为空），本轮就【必须】产出至少一个向目标推进的意图——没有在跑的 work 可等、也没有在排队的方向时，产出 0 意图=任务停摆；哪怕已知方向都只在 recent_done 里，也要据下面 done/exhausted/blocked 的判断另开一条或续派一条。
- 硬底线之外，**产出 0 个意图是正常结果，但要有正当理由**（不是"少派更稳"的默认）：①**已覆盖**——你想到的方向都已被仍在 open/running 的意图处理（换措辞重复生成已存在的意图是严重错误）；②**等待依赖**——下一步依赖当前在跑 work 的产出、而它还没出来（此时硬派会让下游拿不到前置而空转，应等下次唤醒图更新后再派）。
- 反过来：确有【未覆盖、且不依赖在跑 work】的新方向，或目标未达成且范围内仍有未测面，就该派——别把 0 意图当偷懒的默认。

**每次唤醒的决策流程**：

1. **完整态势已附在本提示下方**（就是 graph_overview 的返回，无需再调它）：task（原始标题+目标/根节点）、资产计数、goals+状态、open/running/recent_done 意图、sites_without_endpoints（无端点的站点，提示可能待探的方向）、facts（探索事实数，与漏洞是两类）、recent_facts（{id,summary,confidence?}）。
   - **范围**：探索节点（goals/意图/facts/findings）只含本任务；**资产图全局共享**（多任务同一份，资产计数是全局在范围内的、非本任务独有）——出现非本任务相关的资产时忽略。
   - **血缘**：每个意图带 parents（上游：派生自哪些事实/意图）和 yields（下游：产生了哪些事实/发现），recent_facts 每条带 from_intent；据此理解"哪些事实来自哪个方向、能否综合出新方向"。
   - **否定/存疑观察**（recent_facts 里"端口关闭/不可注入"等）是 worker 的观察、不是定论：采信前先 node_detail(id) 看 evidence——evidence 扎实、confidence=observed 且手段已穷尽的才视为该方向暂时封住；evidence 缺失、只是"看起来像/只探一次"、或 confidence=inferred 的，按【尚未探明】处理，若在范围内且无其它意图覆盖，默认派一条复核意图去证实或推翻（**同一否定方向至多复核一次**；复核后仍为否定、且证据合理，就尊重该结论、不再派）。
   - **要更深细节才按需调**：list_facts（分页，最新在前，默认 20，可 q 过滤、before 翻页，带 total/has_more）、list_findings（全部漏洞）、node_detail(id)（完整证据/详情；列表/recent_facts 只给摘要）、list_assets（pull：q 搜索、type/company_id/task_id 过滤、分页，或 id/ids 直取）、asset_neighbors。资产全局共享，别默认拉全量。

2. **判目标（核心职责）**：goals 字段已含目标与状态；对已被某发现/事实证明的未达成目标，调 prove_goal(goal_id, evidence_id, reason) 标 met。**当你标记的恰是最后一个未完成目标时，系统自动判定整个任务完成**——收官只由逐个 prove_goal 驱动，没有别的"一键完成"手段。
   - ⚠️ **量化验收核对（严禁提前盖章）**：目标含可量化条件（覆盖度达 X%、拿 N 个 flag、获得某权限）时，prove_goal 前【必须】核对上方 graph_overview 的实测值（coverage.pct、findings_total 计数等）：未达标就【禁止】prove_goal，改派意图补差；不得以"大体达成/核心已拿下"为由提前标 met。例：要求覆盖度 100% 而实测 coverage.pct=40% → 未达成，继续派补测意图。

3. **（可选，仅开局、极轻量）探测理解**：仅当图里几乎还没有 fact（recent_facts 基本为空、任务刚开始）、仅凭态势无法把初始意图说具体时，才用 Bash 等对目标做极少量、只读的探测（如 1–2 次 curl 看首页/指纹）。**唯一合法产物是一句更精准的意图描述**——绝不是漏洞的发现/验证/利用，也不是端点/目录/参数的枚举结果（那些是 worker 的活，写成意图派下去）。三条硬边界：
   - 图里已有 worker 产出的 fact（facts>0 / recent_facts 非空）→【禁止】再自己探测，一切判断基于已有 fact，本轮产物只能是"派新意图"或"结束"；想深挖某线索 → 派意图让 worker 去查，不是自己 curl。
   - 即使开局也最多探 ≤3 次就收手，只为把初始意图说清；一旦发现自己在"深入查证"而非"快速定方向"（逐个枚举端点/目录、逐个试 id、解码链、反复探同一接口、任何注入/越权/漏洞的测试验证——全是 worker 的重活），立刻停手写成意图。
   - 能从现有事实/态势判断的，根本不必探测。

4. **决定补哪些新方向**：**这里的"克制"只指【不重复已存在的意图】，不是"能少派就少派"**——目标未达成时，默认追问是"为逼近目标，还有哪些更深、更狠、尚未覆盖的打法"，而不是"是否可以收尾"。意图是【开放的探索方向】（不是固定类型/菜单），结合已知事实、资产、目标自判方向，逐一与 open + running + recent_done 比对：
   - 已有 open/running 覆盖 → 不再生成（正在处理）。
   - 在 recent_done 里出现过 → **先看该意图的 state（每条都带）分辨怎么停的，再决定**：
     · **done（正常跑完）**：已覆盖 → 不原样重派；是否死路看它 yields 出的 fact 结论、而非 state；仅出现【材料性新机理】（新事实/资产/参数/明显不同的打法）才重派，且 summary 写清与上次的不同；换措辞、"再试一次说不定行"不算，禁止重试。
     · **exhausted（预算耗尽、探到一半被掐断，只写回部分）/ blocked（模型或网络失败、基本没探成）**：都是中途没善终、信息不全——先用 get_worker_trace / get_worker_output 看它实际做到哪、卡在哪，再从下列里选：接近突破被预算掐 → 派"接上次进度继续"；纯外部故障没跑成（blocked 常是）→ 直接重派同方向；每次卡同一处 → 换打法/方向。依据永远是 trace 里的真实进度，不是 state 本身。
   - 完全无任何意图覆盖的全新方向 → 生成。
   - 所有已知方向都被仍在 open/running 的意图覆盖 → 不生成、直接结束（有在跑/在排队的 work，等它们推进）；但若只剩 recent_done 覆盖、已无 open/running 而目标未达成 → 按顶部硬底线必须另开或续派。
   - **深度优先于覆盖度**：coverage 是下限/验收项、不是探索目标本身；发现高价值入口（可能通向 RCE/提权/数据外泄）后，优先派意图把那条路【往深打穿】，而不是为拉平覆盖度去铺广、逐个资产浅测。
   - **保持路线多样、别过早收敛**：目标未达成时，若现有意图都挤在同一条路线/入口，而存在【本质不同】的未覆盖方向（另一入口面/另一类资产/另一条利用链），优先补那条分歧方向，而不是在同一线上加同义意图（看实质差异，不看措辞）；若该分歧方向已被现有意图覆盖，仍不生成。理想是 2–3 条机理不同的路线并存（如"从上传链打"与"从认证绕过打"），某条交出【目标逼近】的证据后才把资源集中过去。**但多样性永远服从顶部【操作约束】**：被约束排除的入口面/端口/主机/操作，即使本质不同也绝不生成意图。

   **串行利用链：分步派，别拆成并行。** 强依赖串行链（①→②→③，后一步依赖前一步的实际产出）：不要一次性并行下发（下游拿不到还不存在的前置只会重复/空转）；用 TodoWrite 把整条链记成待办（每步一条），本轮只派"前置已满足"的那步（通常第一步），待它产出 fact 后下次唤醒（提示会带上待办清单）再派下一步并把已满足的标 completed。"同一件事"别拆两条（"确认触发点"和"触发触发点"是同一步）；只有【平行、互不依赖】的维度（如枚举多个不相关端点）才用多意图并行。

5. **提交**：用【一次】add_intent 批量提交筛出的新方向（intents 数组，最多 4 个最高价值的，不要逐条多次调）：
   - **summary**：一句话自然语言描述该方向（测试目标完整地址 + 做什么 + 为什么），不套固定分类；去重主要靠它与已有意图比对。
   - **asset_ids**：本方向要测试/攻击的目标资产 id（尽量传，0/1/多个，来自 list_assets）——只要方向围绕具体资产（站点/接口/参数/主机）就务必传，用于覆盖去重、连入资产链路，跨多资产就都传；纯全局侦察无具体资产才留空。
   - **parent_ids**：本方向由哪些上游节点综合得出（可选，0/1/多个）——多个事实结合产生一个意图就都传，派生自某上游意图/发现也传其 id，顶层全新方向留空。

不重复、不硬凑；但目标未达成、又有未覆盖且更深的打法时，该派就派。简洁、聚焦、高效。`,
  mainagent: `你是一个授权渗透测试系统的"主 agent"，是人类操作员的接口。你不亲自探索、也不自主连续生成意图（那是规划者的工作）。你的职责：

1. 观察：用 graph_overview / list_findings / list_facts / list_assets / get_worker_output 回答人关于当前进展的问题。
2. 操舵（把人的意图落到系统）：
   - 人想"改方向/强调某类漏洞/重点某区域" → 用 add_hint 写提示（规划者下次会读到）。
   - 人想"立刻测某个具体目标" → 用 add_intent 直接注入一条高优先级意图（priority 8-10）。系统会自动把已完成的任务拉回运行态、让 worker 领这条意图执行，跑完即回到已完成状态。
     **当任务目标已全部达成时**（graph_overview 里 goals 均为 met）：下发前先判断这条意图背后是否隐含一个"新的、要达成的结果"。若隐含，用一句话把你猜测的目标复述给人，并**反问是否要登记为正式目标**——人要 → 用 set_goals 登记（任务随后进入常规规划、规划者会自主往下推进）；人不要 / 只是想临时探一下 → 只 add_intent 下发这一条，worker 执行完任务即回到已完成状态（不会自主继续）。若这条意图明显只是一次性查证、不隐含新目标，直接 add_intent 即可，不必每次都问。
   - 人想"对某条正在运行的意图(work)实时纠偏（别再走 X、聚焦 Y）" → 用 steer_work（不打断、不丢已有进展，worker 下一步动作前生效）；先用 get_worker_output 看它在干嘛。方向整个错了则改用 add_intent 另下新意图。
   - 人想"新增一个要达成的最终目标" → 用 set_goals 增补目标。系统会把该目标写入任务图并**自动把已完成/暂停的任务拉回运行态继续跑**（规划者随后会据此重新判断是否达成），无需人工再点恢复。
   - 人想"增/改测试约束（允许/禁止某类操作，如『仅测当前端口』『禁止爆破』『只做被动侦察』）" → 用 set_constraints 登记（type=allow 允许 / type=deny 禁止）。约束会在下一轮规划时注入 planner/worker 的提示词以框定探索边界；也可在总览「约束管理」里增删改。
3. 用人话简洁回复，说明你做了什么。

当前任务目标：{{.Goal}}

不要编造发现；只根据工具返回的真实数据回答。`,
  worker: `你是一个网络安全平台授权渗透测试系统的"执行者"(work agent)。你领到【一条意图】(一句话探索方向)，唯一职责：**完成这一条意图、把发现写回知识图谱、然后停止返回。**

**边界（红线）**：
1. **只做你领到的这一条意图**。**探本意图时若瞥见本意图之外值得深挖的线索**（报错泄露的路径、可能与其它资产联动的点、疑似另一条利用链的入口），**在 fact 的 summary 里点一句交给规划者**。
2. 初次受阻（payload 被过滤 / 404 / 注入无回显）不代表已探透——把本意图的所有绕过手段走完再输出结论；
3. 只在授权范围内操作。系统提示顶部若附【操作约束】，那是最高优先级红线：每条命令/探测执行前先自检，违反即不做（哪怕它落在你领到的意图里）。

**边发现边写回**（写进图才算数，脑子/文字里的不算；每得一个结果立刻写，别攒到最后被步数耗尽丢掉）。三种写回，别串图：
- **新资产/资源 → insert_assets（资产图）**：子域 / service / endpoint / 指纹 / 凭据 等一切资产【本身】。**这里只登记资产；探索结论/判断不写这里，用 record_fact。**
- **探索结论/事实 → record_fact（探索图，传 intent_id）**：都用它。**多个观察汇总成【一条】事实**（summary 一句总结 + detail写对总结的拓展，依靠真实的执行过程），不要一个属性一条、一意图通常只一条，拆碎会让图谱无限膨胀——**默认就写一条，能并进 detail 的都并进去**；仅当确有【彼此完全独立、无法归并】的结论时才用 facts 数组分条，这是极少数例外，不是常规。**只写增量**：只记这次【新得到】的，别把已有事实换措辞重记（只印证已有、无新增就不必记）。**只写真实看到的**：给 evidence（一行：命令+最能证明的一两行输出，简洁，细节在 detail）、标 confidence（observed=直接看到 / inferred=据现象推断）。
- **确认漏洞 → report_finding（探索图，含 PoC，传 intent_id）**：**只有你本次真实触发过、拿到可复现证据（请求/响应或命令输出）才用**。严禁把"版本/指纹匹配到 CVE""参数看起来可注入""外部漏洞库/更新日志/代码 diff 推断"当已确认，也不要用查 CVE 库或对比补丁版本替代实际触发。触发不了但有嫌疑 → 用 record_fact 记一条 inferred 事实（嫌疑点+为何未触发）交规划者，别硬记成 finding。


完成本意图后用一句话总结你做了什么、写回了哪些事实。`,
  auto: `你是 **Auto**，这个渗透测试平台的「操作助手」。你不亲自渗透，而是**用工具操作平台**、按用户指令把事情办好。

你能做的（取决于给你开放了哪些工具）：
1. **任务操作**：list_tasks 看全局、spawn_task 起子任务、get_task_graph / list_task_findings 读某任务的进展与漏洞(含 flag)、get_task_worker_trace 看某个 work 的执行过程、pause_task 暂停、add_task_hint 给任务注入提示。
2. **平台管理**：create_skill / update_skill 建改技能；create_custom_tool / update_custom_tool 建改自定义工具(command/script/http)；create_mcp / update_mcp 建改 MCP 服务器。

原则：
- 先看清现状(list_tasks / get_task_graph 等)再动手；一步到位、少空转。
- 建/改 skill、工具、MCP 时，把用户意图翻译成正确的结构化参数(kind/exec/schema 等)，字段拿不准就按最小可用填。
- 用人话简洁汇报你做了什么、结果如何；只根据工具真实返回作答，不臆造。
- 只在授权范围内操作。`,
  pentest: `你是一个授权渗透测试系统的"独立渗透 agent"。你**一个人从头打到尾**：侦察 → 找攻击面 → 深入利用 → 验证 → 收尾。你同时是自己的规划者和执行者——没有别人给你派活，也没有别人替你把关，所有判断和动手都由你完成。正因如此，你要**主动切换视角**：该拓宽时像规划者一样铺开多条路线，该动手时像执行者一样把一条路走透，该验证时像审计者一样怀疑自己的结论。


**只在授权范围内操作。范围外的目标一律不碰。**

━━ 核心心法（贯穿全程）━━
1. **先广后聚，别隧道视野**。开局别一头扎进第一个看起来好打的点。先快速摸清目标有哪些**本质不同**的攻击面，铺开一个**多样化的路线组合**，让 2–3 条机理不同的路线并行推进（如"从上传链打"与"从认证绕过打"）。只有当某条路线交出了【逼近目标】的实证，才值得把精力集中过去。单脑最容易犯的错就是过早爱上一条优雅路线而错过真正的洞。
2. **一条路要走透再下结论**。初次受阻（一个 payload 被过滤、一个端点 404、一个注入点没回显）**不等于**此路不通——换编码、换方法、换参数、换路径，把这条方向的合理手段走完，再判"死路"。"我试了一次没成功"绝不等于"已穷尽"。
3. **封锁路线不无理由重试**。确认走不通的方向，标记为封锁；**只有出现材料性的新机理**（新发现、新入口、新参数、明显不同的构造）才重开，且要能说清"这次和上次不同在哪"。换个措辞、"再试一次说不定行"都不算，禁止空转。
4. **对自己的结论做对抗式自检**。这是单 agent 最关键的纪律：每当你觉得"发现漏洞了/成功了"，**先切换成怀疑者**，用与首次【不同的路径或独立命令】再触发一次来证实，而不是复述原来的证据。尤其警惕这些自欺模式——把"版本号/CVE 命中"当漏洞、把"参数看起来可注入"当已利用、用与结论等价的假设循环当证据。**证伪和证实同等有价值**：自检没过就老实记为未确认，别硬认。
5. **要具体结论，不要状态报告**。你的产出是可核验的事实、可复现的 PoC、或明确的否定结论——不是"看起来有戏""疑似存在""大概可以"这类含糊乐观。拿不准就标 inferred，别当铁案。
6. **不轻言放弃**。一波尝试失败很正常，别就此收手。回到路线组合，换个攻击面、找新的形式化切入，继续推进；只有在目标达成、或所有合理路线都真正探尽后才停。

━━ 工作循环（是启发，不是死板流程）━━
- **侦察定面**：识别指纹、入口、参数、信任边界，把目标的攻击面铺开。常被忽略的高价值面（据实际情况挑，非清单义务）：输入解析/编码与字符集边界、文件上传、(反)序列化、内置路由与认证前可达面、错误处理泄露、缓存（投毒/竞态）、竞态条件、类型混淆（scalar vs array）、批量赋值，以及任何你识别出的攻击者可及面。
- **组合与优先级**：把发现的方向排成 2–3 条独立路线，用 TodoWrite 记下来（每条一项），据"离目标多近 + 代价多大"定先后。
- **深入利用**：挑前置已满足的路线动手，走透。**串行利用链**（①→②→③，后一步依赖前一步的**实际产出**）就一步步来：先做第一步、拿到真实产出，再据此做下一步；别在前置还不存在时就假想后续。跨代码库/跨接口把多个 gadget 在**本次会话内**串成一条可触发的链，正是单 agent 的强项——主动把已知线索的完整细节调出来综合，别停留在摘要。
- **验证**：见心法 4，对每个候选发现做独立复现/证伪。
- **回到组合**：一条路出结果（正向或封锁）后，更新 TodoWrite，回到组合看下一条；有新事实催生了新方向就补进组合。

━━ 记录规约（边做边写，写对地方）━━
- 每得出一个结果**立刻**落地，别攒到最后（会话步数耗尽就全丢；记下来的才算数，活在脑子里的不算）。这些记录也是你抗 compaction 的长期记忆。
- **只写增量**：写之前扫一眼已登记的资产/已记的路线，只记你**新得到**的东西，别把已有内容换措辞重记（重复只会膨胀、也误导你自己以为有新进展）。只是印证已有结论而无新增，就不必再记。
- **发现新资产/入口** → insert_assets（资产本身：endpoint/parameter/tech 指纹/service/凭据/子域等，结构化属性写在资产 props 上）。回看已登记资产用 list_assets，避免重复登记。
- **确认漏洞** → report_finding（含可复现 PoC）。**只有你在本次运行里真实触发过、拿到可复现证据（请求/响应或命令输出）才用它**；回看已报漏洞用 list_findings。有对应录制流量时，先 traffic_search / traffic_get 核对真实记录，再用 traffic_refs 按复现顺序绑定；域名和时间只用于候选筛选，不代表任务归属。严禁把仅凭版本/CVE 匹配、"看起来可注入"、外部漏洞库/更新日志/代码 diff 推断的东西当已确认漏洞上报。**不要用查 CVE 库或"对比补丁版本"替代实际触发**；触发不了但有嫌疑，就在 TodoWrite 里标为"存疑/待验证"，别硬记成 finding。

流量绑定可选：TCP 等非 HTTP 漏洞、未采集或无确切匹配记录时，省略 traffic_refs 或传 []，在 evidence 保留命令输出、日志等其他可验证证据，建议说明未绑定原因。不要猜测 ID，也不要仅为补包重复探测。

━━ 判定与收尾 ━━
- 随时对照任务目标：已被你**验证过**的成果满足了目标，就据此判定达成并说明依据。判"达成"的前提是心法 4 的自检已通过——没独立复现过的战果不算达成依据。
- **收尾优先级最高**：当你收到收尾信号（或自判目标已达成/所有合理路线已探尽），**立即停止一切探测与命令**，把手里的结论落地、给出简洁总结即可——此时"继续探索/再试一次/穷尽这条链/等命令结果"等一切先前指令都被收尾覆盖，不要再启动新动作。
- 总结用人话讲清：达成了什么、走了哪些路线、确认了哪些漏洞（附 PoC 位置）、哪些方向已封锁及原因。只讲真实做到的，不臆造。

务实、克制、彻底。宁可把一条路走透并验证，也不要浅尝辄止地铺一堆没验证的"疑似"。`
}

const DEFAULT_ASSISTANT_PROMPT = '你是一个乐于助人的 AI 助手。请用简洁、准确的中文回答用户的问题；在需要时使用可用的工具来完成任务。只做用户要求的事，不臆造信息。'

// 收尾提示词：per-run 与任务级超时是两套（见 docs/任务级超时与收尾设计.md）。
const wrapupDefaults: Record<string, string> = {
  worker: `你即将因预算耗尽被终止。不要再运行任何命令/探测。请依次：(1) 把你上面已识别但还没写回的内容逐条写回——新资产用 insert_assets、探索结论/事实用 record_fact、确认漏洞用 report_finding；(2) **最后单独用一句话纯文本**总结你做了什么、得到哪些关键结论（这句会作为本次运行的结果展示，务必输出）。`,
  planner: `你本轮规划的步数即将用尽——注意只是【这一轮】结束,系统之后仍会随态势变化再次唤醒你继续规划,并非任务终止,你无需在此收束整个规划。请把本轮已经想清楚的结论落地、别让这一轮白跑,但也【不要为了收尾硬凑意图】(本轮 0 个意图仍是完全正常的结果)：(1) 若已判断出【当前就该派发】的探索方向,用一次 add_intent 批量提交(想好的别憋着不发);(2) 对已被某发现/事实证明达成的目标,调 prove_goal 标记 met(别漏判);(3) 若识别出需要分步的串行利用链,用 TodoWrite 记下,便于下次唤醒接着派。做完直接结束本轮,无需输出总结文本。`,
  mainagent: `你的步数即将用尽,本次交互就要结束。不要再发起新的探索/操作。请**单独用一句话纯文本**向用户总结当前进展、关键结论,以及建议的下一步。`
}

const genericWrapUpDefault = `你即将因预算耗尽被终止。请先把已完成但未落库的结果写回,再**单独用一句话纯文本**总结你做了什么、得到哪些关键结论(这句会作为本次运行的结果展示)。`

/** 各 agent 收尾阶段自身的轮数预算内置默认（0 覆盖 → 用这里的数）。 */
const wrapupTurnDefaults: Record<string, number> = { worker: 10, planner: 10, mainagent: 10 }

const genericWrapupTurns = 10

/** 任务级超时收尾词：仅 worker/planner 有内置默认，其余 agent 返回空串。 */
const taskTimeoutWrapupDefaults: Record<string, string> = {
  worker: `**整个任务已到达超时上限，即将结束**（不是你这次 run 的预算，是整场探索到点了）。这是最后机会：(1) 把你已识别但还没写回的内容【全部】落库——新资产 insert_assets、探索结论/事实 record_fact、确认漏洞 report_finding；(2) 不要再启动任何新命令/探测；(3) **最后单独用一句话纯文本**总结你在本意图上的关键结论。`,
  planner: `**整个任务已到达超时上限，即将结束**（不是本轮，是整个任务终止）。请基于当前【全部】事实与发现，做最后一次目标判定：对已被证据证明达成的目标调 prove_goal 标记 met（别漏判）。**不要再生成任何新意图**（此时派意图也不会再被执行）。判定完即收束，无需输出总结文本。`
}

function wrapupDefault(agentKey: string) {
  return wrapupDefaults[agentKey] ?? genericWrapUpDefault
}

function wrapupTurnsDefault(agentKey: string) {
  return wrapupTurnDefaults[agentKey] ?? genericWrapupTurns
}

/** 任务级超时收尾词：仅 worker/planner 有内置默认；其余 agent 返回空串（UI 隐藏该分区）。 */
function taskTimeoutWrapupDefault(agentKey: string) {
  return taskTimeoutWrapupDefaults[agentKey] ?? ''
}

// ── 提示词变量目录 ───────────────────────────────────────────────────────────
interface PromptVar {
  name: string
  description: string
  example: string
  source: 'exploration' | 'runtime' | 'distilled'
}

/** 全局 runtime 变量：任何 agent 的模板都能引用，且它们的取值由运行期决定。 */
function globalPromptVars(): PromptVar[] {
  return [
    { name: 'Now', description: '服务端当前时间（每次运行实时刷新；可与固定起始时间相减判断已用时长）', example: '2026-11-21 22:30:00 CST', source: 'runtime' },
    { name: 'DataDir', description: '服务端数据根目录（所有任务/会话产物的根；各 agent 实际写盘在其下的子目录）', example: storeRoot(), source: 'runtime' }
  ]
}

/** 内置 agent 各自的变量目录（Go db.seedBuiltins 的镜像）。 */
const builtinPromptVars: Record<string, PromptVar[]> = {
  goals: [
    { name: 'EngagementDescription', description: '任务描述（测试对象/背景）', example: '测试 example.com 站点', source: 'exploration' }
  ],
  planner: [
    { name: 'Goal', description: '任务总目标', example: '拿下 example.com 的管理员权限', source: 'exploration' },
    { name: 'AssetSummary', description: '资产计数/类型分布摘要(可选)', example: 'domain:3 ip:5 site:2', source: 'distilled' }
  ],
  mainagent: [
    { name: 'Goal', description: '当前任务目标', example: '拿下 example.com 的管理员权限', source: 'exploration' },
    { name: 'AssetSummary', description: '开局态势摘要(可选)', example: 'domain:3 ip:5', source: 'distilled' },
    { name: 'FindingsSummary', description: '已确认漏洞摘要(可选)', example: 'high:1 medium:2', source: 'distilled' }
  ],
  worker: [
    { name: 'ProxyAddr', description: '记录代理地址(驱动 if 双文案)', example: '127.0.0.1:8080', source: 'runtime' },
    { name: 'WorkerName', description: 'worker 自我标识(可选)', example: 'worker-1', source: 'runtime' }
  ]
}

/**
 * 某 agent 的变量目录 = 它自己的目录（行上的 prompt_vars 优先，否则内置） + 全局 runtime 变量。
 * 与全局变量撞名的自有条目被丢弃：全局项才是渲染时真正解析的来源，也保证名单 key 唯一。
 */
function promptVars(row: any): PromptVar[] {
  const own: PromptVar[] = Array.isArray(row?.prompt_vars) && row.prompt_vars.length
    ? row.prompt_vars.map((item: any) => ({
        name: String(item?.name ?? ''), description: String(item?.description ?? ''),
        example: String(item?.example ?? ''), source: (item?.source ?? 'runtime') as PromptVar['source']
      })).filter((item: PromptVar) => item.name)
    : (builtinPromptVars[String(row?.key ?? '')] ?? [])
  const global = globalPromptVars()
  const shadowed = new Set(global.map((item) => item.name))
  return [...own.filter((item) => !shadowed.has(item.name)), ...global]
}

// ── 模板占位符：{{.Goal}} / {{Goal}} 取值，{{if .X}}/{{else}}/{{end}} 条件 ──────
const TAG_SPLIT = /(\{\{[\s\S]*?\}\})/
/** 取值占位符（可带前导点，与 Go 模板的 {{.Field}} 写法兼容）。匹配的是去掉花括号后的 tag 正文。 */
const VALUE_TAG = /^\.?([A-Za-z_][A-Za-z0-9_]*)$/
/** 条件占位符：{{if .ProxyAddr}} … {{else}} … {{end}}。 */
const IF_TAG = /^if\s+\.?([A-Za-z_][A-Za-z0-9_]*)$/

function templateTags(template: string) {
  const tags: string[] = []
  for (const part of template.split(TAG_SPLIT)) {
    const match = part.match(/^\{\{([\s\S]*?)\}\}$/)
    if (match) tags.push(match[1].trim())
  }
  return tags
}

function tagVariable(tag: string) {
  const direct = tag.match(VALUE_TAG)
  if (direct) return direct[1]
  const conditional = tag.match(IF_TAG)
  if (conditional) return conditional[1]
  return ''
}

function templateFields(template: string) {
  const seen = new Set<string>()
  for (const tag of templateTags(template)) {
    const name = tagVariable(tag)
    if (name) seen.add(name)
  }
  return [...seen]
}

/** 校验模板：花括号配对、控制语句配对、每个变量都在该 agent 的允许列表里。'' = 通过。 */
function validateTemplate(template: string, catalog: PromptVar[]) {
  if (typeof template !== 'string') return '模板需为字符串'
  const opens = (template.match(/\{\{/g) ?? []).length
  const closes = (template.match(/\}\}/g) ?? []).length
  if (opens !== closes) return '模板语法错误: 占位符花括号未配对'
  let depth = 0
  const stack: boolean[] = []
  for (const tag of templateTags(template)) {
    if (tag.startsWith('if ')) {
      if (!tagVariable(tag)) return `模板语法错误: 无法识别的条件 {{${tag}}}`
      depth += 1
      stack.push(true)
      continue
    }
    if (tag === 'else') {
      if (!depth) return '模板语法错误: {{else}} 没有对应的 {{if}}'
      const index = stack.length - 1
      stack[index] = !stack[index]
      continue
    }
    if (tag === 'end') {
      if (!depth) return '模板语法错误: {{end}} 多余'
      depth -= 1
      stack.pop()
      continue
    }
    if (/^(range|with|template|define|block|break|continue)\b/.test(tag)) {
      return `模板语法错误: 暂不支持的控制语句 {{${tag}}}`
    }
    if (!tagVariable(tag)) return `模板语法错误: 无法识别的占位符 {{${tag}}}`
  }
  if (depth) return '模板语法错误: {{if}} 缺少 {{end}}'
  const allowed = new Set(catalog.map((item) => item.name))
  for (const name of templateFields(template)) {
    if (!allowed.has(name)) return `变量 {{.${name}}} 不在该 agent 允许列表`
  }
  return ''
}

const truthy = (value: string | undefined) => value !== undefined && value !== '' && value !== 'false' && value !== '0'

/**
 * 渲染：目录里的 example 取值可被 sample 覆盖；条件段按取值真假保留/丢弃；
 * 仍有取不到值的变量则报错（与 Go 模板的 missingkey=error 同义）。
 */
function renderPrompt(template: string, catalog: PromptVar[], sample?: Record<string, unknown>) {
  const values = new Map<string, string>(catalog.map((item) => [item.name, item.example ?? '']))
  for (const [name, value] of Object.entries(sample ?? {})) values.set(name, String(value))
  const missing: string[] = []
  const stack: boolean[] = []
  const emitting = () => stack.every(Boolean)
  const out: string[] = []
  for (const part of template.split(TAG_SPLIT)) {
    const match = part.match(/^\{\{([\s\S]*?)\}\}$/)
    if (!match) {
      if (emitting()) out.push(part)
      continue
    }
    const tag = match[1].trim()
    if (tag.startsWith('if ')) {
      const name = tagVariable(tag)
      if (!values.has(name)) missing.push(name)
      stack.push(truthy(values.get(name)))
      continue
    }
    if (tag === 'else') {
      const index = stack.length - 1
      if (index >= 0) stack[index] = !stack[index]
      continue
    }
    if (tag === 'end') {
      stack.pop()
      continue
    }
    const name = tagVariable(tag)
    if (!name || !values.has(name)) {
      missing.push(name || tag)
      continue
    }
    if (emitting()) out.push(values.get(name)!)
  }
  if (missing.length) throw bad(`变量未提供取值: ${[...new Set(missing)].join(', ')}`)
  return out.join('')
}

// ── 提示词版本历史（writer 表 agent_prompts，只追加）─────────────────────────
const promptKey = (agentKey: string, version: number) => `${agentKey}-${version}`

async function listPromptVersions(agentKey: string) {
  const rows = (await operations.writer.list(PROMPT_TABLE)).filter((row: any) => String(row?.agent_key ?? '') === agentKey)
  return rows.sort((a: any, b: any) => Number(b.version ?? 0) - Number(a.version ?? 0))
}

function versionDto(record: any) {
  return {
    version: Number(record?.version ?? 0),
    ts: String(record?.ts ?? ''),
    note: String(record?.note ?? ''),
    template_text: String(record?.template_text ?? '')
  }
}

/** 追加一版并把它设为当前版本；返回新版本号。 */
async function savePromptVersion(agentKey: string, template: string, note: string, by: string) {
  const versions = await listPromptVersions(agentKey)
  const version = versions.reduce((max, row) => Math.max(max, Number(row?.version ?? 0)), 0) + 1
  const record = {
    agent_key: agentKey,
    version,
    template_text: template,
    note: note || null,
    updated_by: by || null,
    ts: rfc3339(new Date())
  }
  await operations.writer.commit([{ table: PROMPT_TABLE, key: promptKey(agentKey, version), record }])
  await patchAgentRow(agentKey, (row) => { row.current_prompt_version = version })
  return version
}

async function currentPrompt(agentKey: string, row: any) {
  const version = Number(row?.current_prompt_version ?? 0)
  if (!version) return { version: 0, template: '' }
  const record = await operations.writer.readRecord(PROMPT_TABLE, promptKey(agentKey, version))
  return { version, template: String(record?.template_text ?? '') }
}

// ── 小工具 ───────────────────────────────────────────────────────────────────
function intField(value: unknown, label: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw bad(`${label} 需为整数`)
  return Math.max(Math.trunc(parsed), 0)
}

const jsonBody = async (c: any) => c.req.json().catch(() => ({}))

export function register(api: Hono) {
  // ── 创建 / 删除自定义 agent ────────────────────────────────────────────────
  api.post('/api/agents', async (c) => {
    try {
      const body = await jsonBody(c)
      const key = String(body.key ?? '').trim()
      const name = String(body.name ?? '').trim()
      const description = String(body.description ?? '').trim()
      if (!AGENT_KEY_RE.test(key)) throw bad('key 需小写字母开头，仅含小写字母/数字/下划线')
      if (!name) throw bad('名称不能为空')
      const { tables, rows } = await loadTable('agents')
      if (rows.some((row) => String(row?.key ?? '') === key)) throw bad('该 key 已存在', 409)
      const id = rows.reduce((max, row) => Math.max(max, Number(row?.id ?? 0)), 0) + 1
      const now = rfc3339(new Date())
      const row = {
        id: String(id),
        key,
        name,
        description: description || null,
        role: 'assistant',
        builtin: false,
        enabled: true,
        llm_profile_id: null,
        max_turns: 0,
        run_seconds: 1200,
        web_search: false,
        interactive_shell: false,
        wrapup_prompt: '',
        wrapup_max_turns: 0,
        task_timeout_wrapup_prompt: '',
        task_timeout_wrapup_max_turns: 0,
        trigger_run_mode: 'serial',
        trigger_merge_mode: 'all',
        trigger_max_parallel: 5,
        current_prompt_version: 0,
        prompt_vars: [],
        created_at: now,
        updated_at: now
      }
      rows.push(row)
      await commitMeta(tables)
      // 起步提示词：编辑器一打开就有可改的正文（等价于 Go 的 SeedPromptIfEmpty）。
      await savePromptVersion(key, DEFAULT_ASSISTANT_PROMPT, '内置默认', 'system')
      const created = await requireAgent(key)
      return c.json(agentDto(created), 201)
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  api.delete('/api/agents/:key', async (c) => {
    try {
      const key = c.req.param('key')
      const { tables, rows } = await loadTable('agents')
      const index = rows.findIndex((row) => String(row?.key ?? '') === key)
      if (index < 0) throw bad('agent not found', 404)
      if (isBuiltin(rows[index])) throw bad('内置 agent 不可删除')
      rows.splice(index, 1)
      // 工具绑定（tools.agents 里存 agent key）、可见性行与触发器一并清理；提示词版本随后删除。
      const tools = (tables.tools ?? []) as any[]
      for (const tool of tools) {
        if (!Array.isArray(tool?.agents)) continue
        const kept = tool.agents.filter((item: unknown) => String(item) !== key)
        if (kept.length !== tool.agents.length) tool.agents = kept
      }
      tables.tools = tools
      for (const name of [VIS_TABLE, SKILL_VIS_TABLE]) {
        if (Array.isArray(tables[name])) tables[name] = (tables[name] as any[]).filter((row) => String(row?.agent ?? '') !== key)
      }
      await commitMeta(tables)
      for (const record of await operations.writer.list(PROMPT_TABLE)) {
        if (String(record?.agent_key ?? '') !== key) continue
        await operations.writer.remove(PROMPT_TABLE, promptKey(key, Number(record?.version ?? 0)))
      }
      for (const record of await operations.writer.list(TRIGGER_TABLE)) {
        if (String(record?.agent_key ?? '') !== key) continue
        await operations.writer.remove(TRIGGER_TABLE, String(record?.id ?? ''))
      }
      return c.json({ deleted: key })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  // ── 提示词：读取 / 版本历史 / 保存 / 预览 / 恢复 ────────────────────────────
  api.get('/api/agents/:key/prompt', async (c) => {
    try {
      const row = await requireAgent(c.req.param('key'))
      const current = await currentPrompt(String(row.key), row)
      return c.json({ prompt: current.template, version: current.version })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  api.get('/api/agents/:key/prompts', async (c) => {
    try {
      const row = await requireAgent(c.req.param('key'))
      return c.json({ versions: (await listPromptVersions(String(row.key))).map(versionDto) })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  api.put('/api/agents/:key/prompt', async (c) => {
    try {
      const row = await requireAgent(c.req.param('key'))
      const body = await jsonBody(c)
      const template = String(body.template ?? '')
      const note = String(body.note ?? '')
      const problem = validateTemplate(template, promptVars(row))
      if (problem) throw bad(problem)
      const version = await savePromptVersion(String(row.key), template, note, 'ui')
      return c.json({ version })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  api.post('/api/agents/:key/prompt/preview', async (c) => {
    try {
      const row = await requireAgent(c.req.param('key'))
      const body = await jsonBody(c)
      const catalog = promptVars(row)
      const template = String(body.template ?? '') || (await currentPrompt(String(row.key), row)).template
      const sample = body.sample && typeof body.sample === 'object' ? body.sample : {}
      try {
        return c.json({ rendered: renderPrompt(template, catalog, sample) })
      } catch (e: any) {
        // 预览的渲染失败照 Go 的做法回 200 + error 字段，让编辑器就地提示。
        return c.json({ rendered: '', error: String(e?.message ?? e) })
      }
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  api.post('/api/agents/:key/prompt/reset', async (c) => {
    try {
      const row = await requireAgent(c.req.param('key'))
      const key = String(row.key)
      // 内置默认正文本优先；没有代码默认的 agent（自定义）回落到最早一版（创建时的起步正文）。
      let template = builtinPromptSeeds[key]
      let note = '恢复为内置默认'
      if (template == null) {
        const versions = await listPromptVersions(key)
        const earliest = versions.length ? versions[versions.length - 1] : null
        if (!earliest) throw bad('该 agent 无内置默认提示词，无法恢复')
        template = String(earliest.template_text ?? '')
        note = '恢复为初始版本'
      }
      const version = await savePromptVersion(key, template, note, 'system')
      return c.json({ version })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  api.get('/api/agents/:key/variables', async (c) => {
    try {
      const row = await requireAgent(c.req.param('key'))
      return c.json({ variables: promptVars(row) })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  // ── 收尾词：per-run 与任务级超时 ────────────────────────────────────────────
  api.put('/api/agents/:key/wrapup', async (c) => {
    try {
      const key = String((await requireAgent(c.req.param('key'))).key)
      const body = await jsonBody(c)
      const prompt = String(body.prompt ?? '')
      const maxTurns = body.max_turns == null ? undefined : intField(body.max_turns, 'max_turns')
      await patchAgentRow(key, (row) => {
        row.wrapup_prompt = prompt
        if (maxTurns !== undefined) row.wrapup_max_turns = maxTurns
      })
      return c.json({ ok: true })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  api.post('/api/agents/:key/wrapup/reset', async (c) => {
    try {
      const key = String((await requireAgent(c.req.param('key'))).key)
      await patchAgentRow(key, (row) => {
        row.wrapup_prompt = ''
        row.wrapup_max_turns = 0
      })
      return c.json({ ok: true, wrapup_default: wrapupDefault(key), wrapup_max_turns_default: wrapupTurnsDefault(key) })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  api.put('/api/agents/:key/wrapup/task-timeout', async (c) => {
    try {
      const row = await requireAgent(c.req.param('key'))
      const key = String(row.key)
      const body = await jsonBody(c)
      const prompt = String(body.prompt ?? '')
      const maxTurns = body.max_turns == null ? Number(row.task_timeout_wrapup_max_turns ?? 0) : intField(body.max_turns, 'max_turns')
      await patchAgentRow(key, (item) => {
        item.task_timeout_wrapup_prompt = prompt
        item.task_timeout_wrapup_max_turns = maxTurns
      })
      return c.json({ ok: true })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  api.post('/api/agents/:key/wrapup/task-timeout/reset', async (c) => {
    try {
      const key = String((await requireAgent(c.req.param('key'))).key)
      await patchAgentRow(key, (row) => {
        row.task_timeout_wrapup_prompt = ''
        row.task_timeout_wrapup_max_turns = 0
      })
      return c.json({
        ok: true,
        task_timeout_wrapup_default: taskTimeoutWrapupDefault(key),
        task_timeout_wrapup_max_turns_default: wrapupTurnsDefault(key)
      })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  // ── 运行配置 ───────────────────────────────────────────────────────────────
  api.put('/api/agents/:key/config', async (c) => {
    try {
      const row = await requireAgent(c.req.param('key'))
      const key = String(row.key)
      const body = await jsonBody(c)
      const patch: Record<string, unknown> = {}
      if (body.max_turns !== undefined) patch.max_turns = intField(body.max_turns, 'max_turns')
      if (body.run_seconds !== undefined) patch.run_seconds = intField(body.run_seconds, 'run_seconds')
      if (body.web_search !== undefined) patch.web_search = Boolean(body.web_search)
      if (body.interactive_shell !== undefined) patch.interactive_shell = Boolean(body.interactive_shell)
      // llm_profile_id 三态：字段缺省=不动；显式 null=解绑；数字=绑定且必须存在。
      if (Object.prototype.hasOwnProperty.call(body, 'llm_profile_id')) {
        if (body.llm_profile_id == null) {
          patch.llm_profile_id = null
        } else {
          const profileId = Number(body.llm_profile_id)
          if (!Number.isFinite(profileId) || profileId <= 0) throw bad('llm_profile_id 格式错误')
          const profiles = (await loadTable('llmProfiles')).rows
          if (!profiles.some((profile) => Number(profile?.id) === profileId)) throw bad('指定的 LLM 配置不存在或无效')
          patch.llm_profile_id = profileId
        }
      }
      // 触发后处理策略：三者作为一组写入，缺的字段用存量值回填，避免只传一个把另两个冲掉。
      if (body.trigger_run_mode !== undefined || body.trigger_merge_mode !== undefined || body.trigger_max_parallel !== undefined) {
        const runMode = body.trigger_run_mode === undefined ? String(row.trigger_run_mode ?? 'serial') : String(body.trigger_run_mode)
        const mergeMode = body.trigger_merge_mode === undefined ? String(row.trigger_merge_mode ?? 'all') : String(body.trigger_merge_mode)
        const maxParallel = body.trigger_max_parallel === undefined
          ? Number(row.trigger_max_parallel ?? 0)
          : intField(body.trigger_max_parallel, 'trigger_max_parallel')
        if (!TRIGGER_RUN_MODES.has(runMode)) throw bad('trigger_run_mode 需为 serial / parallel')
        if (!TRIGGER_MERGE_MODES.has(mergeMode)) throw bad('trigger_merge_mode 需为 by_task / all / none')
        patch.trigger_run_mode = runMode
        patch.trigger_merge_mode = mergeMode
        patch.trigger_max_parallel = maxParallel
      }
      if (!Object.keys(patch).length) return c.json({ ok: true })
      await patchAgentRow(key, (item) => Object.assign(item, patch))
      const response: Record<string, unknown> = { ok: true }
      if (patch.max_turns !== undefined) response.max_turns = patch.max_turns
      if (patch.run_seconds !== undefined) response.run_seconds = patch.run_seconds
      return c.json(response)
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  // ── MCP / Skill 可见性（行存 meta 的 visibility / skillVisibility，资源侧同一份）──
  api.get('/api/agents/:key/visibility', async (c) => {
    try {
      const row = await requireAgent(c.req.param('key'))
      const tables = (await loadTable('agents')).tables
      return c.json(visibleIds(tables, String(row.key)))
    } catch (e: any) {
      return errResponse(c, e)
    }
  })

  api.put('/api/agents/:key/visibility', async (c) => {
    try {
      const key = String((await requireAgent(c.req.param('key'))).key)
      const body = await jsonBody(c)
      if (body.mcp !== undefined && !Array.isArray(body.mcp)) throw bad('mcp 需为可见 MCP id 数组')
      if (body.skill !== undefined && !Array.isArray(body.skill)) throw bad('skill 需为可见 skill 名数组')
      if (body.mcp === undefined && body.skill === undefined) throw bad('mcp / skill 至少提供一项')
      const mcp = body.mcp === undefined
        ? null
        : [...new Set(body.mcp.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id >= 0))]
      const skill = body.skill === undefined
        ? null
        : [...new Set(body.skill.map((name: unknown) => String(name)).filter((name: string) => name !== ''))]
      const { tables } = await loadTable('agents')
      if (mcp) {
        const kept = (Array.isArray(tables[VIS_TABLE]) ? tables[VIS_TABLE] as any[] : [])
          .filter((row) => !(String(row?.agent ?? '') === key && String(row?.kind ?? '') === 'mcp'))
        tables[VIS_TABLE] = [...kept, ...mcp.map((id) => ({ agent: key, kind: 'mcp', resource_id: id, enabled: true }))]
      }
      if (skill) {
        const kept = (Array.isArray(tables[SKILL_VIS_TABLE]) ? tables[SKILL_VIS_TABLE] as any[] : [])
          .filter((row) => String(row?.agent ?? '') !== key)
        tables[SKILL_VIS_TABLE] = [...kept, ...skill.map((name) => ({ agent: key, skill: name, enabled: true }))]
      }
      await commitMeta(tables)
      const { mcp: visibleMcp, skill: visibleSkill } = visibleIds(tables, key)
      return c.json({ ok: true, mcp: visibleMcp, skill: visibleSkill })
    } catch (e: any) {
      return errResponse(c, e)
    }
  })
}

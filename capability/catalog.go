package capability

import (
	"sort"
	"strings"

	"github.com/zhongxinxuhk/vexnar/vulnclass"
)

// 能力（capability）是「已经能做什么」，与漏洞（finding＝已经证实的问题）分开记：
// 一个漏洞可以推导出多项能力，一项能力也可能由多个漏洞共同支撑。
//
// 目录放代码里（与 vulnclass 一致）：推导规则必须随代码评审，放表里会出现
// 「代码改了、库里还是老规则」的双份真相。将来要做可运营知识库（R1.8）时，
// 这张目录可以用同一套 Key 迁进表，工具读取层不用改。

type Kind struct {
	Key      string   `json:"key"`
	Name     string   `json:"name"`
	Prereq   []string `json:"prereq,omitempty"`   // 获得它通常需要先有什么
	Unlocks  []string `json:"unlocks,omitempty"`  // 拿到之后通常能推进什么
	Risk     string   `json:"risk,omitempty"`     // 误判/滥用代价，给 planner 的取舍提示
	Examples []string `json:"examples,omitempty"` // 典型来源
}

var kinds = []Kind{
	{
		Key: "net_reachable", Name: "网络可达",
		Unlocks:  []string{"内网探测", "盲打类利用（SSRF/XXE 回连）", "跨段横向的前置"},
		Risk:     "只证明「能发出去并收到回应」，不等于目标可信或可被利用。",
		Examples: []string{"SSRF 命中 OAST", "代理/隧道打通", "出网策略绕过"},
	},
	{
		Key: "weblogin", Name: "Web 登录态",
		Prereq:   []string{"net_reachable"},
		Unlocks:  []string{"admin_panel", "业务接口越权测试", "已认证攻击面"},
		Risk:     "会话可能随时失效；复用前要确认角色与租户。",
		Examples: []string{"默认口令", "弱口令爆破成功", "会话固定/窃取"},
	},
	{
		Key: "admin_panel", Name: "管理后台访问",
		Prereq:   []string{"weblogin"},
		Unlocks:  []string{"配置篡改", "账号管理", "插件/模板注入"},
		Risk:     "后台操作影响面大，默认按高危处理，需要审批。",
		Examples: []string{"登录后进入管理端", "未授权后台接口"},
	},
	{
		Key: "file_read", Name: "文件读取",
		Prereq:   []string{"net_reachable"},
		Unlocks:  []string{"源码/配置审计", "凭据发现", "file_write 的前置侦查"},
		Risk:     "读到的内容可能含凭据，按敏感数据处理。",
		Examples: []string{"LFI/路径穿越", "XXE 读文件", "任意文件下载"},
	},
	{
		Key: "file_write", Name: "文件写入",
		Prereq:   []string{"file_read"},
		Unlocks:  []string{"webshell", "配置投毒", "计划任务持久化"},
		Risk:     "写入即改变目标状态，必须留痕并优先选择可回滚路径。",
		Examples: []string{"任意文件上传", "日志投毒", "解压穿越"},
	},
	{
		Key: "cmd_exec", Name: "命令执行",
		Prereq:   []string{"net_reachable"},
		Unlocks:  []string{"提权枚举", "横向移动", "数据外带"},
		Risk:     "最高危能力；默认 deny 或强制人工审批。",
		Examples: []string{"RCE", "SSTI 到命令", "反序列化"},
	},
	{
		Key: "db_read", Name: "数据库读取",
		Prereq:   []string{"net_reachable"},
		Unlocks:  []string{"凭据/会话表读取", "业务数据验证", "写库的前置"},
		Risk:     "可能触及个人数据，注意最小化读取。",
		Examples: []string{"SQL 注入", "数据库弱口令", "备份文件泄露"},
	},
	{
		Key: "token_valid", Name: "有效令牌",
		Prereq:   []string{"net_reachable"},
		Unlocks:  []string{"接口越权", "身份冒用验证", "自动化会话复用"},
		Risk:     "令牌有效期与权限范围必须记录，过期后能力自动失效。",
		Examples: []string{"JWT 弱密钥/未校验", "API Key 泄露", "OAuth 令牌窃取"},
	},
}

// Derivation 是「已确认漏洞 → 能力」的一条推导规则。
// Rule 会被原样写进 capabilities.derivation_rule，作为可审计的推导链。
type Derivation struct {
	VulnClass  string  `json:"vulnclass"`
	Kind       string  `json:"kind"`
	Strength   string  `json:"strength"`
	Rule       string  `json:"rule"`
	Rationale  string  `json:"rationale"`
	Confidence float64 `json:"confidence"`
}

// rules 只覆盖「确认漏洞后基本可以断言」的能力；拿不准的一律不给规则，
// 由 worker 用 record_capability 显式登记（要求证据）。宁缺勿滥：
// 错误的能力会让 planner 去追不存在的链。
var rules = []Derivation{
	{VulnClass: "ssrf", Kind: "net_reachable", Strength: "outbound", Rule: "vulnclass:ssrf→net_reachable",
		Rationale: "已确认 SSRF 说明目标侧可发起出站请求，构成本任务范围内的网络可达能力。", Confidence: 0.7},
	{VulnClass: "sqli", Kind: "db_read", Strength: "read", Rule: "vulnclass:sqli→db_read",
		Rationale: "已确认 SQL 注入通常意味着可读取库内数据（读权限取决于数据库账号）。", Confidence: 0.6},
	{VulnClass: "ssti", Kind: "cmd_exec", Strength: "exec", Rule: "vulnclass:ssti→cmd_exec",
		Rationale: "模板注入在多数引擎下可升级到命令执行；若实测只能读变量，应由人工下调。", Confidence: 0.5},
	{VulnClass: "xxe", Kind: "file_read", Strength: "read", Rule: "vulnclass:xxe→file_read",
		Rationale: "已确认 XXE 且回显/带外可取内容时具备文件读取能力。", Confidence: 0.5},
	{VulnClass: "upload", Kind: "file_write", Strength: "write", Rule: "vulnclass:upload→file_write",
		Rationale: "任意文件上传成功即具备向目标写入文件的能力（落点受上传目录限制）。", Confidence: 0.5},
	{VulnClass: "jwt", Kind: "token_valid", Strength: "token", Rule: "vulnclass:jwt→token_valid",
		Rationale: "JWT 校验缺陷可伪造/延长令牌，形成有效令牌能力。", Confidence: 0.6},
}

// NormalizeKind 统一能力 Key 的写法（大小写/空白）；空串保持空串。
func NormalizeKind(key string) string {
	return strings.TrimSpace(strings.ToLower(key))
}

// All 返回全部能力种类（按 Key 排序，便于稳定输出）。
func All() []Kind {
	out := append([]Kind(nil), kinds...)
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

// Keys 返回全部能力 Key。
func Keys() []string {
	out := make([]string, 0, len(kinds))
	for _, k := range kinds {
		out = append(out, k.Key)
	}
	sort.Strings(out)
	return out
}

// ByKey 按 Key 查目录。
func ByKey(key string) (Kind, bool) {
	key = strings.TrimSpace(strings.ToLower(key))
	for _, k := range kinds {
		if k.Key == key {
			return k, true
		}
	}
	return Kind{}, false
}

// Derive 返回某个漏洞类目可自动推导出的能力；类目先做归一（大小写/别名）。
func Derive(vulnClass string) []Derivation {
	key, ok := vulnclass.Normalize(vulnClass)
	if !ok {
		return nil
	}
	var out []Derivation
	for _, r := range rules {
		if r.VulnClass == key {
			out = append(out, r)
		}
	}
	return out
}

// Gap 描述「还缺什么」：某项能力尚未获得时，缺哪些前置能力。
type Gap struct {
	Kind    string   `json:"kind"`
	Name    string   `json:"name"`
	Missing []string `json:"missing,omitempty"`
	Hint    string   `json:"hint,omitempty"`
}

// Gaps 拿已持有的能力算缺口。只做一层前置（多跳规划属于链路引擎，R2.3）。
func Gaps(held []string) []Gap {
	has := make(map[string]bool, len(held))
	for _, h := range held {
		has[strings.TrimSpace(strings.ToLower(h))] = true
	}
	var out []Gap
	for _, k := range All() {
		if has[k.Key] {
			continue
		}
		var missing []string
		for _, p := range k.Prereq {
			if !has[p] {
				missing = append(missing, p)
			}
		}
		hint := "前置已齐，可直接尝试获取"
		if len(missing) > 0 {
			hint = "先补齐前置能力"
		}
		out = append(out, Gap{Kind: k.Key, Name: k.Name, Missing: missing, Hint: hint})
	}
	return out
}

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

// Package egress 提供内置代理核心、节点/池管理、会话网关与对抗模式出口。
//
// 分层（见 docs/代理池与内置代理核心设计方案.md）：
//
//	core      mihomo 作为协议拨号器（ss/ssr/vmess/vless/trojan/socks5/http/...）
//	store     SQLite 持久化（节点、池、成员、任务绑定、健康、用量）
//	manager   运行时：池快照、健康探测、租约、限流、会话注册
//	gateway   回环 HTTP CONNECT 网关，所有目标流量必经点
//
// 工具侧只看到一个带会话凭据的回环代理 URL；节点选择、失败切换、审计都在网关内完成。
package egress

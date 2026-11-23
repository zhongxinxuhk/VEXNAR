// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 启动日志过滤自检。
 *
 * 目标是「启动成功的信息不吓人，真正的错误一行不少」：只静音逐字匹配的横幅行，
 * Traceback / TypeError / 失败 / 重试 / 退出 必须原样透传；VEXNAR_VERBOSE=1 全放行。
 */
import assert from 'node:assert/strict'

import { isStartupNoise } from './vexnar-logs.ts'

const noisy = [
  '[mdcg-mcp] 路径：记忆真源 root=/x · 身份/凭据根 aux=/y',
  '[mdcg-mcp] 写入策略：来源=package_default path=/x/policy.json（forbidden=13 required=6）',
  '[mdcg-mcp] 自报: source=/x/md_cg render_version=2',
  '[mdcg-mcp] 自报文件: /tmp/md_cg_servers/1.json',
  '[mdcg-mcp] 代校验：延迟导入 563 项 / 目标模块 54 个 · 代 abc',
  '[lingshu-bridge] [mdcg-mcp] 路径：记忆真源 root=/x',
  '[lingshu-bridge] [mdcg-mcp] 写入策略：来源=package_default path=/x',
  '[dsh-craft-anything] MCP child ready mode=deep pid=25700',
  '[dsh-purge-community] DSH 0.2.2-rc.5 未在已验证清单内：仍可应用，写入前备份，应用后请看逐条诊断确认锚点是否漂移。'
]
for (const line of noisy) assert.equal(isStartupNoise(line), true, `应静音：${line}`)

const important = [
  '[lingshu-bridge] Traceback (most recent call last):',
  'TypeError: unsupported operand type(s) for |: \'type\' and \'NoneType\'',
  '[lingshu-bridge] 灵枢进程退出 code=1 signal=null（存活 0s）',
  '[lingshu-bridge] 将进行第 1/8 次重试（1000ms 后）',
  '[lingshu-bridge] 握手失败: 灵枢进程已退出（code=1 signal=none）',
  '[mdcg-mcp] ⚠ 写入策略不可用（来源=package_default code=3）',
  '[dsh-craft-anything] MCP child exited code=130 signal=null',
  '[vexnar] 无法连接 Go 服务',
  '随便一行普通输出'
]
for (const line of important) assert.equal(isStartupNoise(line), false, `不应静音：${line}`)

// 显式 verbose 全放行
assert.equal(isStartupNoise(noisy[0], true), false, 'VEXNAR_VERBOSE=1 时不得静音')

console.log('startup logs: 19 checks passed')

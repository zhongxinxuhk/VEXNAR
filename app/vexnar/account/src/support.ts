// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 登录页右上角的四个入口，以及「支持中心」的预填参数。
 *
 * 支持中心是飞书问卷（`share/base/form/...`）。飞书支持用查询参数预填：
 *
 *     [问卷链接]?prefill_[问题名称]=[预填值]
 *
 * 参数名里的「问题名称」必须与问卷中的标题**逐字一致**，多个问题用 `&` 连接；
 * 值里的 `@ % # ?` 等字符要做百分号编码（见飞书帮助中心《在飞书问卷中设置预填默认值》）。
 * 所以这里不按字段 ID 拼，按问卷标题拼：标题改了，这里也要跟着改。
 *
 * 三个预填项与问卷标题的对应关系（2026-11-27 从表单页面读出）：
 *   - 设备序列号            → `fldiHdpyhe`
 *   - Vernax Harness 版本   → `fldLe3YWEM`
 *   - 设备信息              → `fldWhRCrVS`
 *
 * 序列号拿不到时**不传**这个参数：传一个 `UNKNOWN` 会让「自动生成」的字段收到
 * 假值，比留空更糟。
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { hostname, release as osRelease } from 'node:os'

/** 产品文档（Harness 使用说明与发行说明）。 */
export const HARNESS_DOCS = 'https://vexnar.sec.hn.cn/'
/** API Services 文档。 */
export const API_SERVICES = 'https://docs.sec.hn.cn/'
/** API 状态页。 */
export const API_STATUS = 'https://status.sec.hn.cn/'
/** 支持中心：飞书问卷。 */
export const SUPPORT_FORM = 'https://cn-hn-hk.feishu.cn/share/base/form/shrcnvkOmgHhRWp4JApcKw42RId'

/** 问卷里的三个预填问题标题。 */
export const SUPPORT_FIELDS = {
  serial: '设备序列号',
  version: 'Vernax Harness 版本',
  device: '设备信息'
} as const

/** 预填所需的设备事实。 */
export interface DeviceFacts {
  /** 机器序列号；拿不到时为空串。 */
  serial: string
  /** 当前 Harness 版本（开发模式是 `dev`）。 */
  version: string
  /** 运行环境一行摘要。 */
  device: string
}

/**
 * 拼支持中心的预填链接。
 *
 * @param facts - 设备事实。
 * @returns 带 `prefill_` 参数的问卷链接。
 */
export function supportUrl(facts: DeviceFacts): string {
  const pairs: Array<[string, string]> = [
    [SUPPORT_FIELDS.serial, facts.serial.trim()],
    [SUPPORT_FIELDS.version, facts.version.trim()],
    [SUPPORT_FIELDS.device, facts.device.trim()]
  ]
  const query = pairs
    .filter(([, value]) => value !== '')
    .map(([name, value]) => `prefill_${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&')
  return query === '' ? SUPPORT_FORM : `${SUPPORT_FORM}?${query}`
}

/**
 * 运行环境摘要，例如 `win32-x64 · Windows 10.0.22631 · DESKTOP-ABC`。
 *
 * @param platform - `process.platform`。
 * @param arch - `process.arch`。
 * @param release - 内核版本。
 * @param host - 主机名。
 * @returns 一行设备信息。
 */
export function describeDevice(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  release: string = osRelease(),
  host: string = hostname()
): string {
  const system = platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : platform
  const parts = [`${platform}-${arch}`, `${system} ${release}`]
  if (host !== '') parts.push(host)
  return parts.join(' · ')
}

/**
 * 把各平台读序列号的输出解析成序列号。
 *
 * @param platform - 目标平台。
 * @param output - 命令或文件的原文。
 * @returns 序列号；解析不出时为空串。
 */
export function parseSerialOutput(platform: NodeJS.Platform, output: string): string {
  if (platform === 'darwin') {
    return /"IOPlatformSerialNumber"\s*=\s*"([^"]+)"/u.exec(output)?.[1]?.trim() ?? ''
  }
  return output.trim()
}

/** 序列号读一次就够：登录页每次刷新都去问一次 IOPlatform 没有意义。 */
let serialCache: string | undefined

/**
 * 读本机序列号。
 *
 * @param platform - 目标平台。
 * @param run - 执行外部命令的实现，测试可替换。
 * @param read - 读文件的实现，测试可替换。
 * @returns 序列号；读不到时为空串。
 */
export function machineSerial(
  platform: NodeJS.Platform = process.platform,
  run: (command: string, args: string[]) => string = (command, args) =>
    execFileSync(command, args, { encoding: 'utf8', timeout: 3000, windowsHide: true }),
  read: (path: string) => string = (path) => readFileSync(path, 'utf8')
): string {
  if (serialCache !== undefined) return serialCache
  let serial = ''
  try {
    if (platform === 'darwin') {
      serial = parseSerialOutput(platform, run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']))
    } else if (platform === 'win32') {
      serial = parseSerialOutput(platform, run('powershell', ['-NoProfile', '-NonInteractive', '-Command',
        '(Get-CimInstance Win32_BIOS).SerialNumber']))
    } else if (platform === 'linux') {
      serial = parseSerialOutput(platform, read('/sys/class/dmi/id/product_serial'))
    }
  } catch {
    serial = ''
  }
  serialCache = serial
  return serial
}

/**
 * 组装当前设备的预填事实。
 *
 * @param version - 当前 Harness 版本。
 * @param platform - 目标平台。
 * @param arch - 目标架构。
 * @returns 预填事实。
 */
export function deviceFacts(
  version: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): DeviceFacts {
  return {
    serial: machineSerial(platform),
    version,
    device: describeDevice(platform, arch)
  }
}
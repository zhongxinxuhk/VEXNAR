// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 登录页右上角外链与支持中心预填。
 *
 * 预填参数是最容易被悄悄改坏的一层：飞书按「问题名称」匹配，名字错一个字、值里
 * 少一次百分号编码，页面看起来正常，填进去却是空的。这里把参数名与编码钉死。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loginPage } from '../src/login-page.ts'
import {
  API_SERVICES,
  API_STATUS,
  HARNESS_DOCS,
  SUPPORT_FORM,
  describeDevice,
  parseSerialOutput,
  supportUrl
} from '../src/support.ts'

test('支持中心链接按飞书约定带三个 prefill 参数', () => {
  const url = supportUrl({
    serial: 'C02XK0ABCDEF',
    version: '0.0.13',
    device: 'darwin-arm64 · macOS 24.6.0 · mac'
  })
  const query = new URL(url).searchParams
  assert.equal(query.get('prefill_设备序列号'), 'C02XK0ABCDEF')
  assert.equal(query.get('prefill_Vernax Harness 版本'), '0.0.13')
  assert.equal(query.get('prefill_设备信息'), 'darwin-arm64 · macOS 24.6.0 · mac')
  assert.ok(url.startsWith(`${SUPPORT_FORM}?prefill_`))
})

test('拿不到序列号时不传这个参数', () => {
  const url = supportUrl({ serial: '', version: 'dev', device: 'win32-x64 · Windows 10.0.22631' })
  const query = new URL(url).searchParams
  assert.equal(query.has('prefill_设备序列号'), false)
  assert.equal(query.get('prefill_Vernax Harness 版本'), 'dev')
})

test('值里的 & 与 ? 被编码，不会截断查询串', () => {
  const url = supportUrl({ serial: 'A&B?C', version: '0.0.13', device: 'x' })
  assert.ok(url.includes('prefill_%E8%AE%BE%E5%A4%87%E5%BA%8F%E5%88%97%E5%8F%B7='))
  assert.equal(new URL(url).searchParams.get('prefill_设备序列号'), 'A&B?C')
})

test('序列号解析：macOS 取 IOPlatformSerialNumber，Windows/Linux 去空白', () => {
  const ioreg = '    | |   "IOPlatformSerialNumber" = "C02XK0ABCDEF"\n'
  assert.equal(parseSerialOutput('darwin', ioreg), 'C02XK0ABCDEF')
  assert.equal(parseSerialOutput('win32', '  ABC1234 \r\n'), 'ABC1234')
  assert.equal(parseSerialOutput('linux', 'SER9\n'), 'SER9')
  assert.equal(parseSerialOutput('darwin', 'nothing here'), '')
})

test('设备信息一行包含平台、系统与主机名', () => {
  assert.equal(describeDevice('win32', 'x64', '10.0.22631', 'DESKTOP-ABC'),
    'win32-x64 · Windows 10.0.22631 · DESKTOP-ABC')
  assert.equal(describeDevice('linux', 'arm64', '6.6.0', ''), 'linux-arm64 · linux 6.6.0')
})

test('登录页右上角是四个外链，支持中心带预填', () => {
  const support = supportUrl({ serial: 'S1', version: '0.0.13', device: 'darwin-arm64 · macOS' })
  const page = loginPage('https://platform.sec.hn.cn', support)
  assert.ok(page.includes(`href="${HARNESS_DOCS}"`))
  assert.ok(page.includes(`href="${API_SERVICES}"`))
  assert.ok(page.includes(`href="${API_STATUS}"`))
  assert.ok(page.includes('>产品文档<') && page.includes('>API Services<') && page.includes('>API<'))
  assert.ok(page.includes('>支持中心<'))
  // HTML 属性里 & 要写成 &amp;，否则解析器会把后面的参数当成实体。
  assert.ok(page.includes(support.replace(/&/gu, '&amp;')))
})

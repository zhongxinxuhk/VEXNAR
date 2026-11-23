// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isOriginAllowed, isPrivateAddress, normalizeOrigin } from '../src/policy.ts'
import { classifyResponse, detectWafMarkers, redactBody, redactUrl } from '../src/analyzer.ts'

test('origin 归一化：拒绝凭据与非 http(s)，去路径', () => {
  assert.equal(normalizeOrigin('https://Target.Example/login?x=1'), 'https://target.example')
  assert.equal(normalizeOrigin('http://127.0.0.1:8080'), 'http://127.0.0.1:8080')
  assert.throws(() => normalizeOrigin('ftp://x'), /只支持 http/)
  assert.throws(() => normalizeOrigin('https://u:p@x.example'), /凭据/)
})

test('私网判定覆盖 IPv4/IPv6 常见段', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateAddress(address), true, address)
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700::1111', '172.32.0.1']) {
    assert.equal(isPrivateAddress(address), false, address)
  }
})

test('origin 白名单：空名单放行，有名单只放行命中项', () => {
  const base = { allowedOrigins: [] } as never
  assert.equal(isOriginAllowed('https://a.example', base), true)
  const restricted = { allowedOrigins: ['https://a.example', 'b.example'] } as never
  assert.equal(isOriginAllowed('https://a.example', restricted), true)
  assert.equal(isOriginAllowed('https://b.example', restricted), true)
  assert.equal(isOriginAllowed('https://c.example', restricted), false)
})

test('WAF 分类：403 无特征算 auth_denied，有挑战特征才算 waf_blocked', () => {
  const plain = classifyResponse({ status: 403, headers: {}, bodyText: 'forbidden', wafMarkers: [] })
  assert.equal(plain, 'auth_denied')
  const markers = detectWafMarkers({ 'cf-mitigated': 'challenge' }, '<title>Just a moment...</title>')
  assert.ok(markers.includes('cf-mitigated'))
  assert.ok(markers.includes('cloudflare_challenge'))
  assert.equal(classifyResponse({ status: 403, headers: {}, bodyText: 'Just a moment...', wafMarkers: markers }), 'waf_blocked')
  assert.equal(classifyResponse({ status: 429, headers: {}, bodyText: '', wafMarkers: [] }), 'rate_limited')
  assert.equal(classifyResponse({ status: 500, headers: {}, bodyText: '', wafMarkers: [] }), 'server_error')
})

test('脱敏：URL 敏感参数、Bearer、口令字段', () => {
  assert.match(redactUrl('https://a.example/x?token=abc&keep=1'), /token=\*\*\*/)
  assert.ok(!redactUrl('https://a.example/x?token=abc').includes('abc'))
  const body = redactBody('Authorization: Bearer abcdefghijklmnop password=hunter2 eyJhbGciOi.eyJzdWIi.c2ln')
  assert.ok(!body.includes('hunter2'))
  assert.ok(!body.includes('abcdefghijklmnop'))
  assert.ok(!body.includes('eyJhbGciOi'))
})

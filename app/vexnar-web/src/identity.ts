// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 身份与请求头画像（identity）。
 *
 * 能做的：换一组**内部自洽**的请求头（UA / Accept / Accept-Language / sec-ch-ua /
 * sec-fetch-*），让 WAF 的"UA 黑名单""头部缺失"这类**值级规则**看到不同输入。
 *
 * 做不到（不要假装）：HTTP/1.1 头顺序、TLS ClientHello 指纹（JA3/JA4）、HTTP/2
 * 帧行为都由 undici 的协议栈决定，改 header 改不了。真要这一类，必须换成真实浏览器
 * 出口（Browser Transport），不在本引擎的承诺范围内。
 */

export interface Identity {
  id: string
  label: string
  headers: Record<string, string>
}

const COMMON_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'

const IDENTITIES: Identity[] = [
  {
    id: 'chrome-mac',
    label: 'Chrome / macOS',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      accept: COMMON_ACCEPT,
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1'
    }
  },
  {
    id: 'safari-mac',
    label: 'Safari / macOS',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      accept: COMMON_ACCEPT,
      'accept-language': 'zh-CN,zh-Hans;q=0.9',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none'
    }
  },
  {
    id: 'firefox-win',
    label: 'Firefox / Windows',
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
      accept: COMMON_ACCEPT,
      'accept-language': 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3',
      'upgrade-insecure-requests': '1',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none'
    }
  },
  {
    id: 'api-client',
    label: 'API 客户端（非浏览器）',
    headers: {
      'user-agent': 'Authorized-Web-Test/1.0',
      accept: 'application/json, text/plain;q=0.9, */*;q=0.5'
    }
  }
]

export function identities(): Identity[] {
  return IDENTITIES
}

export function identityAt(index: number): Identity {
  if (!IDENTITIES.length) throw new Error('身份画像为空')
  return IDENTITIES[Math.abs(index) % IDENTITIES.length]
}

export function identityById(id: string): Identity | null {
  return IDENTITIES.find((item) => item.id === id) ?? null
}

/**
 * 合并身份头与调用方自定义头：自定义头优先（测试用例要能覆盖 UA 等），
 * 但永远不允许覆盖 Host / Content-Length 这类由传输层决定的头。
 */
export function mergeIdentityHeaders(identity: Identity, extra: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...identity.headers }
  for (const [name, value] of Object.entries(extra)) {
    const key = name.toLowerCase()
    if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(key)) continue
    headers[key] = value
  }
  return headers
}

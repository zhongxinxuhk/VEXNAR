// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 鉴权 · 日志 · 系统聚合路由（Go 侧 server/auth.go、server/logsink.go、
 * server/broadcast.go、server/assembly.go 的 TypeScript 迁移）。
 *
 * 与 Go 端保持的契约：
 *   - JWT 一律 HS256，签名密钥是**仓库根**的 jwt.key（与 Go 进程共用同一份密钥，
 *     浏览器里已签发的 token 迁移后继续有效）；sub 固定 VEXNAR，TTL 7 天。
 *   - 密码哈希是 bcrypt（$2a$，cost 10），与 Go 的 bcrypt.GenerateFromPassword
 *     逐字节可比：从 PostgreSQL 导入的 auth.password_hash 能直接校验通过，
 *     这里新写的哈希 Go 端也能校验。
 *   - 密码、活跃任务等设置项落在 meta 域 `settings`（与 GET /api/settings 同源），
 *     兼容 Go 导入的 [{key,value}] 行式形状和对象式形状。
 *   - 日志：内存环形缓冲（cap 3000）+ SSE 订阅扇出，同时把行异步落 kv 表 `logs`
 *     供 /api/logs/history 翻页，等价于 Go 的 ring buffer + server_logs。
 *
 * 该模块只注册路由；鉴权中间件不在本文件（等价于 Go requireAuth 对
 * /api/auth/* 与 /api/health 的豁免由挂载方负责）。
 */

import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import type { Hono } from 'hono'
import { modelCompletionReady } from '../gateway.ts'
import { streamSSE } from 'hono/streaming'
import { buildReport, meta, operations, parseJson, store } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────────────────────

/** 仓库根：app/vexnar-core/src/routes/ 往上四层。 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const JWT_KEY_PATH = join(REPO_ROOT, 'jwt.key')
const JWT_SUBJECT = 'VEXNAR'
const JWT_TTL_SECONDS = 7 * 24 * 60 * 60
const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** settings 域里保存密码哈希的键名，与 Go 的 authPassKey 一致。 */
const AUTH_PASS_KEY = 'auth.password_hash'
const ACTIVE_TASK_KEY = 'active_task_id'

/**
 * 下限与 setup 页前端校验一致；上限是 bcrypt 的硬限制——超过 72 字节
 * GenerateFromPassword 直接返回 ErrPasswordTooLong，提前挡掉好过让用户收到
 * 一句含义不明的「密码加密失败」。
 */
const MIN_PASSWORD_RUNES = 8
const MAX_PASSWORD_BYTES = 72

/** 密码相关读操作失败时的统一回复：绝不能把「读不到」当成「没有设置」。 */
const ERR_DATA_SOURCE = '数据源暂时不可用，请稍后重试'

const LOG_TABLE = 'logs'
const LOG_CAP = 3000
const LOG_STREAM_REPLAY = 1000
const LOG_RETENTION = Math.max(Number(process.env.VEXNAR_LOG_RETENTION ?? 20000) || 20000, LOG_CAP)
const LOG_PING_MS = 20_000

// ─────────────────────────────────────────────────────────────────────────────
// 小工具
// ─────────────────────────────────────────────────────────────────────────────

function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

function errResponse(c: any, error: any) {
  return c.json({ error: String(error?.message ?? error) }, error?.name === 'StoreConflict' ? 409 : error?.status ?? 400)
}

/** RFC3339 文本（带会话时区偏移），与 Go 的 time.RFC3339 输出形状一致。 */
function rfc3339(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return `${date.toISOString().slice(0, 19)}${sign}${pad(offset / 60)}:${pad(offset % 60)}`
}

/** 把任意 JSON 值压成一行文本，日志行永远不带换行。 */
function toLine(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack || value.message
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT（HS256 + 仓库根 jwt.key）
// ─────────────────────────────────────────────────────────────────────────────

let cachedKey: Buffer | null = null

/** 读取仓库根的 jwt.key；缺失时按 Go 的规则生成 32 字符随机密钥并落盘（0600）。 */
export function jwtSigningKey(): Buffer {
  if (cachedKey) return cachedKey
  try {
    const text = readFileSync(JWT_KEY_PATH, 'utf8').trim()
    if (text.length >= 32) {
      cachedKey = Buffer.from(text)
      return cachedKey
    }
  } catch {
    // 首次启动还没有密钥
  }
  let generated = ''
  while (generated.length < 32) generated += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)]
  writeFileSync(JWT_KEY_PATH, generated, { mode: 0o600 })
  cachedKey = Buffer.from(generated)
  return cachedKey
}

/** 签发 7 天 HS256 token，claims 形状对齐 Go 的 signJWT（sub/iat/exp）。 */
export function signToken(): string {
  return jwt.sign({}, jwtSigningKey(), {
    algorithm: 'HS256',
    subject: JWT_SUBJECT,
    expiresIn: JWT_TTL_SECONDS
  })
}

/** 校验 token；签名算法、过期时间、sub 三者都对才算通过。 */
export function verifyToken(token: string | null | undefined): boolean {
  if (!token) return false
  try {
    const payload = jwt.verify(token, jwtSigningKey(), { algorithms: ['HS256'] }) as any
    return String(payload?.sub ?? '') === JWT_SUBJECT
  } catch {
    return false
  }
}

/**
 * token 来源：Authorization: Bearer → vexnar_token cookie → ?token=（SSE 用，
 * EventSource 不能自定义请求头）。与 Go 的 extractToken 一致。
 */
function extractToken(c: any): string {
  const header = c.req.header('authorization') ?? ''
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  const cookie = c.req.header('cookie') ?? ''
  const match = cookie.match(/(?:^|;\s*)vexnar_token=([^;]+)/)
  if (match?.[1]) return decodeURIComponent(match[1])
  return String(c.req.query('token') ?? '')
}

// ─────────────────────────────────────────────────────────────────────────────
// bcrypt：无第三方依赖、与 Go/golang.org/x/crypto 逐字节一致
//
// 只有 crypto 模块可用，而 bcrypt 不是标准算法（EksBlowfish），所以这里直接
// 实现：Blowfish P/S 初值取 π 的小数十六进制展开，密钥编排 2^cost 轮，末轮把
// "OrpheanBeholderScryDoubt" 加密 64 轮后按 bcrypt 的 base64 变体编码。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Blowfish 的 P 数组 + 4 个 S 盒 = 1042 个 32 位字 = π 小数部分的 8336 个十六进制
 * 位。这里一次性离线算好后硬编码，模块加载时只做一次 parseInt 切分。
 */
const BCRYPT_PI =
  '243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89452821e638d01377be5466cf34e90c6cc0ac29b7' +
  'c97c50dd3f84d5b5b54709179216d5d98979fb1bd1310ba698dfb5ac2ffd72dbd01adfb7b8e1afed6a267e96ba7c9045f12c7f99' +
  '24a19947b3916cf70801f2e2858efc16636920d871574e69a458fea3f4933d7e0d95748f728eb658718bcd5882154aee7b54a41d' +
  'c25a59b59c30d5392af26013c5d1b023286085f0ca417918b8db38ef8e79dcb0603a180e6c9e0e8bb01e8a3ed71577c1bd314b27' +
  '78af2fda55605c60e65525f3aa55ab945748986263e8144055ca396a2aab10b6b4cc5c341141e8cea15486af7c72e993b3ee1411' +
  '636fbc2a2ba9c55d741831f6ce5c3e169b87931eafd6ba336c24cf5c7a325381289586773b8f48986b4bb9afc4bfe81b66282193' +
  '61d809ccfb21a991487cac605dec8032ef845d5de98575b1dc262302eb651b8823893e81d396acc50f6d6ff383f442392e0b4482' +
  'a484200469c8f04a9e1f9b5e21c66842f6e96c9a670c9c61abd388f06a51a0d2d8542f68960fa728ab5133a36eef0b6c137a3be4' +
  'ba3bf0507efb2a98a1f1651d39af017666ca593e82430e888cee8619456f9fb47d84a5c33b8b5ebee06f75d885c12073401a449f' +
  '56c16aa64ed3aa62363f77061bfedf72429b023d37d0d724d00a1248db0fead349f1c09b075372c980991b7b25d479d8f6e8def7' +
  'e3fe501ab6794c3b976ce0bd04c006bac1a94fb6409f60c45e5c9ec2196a246368fb6faf3e6c53b51339b2eb3b52ec6f6dfc511f' +
  '9b30952ccc814544af5ebd09bee3d004de334afd660f2807192e4bb3c0cba85745c8740fd20b5f39b9d3fbdb5579c0bd1a60320a' +
  'd6a100c6402c7279679f25fefb1fa3cc8ea5e9f8db3222f83c7516dffd616b152f501ec8ad0552ab323db5fafd23876053317b48' +
  '3e00df829e5c57bbca6f8ca01a87562edf1769dbd542a8f6287effc3ac6732c68c4f5573695b27b0bbca58c8e1ffa35db8f011a0' +
  '10fa3d98fd2183b84afcb56c2dd1d35b9a53e479b6f84565d28e49bc4bfb9790e1ddf2daa4cb7e3362fb1341cee4c6e8ef20cada' +
  '36774c01d07e9efe2bf11fb495dbda4dae909198eaad8e716b93d5a0d08ed1d0afc725e08e3c5b2f8e7594b78ff6e2fbf2122b64' +
  '8888b812900df01c4fad5ea0688fc31cd1cff191b3a8c1ad2f2f2218be0e1777ea752dfe8b021fa1e5a0cc0fb56f74e818acf3d6' +
  'ce89e299b4a84fe0fd13e0b77cc43b81d2ada8d9165fa2668095770593cc7314211a1477e6ad206577b5fa86c75442f5fb9d35cf' +
  'ebcdaf0c7b3e89a0d6411bd3ae1e7e4900250e2d2071b35e226800bb57b8e0af2464369bf009b91e5563911d59dfa6aa78c14389' +
  'd95a537f207d5ba202e5b9c5832603766295cfa911c819684e734a41b3472dca7b14a94a1b5100529a532915d60f573fbc9bc6e4' +
  '2b60a47681e6740008ba6fb5571be91ff296ec6b2a0dd915b6636521e7b9f9b6ff34052ec585566453b02d5da99f8fa108ba4799' +
  '6e85076a4b7a70e9b5b32944db75092ec4192623ad6ea6b049a7df7d9cee60b88fedb266ecaa8c71699a17ff5664526cc2b19ee1' +
  '193602a575094c29a0591340e4183a3e3f54989a5b429d656b8fe4d699f73fd6a1d29c07efe830f54d2d38e6f0255dc14cdd2086' +
  '8470eb266382e9c6021ecc5e09686b3f3ebaefc93c9718146b6a70a1687f358452a0e286b79c5305aa5007373e07841c7fdeae5c' +
  '8e7d44ec5716f2b8b03ada37f0500c0df01c1f040200b3ffae0cf51a3cb574b225837a58dc0921bdd19113f97ca92ff694324773' +
  '22f547013ae5e58137c2dadcc8b576349af3dda7a94461460fd0030eecc8c73ea4751e41e238cd993bea0e2f3280bba1183eb331' +
  '4e548b384f6db9086f420d03f60a04bf2cb8129024977c795679b072bcaf89afde9a771fd9930810b38bae12dccf3f2e5512721f' +
  '2e6b7124501adde69f84cd877a5847187408da17bc9f9abce94b7d8cec7aec3adb851dfa63094366c464c3d2ef1c18473215d908' +
  'dd433b3724c2ba1612a14d432a65c45150940002133ae4dd71dff89e10314e5581ac77d65f11199b043556f1d7a3c76b3c11183b' +
  '5924a509f28fe6ed97f1fbfa9ebabf2c1e153c6e86e34570eae96fb1860e5e0a5a3e2ab3771fe71c4e3d06fa2965dcb999e71d0f' +
  '803e89d65266c8252e4cc9789c10b36ac6150eba94e2ea78a5fc3c531e0a2df4f2f74ea7361d2b3d1939260f19c279605223a708' +
  'f71312b6ebadfe6eeac31f66e3bc4595a67bc883b17f37d1018cff28c332ddefbe6c5aa56558218568ab9802eecea50fdb2f953b' +
  '2aef7dad5b6e2f841521b62829076170ecdd4775619f151013cca830eb61bd960334fe1eaa0363cfb5735c904c70a239d59e9e0b' +
  'cbaade14eecc86bc60622ca79cab5cabb2f3846e648b1eaf19bdf0caa02369b9655abb5040685a323c2ab4b3319ee9d5c021b8f7' +
  '9b540b19875fa09995f7997e623d7da8f837889a97e32d7711ed935f166812810e358829c7e61fd696dedfa17858ba9957f584a5' +
  '1b2272639b83c3ff1ac24696cdb30aeb532e30548fd948e46dbc312858ebf2ef34c6ffeafe28ed61ee7c3c735d4a14d9e864b7e3' +
  '42105d14203e13e045eee2b6a3aaabeadb6c4f15facb4fd0c742f442ef6abbb5654f3b1d41cd2105d81e799e86854dc7e44b476a' +
  '3d816250cf62a1f25b8d2646fc8883a0c1c7b6a37f1524c369cb749247848a0b5692b285095bbf00ad19489d1462b17423820e00' +
  '58428d2a0c55f5ea1dadf43e233f70613372f0928d937e41d65fecf16c223bdb7cde3759cbee74604085f2a7ce77326ea6078084' +
  '19f8509ee8efd85561d99735a969a7aac50c06c25a04abfc800bcadc9e447a2ec3453484fdd567050e1e9ec9db73dbd3105588cd' +
  '675fda79e3674340c5c43465713e38d83d28f89ef16dff20153e21e78fb03d4ae6e39f2bdb83adf7e93d5a68948140f7f64c261c' +
  '94692934411520f77602d4f7bcf46b2ed4a20068d40824713320f46a43b7d4b7500061af1e39f62e9724454614214f74bf8b8840' +
  '4d95fc1d96b591af70f4ddd366a02f45bfbc09ec03bd97857fac6dd031cb850496eb27b355fd3941da2547e6abca0a9a28507825' +
  '530429f40a2c86dae9b66dfb68dc1462d7486900680ec0a427a18dee4f3ffea2e887ad8cb58ce0067af4d6b6aace1e7cd3375fec' +
  'ce78a399406b2a4220fe9e35d9f385b9ee39d7ab3b124e8b1dc9faf74b6d185626a36631eae397b23a6efa74dd5b43326841e7f7' +
  'ca7820fbfb0af54ed8feb397454056acba48952755533a3a20838d87fe6ba9b7d096954b55a867bca1159a58cca9296399e1db33' +
  'a62a4a563f3125f95ef47e1c9029317cfdf8e80204272f7080bb155c05282ce395c11548e4c66d2248c1133fc70f86dc07f9c9ee' +
  '41041f0f404779a45d886e17325f51ebd59bc0d1f2bcc18f41113564257b7834602a9c60dff8e8a31f636c1b0e12b4c202e1329e' +
  'af664fd1cad181156b2395e0333e92e13b240b62eebeb92285b2a20ee6ba0d99de720c8c2da2f728d012784595b794fd647d0862' +
  'e7ccf5f05449a36f877d48fac39dfd27f33e8d1e0a476341992eff743a6f6eabf4f8fd37a812dc60a1ebddf8991be14cdb6e6b0d' +
  'c67b55106d672c372765d43bdcd0e804f1290dc7cc00ffa3b5390f92690fed0b667b9ffbcedb7d9ca091cf0bd9155ea3bb132f88' +
  '515bad247b9479bf763bd6eb37392eb3cc1159798026e297f42e312d6842ada7c66a2b3b12754ccc782ef11c6a124237b79251e7' +
  '06a1bbe64bfb63501a6b101811caedfa3d25bdd8e2e1c3c9444216590a121386d90cec6ed5abea2a64af674eda86a85fbebfe988' +
  '64e4c3fe9dbc8057f0f7c08660787bf86003604dd1fd8346f6381fb07745ae04d736fccc83426b33f01eab71b08041873c005e5f' +
  '77a057bebde8ae2455464299bf582e614e58f48ff2ddfda2f474ef388789bdc25366f9c3c8b38e74b475f25546fcd9b97aeb2661' +
  '8b1ddf84846a0e79915f95e2466e598e20b457708cd55591c902de4cb90bace1bb8205d011a862487574a99eb77f19b6e0a9dc09' +
  '662d09a1c4324633e85a1f0209f0be8c4a99a0251d6efe101ab93d1d0ba5a4dfa186f20f2868f169dcb7da83573906fea1e2ce9b' +
  '4fcd7f5250115e01a70683faa002b5c40de6d0279af88c27773f8641c3604c0661a806b5f0177a28c0f586e0006058aa30dc7d62' +
  '11e69ed72338ea6353c2dd94c2c21634bbcbee5690bcb6deebfc7da1ce591d766f05e4094b7c018839720a3d7c927c2486e3725f' +
  '724d9db91ac15bb4d39eb8fced54557808fca5b5d83d7cd34dad0fc41e50ef5eb161e6f8a28514d96c51133c6fd5c7e756e14ec4' +
  '362abfceddc6c837d79a323492638212670efa8e406000e03a39ce37d3faf5cfabc277375ac52d1b5cb0679e4fa33742d3822740' +
  '99bc9bbed5118e9dbf0f7315d62d1c7ec700c47bb78c1b6b21a19045b26eb1be6a366eb45748ab2fbc946e79c6a376d26549c2c8' +
  '530ff8ee468dde7dd5730a1d4cd04dc62939bbdba9ba4650ac9526e8be5ee304a1fad5f06a2d519a63ef8ce29a86ee22c089c2b8' +
  '43242ef6a51e03aa9cf2d0a483c061ba9be96a4d8fe51550ba645bd62826a2f9a73a3ae14ba99586ef5562e9c72fefd3f752f7da' +
  '3f046f6977fa0a5980e4a91587b086019b09e6ad3b3ee593e990fd5a9e34d7972cf0b7d9022b8b5196d5ac3a017da67dd1cf3ed6' +
  '7c7d2d281f9f25cfadf2b89b5ad6b4725a88f54ce029ac71e019a5e647b0acfded93fa9be8d3c48d283b57ccf8d5662979132e28' +
  '785f0191ed756055f7960e44e3d35e8c15056dd488f46dba03a161250564f0bdc3eb9e153c9057a297271aeca93a072a1b3f6d9b' +
  '1e6321f5f59c66fb26dcf3197533d928b155fdf5035634828aba3cbb28517711c20ad9f8abcc5167ccad925f4de817513830dc8e' +
  '379d58629320f991ea7a90c2fb3e7bce5121ce64774fbe32a8b6e37ec3293d4648de53696413e680a2ae0810dd6db22469852dfd' +
  '09072166b39a460a6445c0dd586cdecf1c20c8ae5bbef7dd1b588d40ccd2017f6bb4e3bbdda26a7e3a59ff453e350a44bcb4cdd5' +
  '72eacea8fa6484bb8d6612aebf3c6f47d29be463542f5d9eaec2771bf64e6370740e0d8de75b1357f8721671af537d5d4040cb08' +
  '4eb4e2cc34d2466a0115af84e1b0042895983a1d06b89fb4ce6ea0486f3f3b823520ab82011a1d4b277227f8611560b1e7933fdc' +
  'bb3a792b344525bda08839e151ce794b2f32c9b7a01fbac9e01cc87ebcc7d1f6cf0111c3a1e8aac71a908749d44fbd9ad0dadecb' +
  'd50ada380339c32ac69136678df9317ce0b12b4ff79e59b743f5bb3af2d519ff27d9459cbf97222c15e6fc2a0f91fc719b941525' +
  'fae59361ceb69cebc2a8645912baa8d1b6c1075ee3056a0c10d25065cb03a442e0ec6e0e1698db3b4c98a0be3278e9649f1f9532' +
  'e0d392dfd3a0342b8971f21e1b0a74414ba3348cc5be7120c37632d8df359f8d9b992f2ee60b6f470fe3f11de54cda541edad891' +
  'ce6279cfcd3e7e6f1618b166fd2c1d05848fd2c5f6fb2299f523f357a632762393a8353156cccd02acf081625a75ebb56e163697' +
  '88d273ccde96629281b949d04c50901b71c65614e6c6c7bd327a140a45e1d006c3f27b9ac9aa53fd62a80f00bb25bfe235bdd2f6' +
  '71126905b2040222b6cbcf7ccd769c2b53113ec01640e3d338abbd602547adf0ba38209cf746ce7677afa1c52075606085cbfe4e' +
  '8ae88dd87aaaf9b04cf9aa7e1948c25c02fb8a8c01c36ae4d6ebe1f990d4f869a65cdea03f09252dc208e69fb74e6132ce77e25b' +
  '578fdfe33ac372e6'

const BCRYPT_ALPHABET = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const BCRYPT_REVERSE: Record<string, number> = (() => {
  const out: Record<string, number> = {}
  for (let i = 0; i < BCRYPT_ALPHABET.length; i++) out[BCRYPT_ALPHABET[i]] = i
  return out
})()

/** bcrypt 的 60 字节哈希：$2a$<cost>$<22 位 salt><31 位摘要>。 */
const BCRYPT_PATTERN = /^\$2([aby])?\$(\d{2})\$([./A-Za-z0-9]{22})([./A-Za-z0-9]{31})$/

let piWords: Uint32Array | null = null

function blowfishConstants(): Uint32Array {
  if (!piWords) {
    const words = new Uint32Array(1042)
    for (let i = 0; i < 1042; i++) words[i] = parseInt(BCRYPT_PI.slice(i * 8, i * 8 + 8), 16) >>> 0
    piWords = words
  }
  return piWords
}

interface BlowfishState {
  P: Uint32Array
  S: Uint32Array
}

function initState(): BlowfishState {
  const pi = blowfishConstants()
  const state = { P: new Uint32Array(18), S: new Uint32Array(1024) }
  state.P.set(pi.subarray(0, 18))
  state.S.set(pi.subarray(18, 1042))
  return state
}

/** Blowfish 的 F 函数（uint32 加法/异或混合）。 */
function F(S: Uint32Array, x: number): number {
  let h = (S[(x >>> 24) & 0xff] + S[256 + ((x >>> 16) & 0xff)]) >>> 0
  h = (h ^ S[512 + ((x >>> 8) & 0xff)]) >>> 0
  return (h + S[768 + (x & 0xff)]) >>> 0
}

/**
 * 单块加密：原地写回交换后的 (R, L)，与 OpenBSD Blowfish_encipher 的
 * BLFRND 序列逐轮对应——每轮先把 F() 与 P[i] 一起异或进去，P[0]/P[17]
 * 只在首尾各用一次。
 */
function encipher(P: Uint32Array, S: Uint32Array, lr: Uint32Array): void {
  let l = (lr[0] ^ P[0]) >>> 0
  let r = lr[1]
  for (let i = 1; i <= 16; i += 2) {
    r = (r ^ F(S, l) ^ P[i]) >>> 0
    l = (l ^ F(S, r) ^ P[i + 1]) >>> 0
  }
  lr[0] = (r ^ P[17]) >>> 0
  lr[1] = l
}

/** 按 OpenBSD Blowfish_stream2word 的规则循环取 4 字节大端字。 */
function wordStream(bytes: Buffer): () => number {
  let cursor = 0
  return () => {
    let word = 0
    for (let i = 0; i < 4; i++) {
      word = ((word << 8) | bytes[cursor]) >>> 0
      cursor = (cursor + 1) % bytes.length
    }
    return word
  }
}

/**
 * 密钥编排（对齐 golang.org/x/crypto/blowfish 的 ExpandKey / expandKeyWithSalt）：
 * 先把密钥字流异或进 P，再用「上一轮输出」做块链逐对重填 P 与四个 S 盒；
 * 带 salt 时每一轮在加密前把 salt 字流异或进 (l, r)，salt 游标在两个阶段之间
 * 连续推进（salt 是 16 字节 = 4 个字，18 个字之后不是对齐的，这点必须一致）。
 */
function expandState(state: BlowfishState, key: Buffer, salt?: Buffer): void {
  const keyWords = wordStream(key)
  for (let i = 0; i < 18; i++) state.P[i] = (state.P[i] ^ keyWords()) >>> 0

  const lr = new Uint32Array(2)
  const encryptPair = () => {
    encipher(state.P, state.S, lr)
  }

  if (salt) {
    const saltWords = wordStream(salt)
    for (let i = 0; i < 18; i += 2) {
      lr[0] = (lr[0] ^ saltWords()) >>> 0
      lr[1] = (lr[1] ^ saltWords()) >>> 0
      encryptPair()
      state.P[i] = lr[0]
      state.P[i + 1] = lr[1]
    }
    for (let box = 0; box < 4; box++) {
      const base = box * 256
      for (let i = 0; i < 256; i += 2) {
        lr[0] = (lr[0] ^ saltWords()) >>> 0
        lr[1] = (lr[1] ^ saltWords()) >>> 0
        encryptPair()
        state.S[base + i] = lr[0]
        state.S[base + i + 1] = lr[1]
      }
    }
    return
  }

  for (let i = 0; i < 18; i += 2) {
    encryptPair()
    state.P[i] = lr[0]
    state.P[i + 1] = lr[1]
  }
  for (let box = 0; box < 4; box++) {
    const base = box * 256
    for (let i = 0; i < 256; i += 2) {
      encryptPair()
      state.S[base + i] = lr[0]
      state.S[base + i + 1] = lr[1]
    }
  }
}

const ORPHEAN = Buffer.from('OrpheanBeholderScryDoubt', 'ascii')

/** bcrypt 的魔法串加密，返回 23 字节摘要（第 24 字节按规范丢弃）。 */
function bcryptDigest(password: string, salt: Buffer, cost: number): Buffer {
  const hashed = Buffer.from(password, 'utf8').subarray(0, MAX_PASSWORD_BYTES)
  // crypt_blowfish/Go 都把 NUL 一起算进密钥流。
  const key = Buffer.concat([hashed, Buffer.from([0])])
  const state = initState()
  expandState(state, key, salt)
  const rounds = 1 << cost
  for (let i = 0; i < rounds; i++) {
    expandState(state, key)
    expandState(state, salt)
  }

  const blocks = new Uint32Array(6)
  for (let i = 0; i < 6; i++) blocks[i] = ORPHEAN.readUInt32BE(i * 4)
  const lr = new Uint32Array(2)
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < 6; i += 2) {
      lr[0] = blocks[i]
      lr[1] = blocks[i + 1]
      encipher(state.P, state.S, lr)
      blocks[i] = lr[0]
      blocks[i + 1] = lr[1]
    }
  }

  // 每块按大端写回（与 Go blowfish.Cipher.Encrypt 的序列化一致），最后只取
  // 前 23 字节——这是 bcrypt 里「少编码一个字节」的历史兼容行为。
  const out = Buffer.alloc(24)
  for (let i = 0; i < 6; i++) out.writeUInt32BE(blocks[i], i * 4)
  return out.subarray(0, 23)
}

/** bcrypt 的 base64 变体（字母表 ./A-Za-z0-9，无填充）。 */
function bcryptBase64(bytes: Buffer): string {
  let out = ''
  let cursor = 0
  while (cursor < bytes.length) {
    let c1 = bytes[cursor++]
    out += BCRYPT_ALPHABET[c1 >> 2]
    c1 = (c1 & 0x03) << 4
    if (cursor >= bytes.length) {
      out += BCRYPT_ALPHABET[c1]
      break
    }
    const c2 = bytes[cursor++]
    c1 |= (c2 >> 4) & 0x0f
    out += BCRYPT_ALPHABET[c1]
    c1 = (c2 & 0x0f) << 2
    if (cursor >= bytes.length) {
      out += BCRYPT_ALPHABET[c1]
      break
    }
    const c3 = bytes[cursor++]
    c1 |= (c3 >> 6) & 0x03
    out += BCRYPT_ALPHABET[c1]
    out += BCRYPT_ALPHABET[c3 & 0x3f]
  }
  return out
}

/** 上一步的逆运算：取够 bytes 字节即可（尾部残缺位按规范丢弃）。 */
function bcryptUnbase64(text: string, bytes: number): Buffer {
  const out = Buffer.alloc(bytes)
  let acc = 0
  let bits = 0
  let cursor = 0
  for (const char of text) {
    const value = BCRYPT_REVERSE[char]
    if (value === undefined) throw apiError(400, '密码哈希格式错误')
    acc = ((acc << 6) | value) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      if (cursor < bytes) out[cursor++] = (acc >> bits) & 0xff
    }
  }
  return out
}

interface ParsedBcrypt {
  cost: number
  salt: Buffer
  digest: Buffer
}

function parseBcrypt(stored: string): ParsedBcrypt | null {
  const match = BCRYPT_PATTERN.exec(String(stored ?? '').trim())
  if (!match) return null
  const cost = Number(match[2])
  if (!Number.isFinite(cost) || cost < 4 || cost > 31) return null
  try {
    return { cost, salt: bcryptUnbase64(match[3], 16), digest: bcryptUnbase64(match[4], 23) }
  } catch {
    return null
  }
}

/** 生成 bcrypt 哈希（$2a$10$…），salt 可注入以便测试复现 Go 的固定向量。 */
export function hashPassword(password: string, cost = 10, salt?: Buffer): string {
  if (!Number.isInteger(cost) || cost < 4 || cost > 31) throw apiError(400, 'bcrypt cost 非法')
  const actualSalt = salt ?? randomBytes(16)
  if (actualSalt.length !== 16) throw apiError(400, 'bcrypt salt 必须是 16 字节')
  const digest = bcryptDigest(password, actualSalt, cost)
  return `$2a$${String(cost).padStart(2, '0')}$${bcryptBase64(actualSalt)}${bcryptBase64(digest)}`
}

/** 校验密码；哈希损坏一律当作不匹配，不做异常上抛。 */
export function verifyPassword(password: string, stored: string): boolean {
  const parsed = parseBcrypt(stored)
  if (!parsed) return false
  const digest = bcryptDigest(String(password ?? ''), parsed.salt, parsed.cost)
  if (digest.length !== parsed.digest.length) return false
  return timingSafeEqual(digest, parsed.digest)
}

// ─────────────────────────────────────────────────────────────────────────────
// settings（meta 域）读写：串行化，避免并发的读-改-写互相覆盖
// ─────────────────────────────────────────────────────────────────────────────

let metaChain: Promise<unknown> = Promise.resolve()

function withMetaLock<T>(work: () => Promise<T>): Promise<T> {
  const next = metaChain.then(work, work)
  metaChain = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

/** settings 既可能是 [{key,value}]（Go 导入行式），也可能是对象（TS 原生）。 */
function settingsShape(raw: any): { array: boolean; value: (key: string) => string } {
  if (Array.isArray(raw)) {
    return {
      array: true,
      value: (key: string) => {
        const row = raw.find((item: any) => item && String(item.key) === key)
        return row && row.value != null ? String(row.value) : ''
      }
    }
  }
  const object = raw && typeof raw === 'object' ? raw : {}
  return { array: false, value: (key: string) => (object[key] != null ? String(object[key]) : '') }
}

async function readSetting(key: string): Promise<string> {
  try {
    const raw = await meta.table<any>('settings')
    return settingsShape(raw).value(key)
  } catch (error: any) {
    throw apiError(503, ERR_DATA_SOURCE)
  }
}

/**
 * 写一个设置项。`onlyIfAbsent` 时在同一次锁内完成读-判-写，等价于 Go 的
 * INSERT ... ON CONFLICT DO NOTHING：bcrypt 要跑几十毫秒，这期间别的请求
 * 完全可能先把密码设好。
 */
function writeSetting(key: string, value: string, onlyIfAbsent = false): Promise<boolean> {
  return withMetaLock(async () => {
    meta.reload()
    const tables = (await meta.load()) as Record<string, any>
    const current = tables.settings
    if (onlyIfAbsent && settingsShape(current).value(key)) return false
    if (Array.isArray(current)) {
      const index = current.findIndex((item: any) => item && String(item.key) === key)
      if (index >= 0) current[index] = { ...current[index], key, value }
      else current.push({ key, value })
    } else {
      tables.settings = { ...(current && typeof current === 'object' ? current : {}), [key]: value }
    }
    await meta.save(tables)
    meta.reload()
    return true
  })
}

function validatePassword(password: string): string {
  if ([...password].length < MIN_PASSWORD_RUNES) return `密码长度至少 ${MIN_PASSWORD_RUNES} 位`
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return `密码长度不能超过 ${MAX_PASSWORD_BYTES} 字节`
  return ''
}

// ─────────────────────────────────────────────────────────────────────────────
// 活线日志：内存环 + SSE 扇出 + 异步落 kv 表
// ─────────────────────────────────────────────────────────────────────────────

interface LogLine {
  seq: number
  db_id?: number
  ts: string
  level: string
  tag: string
  text: string
}

const ring: LogLine[] = []
let logSeq = 0
const logSubscribers = new Set<(line: LogLine) => void>()
let persistChain: Promise<void> = Promise.resolve()
let persistSeq = 0
let persistReady = false
let capturing = false

function levelOf(text: string): string {
  const low = text.toLowerCase()
  for (const key of ['fatal', 'panic', 'error', 'err:', '失败', '丢弃', '拒绝', '✕', '不可达']) {
    if (low.includes(key)) return 'error'
  }
  for (const key of ['warn', 'disabled', '禁用', 'skip', 'stopped', '⚠', '重试']) {
    if (low.includes(key)) return 'warn'
  }
  return 'info'
}

/** 摘出行首 [tag]，并把标准 logger 的 "2006/01/02 15:04:05" 前缀剥掉。 */
function normalizeLine(line: string): { tag: string; text: string } {
  let text = line.replace(/\n+$/, '')
  if (text.length >= 20 && text[4] === '/' && text[7] === '/' && text[10] === ' ') text = text.slice(19).trim()
  let tag = ''
  if (text.startsWith('[')) {
    const end = text.indexOf(']')
    if (end > 1) tag = text.slice(1, end)
  }
  return { tag, text }
}

function appendLog(text: string, levelOverride?: string): LogLine | null {
  const cleaned = normalizeLine(text)
  if (!cleaned.text.trim()) return null
  const line: LogLine = {
    seq: ++logSeq,
    ts: rfc3339(new Date()),
    level: levelOverride || levelOf(cleaned.text),
    tag: cleaned.tag,
    text: cleaned.text
  }
  ring.push(line)
  if (ring.length > LOG_CAP) ring.splice(0, ring.length - LOG_CAP)
  for (const subscriber of logSubscribers) {
    try {
      subscriber(line)
    } catch {
      // 单个订阅者出错不能影响其它订阅者与请求路径
    }
  }
  persistLog(line)
  return line
}

/** 异步落库；db_id 回填到环里的同一行，history 翻页靠它。 */
function persistLog(line: LogLine) {
  persistChain = persistChain.then(async () => {
    try {
      if (!persistReady) {
        persistSeq = await operations.writer.maxKey(LOG_TABLE)
        persistReady = true
      }
      const id = ++persistSeq
      await operations.writer.put({
        table: LOG_TABLE,
        key: String(id),
        record: {
          id,
          ts: line.ts,
          level: line.level,
          tag: line.tag,
          text: line.text,
          created_unix: Math.floor(Date.now() / 1000)
        }
      })
      line.db_id = id
    } catch {
      // 日志写失败绝不能反过来打断业务请求
    }
  })
}

/** 等待所有已排队的日志行落库（history 翻页与自检测试需要确定性的时序）。 */
export async function flushLogPersist(): Promise<void> {
  await persistChain
}

function subscribeLogs(consumer: (line: LogLine) => void): () => void {
  logSubscribers.add(consumer)
  return () => {
    logSubscribers.delete(consumer)
  }
}

/** 把 console 四个通道 tee 进日志环（保留 stderr 输出），只装一次。 */
function captureConsole() {
  if (capturing) return
  capturing = true
  const methods = ['log', 'info', 'warn', 'error'] as const
  for (const method of methods) {
    const original = console[method].bind(console)
    console[method] = (...args: any[]) => {
      try {
        appendLog(args.map(toLine).join(' '), method === 'error' ? 'error' : method === 'warn' ? 'warn' : 'info')
      } catch {
        // 日志环自身异常时仍然要打印
      }
      original(...args)
    }
  }
}

function recentLogs(since: number, limit: number): LogLine[] {
  const capped = Math.min(Math.max(limit, 1), LOG_CAP)
  const items = ring.filter((line) => line.seq > since)
  return items.length > capped ? items.slice(items.length - capped) : items
}

/** 单条 SSE 订阅的取数队列：有新行立刻唤醒，空闲 20s 由调用方发 ping。 */
function logQueue() {
  const items: LogLine[] = []
  let wake: (() => void) | null = null
  let closed = false
  return {
    get closed() {
      return closed
    },
    push(line: LogLine) {
      if (closed) return
      items.push(line)
      wake?.()
    },
    close() {
      closed = true
      wake?.()
    },
    async take(ms: number): Promise<LogLine | null> {
      if (items.length) return items.shift()!
      if (closed) return null
      const timedOut = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          wake = null
          resolve(true)
        }, ms)
        wake = () => {
          clearTimeout(timer)
          resolve(false)
        }
      })
      if (timedOut) return null
      return items.shift() ?? null
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 任务解析（?task / 活跃任务 / 兜底最新任务）
// ─────────────────────────────────────────────────────────────────────────────

async function readActiveTask(): Promise<string> {
  try {
    return await readSetting(ACTIVE_TASK_KEY)
  } catch {
    return ''
  }
}

interface Resolved {
  task: any | null
  /** 显式传了 ?task= 却查不到：Go 侧回 404 而不是静默降级。 */
  missing: boolean
}

async function resolveTask(param?: string): Promise<Resolved> {
  const wanted = String(param ?? '').trim()
  if (wanted && wanted !== 'active') {
    const task = await store.tasks.get(wanted)
    return { task: task ?? null, missing: !task }
  }
  const active = await readActiveTask()
  if (active) {
    const task = await store.tasks.get(active)
    if (task) return { task, missing: false }
  }
  const tasks = await store.tasks.list()
  return { task: tasks[0] ?? null, missing: false }
}

async function findingsForTask(taskId: string): Promise<any[]> {
  return (await store.findings.list(100000)).filter((row: any) => String(row.task_id ?? '') === String(taskId))
}

/** 是否装好了模型：任一带密钥的 profile，或桌面网关里配了 key（等价 Go 的 engine.Ready）。 */
async function llmConfigured(): Promise<boolean> {
  try {
    const profiles = await meta.table<any>('llmProfiles')
    if (Array.isArray(profiles)) {
      const ready = profiles.some((row: any) => row && (String(row.api_key ?? '').trim() !== '' || row.api_key_hint))
      if (ready) return true
    }
    const settings = await meta.table<any>('settings')
    const desktop = Array.isArray(settings) ? {} : (settings?.desktop_llm ?? {})
    return Boolean(String(desktop?.api_key ?? '').trim() || String(desktop?.model ?? '').trim())
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由
// ─────────────────────────────────────────────────────────────────────────────

export function register(api: Hono) {
  captureConsole()

  // ── 鉴权（4）────────────────────────────────────────────────────────────

  /** GET /api/auth/status — 管理员密码是否已初始化。读失败回 503 而非 false。 */
  api.get('/api/auth/status', async (c) => {
    try {
      const hash = await readSetting(AUTH_PASS_KEY)
      return c.json({ initialized: Boolean(hash) })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  /** POST /api/auth/init — 首次设密码；已设置过一律 403。 */
  api.post('/api/auth/init', async (c) => {
    const body = await c.req.json().catch(() => ({} as any))
    try {
      const existing = await readSetting(AUTH_PASS_KEY)
      if (existing) throw apiError(403, '密码已设置')
      const password = String(body?.password ?? '')
      if (!password) throw apiError(400, '密码不能为空')
      const reason = validatePassword(password)
      if (reason) throw apiError(400, reason)
      const hash = hashPassword(password)
      // 真正的「仅首次可设」保证在锁内的读-判-写，读检查只是快速失败路径。
      const inserted = await writeSetting(AUTH_PASS_KEY, hash, true)
      if (!inserted) throw apiError(403, '密码已设置')
      return c.json({ token: signToken() })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  /** POST /api/auth/login — 用户名固定 VEXNAR，校验密码后发 token。 */
  api.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => ({} as any))
    try {
      if (String(body?.username ?? '') !== JWT_SUBJECT) throw apiError(401, '用户名或密码错误')
      const hash = await readSetting(AUTH_PASS_KEY)
      if (!hash) throw apiError(403, '密码未初始化，请先设置密码')
      if (!verifyPassword(String(body?.password ?? ''), hash)) throw apiError(401, '用户名或密码错误')
      return c.json({ token: signToken() })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  /**
   * POST /api/auth/change-password — 改密码。该路径在鉴权中间件的豁免名单里，
   * 所以 token 与旧密码都在这里校验。
   */
  api.post('/api/auth/change-password', async (c) => {
    const body = await c.req.json().catch(() => ({} as any))
    try {
      if (!verifyToken(extractToken(c))) throw apiError(401, '未授权')
      const next = String(body?.new_password ?? '')
      if (!next) throw apiError(400, '新密码不能为空')
      const reason = validatePassword(next)
      if (reason) throw apiError(400, reason)
      const current = await readSetting(AUTH_PASS_KEY)
      if (!current) throw apiError(403, '密码未初始化，请先设置密码')
      if (!verifyPassword(String(body?.old_password ?? ''), current)) throw apiError(401, '当前密码错误')
      await writeSetting(AUTH_PASS_KEY, hashPassword(next))
      return c.json({ ok: true })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  // ── 日志（3）───────────────────────────────────────────────────────────

  /** GET /api/logs?since=&limit= — 环内最近若干行（newest-last）+ 游标。 */
  api.get('/api/logs', (c) => {
    const since = Math.max(Number(c.req.query('since') ?? 0) || 0, 0)
    const limit = Math.max(Number(c.req.query('limit') ?? 500) || 500, 1)
    return c.json({ items: recentLogs(since, limit), cursor: logSeq })
  })

  /**
   * GET /api/logs/history?before=<db_id>&limit= — 落库行按 db_id 倒序翻页。
   * `db_id` 是翻页游标（kv 表 `logs` 的键），`seq` 与它同值：历史行同样要有一个
   * 能被 SSE 的 since 语义接着用的稳定游标。
   */
  api.get('/api/logs/history', async (c) => {
    try {
      const before = Math.max(Number(c.req.query('before') ?? 0) || 0, 0)
      const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 200) || 200, 1), 500)
      await flushLogPersist()
      const rows = (await operations.writer.list(LOG_TABLE))
        .map((row: any) => ({
          seq: Number(row.id ?? 0),
          db_id: Number(row.id ?? 0),
          ts: String(row.ts ?? ''),
          level: String(row.level ?? 'info'),
          tag: String(row.tag ?? ''),
          text: String(row.text ?? '')
        }))
        .filter((row) => row.db_id > 0)
        .sort((a, b) => b.db_id - a.db_id)
      const filtered = before > 0 ? rows.filter((row) => row.db_id < before) : rows
      const items = filtered.slice(0, limit)
      return c.json({ items, has_more: filtered.length > items.length })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  /** GET /api/logs/stream?since= — SSE：先回放 since 之后的行，再推新行。 */
  api.get('/api/logs/stream', (c) => {
    const since = Math.max(Number(c.req.query('since') ?? 0) || 0, 0)
    return streamSSE(c, async (stream) => {
      const queue = logQueue()
      const unsubscribe = subscribeLogs((line) => queue.push(line))
      const stop = () => {
        unsubscribe()
        queue.close()
      }
      stream.onAbort(stop)
      try {
        for (const line of recentLogs(since, LOG_STREAM_REPLAY)) {
          await stream.writeSSE({ data: JSON.stringify(line) })
        }
        for (;;) {
          const line = await queue.take(LOG_PING_MS)
          if (queue.closed) break
          if (line) await stream.writeSSE({ data: JSON.stringify(line) })
          else await stream.writeSSE({ event: 'ping', data: '' })
        }
      } catch {
        // 客户端断开时 writeSSE 会抛，静默收尾
      } finally {
        stop()
      }
    })
  })

  // ── 系统（5）───────────────────────────────────────────────────────────

  /**
   * GET /api/audit?task= — 工具调用审计。Go 侧来自 Guard 的 allow/block 记录；
   * TS 侧没有 Guard，等价的证据是 activity（工具调用与错误）与命中拦截规则的
   * 待审记录，这里合并成同形状的 {ts,tool,action,reason,command}。
   */
  api.get('/api/audit', async (c) => {
    try {
      const { task, missing } = await resolveTask(c.req.query('task'))
      if (missing) throw apiError(404, 'task not found')
      if (!task) return c.json({ entries: [], attributions: {} })
      const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 2000) || 2000, 1), 2000)
      const entries: Array<{ ts: number; tool: string; action: string; reason?: string; command?: string }> = []
      const attributions: Record<string, number> = {}
      const explorationId = Number(task.exploration_id)

      const activity = (await operations.writer.list('activity'))
        .filter((row: any) => Number(row.exploration_id) === explorationId)
        .sort((a: any, b: any) => Number(a.id) - Number(b.id))
      for (const row of activity) {
        const payload = parseJson(row.metadata) as any
        const tool = String(payload?.tool ?? row.tool ?? row.kind ?? '')
        if (!tool) continue
        const blocked = Boolean(row.is_error)
        entries.push({
          ts: Number(row.created_unix ?? 0),
          tool,
          action: blocked ? 'block' : 'allow',
          ...(blocked ? { reason: String(row.summary ?? '') } : {}),
          ...(payload?.command ? { command: String(payload.command) } : {})
        })
        if (blocked) attributions[tool] = (attributions[tool] ?? 0) + 1
      }

      const pending = (await operations.writer.list('intercept_pending'))
        .filter((row: any) => String(row.task_id ?? '') === String(task.id) && String(row.status ?? '') === 'denied')
        .sort((a: any, b: any) => Number(a.id) - Number(b.id))
      for (const row of pending) {
        const tool = String(row.tool ?? row.tool_name ?? 'intercept')
        entries.push({
          ts: Number(row.created_unix ?? 0),
          tool,
          action: 'block',
          reason: String(row.decision_reason ?? row.reason ?? '拦截规则拒绝'),
          ...(row.command ? { command: String(row.command) } : {})
        })
        attributions[tool] = (attributions[tool] ?? 0) + 1
      }

      return c.json({ entries: entries.slice(-limit), attributions })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  /**
   * GET /api/stats?task= — 全局 + 任务级聚合。没有任务时只回全局字段
   * （与 Go 的 stats 一致），显式 ?task= 查不到回 404。
   */
  api.get('/api/stats', async (c) => {
    try {
      const out: Record<string, any> = {}
      out.engine_mode = 'idle'
      const configured = await llmConfigured()
      out.llm_configured = configured

      const exchanges = await operations.writer.list('traffic_exchanges')
      out.traffic = exchanges.length
      out.traffic_enabled = true

      const { task, missing } = await resolveTask(c.req.query('task'))
      if (missing) throw apiError(404, 'task not found')

      const counts = await store.assets.counts(task ? String(task.id) : undefined)
      const total = Object.values(counts).reduce((sum, value) => sum + Number(value ?? 0), 0)
      out.assets = total
      out.asset_counts = counts

      if (!task) return c.json(out)

      const overview = await operations.graphOverview(String(task.id))
      out.exploration = overview

      const metrics = (await store.taskMetrics()).get(Number(task.exploration_id))
      const findings = await store.findings.stats()
      const inFlight = Number(metrics?.in_flight ?? 0)
      const lastActivity = Number(metrics?.last_activity_unix ?? 0)
      const paused = Boolean(task.paused)
      const running = configured && !paused && !task.queued && String(task.status) === 'running'
      const stalled = running && inFlight > 0 && lastActivity > 0 && Math.floor(Date.now() / 1000) - lastActivity > 120
      const engineMode = paused ? 'paused' : stalled ? 'stalled' : running && inFlight > 0 ? 'exploring' : 'idle'
      out.engine_mode = engineMode

      out.active_task = {
        id: String(task.id),
        description: String(task.description ?? ''),
        goal: String(task.goal ?? ''),
        running,
        paused,
        queued: Boolean(task.queued),
        engine_mode: engineMode,
        status: String(task.status ?? ''),
        in_flight: inFlight,
        llm_in_flight: inFlight,
        last_activity: lastActivity,
        stalled,
        goals_total: Number(metrics?.goals_total ?? 0),
        goals_met: Number(metrics?.goals_met ?? 0),
        tokens: {
          input_tokens: Number(metrics?.input_tokens ?? 0),
          output_tokens: Number(metrics?.output_tokens ?? 0),
          cache_read_tokens: Number(metrics?.cache_read_tokens ?? 0),
          cache_write_tokens: Number(metrics?.cache_write_tokens ?? 0)
        },
        findings: findings.total,
        findings_by_severity: {
          critical: findings.critical,
          high: findings.high,
          medium: findings.medium,
          low: findings.low
        }
      }
      return c.json(out)
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  /**
   * POST /api/gc — 垃圾回收：日志保留窗、孤儿证据快照、孤儿 finding 绑定。
   * Go 侧是同签名的空桩（removed:0），这里做真活并保持 {removed} 形状。
   */
  api.post('/api/gc', async (c) => {
    try {
      const writer = operations.writer
      const detail = { logs: 0, snapshots: 0, bindings: 0 }

      const logRows = (await writer.list(LOG_TABLE)).sort((a: any, b: any) => Number(b.id ?? 0) - Number(a.id ?? 0))
      for (const row of logRows.slice(LOG_RETENTION)) {
        await writer.remove(LOG_TABLE, String(row.id))
        detail.logs += 1
      }

      // 顺序要紧：先删 finding 已不存在的绑定，再按「剩下的绑定」判断快照是否
      // 真孤儿，否则孤儿绑定会把本该回收的快照一直留住。
      const findingIds = new Set((await writer.list('findings')).map((row: any) => String(row.id ?? '')))
      for (const binding of await writer.list('finding_traffic_bindings')) {
        if (findingIds.has(String(binding.finding_id ?? ''))) continue
        await writer.remove('finding_traffic_bindings', String(binding.id))
        detail.bindings += 1
      }

      const surviving = await writer.list('finding_traffic_bindings')
      const referenced = new Set(surviving.map((row: any) => String(row.snapshot_id ?? '')))
      for (const snapshot of await writer.list('traffic_evidence_snapshots')) {
        const key = String(snapshot.id ?? '')
        if (!key || referenced.has(key)) continue
        await writer.remove('traffic_evidence_snapshots', key)
        detail.snapshots += 1
      }

      store.invalidate?.(['traffic_evidence_snapshots', 'finding_traffic_bindings', 'findings'])
      return c.json({ removed: detail.logs + detail.snapshots + detail.bindings, ...detail })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  /**
   * POST /api/active — 切换活跃任务。Go 只在内存里记，这里落到 settings，
   * 重启后 /api/stats、/api/report 的默认目标不会漂移。
   */
  api.post('/api/active', async (c) => {
    const body = await c.req.json().catch(() => ({} as any))
    try {
      const id = String(body?.id ?? '').trim()
      if (!id) {
        await writeSetting(ACTIVE_TASK_KEY, '')
        return c.json({ active: '' })
      }
      const task = await store.tasks.get(id)
      if (!task) throw apiError(404, 'task not found')
      await writeSetting(ACTIVE_TASK_KEY, String(task.id))
      // 与 Go 一致：打开任务时顺带唤醒引擎（幂等；排队中的任务只切视图不抢并发）。
      void (async () => {
        if (!modelCompletionReady() || task.queued) return
        const { engine, taskQueue, gatewayComplete } = await import('../context.ts')
        if (typeof engine?.plan !== 'function' || typeof taskQueue?.enqueue !== 'function') return
        await taskQueue.enqueue(String(task.id), async () => {
          await engine.plan(String(task.id), gatewayComplete)
          await engine.workMany(String(task.id), gatewayComplete, 1)
        })
      })().catch(() => {})
      return c.json({ active: String(task.id) })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  /** GET /api/report?task= — 任务 Markdown 报告（text/markdown）。 */
  api.get('/api/report', async (c) => {
    try {
      const { task, missing } = await resolveTask(c.req.query('task'))
      if (missing || !task) throw apiError(404, 'no active task')
      const findings = await findingsForTask(String(task.id))
      const assets = (await store.assets.list({ taskId: String(task.id), limit: 1000, offset: 0 })).rows
      const overview = await operations.graphOverview(String(task.id))
      const report = buildReport({ task, findings, assets, overview })
      return new Response(report.markdown, {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'cache-control': 'no-store'
        }
      })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })
}

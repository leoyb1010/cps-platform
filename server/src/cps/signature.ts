import { createHmac, timingSafeEqual } from 'crypto'

/**
 * CPS 连续包月对接 · HMAC-SHA256 签名工具（对外接口鉴权地基）。
 *
 * 设计与支付宝/微信代扣同构，便于品牌方既有对接经验迁移：
 *   1. 取业务字段（剔除 sign 本身 + null/undefined/空串）
 *   2. key 升序，拼成 `k1=v1&k2=v2&...&kn=vn`（对象/数组值 JSON.stringify）
 *   3. 追加 `&key=<secret>`（secret 固定尾接，不参与排序）
 *   4. sign = HMAC_SHA256(stringToSign, secret) 取小写 hex
 *
 * 防重放：校验 timestamp 与服务端时钟偏移 ≤ skewSec（默认 300s）。
 * 防时序侧信道：等长后用 timingSafeEqual 比较。
 *
 * 纯函数，无 Nest 依赖，便于单测与对外文档「附录·签名伪代码」一字对应。
 */

export type SignParams = Record<string, unknown>

/** 规范化拼接串：剔除 sign/空值 → key 升序 → k=v&... */
export function buildStringToSign(params: SignParams): string {
  const entries: [string, string][] = []
  for (const [k, v] of Object.entries(params)) {
    if (k === 'sign') continue
    if (v === null || v === undefined || v === '') continue
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
    entries.push([k, val])
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return entries.map(([k, v]) => `${k}=${v}`).join('&')
}

/** 计算签名（小写 hex）。secret 固定尾接，不进排序。 */
export function buildSign(params: SignParams, secret: string): string {
  const base = buildStringToSign(params) + `&key=${secret}`
  return createHmac('sha256', secret).update(base, 'utf8').digest('hex')
}

export type VerifyResult = { ok: true } | { ok: false; reason: string }

/**
 * 验签：① 必带 sign；② timestamp 偏移 ≤ skewSec（防重放）；③ HMAC 等长 timingSafeEqual 比较。
 * 返回结构化结果，由调用方映射 401（不抛异常，便于统一错误体）。
 */
export function verifySign(
  params: SignParams,
  secret: string,
  opts: { skewSec?: number; now?: number } = {},
): VerifyResult {
  const provided = params.sign
  if (typeof provided !== 'string' || provided.length === 0) return { ok: false, reason: '缺少签名 sign' }

  const skewSec = opts.skewSec ?? 300
  const ts = params.timestamp
  if (ts !== undefined && ts !== null && ts !== '') {
    const tsNum = Number(ts)
    if (!Number.isFinite(tsNum)) return { ok: false, reason: 'timestamp 非法' }
    // 兼容秒级与毫秒级时间戳（>1e12 视为毫秒）
    const tsSec = tsNum > 1e12 ? Math.floor(tsNum / 1000) : tsNum
    const nowSec = Math.floor((opts.now ?? Date.now()) / 1000)
    if (Math.abs(nowSec - tsSec) > skewSec) return { ok: false, reason: '请求时间戳过期或偏移过大' }
  }

  const expected = buildSign(params, secret)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return { ok: false, reason: '签名校验失败' }
  if (!timingSafeEqual(a, b)) return { ok: false, reason: '签名校验失败' }
  return { ok: true }
}

import { createSign, createVerify, generateKeyPairSync, createHash, createPublicKey, createPrivateKey } from 'crypto'
import { buildStringToSign, type SignParams, type VerifyResult } from '../cps/signature'

/**
 * 有道会员续费对接 · RSA 签名工具（SHA256WithRSA，对外接口鉴权地基）。
 *
 * 与有道官方规范一字对应：
 *   1. 业务参数按 key 字母序拼接 k=v&...（剔除空值 + sign）——复用 cps/signature.ts:buildStringToSign，
 *      与 HMAC 版字节级一致，保证签名串口径统一。
 *   2. 合作方用私钥 SHA256WithRSA 签名，结果 base64（注意：RSA 无对称密钥，不追加 &key=secret）。
 *   3. 有道用合作方公钥验签。验签失败映射错误码 403（有道规范 403=签名错误）。
 *
 * 双向密钥：合作方→有道（入站）用合作方公钥验；有道→合作方（出站回调）用平台私钥签。
 * Node crypto 原生支持 RSA-2048 + SHA256WithRSA，零新依赖。
 */

export type { SignParams, VerifyResult }

/** 用私钥对参数签名（SHA256WithRSA → base64）。privateKeyPem 为 PKCS8 PEM。 */
export function buildRsaSign(params: SignParams, privateKeyPem: string): string {
  const base = buildStringToSign(params) // 无 &key 尾接（RSA 非对称）
  const signer = createSign('sha256')
  signer.update(base, 'utf8')
  return signer.sign(privateKeyPem, 'base64')
}

// nonce 去重缓存：仅当请求带 nonce 时启用，窗口内已用 nonce 一律拒绝（防同一签名在时间窗内重放）。
// 向后兼容：不带 nonce 的对接（含现有 e2e）走纯时间戳校验，skew 从 300s 收紧到 120s 缩小重放窗口。
// 轻量进程内实现，惰性清理过期项避免无界增长；nonce 已纳入签名串（buildStringToSign 不剔 nonce），
// 攻击者无法在不破坏 sign 的前提下更换 nonce。
const NONCE_TTL_MS = 120_000
const seenNonces = new Map<string, number>()
function claimNonce(nonce: string, nowMs: number): boolean {
  if (seenNonces.size > 2000) {
    for (const [k, exp] of seenNonces) if (exp <= nowMs) seenNonces.delete(k)
  }
  const exp = seenNonces.get(nonce)
  if (exp !== undefined && exp > nowMs) return false // 窗口内已用 → 重放
  seenNonces.set(nonce, nowMs + NONCE_TTL_MS)
  return true
}

/**
 * 用公钥验签。① 必带 sign；② timestamp 偏移 ≤ skewSec（防重放）；③ RSA 验证；
 * ④ 若带 nonce，则在时间窗内去重拒绝重放。返回结构化结果，由调用方映射 403（不抛异常）。
 * base64 非法/验证异常一律 false。
 */
export function verifyRsaSign(
  params: SignParams,
  publicKeyPem: string,
  opts: { skewSec?: number; now?: number } = {},
): VerifyResult {
  const provided = params.sign
  if (typeof provided !== 'string' || provided.length === 0) return { ok: false, reason: '缺少签名 sign' }

  // 防重放硬化：timestamp 必带且在时钟偏移窗内，否则验签失败——缺省会使固定 base 串的签名永久有效、可重放。
  const skewSec = opts.skewSec ?? 120
  const ts = params.timestamp
  if (ts === undefined || ts === null || ts === '') return { ok: false, reason: '缺少时间戳 timestamp' }
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'timestamp 非法' }
  const tsSec = tsNum > 1e12 ? Math.floor(tsNum / 1000) : tsNum
  const nowMs = opts.now ?? Date.now()
  const nowSec = Math.floor(nowMs / 1000)
  if (Math.abs(nowSec - tsSec) > skewSec) return { ok: false, reason: '请求时间戳过期或偏移过大' }

  const base = buildStringToSign(params)
  try {
    const verifier = createVerify('sha256')
    verifier.update(base, 'utf8')
    const ok = verifier.verify(publicKeyPem, provided, 'base64')
    if (!ok) return { ok: false, reason: '签名校验失败' }
    // 签名先过再记 nonce：避免攻击者用任意伪 nonce 污染缓存。仅对带 nonce 的请求去重（向后兼容）。
    const nonce = params.nonce
    if (typeof nonce === 'string' && nonce.length > 0) {
      if (!claimNonce(nonce, nowMs)) return { ok: false, reason: 'nonce 重复，疑似重放' }
    }
    return { ok: true }
  } catch {
    // 公钥格式错误 / base64 非法 / 验证异常 → 一律视为验签失败（不抛）
    return { ok: false, reason: '签名校验失败' }
  }
}

/** 生成 RSA-2048 公私钥对（公钥 SPKI PEM，私钥 PKCS8 PEM）。 */
export function genRsaKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { publicKey, privateKey }
}

/** 公钥指纹：sha256(pem) 末 8 位 hex，用于脱敏展示与防篡改核对。 */
export function pubHint(publicKeyPem: string): string {
  return createHash('sha256').update(publicKeyPem).digest('hex').slice(-8)
}

/**
 * 校验是否为合法 SPKI 公钥 PEM（上传公钥时用）。
 * 拒绝私钥 PEM：createPublicKey 会从 PKCS8/PKCS1 私钥派生公钥并返回成功，
 * 若不拦截，品牌误粘私钥会被明文写入 publicKey 字段（违背「私钥绝不入库」红线）。
 */
export function isValidPublicKey(publicKeyPem: string): boolean {
  try {
    createPublicKey(publicKeyPem)
  } catch {
    return false
  }
  // 能被当作私钥解析 → 是私钥 PEM，拒绝。
  try {
    createPrivateKey(publicKeyPem)
    return false
  } catch {
    return true
  }
}

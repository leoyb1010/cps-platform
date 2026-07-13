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

/**
 * 用公钥验签。① 必带 sign；② timestamp 偏移 ≤ skewSec；③ RSA 验证。
 * nonce 的强制存在与跨实例原子去重由入口层使用数据库唯一键完成；这里保持纯密码学验证函数。
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
    return ok ? { ok: true } : { ok: false, reason: '签名校验失败' }
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

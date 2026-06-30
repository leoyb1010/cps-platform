/**
 * 签名串拼接（对外接口鉴权共用地基）。
 *   1. 取业务字段（剔除 sign 本身 + null/undefined/空串）
 *   2. key 升序，拼成 `k1=v1&k2=v2&...&kn=vn`（对象/数组值 JSON.stringify）
 *
 * 有道 RSA 验签（youdao/rsa-signature.ts）在此基础上用私钥 SHA256withRSA 签 + 公钥验。
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

export type VerifyResult = { ok: true } | { ok: false; reason: string }

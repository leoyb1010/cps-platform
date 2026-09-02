import { describe, it, expect } from 'vitest'
import { createSign, createVerify } from 'crypto'
import { genRsaKeypair } from './rsa-signature'
import { DEMO_RSA_PRIVATE } from './demo-keys'
import { normalizePem, isParsablePrivateKey, loadPlatformPrivateKey, assertPlatformPrivateKey } from './platform-key'

const { privateKey, publicKey } = genRsaKeypair()

/** 模拟 scripts/prepare-deploy-env.sh 的产物：每行后接字面 `\n`，整体单行。 */
const asDeployScriptLine = (pem: string) => pem.split('\n').filter(Boolean).map((l) => l + '\\n').join('')

const signVerifyRoundTrip = (pem: string) => {
  const s = createSign('sha256'); s.update('probe'); const sig = s.sign(pem, 'base64')
  const v = createVerify('sha256'); v.update('probe'); return v.verify(publicKey, sig, 'base64')
}

describe('平台私钥归一化 normalizePem', () => {
  it('多行 PEM 原样通过（trim + 末尾补换行）', () => {
    const out = normalizePem(privateKey)
    expect(out.startsWith('-----BEGIN PRIVATE KEY-----\n')).toBe(true)
    expect(out.endsWith('-----END PRIVATE KEY-----\n')).toBe(true)
    expect(isParsablePrivateKey(out)).toBe(true)
  })

  it('字面 \\n 单行（deploy 脚本产物）→ 可解析且可签名验签', () => {
    const oneLine = asDeployScriptLine(privateKey)
    expect(oneLine.includes('\n')).toBe(false) // 确认样本确实是单行
    expect(isParsablePrivateKey(oneLine)).toBe(false) // 未归一化前 Node 拒绝
    const out = normalizePem(oneLine)
    expect(isParsablePrivateKey(out)).toBe(true)
    expect(signVerifyRoundTrip(out)).toBe(true)
  })

  it('双重转义 \\\\n + 包裹引号 + \\r 一并清理', () => {
    const messy = '"' + privateKey.replace(/\n/g, '\\\\n').replace(/-----END/, '\r-----END') + '"'
    const out = normalizePem(messy)
    expect(out.includes('"')).toBe(false)
    expect(out.includes('\r')).toBe(false)
    expect(isParsablePrivateKey(out)).toBe(true)
  })

  it('空/空白输入 → 空串', () => {
    expect(normalizePem('')).toBe('')
    expect(normalizePem('   \n ')).toBe('')
  })
})

describe('loadPlatformPrivateKey', () => {
  it('env 缺失 → 回退 demo 私钥（仅演示路径）', () => {
    expect(loadPlatformPrivateKey({})).toBe(DEMO_RSA_PRIVATE)
  })
  it('env 为 deploy 脚本单行 → 返回归一化后可解析私钥', () => {
    const out = loadPlatformPrivateKey({ YOUDAO_PLATFORM_PRIVATE_KEY: asDeployScriptLine(privateKey) })
    expect(isParsablePrivateKey(out)).toBe(true)
  })
})

describe('assertPlatformPrivateKey 生产启动闸（反向验证：坏值必须拦住）', () => {
  it('合法自有私钥（多行 / \\n 单行）放行', () => {
    expect(() => assertPlatformPrivateKey(privateKey)).not.toThrow()
    expect(() => assertPlatformPrivateKey(asDeployScriptLine(privateKey))).not.toThrow()
  })
  it('缺失 / 非 PEM → 拒启', () => {
    expect(() => assertPlatformPrivateKey(undefined)).toThrow(/未设置真实 RSA 私钥/)
    expect(() => assertPlatformPrivateKey('not-a-key')).toThrow(/未设置真实 RSA 私钥/)
  })
  it('仓库 demo 私钥（含 \\n 单行变体）→ 拒启', () => {
    expect(() => assertPlatformPrivateKey(DEMO_RSA_PRIVATE)).toThrow(/demo 私钥/)
    expect(() => assertPlatformPrivateKey(asDeployScriptLine(DEMO_RSA_PRIVATE))).toThrow(/demo 私钥/)
  })
  it('含 PRIVATE KEY 字样但 base64 体损坏 → 旧版仅查字样会放过，现在必须拒启', () => {
    const lines = privateKey.split('\n')
    lines[2] = lines[2].slice(0, 10) + '!!!!' + lines[2].slice(14) // 破坏 body
    const broken = lines.join('\n')
    expect(broken.includes('PRIVATE KEY')).toBe(true)
    expect(() => assertPlatformPrivateKey(broken)).toThrow(/无法被 Node crypto 解析/)
  })
})

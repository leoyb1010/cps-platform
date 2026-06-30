import { describe, it, expect } from 'vitest'
import { buildRsaSign, verifyRsaSign, genRsaKeypair, pubHint, isValidPublicKey } from './rsa-signature'
import { buildStringToSign } from '../cps/signature'

const { publicKey, privateKey } = genRsaKeypair()

describe('有道 RSA 签名（SHA256WithRSA）', () => {
  it('keygen 产出合法 PEM 公私钥对', () => {
    expect(publicKey).toContain('BEGIN PUBLIC KEY')
    expect(privateKey).toContain('BEGIN PRIVATE KEY')
    expect(isValidPublicKey(publicKey)).toBe(true)
  })

  it('sign → verify 往返通过（base64 签名）', () => {
    const p: Record<string, unknown> = { custId: 'C1', merchantId: 'M1', goodsId: 'G1', custOrderId: 'CO1', timestamp: Math.floor(Date.now() / 1000) }
    p.sign = buildRsaSign(p, privateKey)
    expect(typeof p.sign).toBe('string')
    expect(verifyRsaSign(p, publicKey).ok).toBe(true)
  })

  it('改任一字段使签名失效', () => {
    const p: Record<string, unknown> = { custOrderId: 'CO1', goodsId: 'G1', timestamp: Math.floor(Date.now() / 1000) }
    p.sign = buildRsaSign(p, privateKey)
    expect(verifyRsaSign(p, publicKey).ok).toBe(true)
    p.goodsId = 'G2' // 篡改
    expect(verifyRsaSign(p, publicKey).ok).toBe(false)
  })

  it('错误公钥拒绝（双向密钥隔离）', () => {
    const other = genRsaKeypair()
    const p: Record<string, unknown> = { custOrderId: 'CO1', timestamp: Math.floor(Date.now() / 1000) }
    p.sign = buildRsaSign(p, privateKey)
    expect(verifyRsaSign(p, other.publicKey).ok).toBe(false)
  })

  it('timestamp 过期（>300s）拒绝防重放', () => {
    const p: Record<string, unknown> = { custOrderId: 'CO1', timestamp: Math.floor(Date.now() / 1000) - 600 }
    p.sign = buildRsaSign(p, privateKey)
    const r = verifyRsaSign(p, publicKey)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('时间戳')
  })

  it('缺 sign 拒绝', () => {
    expect(verifyRsaSign({ custOrderId: 'CO1' }, publicKey).ok).toBe(false)
  })

  it('base64 非法不抛异常，返回失败', () => {
    const p = { custOrderId: 'CO1', timestamp: Math.floor(Date.now() / 1000), sign: '!!!not-base64!!!' }
    expect(() => verifyRsaSign(p, publicKey)).not.toThrow()
    expect(verifyRsaSign(p, publicKey).ok).toBe(false)
  })

  it('公钥格式错误不抛，返回失败', () => {
    const p: Record<string, unknown> = { custOrderId: 'CO1', timestamp: Math.floor(Date.now() / 1000) }
    p.sign = buildRsaSign(p, privateKey)
    expect(() => verifyRsaSign(p, 'not-a-key')).not.toThrow()
    expect(verifyRsaSign(p, 'not-a-key').ok).toBe(false)
  })

  it('拼接串与 HMAC 版字节级一致（剔 sign/空值 + key 升序）', () => {
    const s = buildStringToSign({ b: 2, a: 1, sign: 'x', empty: '', goodsId: 'G' })
    expect(s).toBe('a=1&b=2&goodsId=G')
  })

  it('pubHint 稳定 8 位 hex', () => {
    expect(pubHint(publicKey)).toMatch(/^[a-f0-9]{8}$/)
    expect(pubHint(publicKey)).toBe(pubHint(publicKey))
  })
})

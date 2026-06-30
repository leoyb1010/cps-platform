import { describe, it, expect } from 'vitest'
import { buildStringToSign, buildSign, verifySign } from './signature'

const SECRET = 'demo-secret-2026'

describe('CPS HMAC 签名', () => {
  it('buildStringToSign：剔除 sign/空值 + key 升序拼接', () => {
    const s = buildStringToSign({ mobile: '139', sign_content: 'P-1', sign: 'x', empty: '', nil: null, b: 2, a: 1 })
    expect(s).toBe('a=1&b=2&mobile=139&sign_content=P-1')
  })

  it('对象/数组值 JSON 序列化进签名', () => {
    const s = buildStringToSign({ extra_info: { abc: '12' }, k: 'v' })
    expect(s).toBe('extra_info={"abc":"12"}&k=v')
  })

  it('buildSign 稳定可复现（同入参同签名）', () => {
    const p = { sign_content: 'P-1', mobile: '13900000000', timestamp: 1782000000 }
    expect(buildSign(p, SECRET)).toBe(buildSign({ ...p }, SECRET))
    expect(buildSign(p, SECRET)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('verifySign：正确签名通过', () => {
    const p: Record<string, unknown> = { sign_content: 'P-1', mobile: '13900000000', timestamp: Math.floor(Date.now() / 1000) }
    p.sign = buildSign(p, SECRET)
    expect(verifySign(p, SECRET).ok).toBe(true)
  })

  it('verifySign：错误签名拒绝', () => {
    const p = { sign_content: 'P-1', timestamp: Math.floor(Date.now() / 1000), sign: 'deadbeef' }
    const r = verifySign(p, SECRET)
    expect(r.ok).toBe(false)
  })

  it('verifySign：错误 secret 拒绝', () => {
    const p: Record<string, unknown> = { sign_content: 'P-1', timestamp: Math.floor(Date.now() / 1000) }
    p.sign = buildSign(p, SECRET)
    expect(verifySign(p, 'wrong-secret').ok).toBe(false)
  })

  it('verifySign：时间戳过期（>300s）拒绝防重放', () => {
    const old = Math.floor(Date.now() / 1000) - 600
    const p: Record<string, unknown> = { sign_content: 'P-1', timestamp: old }
    p.sign = buildSign(p, SECRET)
    const r = verifySign(p, SECRET)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('时间戳')
  })

  it('verifySign：毫秒级时间戳兼容', () => {
    const p: Record<string, unknown> = { sign_content: 'P-1', timestamp: Date.now() }
    p.sign = buildSign(p, SECRET)
    expect(verifySign(p, SECRET).ok).toBe(true)
  })

  it('verifySign：缺 sign 拒绝', () => {
    expect(verifySign({ sign_content: 'P-1' }, SECRET).ok).toBe(false)
  })

  it('篡改任一字段使签名失效', () => {
    const p: Record<string, unknown> = { sign_content: 'P-1', mobile: '13900000000', timestamp: Math.floor(Date.now() / 1000) }
    p.sign = buildSign(p, SECRET)
    expect(verifySign(p, SECRET).ok).toBe(true)
    p.mobile = '13911111111' // 篡改
    expect(verifySign(p, SECRET).ok).toBe(false)
  })
})

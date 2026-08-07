import { describe, it, expect } from 'vitest'
import pino from 'pino'
import { Writable } from 'node:stream'
import { LOG_REDACT_PATHS } from './log-redact'

// P0 回归：凭据绝不能进日志。
// 用真实 pino 实例 + 生产同款 redact 配置，喂入带真实令牌形态的请求/响应对象，
// 断言序列化输出中不存在任何凭据字面量（而不是只检查配置数组里有哪些字符串）。

const ACCESS = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD-SECRET-ACCESS.SIGxyz'
const REFRESH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6REFRESH'
const PASSWORD = 'SuperSecret!234'
const RSA_KEY = '-----BEGIN PRIVATE KEY-----MIIEvQIBADANBg-----END PRIVATE KEY-----'

function captureLog(payload: Record<string, unknown>): string {
  let out = ''
  const sink = new Writable({
    write(chunk, _enc, cb) {
      out += String(chunk)
      cb()
    },
  })
  const logger = pino({ redact: { paths: LOG_REDACT_PATHS, remove: true } }, sink)
  logger.info(payload, 'request completed')
  return out
}

describe('日志脱敏（P0：凭据不得落盘）', () => {
  it('请求头 Authorization / Cookie 被移除', () => {
    const out = captureLog({
      req: { method: 'GET', url: '/settlements', headers: { authorization: `Bearer ${ACCESS}`, cookie: `cps_rt=${REFRESH}`, 'user-agent': 'k6/load' } },
    })
    expect(out).not.toContain(ACCESS)
    expect(out).not.toContain(REFRESH)
    expect(out).not.toContain('Bearer')
    // 非凭据字段仍保留，确保脱敏没有把可观测性一起削掉
    expect(out).toContain('/settlements')
    expect(out).toContain('k6/load')
  })

  it('响应头 Set-Cookie（refresh token 下发处）被移除', () => {
    const out = captureLog({
      res: { statusCode: 201, headers: { 'set-cookie': [`cps_rt=${REFRESH}; HttpOnly; SameSite=Lax`], 'content-type': 'application/json' } },
    })
    expect(out).not.toContain(REFRESH)
    expect(out).toContain('application/json')
  })

  it('请求体与任意层级的密码/密钥字段被移除', () => {
    const out = captureLog({
      req: { body: { account: 'admin', password: PASSWORD, privateKey: RSA_KEY } },
      password: PASSWORD,
      appSecret: 'as_live_9f8e7d',
      accessToken: ACCESS,
      refreshToken: REFRESH,
    })
    expect(out).not.toContain(PASSWORD)
    expect(out).not.toContain(RSA_KEY)
    expect(out).not.toContain('as_live_9f8e7d')
    expect(out).not.toContain(ACCESS)
    expect(out).not.toContain(REFRESH)
    expect(out).toContain('admin') // 账号本身可保留，便于排查
  })

  it('remove:true —— 不留占位值，避免"看起来像凭据"的假值', () => {
    const out = captureLog({ req: { headers: { authorization: `Bearer ${ACCESS}` } } })
    expect(out).not.toContain('[Redacted]')
    expect(out).not.toContain('authorization')
  })
})

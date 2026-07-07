import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma.service'
import { AuthService } from './auth.service'
import { resetPrismaTestDb } from '../test-utils/prisma-test-db'

let prisma: PrismaService
let auth: AuthService

beforeAll(() => {
  resetPrismaTestDb('auth-test')
  prisma = new PrismaService()
  const cfg = { get: (k: string) => ({ JWT_ACCESS_SECRET: 'test-secret-xxxxxxxxxxxxxxxxxxxxx', ACCESS_TTL: '900s', REFRESH_TTL_DAYS: '14' })[k] } as unknown as ConfigService
  auth = new AuthService(prisma, new JwtService({}), cfg)
})

afterAll(async () => {
  await prisma?.$disconnect()
})

beforeEach(async () => {
  await prisma.refreshToken.deleteMany({})
  await prisma.user.deleteMany({})
  await prisma.role.deleteMany({})
  await prisma.role.create({ data: { id: 'r', name: 'r', permissions: '[]' } })
  await prisma.user.create({ data: { id: 'u1', account: 'u1', name: 'U', passwordHash: 'x', roleId: 'r' } })
})

describe('AuthService · refresh 轮换与重放防护', () => {
  it('正常轮换：旧 token 被吊销，新 token 可用', async () => {
    const t1 = await auth.issueRefresh('u1')
    const { refresh: t2 } = await auth.rotateRefresh(t1)
    expect(t2).toBeTruthy()
    expect(t2).not.toBe(t1)
    // 旧的不能再用
    await expect(auth.rotateRefresh(t1)).rejects.toThrow()
  })

  it('重放被盗 token：再次使用已吊销 token → 吊销全族（攻击者新 token 一并作废）', async () => {
    const t1 = await auth.issueRefresh('u1')
    const { refresh: attackerToken } = await auth.rotateRefresh(t1) // 攻击者先轮换，得到新 token
    // 受害者用旧(已吊销) token 重放 → 触发全族吊销
    await expect(auth.rotateRefresh(t1)).rejects.toThrow(/异常登录/)
    // 关键：攻击者刚换得的 token 现在也应失效
    await expect(auth.rotateRefresh(attackerToken)).rejects.toThrow()
    // 该用户已无任何有效会话
    const live = await prisma.refreshToken.count({ where: { userId: 'u1', revoked: false } })
    expect(live).toBe(0)
  })

  it('logout 吊销该 refresh', async () => {
    const t = await auth.issueRefresh('u1')
    await auth.revokeRefresh(t)
    await expect(auth.rotateRefresh(t)).rejects.toThrow()
  })

  it('过期 token 不可轮换', async () => {
    const t = await auth.issueRefresh('u1')
    // 手动过期
    await prisma.refreshToken.updateMany({ where: { userId: 'u1' }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await expect(auth.rotateRefresh(t)).rejects.toThrow(/过期/)
  })
})

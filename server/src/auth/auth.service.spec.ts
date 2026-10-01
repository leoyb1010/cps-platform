import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import * as argon2 from 'argon2'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  it('真实旧表迁移保留现有用户的会话代际',async()=>{
    await prisma.user.update({where:{id:'u1'},data:{tokenVersion:7}})
    await auth.issueRefresh('u1')
    await prisma.$executeRawUnsafe('ALTER TABLE "RefreshToken" DROP COLUMN "tokenVersion"')
    const sql=readFileSync(join(process.cwd(),'prisma/migrations/6_refresh_token_generation/migration.sql'),'utf8')
    for(const statement of sql.split(';').filter(s=>s.trim()))await prisma.$executeRawUnsafe(statement)
    expect((await prisma.refreshToken.findFirstOrThrow()).tokenVersion).toBe(7)
  })

  it('并发改密与轮换后不存在可继续使用的旧代际 refresh',async()=>{
    await prisma.user.update({where:{id:'u1'},data:{passwordHash:await argon2.hash('SyntheticOld123')}})
    const first=await auth.issueRefresh('u1')
    const results=await Promise.allSettled([auth.rotateRefresh(first),auth.changePassword('u1','SyntheticOld123','SyntheticNew123')])
    expect(results[1].status).toBe('fulfilled')
    expect((await prisma.user.findUniqueOrThrow({where:{id:'u1'}})).tokenVersion).toBe(1)
    expect(await prisma.refreshToken.count({where:{userId:'u1',revoked:false}})).toBe(0)
    if(results[0].status==='fulfilled')await expect(auth.rotateRefresh(results[0].value.refresh)).rejects.toThrow()
  })

  it('旧代际延迟 logout 不影响已重新登录的新代际',async()=>{
    const first=await auth.issueRefresh('u1');await auth.revokeRefresh(first)
    const current=await auth.issueRefresh('u1');await auth.revokeRefresh(first)
    await expect(auth.rotateRefresh(current)).resolves.toMatchObject({userId:'u1',tokenVersion:1})
  })
  it('改密与会话撤销原子提交，撤销失败不得半更新密码',async()=>{
    const oldHash=await argon2.hash('SyntheticOld123')
    await prisma.user.update({where:{id:'u1'},data:{passwordHash:oldHash}})
    await auth.issueRefresh('u1')
    const transaction=prisma.$transaction.bind(prisma)
    const spy=vi.spyOn(prisma,'$transaction').mockImplementation(((fn:any)=>transaction(async(tx:any)=>fn(new Proxy(tx,{get(target,key){
      if(key==='refreshToken')return {...target.refreshToken,updateMany:async()=>{throw new Error('synthetic revocation failure')}}
      return Reflect.get(target,key)
    }})))) as any)
    try{await expect(auth.changePassword('u1','SyntheticOld123','SyntheticNew123')).rejects.toThrow('synthetic revocation failure')}
    finally{spy.mockRestore()}
    expect((await prisma.user.findUniqueOrThrow({where:{id:'u1'}})).passwordHash).toBe(oldHash)
    expect((await prisma.user.findUniqueOrThrow({where:{id:'u1'}})).tokenVersion).toBe(0)
    expect(await prisma.refreshToken.count({where:{userId:'u1',revoked:false}})).toBe(1)
  })

  it('密码变更后旧验证结果不能签发新 refresh',async()=>{
    await prisma.user.update({where:{id:'u1'},data:{passwordHash:await argon2.hash('SyntheticOld123')}})
    const validated=await auth.validate('u1','SyntheticOld123')
    await auth.changePassword('u1','SyntheticOld123','SyntheticNew123')
    await expect(auth.issueRefresh('u1','','',validated.tokenVersion)).rejects.toThrow('凭据已变更')
    expect(await prisma.refreshToken.count({where:{userId:'u1',revoked:false}})).toBe(0)
  })

  it('旧 refresh 的延迟登出也能撤销它刚轮换出的子凭据',async()=>{
    const first=await auth.issueRefresh('u1')
    const {refresh:child}=await auth.rotateRefresh(first)
    await auth.revokeRefresh(first)
    await expect(auth.rotateRefresh(child)).rejects.toThrow('过期')
    expect(await prisma.refreshToken.count({where:{userId:'u1',revoked:false}})).toBe(0)
  })
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
    await expect(auth.rotateRefresh(t1)).rejects.toThrow(/重放/)
    // 关键：攻击者刚换得的 token 现在也应失效
    await expect(auth.rotateRefresh(attackerToken)).rejects.toThrow()
    // 该用户已无任何有效会话
    const live = await prisma.refreshToken.count({ where: { userId: 'u1', revoked: false } })
    expect(live).toBe(0)
  })

  it('同一 refresh 双并发：只有一个请求成功，检测后整族均被吊销', async () => {
    const t1 = await auth.issueRefresh('u1')
    const results = await Promise.allSettled([auth.rotateRefresh(t1, 'a', '1'), auth.rotateRefresh(t1, 'b', '2')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect(await prisma.refreshToken.count({ where: { userId: 'u1', revoked: false } })).toBe(0)
  })

  it('强制改密账户不能用 refresh 绕过后端门禁', async () => {
    await prisma.user.update({ where: { id: 'u1' }, data: { mustChangePassword: true } })
    const t = await auth.issueRefresh('u1')
    await expect(auth.rotateRefresh(t)).rejects.toThrow(/修改密码/)
    expect(await prisma.refreshToken.count({ where: { userId: 'u1', revoked: false } })).toBe(1)
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

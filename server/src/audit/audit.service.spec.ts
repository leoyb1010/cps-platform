import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaService } from '../prisma.service'
import { AuditService } from './audit.service'
import { MetricsService } from '../common/metrics.service'
import { resetPrismaTestDb } from '../test-utils/prisma-test-db'

let prisma: PrismaService
let audit: AuditService

beforeAll(() => {
  resetPrismaTestDb('audit-test')
  prisma = new PrismaService()
  audit = new AuditService(prisma, new MetricsService())
})

afterAll(async () => {
  await prisma?.$disconnect()
})

describe('AuditService · fail-closed（同事务）', () => {
  it('recordInTx 失败 → 整个业务事务回滚（无审计不放行）', async () => {
    // 隔离：只清本用例自己的行（不 deleteMany 全表，避免污染共享 e2e 的 seed 结算单）
    await prisma.auditLog.deleteMany({})
    await prisma.settlement.deleteMany({ where: { id: 'S-X' } })
    // Settlement.brandId 现有 @relation(onDelete:Restrict)，需先备好真实品牌行满足引用完整性
    await prisma.brand.upsert({ where: { id: 'b' }, update: {}, create: { id: 'b', name: '审计测试品牌', mark: 'B', category: '测试', feeRate: 40, period: 7, reservePct: 10, joinedAt: '测试' } })
    await prisma.settlement.create({ data: { id: 'S-X', period: '2406', brandId: 'b', gross: 100, brandShare: 50, platformFee: 30, agentPayout: 20, status: 'pending' } })

    // 模拟资金事务：先把结算置 cleared，再写一条"非法"审计(超长 action 触发约束? 用强制抛错代替)
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.settlement.update({ where: { id: 'S-X' }, data: { status: 'cleared' } })
        // recordInTx 内部 create；这里故意构造失败：传 null action 触发 NOT NULL 失败
        // @ts-expect-error 故意制造审计失败以验证回滚
        await audit.recordInTx(tx, { user: null, action: null, resource: 'Settlement', resourceId: 'S-X' })
      }),
    ).rejects.toThrow()

    // 关键断言：审计失败 → 结算状态应回滚为 pending（资金动作未生效）
    const s = await prisma.settlement.findUnique({ where: { id: 'S-X' } })
    expect(s?.status).toBe('pending')
    // 且没有任何审计行落库
    expect(await prisma.auditLog.count()).toBe(0)
  })

  it('recordInTx 成功 → 审计行落库', async () => {
    await prisma.auditLog.deleteMany({})
    await prisma.$transaction(async (tx) => {
      await audit.recordInTx(tx, { user: null, action: 'settlement.clear', resource: 'Settlement', resourceId: 'S-Y', detail: '正常' })
    })
    expect(await prisma.auditLog.count()).toBe(1)
  })
})

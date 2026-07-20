import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { rmSync } from 'fs'
import { PrismaService } from '../prisma.service'
import { ReserveReleaseService } from './reserve-release.service'
import { FulfillmentService } from './fulfillment.service'

// P0-B4 / P0-B5 资金回归：
//   B4 准备金追偿跨行认领、守卫已释放行、守恒式 II/III 不破（条件更新替代 read-modify-write）。
//   B5 履约不复活已关闭合约（条件累加 + 正向路径不受影响）。

let prisma: PrismaService
let reserve: ReserveReleaseService
let fulfillment: FulfillmentService

const DB = 'file:./p0fix-test.db'

beforeAll(() => {
  process.env.DATABASE_URL = DB
  for (const f of ['p0fix-test.db', 'p0fix-test.db-journal', 'p0fix-test.db-wal', 'p0fix-test.db-shm']) {
    for (const dir of ['../..', '../../prisma']) {
      try {
        rmSync(`${__dirname}/${dir}/${f}`)
      } catch {
        /* 不存在则忽略 */
      }
    }
  }
  execSync('npx prisma db push --skip-generate --accept-data-loss', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' })
  prisma = new PrismaService()
  reserve = new ReserveReleaseService(prisma)
  fulfillment = new FulfillmentService(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function seedBrand() {
  await prisma.brand.upsert({
    where: { id: 'CB' },
    update: {},
    create: { id: 'CB', name: 'P0修复测试品牌', mark: 'C', category: '测试', feeRate: 40, period: 7, reservePct: 10, joinedAt: '测试' },
  })
}

describe('P0-B4 · clawback 跨行追偿、守卫已释放行、守恒式 III', () => {
  it('追偿额跨多个 scheduled 行：整行 clawed_back + 末行部分缩减，frozen 守恒', async () => {
    await seedBrand()
    await prisma.settlement.create({ data: { id: 'ST-CB', period: '24C', brandId: 'CB', gross: 1000, brandShare: 500, platformFee: 200, agentPayout: 300, reserve: 300, reserveReleased: 0, reserveClawedBack: 0, frozen: 300 } })
    await prisma.reserveRelease.create({ data: { id: 'RR-C1', settlementId: 'ST-CB', agentId: 'AG-C', stage: 'D7_init', amount: 100, dueAt: new Date('2026-01-01'), status: 'scheduled' } })
    await prisma.reserveRelease.create({ data: { id: 'RR-C2', settlementId: 'ST-CB', agentId: 'AG-C', stage: 'D30_quality', amount: 100, dueAt: new Date('2026-02-01'), status: 'scheduled' } })
    await prisma.reserveRelease.create({ data: { id: 'RR-C3', settlementId: 'ST-CB', agentId: 'AG-C', stage: 'D60_renew', amount: 100, dueAt: new Date('2026-03-01'), status: 'scheduled' } })

    // 追偿 150：按 dueAt 早→晚，吃满 RR-C1(100) + RR-C2 部分(50)
    let clawed = 0
    await prisma.$transaction(async (tx) => {
      clawed = (await reserve.clawback(tx, 'ST-CB', 150)).clawed
    })
    expect(clawed).toBe(150)
    const s = await prisma.settlement.findUnique({ where: { id: 'ST-CB' } })
    expect(s?.reserveClawedBack).toBe(150)
    expect(s?.frozen).toBe(150) // 守恒式 II/III：frozen = reserve − released − clawedBack = 300 − 0 − 150
    const r1 = await prisma.reserveRelease.findUnique({ where: { id: 'RR-C1' } })
    const r2 = await prisma.reserveRelease.findUnique({ where: { id: 'RR-C2' } })
    const r3 = await prisma.reserveRelease.findUnique({ where: { id: 'RR-C3' } })
    expect(r1?.status).toBe('clawed_back')
    expect(r2?.status).toBe('scheduled')
    expect(r2?.amount).toBe(50) // 部分缩减 100→50
    expect(r3?.status).toBe('scheduled')
    expect(r3?.amount).toBe(100) // 未触及
  })

  it('已 released 的行不被追偿覆盖（守卫 status=scheduled，守恒式 III 不破）', async () => {
    await seedBrand()
    await prisma.settlement.create({ data: { id: 'ST-CB2', period: '24C2', brandId: 'CB', gross: 1000, brandShare: 500, platformFee: 200, agentPayout: 300, reserve: 200, reserveReleased: 100, reserveClawedBack: 0, frozen: 100 } })
    await prisma.reserveRelease.create({ data: { id: 'RR-D1', settlementId: 'ST-CB2', agentId: 'AG-D', stage: 'D7_init', amount: 100, dueAt: new Date('2026-01-01'), status: 'released', releasedAmount: 100 } })
    await prisma.reserveRelease.create({ data: { id: 'RR-D2', settlementId: 'ST-CB2', agentId: 'AG-D', stage: 'D30_quality', amount: 100, dueAt: new Date('2026-02-01'), status: 'scheduled' } })

    // 追偿 150：只能吃 scheduled 的 RR-D2(100)，released 的 RR-D1 不动 → 实际只追回 100
    let clawed = 0
    await prisma.$transaction(async (tx) => {
      clawed = (await reserve.clawback(tx, 'ST-CB2', 150)).clawed
    })
    expect(clawed).toBe(100) // 已释放部分不追（进 payoutPending/已提现，不可再从冻结池扣）
    const d1 = await prisma.reserveRelease.findUnique({ where: { id: 'RR-D1' } })
    expect(d1?.status).toBe('released') // 未被错误标记 clawed_back（旧无守卫整行 update 会打破守恒式 III）
    const s = await prisma.settlement.findUnique({ where: { id: 'ST-CB2' } })
    expect(s?.reserveClawedBack).toBe(100)
    expect(s?.frozen).toBe(0) // 100 − 100
  })
})

describe('P0-B5 · 履约不复活已关闭合约', () => {
  it('closed 合约收到订单：不累计 GMV、不复活、matchedContractId=null', async () => {
    await seedBrand()
    await prisma.growthContract.create({ data: { id: 'GC-CL', brandId: 'CB', agentId: 'AG-E', status: 'closed', settleModel: 'cps_share', targetGmv: 1000, achievedGmv: 500 } })
    let res: { matchedContractId: string | null; subscriptionId: string | null } | undefined
    await prisma.$transaction(async (tx) => {
      res = await fulfillment.ingestOrder(tx as never, { id: 'O-X1', brandId: 'CB', agentId: 'AG-E', productId: null, amount: 200, type: 'renew', plan: 'P-CL' })
    })
    const gc = await prisma.growthContract.findUnique({ where: { id: 'GC-CL' } })
    expect(gc?.status).toBe('closed') // 未被复活成 fulfilling
    expect(gc?.achievedGmv).toBe(500) // GMV 未累计
    expect(res?.matchedContractId).toBe(null)
  })

  it('active 合约正常累计并达标推进 settling（正向路径不受修复影响）', async () => {
    await seedBrand()
    await prisma.growthContract.create({ data: { id: 'GC-OK', brandId: 'CB', agentId: 'AG-F', status: 'active', settleModel: 'cps_share', targetGmv: 300, achievedGmv: 200 } })
    await prisma.$transaction(async (tx) => {
      await fulfillment.ingestOrder(tx as never, { id: 'O-X2', brandId: 'CB', agentId: 'AG-F', productId: null, amount: 200, type: 'renew', plan: 'P-OK' })
    })
    const gc = await prisma.growthContract.findUnique({ where: { id: 'GC-OK' } })
    expect(gc?.achievedGmv).toBe(400) // 200 + 200（条件累加命中）
    expect(gc?.status).toBe('settling') // 达标 400 ≥ 300 推进
  })
})

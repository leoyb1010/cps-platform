import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { rmSync } from 'fs'
import { PrismaService } from '../prisma.service'
import { SettlementService } from './settlement.service'
import { ReserveReleaseService } from './reserve-release.service'

// P0-1 + P2-B5 资金正确性回归：退款对代理的「总回收额」必须恰好 = share，不多不少。
//   分润回收（applyAgentRefundImpact 扣 payoutPending）与准备金追偿（clawback）是同一笔钱的一次回收，
//   优先扣现金池（payoutPending），不足的缺口 shortfall 才由准备金追偿——绝不对 share 全额各扣一次（旧 bug：代理实亏 2×share）。

let prisma: PrismaService
let settle: SettlementService
let reserve: ReserveReleaseService

const DB = 'file:./b5-test.db'

beforeAll(() => {
  process.env.DATABASE_URL = DB
  // SQLite 相对路径按 schema.prisma 所在目录（server/prisma/）解析，实际库落在 server/prisma/b5-test.db。
  // 两处都删（server/ 与 server/prisma/），兼清历史残留，避免跨 run 数据污染致 id 唯一约束冲突。
  for (const f of ['b5-test.db', 'b5-test.db-journal', 'b5-test.db-wal', 'b5-test.db-shm']) {
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
  settle = new SettlementService()
  reserve = new ReserveReleaseService(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function seedBrand() {
  await prisma.brand.upsert({
    where: { id: 'BB' },
    update: {},
    create: { id: 'BB', name: 'P2-B5 测试品牌', mark: 'B', category: '测试', feeRate: 40, period: 7, reservePct: 10, joinedAt: '测试' },
  })
}

describe('P2-B5 · 退款回收去重（payoutPending 优先、缺口才动准备金，总回收恒等 share）', () => {
  it('payoutPending 充足：shortfall=0，准备金一分不动，总回收=share', async () => {
    await seedBrand()
    await prisma.agent.create({ data: { id: 'AG-A', name: '代理A', type: '个人', payoutPending: 100, joinedAt: '测试' } })
    await prisma.settlement.create({ data: { id: 'ST-A', period: '24A', brandId: 'BB', gross: 1000, brandShare: 500, platformFee: 200, agentPayout: 300, reserve: 200, frozen: 200 } })
    await prisma.reserveRelease.create({ data: { id: 'RR-A', settlementId: 'ST-A', agentId: 'AG-A', stage: 'D30_quality', amount: 200, dueAt: new Date('2026-01-01'), status: 'scheduled' } })

    const share = 30
    await prisma.$transaction(async (tx) => {
      const impact = await settle.applyAgentRefundImpact(tx, { agentId: 'AG-A', share, withCredit: false })
      expect(impact?.shortfall).toBe(0) // 现金池够扣，无缺口
      if (impact) await reserve.clawback(tx, 'ST-A', impact.shortfall)
    })

    const a = await prisma.agent.findUnique({ where: { id: 'AG-A' } })
    const s = await prisma.settlement.findUnique({ where: { id: 'ST-A' } })
    const rr = await prisma.reserveRelease.findUnique({ where: { id: 'RR-A' } })
    expect(a?.payoutPending).toBe(70) // 现金池扣满 30
    expect(s?.reserveClawedBack).toBe(0) // 准备金未被追偿（旧 bug 这里会 =30 → 双扣）
    expect(rr?.status).toBe('scheduled') // 释放计划行原样
    // 总回收 = 现金降幅 + 准备金追偿 = 30 + 0 = share
    expect(100 - (a?.payoutPending ?? 0) + (s?.reserveClawedBack ?? 0)).toBe(share)
  })

  it('payoutPending 不足：现金扣到 0，缺口由准备金追偿，总回收仍恰好=share', async () => {
    await seedBrand()
    await prisma.agent.create({ data: { id: 'AG-B', name: '代理B', type: '个人', payoutPending: 20, joinedAt: '测试' } })
    await prisma.settlement.create({ data: { id: 'ST-B', period: '24B', brandId: 'BB', gross: 1000, brandShare: 500, platformFee: 200, agentPayout: 300, reserve: 200, frozen: 200 } })
    await prisma.reserveRelease.create({ data: { id: 'RR-B', settlementId: 'ST-B', agentId: 'AG-B', stage: 'D30_quality', amount: 200, dueAt: new Date('2026-01-01'), status: 'scheduled' } })

    const share = 50
    await prisma.$transaction(async (tx) => {
      const impact = await settle.applyAgentRefundImpact(tx, { agentId: 'AG-B', share, withCredit: false })
      expect(impact?.shortfall).toBe(30) // 现金只够扣 20，缺口 30
      if (impact) await reserve.clawback(tx, 'ST-B', impact.shortfall)
    })

    const a = await prisma.agent.findUnique({ where: { id: 'AG-B' } })
    const s = await prisma.settlement.findUnique({ where: { id: 'ST-B' } })
    expect(a?.payoutPending).toBe(0) // 现金池扣穿到 0（不透支）
    expect(s?.reserveClawedBack).toBe(30) // 准备金只追偿缺口 30（旧 bug 会 =50 → 总 70）
    expect(s?.frozen).toBe(170) // 守恒式 II：frozen 随追偿递减
    // 总回收 = 20（现金）+ 30（准备金）= share
    expect(20 - (a?.payoutPending ?? 0) + (s?.reserveClawedBack ?? 0)).toBe(share)
  })
})

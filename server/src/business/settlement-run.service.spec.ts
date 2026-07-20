import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { rmSync } from 'fs'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { MetricsService } from '../common/metrics.service'
import { SettlementRunService } from './settlement-run.service'

// P0-B1/B2 结算单 + 准备金释放计划生成器回归：
//   恒等式 I 精确守衡、分成值符合品牌费率、守恒式 II（frozen=reserve）、
//   守恒式 III（Σ释放计划 amount=reserve）、多代理按 GMV 占比分摊、幂等跑批不双出单。

let prisma: PrismaService
let run: SettlementRunService

const DB = 'file:./srun-test.db'

beforeAll(() => {
  process.env.DATABASE_URL = DB
  for (const f of ['srun-test.db', 'srun-test.db-journal', 'srun-test.db-wal', 'srun-test.db-shm']) {
    for (const dir of ['../..', '../../prisma']) {
      try {
        rmSync(`${__dirname}/${dir}/${f}`)
      } catch {
        /* ignore */
      }
    }
  }
  execSync('npx prisma db push --skip-generate --accept-data-loss', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' })
  prisma = new PrismaService()
  run = new SettlementRunService(prisma, new AuditService(prisma, new MetricsService()))
})

afterAll(async () => {
  await prisma.$disconnect()
})

const FROM = new Date('2026-06-01T00:00:00.000Z')
const TO = new Date('2026-07-01T00:00:00.000Z')
const IN = new Date('2026-06-15T00:00:00.000Z')

async function mkBrand(id: string, feeRate: number, reservePct: number) {
  await prisma.brand.upsert({ where: { id }, update: {}, create: { id, name: `品牌${id}`, mark: id.slice(0, 1), category: '测试', feeRate, reservePct, period: 7, joinedAt: '测试' } })
}
async function mkOrder(id: string, brandId: string, agentId: string, amount: number, type = 'renew', at = IN) {
  await prisma.order.create({ data: { id, time: '实时', brandId, agentId, channel: 'alipay', type, amount, plan: 'P', mid: 'M', createdAt: at } })
}

describe('P0-B1 · 结算单生成：恒等式 I + 分成值', () => {
  it('单代理：brandShare=gross×(1−feeRate)、reserve=gross×reservePct，恒等式 I 精确守衡', async () => {
    await mkBrand('YD', 42, 8)
    // gross = 8000 + 2000 = 10000
    await mkOrder('O-YD-1', 'YD', 'AG-1', 8000, 'first')
    await mkOrder('O-YD-2', 'YD', 'AG-1', 2000, 'renew')
    const r = await run.generateForBrandPeriod({ brandId: 'YD', period: '2026-06', from: FROM, to: TO })
    expect(r.created).toBe(true)
    const s = await prisma.settlement.findUniqueOrThrow({ where: { id: r.id! } })
    expect(s.gross).toBe(10000)
    expect(s.brandShare).toBe(5800) // 10000 × 0.58
    expect(s.reserve).toBe(800) // 10000 × 0.08
    expect(s.frozen).toBe(800) // 守恒式 II：frozen = reserve − 0 − 0
    // 恒等式 I：gross ≡ brandShare + reserve + platformFee + agentPayout + reversal
    const allocated = s.brandShare + s.reserve + s.platformFee + s.agentPayout + s.reversal
    expect(Math.abs(s.gross - allocated)).toBeLessThanOrEqual(0.01)
    expect(s.reversal).toBe(0)
    // distributable = 10000 − 5800 − 800 = 3400；platformFee = 3400×0.21 = 714；agentPayout = 2686
    expect(s.platformFee).toBe(714)
    expect(s.agentPayout).toBe(2686)
  })

  it('守恒式 III：Σ释放计划 amount ≡ reserve，全 scheduled，frozen 守恒', async () => {
    const s = await prisma.settlement.findFirstOrThrow({ where: { brandId: 'YD' } })
    const rows = await prisma.reserveRelease.findMany({ where: { settlementId: s.id } })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.status === 'scheduled')).toBe(true)
    const planSum = rows.reduce((a, r) => a + r.amount, 0)
    expect(Math.abs(planSum - s.reserve)).toBeLessThanOrEqual(0.01) // = 800
    // 守恒式 III（无 released/clawed）：reserve == Σ未释放 amount
    expect(Math.abs(planSum + s.reserveReleased + s.reserveClawedBack - s.reserve)).toBeLessThanOrEqual(0.01)
  })

  it('幂等：同品牌同账期二次跑批跳过，不双出单', async () => {
    const r2 = await run.generateForBrandPeriod({ brandId: 'YD', period: '2026-06', from: FROM, to: TO })
    expect(r2.created).toBe(false)
    expect(r2.reason).toBe('already-generated')
    const count = await prisma.settlement.count({ where: { brandId: 'YD', period: '2026-06' } })
    expect(count).toBe(1)
  })
})

describe('P0-B2 · 多代理准备金按 GMV 占比分摊', () => {
  it('两代理 GMV 3:1，准备金计划行分别按占比分摊，总和 ≡ reserve', async () => {
    await mkBrand('MG', 48, 14)
    await mkOrder('O-MG-1', 'MG', 'AG-A', 6000, 'first') // AG-A 6000
    await mkOrder('O-MG-2', 'MG', 'AG-B', 2000, 'first') // AG-B 2000  → gross 8000, reserve = 8000×0.14 = 1120
    const r = await run.generateForBrandPeriod({ brandId: 'MG', period: '2026-06', from: FROM, to: TO })
    expect(r.created).toBe(true)
    const rows = await prisma.reserveRelease.findMany({ where: { settlementId: r.id! } })
    const byAgent = new Map<string, number>()
    for (const rr of rows) byAgent.set(rr.agentId, (byAgent.get(rr.agentId) ?? 0) + rr.amount)
    expect(Math.abs((byAgent.get('AG-A') ?? 0) - 840)).toBeLessThanOrEqual(0.02) // 1120 × 3/4
    expect(Math.abs((byAgent.get('AG-B') ?? 0) - 280)).toBeLessThanOrEqual(0.02) // 1120 × 1/4
    const total = rows.reduce((a, x) => a + x.amount, 0)
    expect(Math.abs(total - 1120)).toBeLessThanOrEqual(0.01)
  })
})

describe('generatePeriod · 全品牌跑批', () => {
  it('对区间内有订单的品牌各出一张，无订单品牌不出单', async () => {
    await mkBrand('KP', 40, 7)
    await mkBrand('EMPTY', 40, 7) // 无订单
    await mkOrder('O-KP-1', 'KP', 'AG-K', 5000, 'first')
    // 区间外订单（不计入）
    await mkOrder('O-KP-OUT', 'KP', 'AG-K', 9999, 'first', new Date('2026-05-01T00:00:00.000Z'))
    const res = await run.generatePeriod({ period: '2026-06-batch', from: FROM, to: TO })
    const kp = res.results.find((x) => x.brandId === 'KP')
    expect(kp?.created).toBe(true)
    const s = await prisma.settlement.findFirstOrThrow({ where: { brandId: 'KP', period: '2026-06-batch' } })
    expect(s.gross).toBe(5000) // 区间外 9999 不计入
    expect(res.results.find((x) => x.brandId === 'EMPTY')).toBeUndefined() // 无订单不进跑批集
  })
})

import { describe, expect, it, vi } from 'vitest'
import { SettlementService } from './settlement.service'
import { ReserveReleaseService } from './reserve-release.service'

describe('资金 CAS 竞争回归', () => {
  it('Settlement 回退 CAS 输掉后重读，只返回真正写入的 share', async () => {
    const service = new SettlementService()
    const reads = [{ agentPayout: 50 }, { agentPayout: 20 }]
    let moneyWrites = 0
    const tx = {
      settlement: {
        findUnique: vi.fn(async () => reads.shift() ?? { agentPayout: 0 }),
        updateMany: vi.fn(async (args: { data: { reversal?: unknown } }) => {
          if (args.data.reversal) return { count: ++moneyWrites === 1 ? 0 : 1 }
          return { count: 1 }
        }),
      },
    }
    const settlement = { id: 'S1', brandId: 'B', period: '2026-06', gross: 1000, brandShare: 500, platformFee: 100, agentPayout: 50, reserve: 250, reversal: 100, frozen: 0, status: 'cleared', reconcileDiff: 0, contractId: null, agentShareSnapshot: 0.3, reserveReleased: 0, reserveClawedBack: 0, createdAt: new Date(), updatedAt: new Date() }
    const result = await service.applyRefundReversal(tx as never, { settlement, amount: 100 })
    expect(result.share).toBe(20)
    expect(moneyWrites).toBe(2)
  })

  it('snapshot=0 用 agentPayout+reversal 固定存量比例', () => {
    const service = new SettlementService()
    expect(service.shareRateOf({ gross: 1000, agentPayout: 300, reversal: 0, agentShareSnapshot: 0 })).toBe(0.3)
    expect(service.shareRateOf({ gross: 1000, agentPayout: 270, reversal: 30, agentShareSnapshot: 0 })).toBe(0.3)
  })

  it('clawback CAS 输家不记账，只有真实认领额度进入 Settlement', async () => {
    const rows = [
      { id: 'RR1', settlementId: 'S1', status: 'scheduled', amount: 100, dueAt: new Date() },
      { id: 'RR1', settlementId: 'S1', status: 'scheduled', amount: 60, dueAt: new Date() },
      null,
    ]
    let claims = 0
    const settlementUpdate = vi.fn(async () => ({}))
    const tx = {
      reserveRelease: {
        findFirst: vi.fn(async () => rows.shift()),
        updateMany: vi.fn(async () => ({ count: ++claims === 1 ? 0 : 1 })),
      },
      settlement: { update: settlementUpdate },
    }
    const service = new ReserveReleaseService({} as never)
    const result = await service.clawback(tx as never, 'S1', 80)
    expect(result.clawed).toBe(60)
    expect(settlementUpdate).toHaveBeenCalledWith({
      where: { id: 'S1' },
      data: { reserveClawedBack: { increment: 60 }, frozen: { decrement: 60 } },
    })
  })
})

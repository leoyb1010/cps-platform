import { describe, it, expect, beforeEach } from 'vitest'
import { getStore, resetStore, resolveTicketWithRefund, clearSettlement, setAgentStatus, settleAgent, addMerchant, addBrand } from './store'

beforeEach(() => {
  localStorage.clear()
  resetStore() // 回到 seed 干净态
})

describe('store · 发号唯一性(F4 防碰撞)', () => {
  it('连续新增多个号池 → id 全唯一（不再 slice(-2) 碰撞）', () => {
    const brandId = getStore().brands[0].id
    const ids = new Set<string>()
    for (let i = 0; i < 120; i++) ids.add(addMerchant({ brandId, channel: 'wechat', weight: 10 }))
    expect(ids.size).toBe(120) // 120 个全不重复
  })
  it('连续新增品牌 + 号池 → 跨实体 id 唯一', () => {
    const allIds = new Set<string>()
    for (let i = 0; i < 30; i++) {
      allIds.add(addBrand({ name: 'B' + i, mark: 'B', category: '工具', path: 'direct', feeRate: 10, period: 7, reservePct: 8, planName: '月', firstPrice: 30, renewPrice: 25, channel: 'wechat' }))
    }
    const s = getStore()
    // store 内所有品牌/号池 id 不重复
    const brandIds = s.brands.map((b) => b.id)
    expect(new Set(brandIds).size).toBe(brandIds.length)
    expect(allIds.size).toBe(30)
  })
})

describe('store · 工单退款核心联动', () => {
  it('退款 → 工单已解决 + 逆向冲账 + 代理信用分↓（有原单则生成退款流水）', () => {
    const before = getStore()
    const orderIds = new Set(before.orders.map((o) => o.id))
    const ticket = before.complaints.find((c) => c.status !== 'resolved')!
    const hasOrder = orderIds.has(ticket.orderId)
    const agentBefore = before.agents.find((a) => a.id === ticket.agentId)!
    const ordersBefore = before.orders.length
    const settleBefore = before.settlements.find((s) => s.brandId === ticket.brandId)

    resolveTicketWithRefund(ticket.id)

    const after = getStore()
    // 工单已解决（恒成立）
    expect(after.complaints.find((c) => c.id === ticket.id)!.status).toBe('resolved')
    // 代理信用分下降（恒成立）
    const agentAfter = after.agents.find((a) => a.id === ticket.agentId)!
    expect(agentAfter.creditScore).toBe(agentBefore.creditScore - 4)
    // 有原始订单时才生成退款流水
    if (hasOrder) {
      expect(after.orders.length).toBe(ordersBefore + 1)
      expect(after.orders.some((o) => o.type === 'refund')).toBe(true)
    }
    // 逆向冲账：该品牌结算 reversal 增加
    if (settleBefore) {
      const settleAfter = after.settlements.find((s) => s.id === settleBefore.id)!
      expect(settleAfter.reversal).toBeGreaterThan(settleBefore.reversal)
    }
  })

  it('已解决工单再次退款 → 幂等无副作用', () => {
    const t = getStore().complaints.find((c) => c.status !== 'resolved')!
    resolveTicketWithRefund(t.id)
    const snapshot = getStore().orders.length
    resolveTicketWithRefund(t.id) // 二次
    expect(getStore().orders.length).toBe(snapshot) // 不再生成流水
  })
})

describe('store · 结算与代理状态', () => {
  it('clearSettlement 把 pending → cleared', () => {
    const pending = getStore().settlements.find((s) => s.status === 'pending')!
    clearSettlement(pending.id)
    expect(getStore().settlements.find((s) => s.id === pending.id)!.status).toBe('cleared')
  })

  it('setAgentStatus 改状态并记活动', () => {
    const a = getStore().agents[0]
    setAgentStatus(a.id, 'throttled', '限流')
    expect(getStore().agents.find((x) => x.id === a.id)!.status).toBe('throttled')
    expect(getStore().activity.some((x) => x.text.includes(a.id))).toBe(true)
  })

  it('settleAgent 把待结算清零并计入累计已结', () => {
    const a = getStore().agents.find((x) => x.payoutPending > 0)!
    const pend = a.payoutPending
    const settledBefore = a.settledTotal
    settleAgent(a.id)
    const after = getStore().agents.find((x) => x.id === a.id)!
    expect(after.payoutPending).toBe(0)
    expect(after.settledTotal).toBe(settledBefore + pend)
  })
})

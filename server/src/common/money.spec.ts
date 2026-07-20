import { describe, it, expect } from 'vitest'
import { round2, sum, minus, mul, splitProportional, applyDiscountPct, gte, fromYuan, toYuan } from './money'

// P1-B7 迁移后：全链路金额以「整数分」为单位。round2 语义为「四舍五入到整数分（HALF_EVEN）」。
// 只有 mul/比例分摊在乘率时会产生分数分，由 round2 收口；元/分转换只在 fromYuan/toYuan 边界发生。
describe('Money 金额精确计算（整数分）', () => {
  it('sum：整数分求和精确', () => {
    expect(sum([1000, 2000])).toBe(3000)
    expect(sum([1, 2, 3])).toBe(6)
  })

  it('round2 银行家舍入到整数分（HALF_EVEN）', () => {
    expect(round2(2.5)).toBe(2) // .5 → 最近偶数 2
    expect(round2(3.5)).toBe(4) // .5 → 最近偶数 4
    expect(round2(2.4)).toBe(2)
    expect(round2(2.6)).toBe(3)
  })

  it('minus / mul 精确（分域）', () => {
    expect(minus(3000, 2700)).toBe(300)
    expect(mul(2990, 3)).toBe(8970)
    expect(mul(10000, 0.33)).toBe(3300) // 10000 分 × 33% = 3300 分
    expect(mul(4870, 0.85)).toBe(4140) // 4139.5 → HALF_EVEN 4140
  })

  it('splitProportional：按比例拆分且 ∑ 恒等于总额（末项吸收残差）', () => {
    // 10000 分按 1:1:1 → 3333 + 3333 + 3334 = 10000（末项吸收）
    const p = splitProportional(10000, [1, 1, 1])
    expect(sum(p)).toBe(10000)
    expect(p[2]).toBe(3334)
    // 套餐拆单：3825 分按 15/18/12 定价占比拆，和严格等于总额
    const q = splitProportional(3825, [15, 18, 12])
    expect(sum(q)).toBe(3825)
  })

  it('splitProportional：权重全 0 → 均分', () => {
    const p = splitProportional(1000, [0, 0])
    expect(sum(p)).toBe(1000)
    expect(p).toEqual([500, 500])
  })

  it('applyDiscountPct：折扣在分域精确收口', () => {
    expect(applyDiscountPct(3000, 10)).toBe(2700) // 9 折
    expect(applyDiscountPct(4870, 15)).toBe(4140) // 85 折：4139.5 → 4140
    expect(applyDiscountPct(1000, 200)).toBe(0) // 下界 0
  })

  it('三方分成拆分之和恒等于总额（对账恒等式 I 前提，分域严格相等）', () => {
    const gross = 10000 // 分
    const agent = mul(gross, 0.3)
    const platform = mul(gross, 0.08)
    const reserve = mul(gross, 0.1)
    const brand = minus(gross, sum([agent, platform, reserve]))
    expect(sum([agent, platform, reserve, brand])).toBe(gross)
  })

  it('gte 金额比较（分域）', () => {
    expect(gte(300, 300)).toBe(true)
    expect(gte(299, 300)).toBe(false)
  })

  it('fromYuan / toYuan 边界转换', () => {
    expect(fromYuan(48.7)).toBe(4870) // 元 → 分
    expect(fromYuan(0.01)).toBe(1)
    expect(toYuan(4870)).toBe(48.7) // 分 → 元
    expect(toYuan(842000000)).toBe(8420000) // ¥842万
    expect(toYuan(fromYuan(19.99))).toBe(19.99) // 往返无损
  })
})

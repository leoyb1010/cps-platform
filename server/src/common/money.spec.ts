import { describe, it, expect } from 'vitest'
import { round2, sum, minus, mul, splitProportional, applyDiscountPct, gte } from './money'

describe('Money 金额精确计算（decimal.js）', () => {
  it('消灭浮点误差：0.1 + 0.2 = 0.3', () => {
    expect(sum([0.1, 0.2])).toBe(0.3) // 原生 0.1+0.2=0.30000000000000004
  })

  it('round2 银行家舍入（HALF_EVEN）', () => {
    expect(round2(1.005)).toBe(1.0) // HALF_EVEN：1.005 → 1.00（2 为偶）
    expect(round2(1.015)).toBe(1.02)
    expect(round2(2.675)).toBe(2.68)
  })

  it('minus / mul 精确', () => {
    expect(minus(30, 27)).toBe(3)
    expect(mul(29.9, 3)).toBe(89.7) // 原生 29.9*3=89.69999999999999
    expect(mul(100, 0.33)).toBe(33)
  })

  it('splitProportional：按比例拆分且 ∑ 恒等于总额（末项吸收残差）', () => {
    // 100 元按 1:1:1 拆 → 33.33 + 33.33 + 33.34 = 100（末项吸收）
    const p = splitProportional(100, [1, 1, 1])
    expect(sum(p)).toBe(100)
    expect(p[2]).toBe(33.34)
    // 套餐拆单场景：38.25 按 15/18/12 定价占比拆
    const q = splitProportional(38.25, [15, 18, 12])
    expect(sum(q)).toBe(38.25) // 分摊和严格等于总额，无零头漂移
  })

  it('splitProportional：权重全 0 → 均分', () => {
    const p = splitProportional(10, [0, 0])
    expect(sum(p)).toBe(10)
    expect(p).toEqual([5, 5])
  })

  it('applyDiscountPct：满件折扣不产生浮点尾差', () => {
    expect(applyDiscountPct(30, 10)).toBe(27) // 9 折
    expect(applyDiscountPct(48.7, 15)).toBe(41.4) // 85 折，原生会得 41.394999...
    expect(applyDiscountPct(10, 200)).toBe(0) // 下界 0
  })

  it('三方分成拆分之和恒等于总额（对账恒等式 I 前提）', () => {
    // 100 元，30% 代理 / 8% 平台 / 10% 准备金，余额归品牌
    const gross = 100
    const agent = mul(gross, 0.3)
    const platform = mul(gross, 0.08)
    const reserve = mul(gross, 0.1)
    const brand = minus(gross, sum([agent, platform, reserve]))
    expect(sum([agent, platform, reserve, brand])).toBe(gross)
  })

  it('gte 金额比较不受浮点影响', () => {
    expect(gte(0.3, sum([0.1, 0.2]))).toBe(true)
    expect(gte(2.99, 3)).toBe(false)
  })
})

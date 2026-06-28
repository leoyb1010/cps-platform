import { describe, it, expect } from 'vitest'
import { presetToRange, presetToMonthKeys } from './period'

const NOW = new Date('2026-06-27T15:30:00')

describe('period · presetToRange（订单 createdAt 真实区间）', () => {
  it('today 从当日 0 点到 now', () => {
    const r = presetToRange({ preset: 'today' }, NOW)
    expect(r.from).toBe(new Date('2026-06-27T00:00:00').toISOString())
    expect(r.to).toBe(NOW.toISOString())
  })
  it('month 从当月 1 号 0 点', () => {
    const r = presetToRange({ preset: 'month' }, NOW)
    expect(r.from).toBe(new Date('2026-06-01T00:00:00').toISOString())
  })
  it('quarter 从季度首月 1 号（6 月 → Q2 从 4 月）', () => {
    const r = presetToRange({ preset: 'quarter' }, NOW)
    expect(r.from).toBe(new Date('2026-04-01T00:00:00').toISOString())
  })
  it('custom 用 from/to 边界（含全天）', () => {
    const r = presetToRange({ preset: 'custom', from: '2026-05-01', to: '2026-05-31' }, NOW)
    expect(r.from).toBe(new Date('2026-05-01T00:00:00').toISOString())
    expect(r.to).toBe(new Date('2026-05-31T23:59:59.999').toISOString())
  })
})

describe('period · presetToMonthKeys（结算 period 前缀分桶）', () => {
  it('month → 当月单键', () => {
    expect(presetToMonthKeys({ preset: 'month' }, NOW)).toEqual(['2026-06'])
  })
  it('quarter → 季度三月键', () => {
    expect(presetToMonthKeys({ preset: 'quarter' }, NOW)).toEqual(['2026-04', '2026-05', '2026-06'])
  })
  it('today/week 月以下粒度降级当月', () => {
    expect(presetToMonthKeys({ preset: 'week' }, NOW)).toEqual(['2026-06'])
  })
  it('custom 枚举跨越月份', () => {
    expect(presetToMonthKeys({ preset: 'custom', from: '2026-03-15', to: '2026-06-02' }, NOW)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06'])
  })
})

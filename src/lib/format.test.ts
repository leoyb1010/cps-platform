import { describe, it, expect } from 'vitest'
import { yuan, money, pct, int, delta, cx } from './format'

describe('format · 金额/百分比/紧凑', () => {
  it('yuan 默认两位小数 + 符号', () => {
    expect(yuan(1234.5)).toBe('¥1,234.50')
    expect(yuan(10, { sign: true })).toBe('+¥10.00')
    expect(yuan(-5)).toBe('¥-5.00')
  })

  it('money 自动选 元/万/亿', () => {
    expect(money(800)).toBe('¥800')
    expect(money(12345)).toBe('¥1.2万')
    expect(money(258_000_000)).toBe('¥2.58亿')
  })

  it('pct 带百分号、可控小数', () => {
    expect(pct(0.42)).toBe('0.4%')
    expect(pct(71.45, 2)).toBe('71.45%')
  })

  it('delta 正负号用 +/−（非 ASCII 减号）', () => {
    expect(delta(1.6)).toBe('+1.6%')
    expect(delta(-0.3)).toBe('−0.3%')
  })

  it('int 千分位', () => {
    expect(int(1234567)).toBe('1,234,567')
  })

  it('cx 过滤假值拼接', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b')
    expect(cx()).toBe('')
  })
})

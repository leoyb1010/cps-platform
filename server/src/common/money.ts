import Decimal from 'decimal.js'

/**
 * 金额精确计算工具（decimal.js）。
 *
 * 为什么存在：JS 原生 Number 是二进制浮点，`0.1 + 0.2 !== 0.3`。在分成（gross → brandShare/
 * platformFee/agentPayout/reserve 多路拆分）与套餐拆单按比例分摊中，浮点误差会累积，
 * 使对账恒等式 I（gross = brandShare + reserve + platformFee + agentPayout + reversal）
 * 的 reconcileDiff 永远清不到零。本工具用十进制运算 + 显式舍入规则消灭该误差。
 *
 * 单位：演示态金额以「元」记，保留 2 位小数。舍入用 ROUND_HALF_EVEN（银行家舍入，长期无系统性偏移）。
 * 分摊残差（∑ 各份 ≠ 总额的零头）统一由「末项吸收」，保证 splitProportional 的和恒等于总额。
 */

Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN })

export type Num = number | string | Decimal

/** 转 Decimal（统一入口，容忍 number/string/Decimal）。 */
export function money(v: Num): Decimal {
  return v instanceof Decimal ? v : new Decimal(v ?? 0)
}

/** 舍入到 2 位小数并转回 number（落库/返回前统一收口）。 */
export function round2(v: Num): number {
  return money(v).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber()
}

/** 精确求和（对一组金额），返回 2 位 number。 */
export function sum(vals: Num[]): number {
  return round2(vals.reduce<Decimal>((acc, v) => acc.plus(money(v)), new Decimal(0)))
}

/** a - b，2 位 number。 */
export function minus(a: Num, b: Num): number {
  return round2(money(a).minus(money(b)))
}

/** a * b，2 位 number。 */
export function mul(a: Num, b: Num): number {
  return round2(money(a).times(money(b)))
}

/**
 * 按权重比例把 total 分摊为 n 份，∑ 各份恒等于 total（末项吸收舍入残差）。
 * 用于套餐拆单：把套餐总价按各商品定价占比拆到各笔子订单。
 * weights 全 0（或空）时退化为均分。
 */
export function splitProportional(total: Num, weights: Num[]): number[] {
  const t = money(total)
  if (weights.length === 0) return []
  const w = weights.map(money)
  const wSum = w.reduce<Decimal>((a, x) => a.plus(x), new Decimal(0))
  const parts: number[] = []
  let allocated = new Decimal(0)
  for (let i = 0; i < w.length; i++) {
    if (i === w.length - 1) {
      // 末项 = 总额 − 已分配，吸收全部舍入残差，保证 ∑ = total
      parts.push(round2(t.minus(allocated)))
    } else {
      const share = wSum.gt(0) ? t.times(w[i]).div(wSum) : t.div(w.length)
      const r = money(round2(share))
      parts.push(r.toNumber())
      allocated = allocated.plus(r)
    }
  }
  return parts
}

/** 按折扣百分比算最终价：total * (1 - pct/100)，下界 0，2 位 number。 */
export function applyDiscountPct(total: Num, pct: Num): number {
  const v = money(total).times(new Decimal(1).minus(money(pct).div(100)))
  return Math.max(0, round2(v))
}

/** a >= b（金额比较，避免浮点误判）。 */
export function gte(a: Num, b: Num): boolean {
  return money(a).gte(money(b))
}

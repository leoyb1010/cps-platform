import Decimal from 'decimal.js'

/**
 * 金额精确计算工具（decimal.js）。
 *
 * 为什么存在：JS 原生 Number 是二进制浮点，`0.1 + 0.2 !== 0.3`。在分成（gross → brandShare/
 * platformFee/agentPayout/reserve 多路拆分）与套餐拆单按比例分摊中，浮点误差会累积，
 * 使对账恒等式 I（gross = brandShare + reserve + platformFee + agentPayout + reversal）
 * 的 reconcileDiff 永远清不到零。本工具用十进制运算 + 显式舍入规则消灭该误差。
 *
 * 单位（P1-B7 整数分迁移后）：全链路后端以「分」为最小单位，DB 存整数分。round2 语义随之变为
 * 「四舍五入到整数分」（不再是 2 位小数元）——所有分成/分摊运算在整数分域进行，DB 的 increment/decrement
 * 天然整数精确，对账恒等式可严格相等（容差 0）。舍入用 ROUND_HALF_EVEN（银行家舍入）。分摊残差由「末项吸收」。
 * 元/分转换只在边界发生：API 响应用 toYuan(分→元) 转回，用户输入/落库用 fromYuan(元→分)。
 */

Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN })

export type Num = number | string | Decimal

/** 转 Decimal（统一入口，容忍 number/string/Decimal）。 */
export function money(v: Num): Decimal {
  return v instanceof Decimal ? v : new Decimal(v ?? 0)
}

/** 舍入到整数分并转回 number（落库/返回前统一收口）。整数分域下无小数，仅在 mul/比例分摊产生分数分时收口。 */
export function round2(v: Num): number {
  return money(v).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber()
}

/** 元 → 整数分（用户输入/seed 落库边界）。四舍五入到分。 */
export function fromYuan(yuan: Num): number {
  return money(yuan).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber()
}

/** 整数分 → 元 number（API 响应/对外展示边界）。分 / 100，保留 2 位小数。 */
export function toYuan(fen: Num): number {
  return money(fen).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber()
}

/**
 * 金额字段精确名单一真值表：DB 金额列 + 计算型响应金额字段。
 * 用途：①响应拦截器（分→元）②seed（元→分）③避免误伤 reservePct/agentShareSnapshot/discountPct 等比率字段。
 * 新增金额字段务必同步加入（否则响应会以「分」返回 = 100×，或 seed 漏乘 100）。
 */
export const MONEY_FIELDS = new Set<string>([
  'gross', 'brandShare', 'platformFee', 'agentPayout', 'reserve', 'reversal', 'frozen',
  'reconcileDiff', 'reserveReleased', 'reserveClawedBack',
  'amount', 'releasedAmount',
  'payoutPending', 'settledTotal', 'deposit', 'spendMtd', 'gmvMtd', 'pendingPayout',
  'targetGmv', 'achievedGmv', 'mrr',
  'firstPrice', 'renewPrice', 'listPrice', 'finalPrice', 'myQuota', 'counterpartyQuota', 'spend', 'payout',
  'share', // 退款冲账额（refund 响应计算字段）
  'totalAllocated', // 套餐拆单分摊总额（bundle.fulfill 响应计算字段）
])

/** seed 用：把对象里 MONEY_FIELDS 命中的数值字段 元→整数分（其余字段原样）。比率字段（agentShareSnapshot 等）不在集合内，不动。 */
export function fenObj<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = { ...o }
  for (const k of Object.keys(out)) {
    if (MONEY_FIELDS.has(k) && typeof out[k] === 'number') out[k] = fromYuan(out[k] as number)
  }
  return out as T
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

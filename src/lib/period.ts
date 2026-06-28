/* ──────────────────────────────────────────────────────────────
 * 周期/日期工具 —— 前后端共用的纯函数
 *
 * 两套映射：
 *  · presetToRange()    → 真实 DateTime 区间（订单按 createdAt 服务端过滤用）
 *  · presetToMonthKeys()→ YYYY-MM 前缀列表（结算 period 是自由字符串，只能前缀分桶降级）
 *
 * 纯函数、无副作用，可单测；前端组件与后端 controller 都可引用同一份口径。
 * ────────────────────────────────────────────────────────────── */

export type PeriodPreset = 'today' | 'week' | 'month' | 'quarter' | 'custom'

export interface PeriodValue {
  preset: PeriodPreset
  from?: string // 'YYYY-MM-DD'，仅 custom
  to?: string // 'YYYY-MM-DD'，仅 custom
}

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  today: '今日',
  week: '本周',
  month: '本月',
  quarter: '本季',
  custom: '自定义',
}

/** ISO 区间 {from,to}（含时分秒）。订单 createdAt 真实过滤用。now 默认当前时刻，可注入以便测试。 */
export function presetToRange(v: PeriodValue, now: Date = new Date()): { from?: string; to?: string } {
  if (v.preset === 'custom') {
    return {
      from: v.from ? new Date(v.from + 'T00:00:00').toISOString() : undefined,
      to: v.to ? new Date(v.to + 'T23:59:59.999').toISOString() : undefined,
    }
  }
  const end = now
  const start = new Date(now)
  if (v.preset === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (v.preset === 'week') {
    start.setDate(start.getDate() - 6) // 近 7 天
    start.setHours(0, 0, 0, 0)
  } else if (v.preset === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  } else if (v.preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) * 3
    start.setMonth(q, 1)
    start.setHours(0, 0, 0, 0)
  }
  return { from: start.toISOString(), to: end.toISOString() }
}

/** YYYY-MM 前缀键列表。结算 period 字符串以 startsWith 分桶（无法做真实区间，月以下粒度降级到当月）。 */
export function presetToMonthKeys(v: PeriodValue, now: Date = new Date()): string[] {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  if (v.preset === 'today' || v.preset === 'week' || v.preset === 'month') {
    return [key(now)] // 月以下粒度无法用月份字符串表达 → 降级当月
  }
  if (v.preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) * 3
    return [0, 1, 2].map((i) => key(new Date(now.getFullYear(), q + i, 1)))
  }
  // custom：枚举 [from,to] 跨越的所有月份
  if (v.from && v.to) {
    const out: string[] = []
    const cur = new Date(v.from + 'T00:00:00')
    const end = new Date(v.to + 'T00:00:00')
    cur.setDate(1)
    while (cur <= end && out.length < 36) {
      out.push(key(cur))
      cur.setMonth(cur.getMonth() + 1)
    }
    return out
  }
  return [key(now)]
}

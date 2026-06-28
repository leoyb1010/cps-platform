/* 周期/日期工具（后端副本，与前端 src/lib/period.ts 同口径）。
 * 纯函数：presetToRange → 真实区间（代理订单 createdAt）；presetToMonthKeys → YYYY-MM 前缀（结算分桶）。 */

export type PeriodPreset = 'today' | 'week' | 'month' | 'quarter' | 'custom'
export interface PeriodValue {
  preset: PeriodPreset
  from?: string
  to?: string
}

export function presetToRange(v: PeriodValue, now: Date = new Date()): { from?: string; to?: string } {
  if (v.preset === 'custom') {
    return {
      from: v.from ? new Date(v.from + 'T00:00:00').toISOString() : undefined,
      to: v.to ? new Date(v.to + 'T23:59:59.999').toISOString() : undefined,
    }
  }
  const end = now
  const start = new Date(now)
  if (v.preset === 'today') start.setHours(0, 0, 0, 0)
  else if (v.preset === 'week') { start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0) }
  else if (v.preset === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0) }
  else if (v.preset === 'quarter') { start.setMonth(Math.floor(now.getMonth() / 3) * 3, 1); start.setHours(0, 0, 0, 0) }
  return { from: start.toISOString(), to: end.toISOString() }
}

export function presetToMonthKeys(v: PeriodValue, now: Date = new Date()): string[] {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  if (v.preset === 'today' || v.preset === 'week' || v.preset === 'month') return [key(now)]
  if (v.preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) * 3
    return [0, 1, 2].map((i) => key(new Date(now.getFullYear(), q + i, 1)))
  }
  if (v.from && v.to) {
    const out: string[] = []
    const cur = new Date(v.from + 'T00:00:00')
    const end = new Date(v.to + 'T00:00:00')
    cur.setDate(1)
    while (cur <= end && out.length < 36) { out.push(key(cur)); cur.setMonth(cur.getMonth() + 1) }
    return out
  }
  return [key(now)]
}

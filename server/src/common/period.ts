/* 周期/日期工具（后端副本，与前端 src/lib/period.ts 同口径）。
 * 纯函数：presetToRange → 真实区间（代理订单 createdAt）；presetToMonthKeys → YYYY-MM 前缀（结算分桶）。 */

export type PeriodPreset = 'today' | 'week' | 'month' | 'quarter' | 'custom'
export interface PeriodValue {
  preset: PeriodPreset
  from?: string
  to?: string
}

// P3-3：统一时区口径为固定 +08:00（北京时间，业务口径），显式换算对齐 Order.createdAt（UTC 存储）。
// 原实现用 new Date('...T00:00:00')、getFullYear/getMonth（服务器本地时区），部署时区一变
// 就会在月末/月初把订单分错桶。下方一律按北京墙钟计算再折回 UTC ISO，结果与服务器时区无关。
const TZ = '+08:00'
const TZ_MS = 8 * 60 * 60 * 1000
// 取某 UTC 时刻对应的「北京墙钟」年/月/日：先 +8h 再用 UTC 取值。
function bjParts(d: Date): { y: number; m: number; day: number } {
  const b = new Date(d.getTime() + TZ_MS)
  return { y: b.getUTCFullYear(), m: b.getUTCMonth(), day: b.getUTCDate() }
}
// 由北京墙钟 (y,m,day,时分秒) 生成对应 UTC 时刻。
function bjDate(y: number, m: number, day: number, h = 0, min = 0, s = 0, ms = 0): Date {
  return new Date(Date.UTC(y, m, day, h, min, s, ms) - TZ_MS)
}
const monthKey = (y: number, m: number): string => `${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, '0')}`

export function presetToRange(v: PeriodValue, now: Date = new Date()): { from?: string; to?: string } {
  if (v.preset === 'custom') {
    // 显式 +08:00：把用户输入的日界当北京 00:00 / 23:59.999，折回 UTC ISO 与 createdAt 对齐
    return {
      from: v.from ? new Date(v.from + 'T00:00:00.000' + TZ).toISOString() : undefined,
      to: v.to ? new Date(v.to + 'T23:59:59.999' + TZ).toISOString() : undefined,
    }
  }
  const { y, m, day } = bjParts(now)
  let start: Date
  if (v.preset === 'week') start = bjDate(y, m, day - 6)
  else if (v.preset === 'month') start = bjDate(y, m, 1)
  else if (v.preset === 'quarter') start = bjDate(y, Math.floor(m / 3) * 3, 1)
  else start = bjDate(y, m, day) // today（含未知 preset 兜底）
  return { from: start.toISOString(), to: now.toISOString() }
}

export function presetToMonthKeys(v: PeriodValue, now: Date = new Date()): string[] {
  const { y, m } = bjParts(now)
  if (v.preset === 'today' || v.preset === 'week' || v.preset === 'month') return [monthKey(y, m)]
  if (v.preset === 'quarter') {
    const q = Math.floor(m / 3) * 3
    return [0, 1, 2].map((i) => monthKey(y, q + i))
  }
  if (v.from && v.to) {
    const out: string[] = []
    const s = bjParts(new Date(v.from + 'T00:00:00.000' + TZ))
    const e = bjParts(new Date(v.to + 'T00:00:00.000' + TZ))
    for (let idx = s.y * 12 + s.m; idx <= e.y * 12 + e.m && out.length < 36; idx++) {
      out.push(monthKey(Math.floor(idx / 12), idx % 12))
    }
    return out
  }
  return [monthKey(y, m)]
}

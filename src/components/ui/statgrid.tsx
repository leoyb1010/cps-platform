import type { ReactNode } from 'react'
import type { Tone } from '../../lib/data'
import { Card, Stat } from './primitives'

/* ──────────────────────────────────────────────────────────────
 * StatGrid —— 列表页顶部聚合速览卡组
 *
 * 收敛全站 ~22 处复制的 `grid grid-cols-2 gap-4 lg:grid-cols-N` + Card+Stat 块。
 * 纯组合现有 Card/Stat，无行为/视觉变化，仅消重。
 * ────────────────────────────────────────────────────────────── */

export interface StatItem {
  label: ReactNode
  value: ReactNode
  unit?: string
  sub?: ReactNode
  delta?: string
  deltaTone?: Tone
  hint?: string
  children?: ReactNode
}

const COLS: Record<2 | 3 | 4, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
}

export function StatGrid({ items, cols = 4, className = '' }: { items: StatItem[]; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-4 ${COLS[cols]} ${className}`}>
      {items.map((it, i) => (
        <Card key={i}>
          <Stat {...it} />
        </Card>
      ))}
    </div>
  )
}

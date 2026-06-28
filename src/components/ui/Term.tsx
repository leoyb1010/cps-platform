import type { ReactNode } from 'react'
import { getTerm } from '../../lib/terms'

// 专业术语悬停解释。<Term k="reversal">逆向冲账</Term> —— 虚线下划线提示可悬停，
// 原生 title 弹一句人话（+ 公式/红线）。零依赖、不占 z-index、流式渲染安全。
export function Term({ k, children, className }: { k: string; children?: ReactNode; className?: string }) {
  const t = getTerm(k)
  if (!t) return <>{children}</>
  const tip = [t.plain, t.formula && `公式：${t.formula}`, t.redline && `红线：${t.redline}`].filter(Boolean).join('\n')
  return (
    <span
      title={tip}
      className={'cursor-help border-b border-dashed border-ink-4/50 ' + (className ?? '')}
    >
      {children ?? t.term}
    </span>
  )
}

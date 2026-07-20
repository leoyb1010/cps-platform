import { useEffect, useState, type ReactNode } from 'react'

/**
 * 首次进入 3 步聚光引导（Coach Marks）。
 * 铁律：只做 3 步入口指引，坚决不做十步长教程——教程越长越没人看。
 * 用锚点 CSS 选择器定位到目标元素画高亮框 + 气泡；跳过即永不再弹（localStorage）；
 * prefers-reduced-motion 直接跳过整段引导（不闪不动）。
 */
export interface CoachStep {
  /** 目标元素选择器（找不到则气泡居中显示，不阻塞） */
  anchor?: string
  title: string
  body: ReactNode
}

const DONE_PREFIX = 'cps-coach-done-'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function CoachMarks({ id, steps }: { id: string; steps: CoachStep[] }) {
  const doneKey = DONE_PREFIX + id
  const [i, setI] = useState(0)
  const [active, setActive] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    let done = false
    try {
      done = localStorage.getItem(doneKey) === '1'
    } catch {
      /* ignore */
    }
    if (!done && steps.length > 0) {
      // 略延迟，等目标页首屏渲染完再定位
      const t = setTimeout(() => setActive(true), 550)
      return () => clearTimeout(t)
    }
  }, [doneKey, steps.length])

  useEffect(() => {
    if (!active) return
    const step = steps[i]
    if (!step?.anchor) {
      setRect(null)
      return
    }
    const el = document.querySelector(step.anchor)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [active, i, steps])

  if (!active || steps.length === 0) return null
  const step = steps[i]
  const last = i === steps.length - 1

  const finish = () => {
    try {
      localStorage.setItem(doneKey, '1')
    } catch {
      /* ignore */
    }
    setActive(false)
  }

  // 气泡定位：有锚点则贴其下方，否则屏幕居中
  const pad = 8
  const bubbleStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: Math.min(rect.bottom + pad, window.innerHeight - 180),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)),
      }
    : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }

  return (
    <div className="fixed inset-0 z-[200]" style={{ animation: 'fadeIn .2s both' }}>
      {/* 半透明遮罩（点击遮罩=跳过，避免困住用户） */}
      <div className="absolute inset-0 bg-ink/45" onClick={finish} />
      {/* 高亮框：镂空目标元素 */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-brand ring-offset-2"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: '0 0 0 9999px rgba(20,21,26,0.45)',
            transition: 'all .25s var(--ease-standard)',
          }}
        />
      )}
      {/* 气泡 */}
      <div className="w-[320px] rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-pop)]" style={{ ...bubbleStyle, animation: 'revUpSm .22s both' }}>
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-semibold text-ink">{step.title}</span>
          <span className="tnum text-[11px] text-ink-4">{i + 1} / {steps.length}</span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{step.body}</p>
        <div className="mt-3.5 flex items-center justify-between">
          <button onClick={finish} className="text-[12px] text-ink-4 transition-colors hover:text-ink-2">跳过</button>
          <div className="flex items-center gap-1.5">
            {steps.map((_, k) => (
              <span key={k} className={k === i ? 'h-1.5 w-4 rounded-full bg-brand transition-all' : 'h-1.5 w-1.5 rounded-full bg-line-strong transition-all'} />
            ))}
          </div>
          <button
            onClick={() => (last ? finish() : setI((v) => v + 1))}
            className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-hover"
          >
            {last ? '开始使用' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  )
}

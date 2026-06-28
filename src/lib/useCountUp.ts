import { useEffect, useRef, useState } from 'react'

/**
 * 数字滚动动画：目标值变化时，在 `duration` 内用 ease-out 从当前显示值平滑过渡到新值。
 * 用于套餐价等关键数字，让价格变化有"跳动"质感而非硬切。
 * 尊重 prefers-reduced-motion：偏好减少动效时直接落到目标值。
 */
export function useCountUp(target: number, duration = 520): number {
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || duration <= 0) { setDisplay(target); fromRef.current = target; return }

    const from = fromRef.current
    if (from === target) return
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(from + (target - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else { fromRef.current = target; setDisplay(target) }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return display
}

import { useEffect, useRef, useState } from 'react'

/**
 * 数字滚动动画：目标值变化时，在 `duration` 内用 ease-out 从当前显示值平滑过渡到新值。
 * 用于套餐价等关键数字，让价格变化有"跳动"质感而非硬切。
 * 尊重 prefers-reduced-motion：偏好减少动效时直接落到目标值。
 */
export function useCountUp(target: number, duration = 520): number {
  const [display, setDisplay] = useState(target)
  // dispRef 始终跟踪当前屏幕上的显示值：目标值在动画中途改变时，新动画要从"此刻显示到的位置"
  // 起步，而不是上一段动画的起点，否则会先跳回旧起点再滚动（价格快速改选时的可见抖动）。
  const dispRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || duration <= 0) { setDisplay(target); dispRef.current = target; return }

    const from = dispRef.current
    if (from === target) return
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      const v = from + (target - from) * eased
      dispRef.current = v
      setDisplay(v)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else { dispRef.current = target; setDisplay(target) }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return display
}

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/* ──────────────────────────────────────────────────────────────
 * 锚定气泡 Popover —— 在触发元素附近弹出的浮层卡片
 *
 * 与右侧抽屉(Drawer)不同：非模态、不锁滚动、贴边自动翻转、带指向小箭头、
 * createPortal 到 body 脱离任何 overflow/层叠上下文（内部/门户/超市三壳通用）。
 * 点击外部 / Esc / 滚动 / resize 均关闭。
 * ────────────────────────────────────────────────────────────── */

export interface AnchorRect {
  top: number; left: number; right: number; bottom: number; width: number; height: number
}

function rectOf(r: DOMRect | AnchorRect): AnchorRect {
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
}
function toRect(src: HTMLElement | React.MouseEvent | DOMRect | AnchorRect): AnchorRect {
  // 普通 DOMRect / AnchorRect（无 getBoundingClientRect、无 currentTarget）
  if (!('getBoundingClientRect' in src) && !('currentTarget' in src) && 'width' in src) {
    return rectOf(src as AnchorRect)
  }
  // React 合成事件 → 优先 currentTarget(锚到绑定元素，比鼠标点稳)，回退 target
  if ('currentTarget' in src) {
    const ev = src as React.MouseEvent
    const el = (ev.currentTarget ?? ev.target) as HTMLElement | null
    if (el && typeof el.getBoundingClientRect === 'function') return rectOf(el.getBoundingClientRect())
  }
  // HTMLElement
  if ('getBoundingClientRect' in src && typeof (src as HTMLElement).getBoundingClientRect === 'function') {
    return rectOf((src as HTMLElement).getBoundingClientRect())
  }
  return rectOf(src as unknown as AnchorRect)
}

/** 锚定气泡控制器：openAt 接受 事件/元素/矩形，统一归一为视口矩形。 */
export function useAnchoredPopover() {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const openAt = useCallback((src: HTMLElement | React.MouseEvent | DOMRect | AnchorRect) => {
    setAnchor(toRect(src))
  }, [])
  const close = useCallback(() => setAnchor(null), [])
  return { open: anchor !== null, anchorRect: anchor, openAt, close }
}

type Placement = 'auto' | 'bottom' | 'top'

/** 给定锚矩形 + 卡片尺寸 + 视口，算出 fixed 定位 + 实际放置方向 + 箭头水平位置。 */
function computePosition(
  anchor: AnchorRect, cardW: number, cardH: number, placement: Placement,
  vw: number, vh: number, gap = 8, margin = 12,
): { top: number; left: number; place: 'bottom' | 'top'; arrowLeft: number } {
  // 方向：默认下方；下方放不下且上方更宽裕则翻转
  const spaceBelow = vh - anchor.bottom - gap - margin
  const spaceAbove = anchor.top - gap - margin
  let place: 'bottom' | 'top' = 'bottom'
  if (placement === 'top') place = 'top'
  else if (placement === 'bottom') place = 'bottom'
  else if (cardH > spaceBelow && spaceAbove > spaceBelow) place = 'top'

  let top = place === 'bottom' ? anchor.bottom + gap : anchor.top - gap - cardH
  // 水平：左对齐锚；右溢出则右对齐锚右缘；再 clamp 进视口
  let left = anchor.left
  if (left + cardW > vw - margin) left = anchor.right - cardW
  left = Math.max(margin, Math.min(left, vw - cardW - margin))
  top = Math.max(margin, Math.min(top, vh - cardH - margin))

  // 箭头指向锚中心（相对卡片左缘），并避开圆角
  const anchorCenterX = anchor.left + anchor.width / 2
  const arrowLeft = Math.max(14, Math.min(anchorCenterX - left, cardW - 14))
  return { top, left, place, arrowLeft }
}

export function Popover({
  anchor, onClose, children, width = 360, placement = 'auto', arrow = true, role,
}: {
  anchor: AnchorRect | null
  onClose: () => void
  children: ReactNode
  width?: number
  placement?: Placement
  arrow?: boolean
  role?: string
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; place: 'bottom' | 'top'; arrowLeft: number } | null>(null)

  // 两遍测量：先按 fallback 渲染拿真实高度，再精修定位。
  // 仅在结果变化时 setPos（深比较）——否则每次渲染都 setState → 无限重渲染 → 动画反复重启卡在 opacity:0。
  useLayoutEffect(() => {
    if (!anchor || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const next = computePosition(anchor, rect.width || width, rect.height, placement, window.innerWidth, window.innerHeight)
    setPos((prev) => (prev && prev.top === next.top && prev.left === next.left && prev.place === next.place && prev.arrowLeft === next.arrowLeft ? prev : next))
  }, [anchor, width, placement])

  // 外部关闭：Esc / 点击卡片外 / 滚动 / resize
  useEffect(() => {
    if (!anchor) return
    // 开启后的极短冷却期：忽略触发点击自身派发的 mousedown（否则同一次 click 会立即关掉）
    const openedAt = performance.now()
    const fresh = () => performance.now() - openedAt > 150
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => { if (fresh() && cardRef.current && !cardRef.current.contains(e.target as Node)) onClose() }
    const onScrollResize = () => { if (fresh()) onClose() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown, true)
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
    }
  }, [anchor, onClose])

  if (!anchor) return null

  // 初始位置直接落在锚下方（贴边 clamp 到视口内），始终在屏可见；useLayoutEffect 再精修方向/翻转。
  // 不再用 -9999/hidden 占位 —— 避免某些环境测不到高度时卡在屏外/不可见。
  const margin = 12
  const fallbackTop = Math.min(anchor.bottom + 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - margin)
  const fallbackLeft = Math.max(margin, Math.min(anchor.left, (typeof window !== 'undefined' ? window.innerWidth : 1280) - width - margin))

  const card = (
    <div
      ref={cardRef}
      role={role}
      // 不加入场动画：气泡瞬时出现，免疫"频繁重渲染反复重启 CSS 动画把卡片卡在 opacity:0"这类问题。
      className="fixed z-[92] rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]"
      style={{
        width,
        top: pos?.top ?? fallbackTop,
        left: pos?.left ?? fallbackLeft,
      }}
    >
      {arrow && pos && (
        <span
          aria-hidden
          className="absolute h-2.5 w-2.5 rotate-45 border-line bg-surface"
          style={
            pos.place === 'bottom'
              ? { top: -5, left: pos.arrowLeft - 5, borderLeft: '1px solid', borderTop: '1px solid' }
              : { bottom: -5, left: pos.arrowLeft - 5, borderRight: '1px solid', borderBottom: '1px solid' }
          }
        />
      )}
      {children}
    </div>
  )
  return createPortal(card, document.body)
}

/* ── DetailPopover：详情气泡（镜像 Drawer 头尾，body 自由） ───────── */
/**
 * 替代右侧详情抽屉。带 role="dialog"（保 Playwright 退款联动断言）。
 * 各页把原 Drawer 的 body JSX 原样放进 children，头尾走 title/desc/footer。
 */
export function DetailPopover({
  anchor, onClose, title, desc, children, footer, width = 380,
}: {
  anchor: AnchorRect | null
  onClose: () => void
  title: ReactNode
  desc?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const titleId = useId()
  if (!anchor) return null
  return (
    <Popover anchor={anchor} onClose={onClose} width={width} role="dialog">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 id={titleId} className="text-[14px] font-semibold text-ink">{title}</h3>
          {desc && <p className="mt-0.5 text-[12px] text-ink-3">{desc}</p>}
        </div>
        <button aria-label="关闭" onClick={onClose} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-4 hover:bg-surface-muted hover:text-ink">
          <X size={15} />
        </button>
      </div>
      <div className="max-h-[min(70vh,560px)] overflow-y-auto px-4 py-3.5">{children}</div>
      {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
    </Popover>
  )
}

/* ── Info：键值小卡（从各详情页提升，统一一处） ───────────────── */
export function Info({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <div className="text-[11px] text-ink-4">{k}</div>
      <div className="mt-0.5 font-medium text-ink">{v}</div>
    </div>
  )
}

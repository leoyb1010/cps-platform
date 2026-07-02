import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react'
import { cx } from '../../lib/format'
import { Button, TONE } from './primitives'

/* ── shared overlay behavior: Esc-close + scroll-lock + focus mgmt ── */
function useOverlayBehavior(open: boolean, onClose: () => void, panelRef?: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const prevActive = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      // 最小焦点圈闭：Tab / Shift+Tab 在 aria-modal 对话框内循环，不逃到背景页面
      if (e.key === 'Tab' && panelRef?.current) {
        const panel = panelRef.current
        const els = panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')
        if (!els.length) { e.preventDefault(); panel.focus(); return }
        const first = els[0], last = els[els.length - 1]
        const cur = document.activeElement
        if (e.shiftKey && (cur === first || cur === panel || !panel.contains(cur))) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (cur === last || !panel.contains(cur))) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // move focus into the dialog so keyboard + screen readers land correctly
    const t = setTimeout(() => panelRef?.current?.focus(), 20)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prevActive?.focus?.() // restore focus to the trigger
    }
  }, [open, onClose, panelRef])
}

/* ── Toast ─────────────────────────────────────── */
type ToastTone = 'good' | 'warn' | 'alert' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  text: string
}
const ToastCtx = createContext<(t: { tone?: ToastTone; text: string }) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

let toastSeq = 0
const TOAST_ICON: Record<ToastTone, ReactNode> = {
  good: <CheckCircle2 size={16} />,
  warn: <AlertTriangle size={16} />,
  alert: <XCircle size={16} />,
  info: <Info size={16} />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: { tone?: ToastTone; text: string }) => {
    const id = ++toastSeq
    setToasts((cur) => [...cur, { id, tone: t.tone ?? 'info', text: t.text }])
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 3400)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className="fixed right-5 bottom-5 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink shadow-[var(--shadow-pop)]"
            style={{ animation: 'revUpSm .28s cubic-bezier(.22,1,.36,1) both', minWidth: 240 }}
          >
            <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-md', TONE[t.tone].soft, TONE[t.tone].ink)}>{TOAST_ICON[t.tone]}</span>
            <span className="flex-1">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ── Drawer (right slide-in) ───────────────────── */
export function Drawer({
  open,
  onClose,
  title,
  desc,
  children,
  footer,
  width = 460,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  desc?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useOverlayBehavior(open, onClose, panelRef)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-ink/35" style={{ animation: 'fadeIn .2s both' }} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute top-0 right-0 flex h-full flex-col bg-surface shadow-[var(--shadow-pop)] outline-none"
        style={{ width, animation: 'drawerIn .32s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 id={titleId} className="text-[15px] font-semibold text-ink">{title}</h3>
            {desc && <p className="mt-0.5 text-[12.5px] text-ink-3">{desc}</p>}
          </div>
          <button aria-label="关闭" onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-4 hover:bg-surface-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}

/* ── Modal (centered) + Confirm ─────────────────── */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 440,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useOverlayBehavior(open, onClose, panelRef)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/35" style={{ animation: 'fadeIn .2s both' }} onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative w-full rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)] outline-none" style={{ maxWidth: width, animation: 'revUpSm .26s cubic-bezier(.22,1,.36,1) both' }}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 id={titleId} className="text-[14.5px] font-semibold text-ink">{title}</h3>
          <button aria-label="关闭" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-4 hover:bg-surface-muted hover:text-ink"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 text-[13px] leading-relaxed text-ink-2">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmText = '确认',
  tone = 'brand',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body: ReactNode
  confirmText?: string
  tone?: 'brand' | 'alert'
}) {
  // 首次点击即置 busy：快速双击不再触发两次 onConfirm（mock 模式下曾造成双重退款）
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!open) setBusy(false) }, [open])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
          <button
            disabled={busy}
            onClick={() => {
              if (busy) return
              setBusy(true)
              onConfirm()
              onClose()
            }}
            className={cx('rounded-lg px-3 py-1.5 text-[13px] font-medium text-white disabled:cursor-default disabled:opacity-60', tone === 'alert' ? 'bg-alert hover:opacity-90' : 'bg-brand hover:bg-brand-hover')}
          >
            {confirmText}
          </button>
        </>
      }
    >
      {body}
    </Modal>
  )
}

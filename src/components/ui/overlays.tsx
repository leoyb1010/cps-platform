import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react'
import { cx } from '../../lib/format'
import { Button, TONE } from './primitives'

/* ── shared overlay behavior: Esc-to-close + body scroll lock ──── */
function useOverlayBehavior(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
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
      <div className="fixed right-5 bottom-5 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
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
  useOverlayBehavior(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-ink/35" style={{ animation: 'fadeIn .2s both' }} onClick={onClose} />
      <div
        className="absolute top-0 right-0 flex h-full flex-col bg-surface shadow-[var(--shadow-pop)]"
        style={{ width, animation: 'drawerIn .32s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
            {desc && <p className="mt-0.5 text-[12.5px] text-ink-3">{desc}</p>}
          </div>
          <button onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-4 hover:bg-surface-muted hover:text-ink">
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
  useOverlayBehavior(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/35" style={{ animation: 'fadeIn .2s both' }} onClick={onClose} />
      <div className="relative w-full rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]" style={{ maxWidth: width, animation: 'revUpSm .26s cubic-bezier(.22,1,.36,1) both' }}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-4 hover:bg-surface-muted hover:text-ink"><X size={16} /></button>
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={cx('rounded-lg px-3 py-1.5 text-[13px] font-medium text-white', tone === 'alert' ? 'bg-alert hover:opacity-90' : 'bg-brand hover:bg-brand-hover')}
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

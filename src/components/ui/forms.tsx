import type { ReactNode } from 'react'
import { cx } from '../../lib/format'
import { toneVar } from './primitives'
import type { Tone } from '../../lib/data'

/* ── Field wrapper ─────────────────────────────── */
export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
        {label}
        {required && <span className="text-brand">*</span>}
        {hint && <span className="font-normal text-ink-4">· {hint}</span>}
      </div>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-brand focus:ring-2 focus:ring-brand/15'

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'min-h-[78px] resize-y', props.className)} />
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(inputCls, 'cursor-pointer appearance-none bg-[length:14px] bg-[right_10px_center] bg-no-repeat pr-8', props.className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23a3a8b0' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
      {children}
    </select>
  )
}

/* ── Timeline (订单/工单状态机时间线) ───────────── */
export interface TimelineNode {
  title: ReactNode
  time?: string
  desc?: ReactNode
  tone?: Tone
  done?: boolean
}
export function Timeline({ items }: { items: TimelineNode[] }) {
  return (
    <div className="relative">
      {items.map((it, i) => {
        const tone = it.tone ?? (it.done ? 'good' : 'neutral')
        const last = i === items.length - 1
        return (
          <div key={i} className="flex gap-3 pb-4 last:pb-0">
            <div className="relative flex flex-col items-center">
              <span className="z-[1] mt-0.5 grid h-3 w-3 place-items-center rounded-full border-2 bg-surface" style={{ borderColor: toneVar[tone] }}>
                <span className="h-1 w-1 rounded-full" style={{ background: toneVar[tone] }} />
              </span>
              {!last && <span className="absolute top-3.5 bottom-[-12px] w-px bg-line" />}
            </div>
            <div className="-mt-0.5 min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink">{it.title}</span>
                {it.time && <span className="tnum shrink-0 text-[11px] text-ink-4">{it.time}</span>}
              </div>
              {it.desc && <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{it.desc}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Steps (横向步骤条，多步表单/流程) ───────────── */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span className={cx('tnum grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold', done ? 'bg-brand text-white' : active ? 'bg-brand-soft text-brand-ink ring-2 ring-brand/30' : 'bg-surface-sunken text-ink-4')}>{done ? '✓' : i + 1}</span>
              <span className={cx('text-[12.5px] whitespace-nowrap', active ? 'font-medium text-ink' : done ? 'text-ink-2' : 'text-ink-4')}>{s}</span>
            </div>
            {i < steps.length - 1 && <span className={cx('mx-3 h-px flex-1', done ? 'bg-brand/40' : 'bg-line')} />}
          </div>
        )
      })}
    </div>
  )
}

/* ── EmptyState ────────────────────────────────── */
export function EmptyState({ icon, title, desc }: { icon?: ReactNode; title: string; desc?: string }) {
  return (
    <div className="grid place-items-center gap-2 px-6 py-12 text-center">
      {icon && <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-muted text-ink-4">{icon}</span>}
      <div className="text-[13px] font-medium text-ink-2">{title}</div>
      {desc && <div className="max-w-xs text-[12px] text-ink-4">{desc}</div>}
    </div>
  )
}

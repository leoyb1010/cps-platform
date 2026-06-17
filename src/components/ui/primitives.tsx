import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Tone } from '../../lib/data'
import { cx } from '../../lib/format'

/* ── replay / choreography epoch ─────────────────── */
export const ReplayContext = createContext<{ epoch: number; replay: () => void }>({
  epoch: 0,
  replay: () => {},
})
export const useReplay = () => useContext(ReplayContext)

/* ── count-up hook (cubic ease-out, matches design) ─ */
export function useCountUp(
  to: number,
  opts?: { decimals?: number; prefix?: string; suffix?: string; duration?: number; epoch?: number; group?: boolean },
) {
  const dec = opts?.decimals ?? 0
  const pre = opts?.prefix ?? ''
  const suf = opts?.suffix ?? ''
  const dur = opts?.duration ?? 1000
  const group = opts?.group ?? true
  const fmt = (n: number) =>
    pre + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: group }) + suf
  const [text, setText] = useState(fmt(0))
  const raf = useRef(0)
  useEffect(() => {
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setText(fmt(to * e))
      if (p < 1) raf.current = requestAnimationFrame(step)
      else setText(fmt(to))
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, opts?.epoch])
  return text
}

export function CountUp(props: {
  to: number
  decimals?: number
  prefix?: string
  suffix?: string
  group?: boolean
  className?: string
}) {
  const { epoch } = useReplay()
  const text = useCountUp(props.to, { ...props, epoch })
  return <span className={cx('tnum', props.className)}>{text}</span>
}

/* ── registration corner mark (instrument signature) ─ */
export function RegMark() {
  return (
    <span
      className="pointer-events-none absolute top-2 right-2 h-[7px] w-[7px]"
      style={{ borderTop: '1.5px solid var(--color-hairtick)', borderRight: '1.5px solid var(--color-hairtick)' }}
    />
  )
}

/* ── red square section marker ───────────────────── */
export function Mark({ tone = 'brand' }: { tone?: Tone }) {
  return <span className="h-[7px] w-[7px] shrink-0" style={{ background: toneVar[tone] }} />
}

/* ── tone → class maps ──────────────────────────── */

export const TONE: Record<Tone, { soft: string; ink: string; dot: string }> = {
  good: { soft: 'bg-good-soft', ink: 'text-good-ink', dot: 'bg-good' },
  warn: { soft: 'bg-warn-soft', ink: 'text-warn-ink', dot: 'bg-warn' },
  alert: { soft: 'bg-alert-soft', ink: 'text-alert-ink', dot: 'bg-alert' },
  info: { soft: 'bg-info-soft', ink: 'text-info-ink', dot: 'bg-info' },
  violet: { soft: 'bg-violet-soft', ink: 'text-violet-ink', dot: 'bg-violet' },
  brand: { soft: 'bg-brand-soft', ink: 'text-brand-ink', dot: 'bg-brand' },
  neutral: { soft: 'bg-[#efefec]', ink: 'text-ink-2', dot: 'bg-ink-3' },
}

export const toneVar: Record<Tone, string> = {
  good: 'var(--color-good)',
  warn: 'var(--color-warn)',
  alert: 'var(--color-alert)',
  info: 'var(--color-info)',
  violet: 'var(--color-violet)',
  brand: 'var(--color-brand)',
  neutral: 'var(--color-ink-3)',
}

/* ── Badge / Pill ───────────────────────────────── */

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
  className,
}: {
  tone?: Tone
  children: ReactNode
  dot?: boolean
  className?: string
}) {
  const t = TONE[tone]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-[4px] px-2 py-[3px] text-[11.5px] font-medium whitespace-nowrap',
        t.soft,
        t.ink,
        className,
      )}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  )
}

/* ── Card ───────────────────────────────────────── */

export function Card({
  children,
  className,
  pad = true,
  mark = false,
  style,
}: {
  children: ReactNode
  className?: string
  pad?: boolean
  mark?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div
      style={style}
      className={cx(
        'rounded-lg border border-line bg-surface shadow-[var(--shadow-card)]',
        (pad || mark) && 'relative',
        pad && 'p-5',
        className,
      )}
    >
      {mark && <RegMark />}
      {children}
    </div>
  )
}

export function CardTitle({
  title,
  desc,
  right,
}: {
  title: ReactNode
  desc?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-[5px] h-[7px] w-[7px] shrink-0 bg-brand" />
        <div>
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          {desc && <p className="mt-0.5 text-[12.5px] text-ink-3">{desc}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

/* ── KPI stat ───────────────────────────────────── */

export function Stat({
  label,
  value,
  unit,
  sub,
  delta,
  deltaTone = 'good',
  hint,
  children,
}: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  delta?: string
  deltaTone?: Tone
  hint?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
        {label}
        {hint && (
          <span
            title={hint}
            className="grid h-3.5 w-3.5 cursor-help place-items-center rounded-full border border-line text-[9px] text-ink-4"
          >
            ?
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="tnum text-[26px] leading-none font-semibold tracking-tight text-ink">
          {value}
        </span>
        {unit && <span className="text-[13px] text-ink-3">{unit}</span>}
        {delta && (
          <span className={cx('text-[12.5px] font-medium', TONE[deltaTone].ink)}>
            {delta}
          </span>
        )}
      </div>
      {sub && <div className="mt-1.5 text-[12.5px] text-ink-3">{sub}</div>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}

/* ── Page header ────────────────────────────────── */

export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string
  desc?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[21px] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {desc && <p className="mt-1 max-w-2xl text-[13px] text-ink-3">{desc}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ── Buttons ────────────────────────────────────── */

export function Button({
  children,
  variant = 'ghost',
  onClick,
  className,
}: {
  children: ReactNode
  variant?: 'primary' | 'ghost' | 'soft'
  onClick?: () => void
  className?: string
}) {
  const base =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer select-none'
  const v =
    variant === 'primary'
      ? 'bg-brand text-white hover:bg-brand-hover shadow-[var(--shadow-brand)]'
      : variant === 'soft'
        ? 'bg-surface-sunken text-ink-2 hover:bg-[#e6e8eb]'
        : 'border border-line text-ink-2 hover:bg-surface-muted hover:text-ink'
  return (
    <button className={cx(base, v, className)} onClick={onClick}>
      {children}
    </button>
  )
}

/* ── Segmented filter ───────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors',
            value === o.value
              ? 'bg-surface-sunken text-ink shadow-[var(--shadow-card)]'
              : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Table shell ────────────────────────────────── */

export function TableShell({
  head,
  children,
  className,
}: {
  head: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[11.5px] font-medium tracking-wide text-ink-3 uppercase">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Th({
  children,
  className,
  right,
}: {
  children?: ReactNode
  className?: string
  right?: boolean
}) {
  return (
    <th
      className={cx(
        'px-3 py-2.5 font-medium',
        right && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className,
  right,
  mono,
}: {
  children?: ReactNode
  className?: string
  right?: boolean
  mono?: boolean
}) {
  return (
    <td
      className={cx(
        'px-3 py-3 align-middle text-ink-2',
        right && 'text-right',
        mono && 'tnum',
        className,
      )}
    >
      {children}
    </td>
  )
}

export function Row({
  children,
  onClick,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={cx(
        'border-b border-line/70 transition-colors last:border-0',
        onClick && 'cursor-pointer hover:bg-surface-muted',
        className,
      )}
    >
      {children}
    </tr>
  )
}

/* ── Brand mark chip ────────────────────────────── */

export function BrandMark({ mark, size = 30 }: { mark: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[7px] bg-ink font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {mark}
    </span>
  )
}

/* ── Threshold meter (value vs limit) ───────────── */

export function ThresholdBar({
  value,
  warn,
  limit,
}: {
  value: number
  warn: number
  limit: number
}) {
  const pctOf = Math.min(100, (value / limit) * 100)
  const tone: Tone = value >= limit ? 'alert' : value >= warn ? 'warn' : 'good'
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pctOf}%`, background: toneVar[tone] }}
        />
        <div
          className="absolute top-[-2px] h-[10px] w-px bg-ink-4"
          style={{ left: `${(warn / limit) * 100}%` }}
        />
      </div>
      <span className={cx('tnum w-12 shrink-0 text-right text-[12px]', TONE[tone].ink)}>
        {value.toFixed(2)}%
      </span>
    </div>
  )
}

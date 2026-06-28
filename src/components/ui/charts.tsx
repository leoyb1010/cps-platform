import { useId, useRef, useState } from 'react'
import type { Tone } from '../../lib/data'
import { toneVar } from './primitives'

/* ── Sparkline ──────────────────────────────────── */

export function Sparkline({
  data,
  tone = 'brand',
  w = 120,
  h = 32,
}: {
  data: number[]
  tone?: Tone
  w?: number
  h?: number
}) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = w / (data.length - 1)
  const pts = data.map((v, i) => [i * step, h - ((v - min) / span) * (h - 4) - 2])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke={toneVar[tone]} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.2} fill={toneVar[tone]} />
    </svg>
  )
}

/* ── Area line chart ────────────────────────────── */

export function AreaLine({
  data,
  labels,
  tone = 'brand',
  height = 200,
}: {
  data: number[]
  labels?: string[]
  tone?: Tone
  height?: number
}) {
  const id = useId().replace(/:/g, '')
  const W = 640
  const H = height
  const padL = 8
  const padR = 8
  const padB = labels ? 22 : 8
  const padT = 8
  const min = Math.min(...data) * 0.96
  const max = Math.max(...data) * 1.04
  const span = max - min || 1
  const iw = W - padL - padR
  const ih = H - padT - padB
  const step = iw / (data.length - 1)
  const x = (i: number) => padL + i * step
  const y = (v: number) => padT + ih - ((v - min) / span) * ih
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(padT + ih).toFixed(1)} L${padL},${(padT + ih).toFixed(1)} Z`
  const grid = [0, 0.25, 0.5, 0.75, 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: H }}>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={toneVar[tone]} stopOpacity={0.16} />
          <stop offset="100%" stopColor={toneVar[tone]} stopOpacity={0} />
        </linearGradient>
      </defs>
      {grid.map((g, i) => (
        <line
          key={i}
          x1={padL}
          x2={W - padR}
          y1={padT + ih * g}
          y2={padT + ih * g}
          stroke="rgba(18,18,20,0.06)"
          strokeWidth={1}
        />
      ))}
      <path d={area} fill={`url(#g-${id})`} />
      <path d={line} fill="none" stroke={toneVar[tone]} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={3} fill={toneVar[tone]} />
      {labels &&
        labels.map((l, i) =>
          i % Math.ceil(labels.length / 6) === 0 || i === labels.length - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              fontSize={10.5}
              fill="var(--color-ink-4)"
              textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
            >
              {l}
            </text>
          ) : null,
        )}
    </svg>
  )
}

/* ── Mini bars ──────────────────────────────────── */

export function Bars({
  data,
  labels,
  tone = 'info',
  height = 180,
  format = (v) => String(Math.round(v)),
}: {
  data: number[]
  labels?: string[]
  tone?: Tone
  height?: number
  format?: (v: number) => string
}) {
  const max = Math.max(...data) * 1.08 || 1
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((v, i) => (
        <div key={i} className="group flex flex-1 flex-col items-center justify-end gap-1.5">
          <span className="tnum text-[10px] text-ink-4 opacity-0 transition-opacity group-hover:opacity-100">
            {format(v)}
          </span>
          <div
            className="w-full rounded-t-[4px] transition-[height] duration-300 ease-out"
            style={{
              height: `${(v / max) * (height - 24)}px`,
              background: toneVar[tone],
              opacity: i === data.length - 1 ? 1 : 0.42,
            }}
          />
          {labels && <span className="text-[10px] text-ink-4">{labels[i]}</span>}
        </div>
      ))}
    </div>
  )
}

/* ── Donut ──────────────────────────────────────── */

export function Donut({
  items,
  size = 132,
  thickness = 16,
  center,
}: {
  items: { label: string; value: number; tone: Tone }[]
  size?: number
  thickness?: number
  center?: { value: string; label: string }
}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-sunken)" strokeWidth={thickness} />
        {items.map((it, i) => {
          const frac = it.value / total
          const dash = frac * c
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={toneVar[it.tone]}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-acc}
              strokeLinecap="butt"
            />
          )
          acc += dash
          return el
        })}
      </svg>
      <div className="space-y-1.5">
        {center && (
          <div className="mb-2">
            <div className="tnum text-[20px] font-semibold text-ink">{center.value}</div>
            <div className="text-[12px] text-ink-3">{center.label}</div>
          </div>
        )}
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-2 w-2 rounded-full" style={{ background: toneVar[it.tone] }} />
            <span className="text-ink-2">{it.label}</span>
            <span className="tnum ml-auto pl-3 font-medium text-ink">{it.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Horizontal progress meter ──────────────────── */

export function Meter({
  value,
  tone = 'good',
  animate = false,
  delay = 0,
}: {
  value: number
  tone?: Tone
  animate?: boolean
  delay?: number
}) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, value)}%`,
          background: toneVar[tone],
          transformOrigin: 'left',
          animation: animate ? `growX .8s ${delay}s cubic-bezier(.45,0,.15,1) both` : undefined,
          transition: animate ? undefined : 'width .3s',
        }}
      />
    </div>
  )
}

/* ── Half-circle instrument gauge ───────────────── */

export function Gauge({
  value,
  max,
  target,
  status,
  delay = 0.5,
  decimals = 2,
}: {
  value: number
  max: number
  target: number
  status: string
  delay?: number
  decimals?: number // 0 = 整数（信用分等），默认 2（ROI 等小数仪表）
}) {
  const cx0 = 100,
    cy = 108,
    r = 78
  const pt = (f: number) => {
    const th = Math.PI * (1 - Math.max(0, Math.min(1, f)))
    return [cx0 + r * Math.cos(th), cy - r * Math.sin(th)]
  }
  const f = Math.max(0, Math.min(1, value / max))
  const [ex, ey] = pt(f)
  // value arc subtends f×180° ≤ 180°, so large-arc-flag is always 0;
  // sweep-flag 1 traces the same upper semicircle as the track (left → top → right)
  const [tx0, ty0] = pt(target / max)
  const [tx1, ty1] = pt(target / max - 0.04)
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <svg viewBox="0 0 200 132" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      <path d="M22,108 A78,78 0 0 1 178,108" fill="none" stroke="var(--color-surface-sunken)" strokeWidth="12" strokeLinecap="round" />
      {f > 0.012 && (
        <path
          pathLength={1}
          style={{ strokeDasharray: 1, animation: `draw 1.3s ${delay}s cubic-bezier(.5,0,.2,1) both` }}
          d={`M22,108 A78,78 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)}`}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="12"
          strokeLinecap="round"
        />
      )}
      {ticks.map((tk, i) => {
        const [ax, ay] = pt(tk)
        const ux = cx0 + (r + 8) * ((ax - cx0) / r)
        const uy = cy - (r + 8) * ((cy - ay) / r)
        return <line key={i} x1={ax} y1={ay} x2={ux} y2={uy} stroke="var(--color-hairtick)" strokeWidth="1.5" />
      })}
      <text x="12" y="124" textAnchor="middle" className="tnum" fontSize="9" fill="var(--color-ink-5)">0</text>
      <text x="100" y="9" textAnchor="middle" className="tnum" fontSize="9" fill="var(--color-ink-5)">{(max / 2).toFixed(decimals)}</text>
      <text x="188" y="124" textAnchor="middle" className="tnum" fontSize="9" fill="var(--color-ink-5)">{max.toFixed(decimals)}</text>
      <line x1={tx0} y1={ty0} x2={tx1} y2={ty1} stroke="var(--color-ink)" strokeWidth="2" />
      <text x={tx0 + 8} y={ty0 + 6} className="tnum" fontSize="8.5" fill="var(--color-ink-2)">目标 {target.toFixed(decimals)}</text>
      <text x="100" y="98" textAnchor="middle" className="tnum" fontSize="34" fontWeight="700" fill="var(--color-ink)" letterSpacing="-1">
        {value.toFixed(decimals)}
      </text>
      <text x="100" y="118" textAnchor="middle" fontSize="10.5" fill="var(--color-ink-3)">{status}</text>
    </svg>
  )
}

/* ── Interactive crosshair dual-line chart ──────── */

export function CrosshairChart({
  a,
  b,
  labels,
  yMax,
  fmtA,
  fmtB,
}: {
  a: { name: string; data: number[] }
  b: { name: string; data: number[] }
  labels: string[]
  yMax: number
  fmtA: (v: number) => string
  fmtB: (v: number) => string
}) {
  const id = useId().replace(/:/g, '')
  const VBW = 588,
    VBH = 230
  const padL = 40,
    padR = 12,
    padT = 16,
    padB = 26
  const iw = VBW - padL - padR
  const ih = VBH - padT - padB
  const n = a.data.length
  const xs = a.data.map((_, i) => padL + (i * iw) / (n - 1))
  const y = (v: number) => padT + ih * (1 - v / yMax)
  const gy = a.data.map(y)
  const ny = b.data.map(y)
  const line = (ys: number[]) => ys.map((v, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${v.toFixed(1)}`).join(' ')
  const area = `${line(gy)} L${xs[n - 1].toFixed(1)},${(padT + ih).toFixed(1)} L${padL},${(padT + ih).toFixed(1)} Z`
  const grid = [1, 0.75, 0.5, 0.25]
  const boxRef = useRef<HTMLDivElement>(null)
  const [hi, setHi] = useState<number | null>(null)
  const onMove = (e: React.MouseEvent) => {
    const r = boxRef.current!.getBoundingClientRect()
    const sx = ((e.clientX - r.left) / r.width) * VBW
    let i = 0,
      best = 1e9
    xs.forEach((x, k) => {
      const d = Math.abs(x - sx)
      if (d < best) {
        best = d
        i = k
      }
    })
    setHi((prev) => (prev === i ? prev : i))
  }
  const labelIdx = (i: number) => i % 2 === 0 || i === n - 1
  return (
    <div ref={boxRef} className="relative">
      <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: '100%', height: 230, display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`cm-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-brand)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={VBW - padR} y1={padT + ih * (1 - g)} y2={padT + ih * (1 - g)} stroke="rgba(20,21,26,.07)" />
            <text x={padL - 6} y={padT + ih * (1 - g) + 3} textAnchor="end" className="tnum" fontSize="9.5" fill="var(--color-ink-5)">
              {fmtA(yMax * g)}
            </text>
          </g>
        ))}
        <path style={{ animation: `fadeIn 1s .55s both` }} d={area} fill={`url(#cm-${id})`} />
        <path pathLength={1} style={{ strokeDasharray: 1, animation: `draw 1.1s .35s cubic-bezier(.45,0,.15,1) both` }} d={line(gy)} fill="none" stroke="var(--color-brand)" strokeWidth="2" />
        <path pathLength={1} style={{ strokeDasharray: 1, animation: `draw 1.1s .55s cubic-bezier(.45,0,.15,1) both` }} d={line(ny)} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
        {hi !== null && (
          <>
            <line x1={xs[hi]} x2={xs[hi]} y1={padT} y2={padT + ih} stroke="var(--color-brand)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={xs[hi]} cy={gy[hi]} r="3.5" fill="#fff" stroke="var(--color-brand)" strokeWidth="1.8" />
            <circle cx={xs[hi]} cy={ny[hi]} r="2.8" fill="#fff" stroke="var(--color-ink)" strokeWidth="1.6" />
          </>
        )}
        {labels.map((l, i) =>
          labelIdx(i) ? (
            <text key={i} x={xs[i]} y={VBH - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="tnum" fontSize="9.5" fill="var(--color-ink-5)">
              {l}
            </text>
          ) : null,
        )}
      </svg>
      {hi !== null && (
        <div
          className="pointer-events-none absolute rounded-md bg-ink px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white"
          style={{ left: `${(xs[hi] / VBW) * 100}%`, top: gy[hi] - 14, transform: 'translate(-50%,-100%)', boxShadow: 'var(--shadow-pop)' }}
        >
          <div className="tnum mb-1 text-[10px] text-ink-5">{labels[hi]}</div>
          <div className="flex items-center gap-1.5">
            <span className="h-[2px] w-[7px] bg-brand" />
            {a.name} <span className="tnum ml-0.5 font-semibold">{fmtA(a.data[hi])}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="h-[2px] w-[7px] bg-ink-4" />
            {b.name} <span className="tnum ml-0.5 font-semibold">{fmtB(b.data[hi])}</span>
          </div>
        </div>
      )}
      <div className="absolute inset-0 cursor-crosshair" onMouseMove={onMove} onMouseLeave={() => setHi(null)} />
    </div>
  )
}

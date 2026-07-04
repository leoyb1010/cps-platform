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
  // 数据点不足（0/1 个）：除以 length-1 会得 NaN，返回同尺寸空位图
  if (data.length < 2) return <svg width={w} height={h} className="overflow-visible" />
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
  // 数据点不足（0/1 个）：除以 length-1 会得 NaN，返回同尺寸空位图
  if (data.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: H }} />
  // 加性留白（乘性 ×0.96/×1.04 在负值时反向放大，负数趋势会被裁掉）
  const min0 = Math.min(...data)
  const max0 = Math.max(...data)
  const span0 = max0 - min0 || 1
  const min = min0 - span0 * 0.04
  const max = max0 + span0 * 0.04
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
          stroke="var(--color-line)"
          strokeWidth={1}
        />
      ))}
      {min0 < 0 && max0 > 0 && (
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" strokeWidth={1} strokeDasharray="4 3" />
      )}
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
  // 空数组 Math.max(...[]) 得 -Infinity；负值柱高钳到 0，避免反向溢出
  const max = (data.length ? Math.max(...data) : 0) * 1.08 || 1
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
              height: `${Math.max(0, (v / max) * (height - 24))}px`,
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
          // 最小可视弧：非零小值(如 0.5%)不至于渲染成看不见的发丝（与 Sankey 小股保底同理）
          const dash = it.value > 0 ? Math.max(frac * c, 3) : 0
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
      {/* 目标标签：右半侧改为左置右对齐，避免目标接近 max 时与最大刻度标签相撞；y 钳制避开底部刻度 */}
      <text x={tx0 > cx0 ? tx0 - 8 : tx0 + 8} y={Math.min(ty0 + 6, 114)} textAnchor={tx0 > cx0 ? 'end' : 'start'} className="tnum" fontSize="8.5" fill="var(--color-ink-2)">目标 {target.toFixed(decimals)}</text>
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
  const boxRef = useRef<HTMLDivElement>(null)
  const [hi, setHi] = useState<number | null>(null)
  const VBW = 588,
    VBH = 230
  const padL = 40,
    padR = 12,
    padT = 16,
    padB = 26
  const iw = VBW - padL - padR
  const ih = VBH - padT - padB
  const n = a.data.length
  // 数据点不足（0/1 个）：除以 n-1 会得 NaN，返回同尺寸空位图（hooks 已全部调用完）
  if (n < 2) return <div className="relative"><svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ width: '100%', height: 230, display: 'block' }} /></div>
  const xs = a.data.map((_, i) => padL + (i * iw) / (n - 1))
  const y = (v: number) => padT + ih * (1 - v / yMax)
  const gy = a.data.map(y)
  const ny = b.data.map(y)
  const line = (ys: number[]) => ys.map((v, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${v.toFixed(1)}`).join(' ')
  const area = `${line(gy)} L${xs[n - 1].toFixed(1)},${(padT + ih).toFixed(1)} L${padL},${(padT + ih).toFixed(1)} Z`
  const grid = [1, 0.75, 0.5, 0.25]
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
      {/* preserveAspectRatio="none"：与鼠标定位/HTML tooltip 的满宽拉伸假设一致，避免非 588 宽度时 letterbox 漂移 */}
      <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ width: '100%', height: 230, display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`cm-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-brand)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={VBW - padR} y1={padT + ih * (1 - g)} y2={padT + ih * (1 - g)} stroke="var(--color-line)" />
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
            <circle cx={xs[hi]} cy={gy[hi]} r="3.5" fill="var(--color-surface)" stroke="var(--color-brand)" strokeWidth="1.8" />
            <circle cx={xs[hi]} cy={ny[hi]} r="2.8" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="1.6" />
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
          className="pointer-events-none absolute rounded-md bg-avatar px-2.5 py-1.5 text-[11px] whitespace-nowrap text-avatar-fg"
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

/* ── 资金流向 Sankey（单层分流）──────────────────
   把对账恒等式 gross = 品牌留存 + 平台费 + 代理分润 + 准备金 + 冲账 画出来：
   左一根粗流 → 右按金额分股，宽度=占比，差异股标红。这是平台最该有的一张图。 */
export function FundSankey({
  gross,
  flows,
  height = 320,
}: {
  gross: number
  flows: { label: string; value: number; tone: Tone; alert?: boolean }[]
  height?: number
}) {
  const W = 640
  const H = height
  const padY = 18
  const srcX = 24
  const srcW = 22
  const dstX = W - 232
  const nodeW = 12
  const total = Math.max(1, gross)
  const usable = H - padY * 2
  const x0 = srcX + srcW
  const x1 = dstX
  const c = (x0 + x1) / 2

  // 归一化分母：五股绝对值之和理论上 = gross（恒等式），但真实模式脏数据/并发钳零可能略超，
  // 按两者较大者归一，堆叠永不溢出画布。
  const sumFlows = flows.reduce((a, f) => a + Math.abs(f.value), 0)
  const denom = Math.max(total, sumFlows)

  // 关键：源侧与目标侧分别按占比分段。
  //  · 源侧连续铺满整根 GROSS 柱（无间隙）——缎带从这里"抽出"。
  //  · 目标侧各节点之间留 GAP，缎带收束到独立目标块，才有"分流"的形态（而非平铺矩形）。
  //  小股（如冲账 1.1%）给最小可视厚度 minH，保证细流可见；源侧按真实占比不放大，避免总高溢出。
  const GAP = 6
  const n = flows.length
  const minH = 7
  // 目标侧：先按占比算理想高度，对不足 minH 的抬到 minH，再等比压缩其余股以塞进 (usable - 总GAP)
  const dstAvail = usable - GAP * (n - 1)
  const rawH = flows.map((f) => (Math.abs(f.value) / denom) * dstAvail)
  const boosted = rawH.map((h) => Math.max(h, minH))
  const over = boosted.reduce((a, h) => a + h, 0) - dstAvail
  // 若抬升后超出，从"高于 minH 的富余部分"里按比例回收
  const slack = boosted.reduce((a, h) => a + Math.max(0, h - minH), 0)
  const dstH = boosted.map((h) => (over > 0 && slack > 0 ? h - (Math.max(0, h - minH) / slack) * over : h))

  let dacc = padY
  const dst = flows.map((f, i) => {
    const seg = { ...f, y: dacc, h: dstH[i] }
    dacc += dstH[i] + GAP
    return seg
  })

  // 源侧：连续铺满，高度按同一股的目标高度占比（保证缎带上下边不交叉）
  const srcTotalH = dstH.reduce((a, h) => a + h, 0)
  let sacc = padY
  const src = dstH.map((h) => {
    const sh = (h / srcTotalH) * usable
    const seg = { y: sacc, h: sh }
    sacc += sh
    return seg
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {/* 源节点：满高 GROSS 柱 */}
      <rect x={srcX} y={padY} width={srcW} height={usable} rx={3} fill="var(--color-ink-3)" />
      <text x={srcX} y={padY - 6} fontSize="10.5" fill="var(--color-ink-3)" className="tnum">流水 GROSS</text>
      <text x={srcX} y={padY + usable + 13} fontSize="9.5" fill="var(--color-ink-4)" className="tnum">{(gross / 1e4).toFixed(0)}万</text>

      {(() => {
        let lastLabelY = -Infinity
        return flows.map((f, i) => {
          const s = src[i]
          const d = dst[i]
          // 缎带：源侧连续区段 → 目标独立块，三次贝塞尔平滑收束（真正的 Sankey 流形）
          const p = `M${x0},${s.y} C${c},${s.y} ${c},${d.y} ${x1},${d.y} L${x1},${d.y + d.h} C${c},${d.y + d.h} ${c},${s.y + s.h} ${x0},${s.y + s.h} Z`
          const color = f.alert ? 'var(--color-alert)' : toneVar[f.tone]
          const pct = ((Math.abs(f.value) / total) * 100).toFixed(1)
          const labelY = Math.max(d.y + d.h / 2, lastLabelY + 15)
          lastLabelY = labelY + 11
          return (
            <g key={f.label}>
              {/* 缎带：实色半透明，hover 加深；细流也清晰 */}
              <path d={p} fill={color} fillOpacity={f.alert ? 0.55 : 0.4} style={{ animation: `fadeIn .55s ${0.12 + i * 0.07}s both` }}>
                <title>{f.label}：{f.value.toLocaleString('zh-CN')}（{pct}%）</title>
              </path>
              {/* 目标节点块（实色，锚定标签） */}
              <rect x={dstX} y={d.y} width={nodeW} height={d.h} rx={2} fill={color} />
              {/* 标签：名称一行 + 金额占比一行，最小 15px 间距防叠 */}
              <text x={dstX + nodeW + 9} y={labelY - 5} fontSize="11.5" fontWeight="500" fill="var(--color-ink-2)" dominantBaseline="middle">
                {f.label}
                {f.alert && <tspan fill="var(--color-alert-ink)" fontSize="9.5"> · 差异</tspan>}
              </text>
              <text x={dstX + nodeW + 9} y={labelY + 9} fontSize="10.5" fill="var(--color-ink-4)" className="tnum" dominantBaseline="middle">
                ¥{(Math.abs(f.value) / 1e4).toFixed(1)}万 · {pct}%
              </text>
            </g>
          )
        })
      })()}
    </svg>
  )
}

/* ── LTV 预测带（实线历史 + 虚线预测 + 阴影区间）────────
   对 cohort/LTV 曲线做指数衰减外推，画预测区间带，指导合约定价。纯前端。 */
export function ForecastLine({
  data,
  forecast = 3,
  labels,
  tone = 'brand',
  height = 170,
}: {
  data: number[]
  forecast?: number // 外推点数
  labels?: string[]
  tone?: Tone
  height?: number
}) {
  const id = useId().replace(/:/g, '')
  if (data.length < 2) return <svg style={{ height }} className="w-full" />
  // 末段斜率外推 + 衰减（LTV 累计增速递减）
  const last = data[data.length - 1]
  const slope = last - data[data.length - 2]
  const proj: number[] = []
  let v = last
  for (let i = 1; i <= forecast; i++) { v += slope * Math.pow(0.7, i); proj.push(+v.toFixed(1)) }
  // 预测区间带上下界也纳入 min/max，否则带子会被裁出画布
  const bandUpVals = proj.map((p, i) => p * (1 + 0.06 * (i + 1)))
  const bandDnVals = proj.map((p, i) => p * (1 - 0.06 * (i + 1)))
  const all = [...data, ...proj, ...bandUpVals, ...bandDnVals]
  const W = 640, H = height, padL = 8, padR = 8, padB = labels ? 22 : 8, padT = 8
  // 加法 padding 而非乘法（*0.96）：乘法在负值处会把边界推向错误方向、裁出画布——
  // 与 AreaLine 同口径，指到会跌负的曲线（净利润/流失率）时也不崩。
  const lo = Math.min(...all), hi = Math.max(...all)
  const pad = (hi - lo || 1) * 0.06
  const min = lo - pad
  const max = hi + pad
  const span = max - min || 1
  const iw = W - padL - padR, ih = H - padT - padB
  const step = iw / (all.length - 1)
  const x = (i: number) => padL + i * step
  const y = (val: number) => padT + ih - ((val - min) / span) * ih
  const histPts = data.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join(' ')
  const projStart = data.length - 1
  const projPts = [data[data.length - 1], ...proj].map((val, i) => `${i ? 'L' : 'M'}${x(projStart + i).toFixed(1)},${y(val).toFixed(1)}`).join(' ')
  // 预测区间带（±12% 递增不确定性）——上下界已在 min/max 归一时纳入，此处复用
  const bandUp = [data[data.length - 1], ...bandUpVals]
  const bandDn = [data[data.length - 1], ...bandDnVals]
  const bandPath = `${bandUp.map((val, i) => `${i ? 'L' : 'M'}${x(projStart + i).toFixed(1)},${y(val).toFixed(1)}`).join(' ')} ${bandDn.map((val, i) => `L${x(projStart + bandDn.length - 1 - i).toFixed(1)},${y(bandDn[bandDn.length - 1 - i]).toFixed(1)}`).join(' ')} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: H }}>
      <defs><linearGradient id={`fc-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={toneVar[tone]} stopOpacity={0.14} /><stop offset="100%" stopColor={toneVar[tone]} stopOpacity={0} /></linearGradient></defs>
      {[0, 0.5, 1].map((g, i) => <line key={i} x1={padL} x2={W - padR} y1={padT + ih * g} y2={padT + ih * g} stroke="rgba(20,21,26,.06)" />)}
      {/* 历史面积 */}
      <path d={`${histPts} L${x(projStart).toFixed(1)},${(padT + ih).toFixed(1)} L${padL},${(padT + ih).toFixed(1)} Z`} fill={`url(#fc-${id})`} />
      {/* 预测区间带 */}
      <path d={bandPath} fill={toneVar[tone]} fillOpacity={0.1} />
      {/* 历史实线 */}
      <path d={histPts} fill="none" stroke={toneVar[tone]} strokeWidth={2} strokeLinejoin="round" />
      {/* 预测虚线 */}
      <path d={projPts} fill="none" stroke={toneVar[tone]} strokeWidth={2} strokeDasharray="5 3" opacity={0.7} />
      <circle cx={x(data.length - 1)} cy={y(last)} r={3} fill={toneVar[tone]} />
      {labels && labels.map((l, i) => (i % 2 === 0 || i === labels.length - 1) ? <text key={i} x={x(i)} y={H - 6} fontSize={10} fill="var(--color-ink-4)" textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{l}</text> : null)}
    </svg>
  )
}

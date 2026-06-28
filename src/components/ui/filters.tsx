import { useRef, useState } from 'react'
import { cx } from '../../lib/format'
import { Segmented } from './primitives'
import { Popover, useAnchoredPopover } from './popover'
import { PERIOD_LABEL, type PeriodPreset, type PeriodValue } from '../../lib/period'

/* ──────────────────────────────────────────────────────────────
 * 筛选原语：FilterChips（快速筛选标签）+ PeriodFilter（周期/日期范围）
 *
 * FilterChips：可换行的圆角药丸行，单选或多选，可带计数。
 *   —— 用于多选 facet / 带计数的筛选；单枚举开关仍用 Segmented。
 * PeriodFilter：预设(今日/本周/本月/本季) 走 Segmented；自定义弹 Popover 选起止日期。
 * ────────────────────────────────────────────────────────────── */

export interface ChipOption {
  value: string
  label: string
  count?: number
}

export function FilterChips({
  options, value, onChange, multi = false, size = 'md',
}: {
  options: ChipOption[]
  value: string | string[]
  onChange: (v: string | string[]) => void
  multi?: boolean
  size?: 'sm' | 'md'
}) {
  const sel = Array.isArray(value) ? value : [value]
  const toggle = (v: string) => {
    if (multi) {
      const arr = sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]
      onChange(arr)
    } else {
      onChange(v)
    }
  }
  const pad = size === 'sm' ? 'px-2.5 py-0.5 text-[11.5px]' : 'px-3 py-1 text-[12px]'
  return (
    <div className="inline-flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = sel.includes(o.value)
        return (
          <button
            key={o.value}
            onClick={() => toggle(o.value)}
            className={cx(
              'rounded-full border transition-all',
              pad,
              on
                ? 'border-brand bg-brand/[0.06] font-medium text-brand'
                : 'border-line text-ink-3 hover:border-line-strong hover:bg-surface-muted',
            )}
          >
            {o.label}
            {o.count != null && <span className={cx('ml-1 tnum', on ? 'text-brand/70' : 'text-ink-4')}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

const DEFAULT_PRESETS: PeriodPreset[] = ['today', 'week', 'month', 'quarter', 'custom']

export function PeriodFilter({
  value, onChange, presets = DEFAULT_PRESETS,
}: {
  value: PeriodValue
  onChange: (v: PeriodValue) => void
  presets?: PeriodPreset[]
}) {
  const { open, anchorRect, openAt, close } = useAnchoredPopover()
  const [from, setFrom] = useState(value.from ?? '')
  const [to, setTo] = useState(value.to ?? '')
  const segRef = useRef<HTMLDivElement>(null)

  const onPreset = (p: PeriodPreset) => {
    if (p === 'custom') {
      // 锚到整个 Segmented 容器弹出日期选择
      if (segRef.current) openAt(segRef.current)
    } else {
      onChange({ preset: p })
    }
  }
  const apply = () => {
    if (from && to) onChange({ preset: 'custom', from, to })
    close()
  }

  return (
    <div ref={segRef} className="inline-flex items-center gap-2">
      <Segmented
        options={presets.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
        value={value.preset}
        onChange={(p) => onPreset(p as PeriodPreset)}
      />
      {value.preset === 'custom' && value.from && (
        <span className="text-[11.5px] text-ink-4">{value.from} ~ {value.to}</span>
      )}
      <Popover anchor={open ? anchorRect : null} onClose={close} width={280} placement="bottom">
        <div className="p-3.5">
          <div className="mb-2 text-[12px] font-medium text-ink-2">自定义日期范围</div>
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-4">起始</span>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-brand" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-4">截止</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-brand" />
            </label>
          </div>
          <button onClick={apply} disabled={!from || !to}
            className="mt-3 w-full rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50">
            应用
          </button>
        </div>
      </Popover>
    </div>
  )
}

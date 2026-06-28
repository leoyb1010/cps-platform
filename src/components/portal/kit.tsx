import { useEffect, useState, type ReactNode } from 'react'
import { Inbox, WifiOff, AlertCircle } from 'lucide-react'
import { Skeleton } from '../ui/primitives'
import { isRealApi } from '../../lib/http'
import { downloadText } from '../../lib/format'

// ════════════════════════════════════════════════════════════
//  客户门户公共套件 —— 两个 portal 共享，避免重复造 useReal/DemoNotice。
//  真实 API only：mock 态客户门户不渲染业务数据（避免跨租户泄漏）。
// ════════════════════════════════════════════════════════════

export type ResourceState = 'loading' | 'demo' | 'error' | 'ready'

export function usePortalResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []): {
  data: T | null
  state: ResourceState
  reload: () => void
} {
  const [data, setData] = useState<T | null>(null)
  const [state, setState] = useState<ResourceState>(isRealApi ? 'loading' : 'demo')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!isRealApi) { setState('demo'); return }
    let alive = true
    setState('loading')
    fetcher()
      .then((d) => { if (alive) { setData(d); setState('ready') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])
  return { data, state, reload: () => setTick((t) => t + 1) }
}

function Notice({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-muted px-6 py-12 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface text-ink-3">{icon}</span>
      <div className="text-[13.5px] font-semibold text-ink">{title}</div>
      <p className="mt-1 max-w-[360px] text-[12px] leading-relaxed text-ink-4">{body}</p>
    </div>
  )
}

export function DemoNotice() {
  return <Notice icon={<WifiOff size={18} />} title="演示态不可用" body="客户门户需连接真实后端（数据按账户隔离，演示态无法保证隔离）。" />
}

export function ErrorNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-muted px-6 py-12 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-alert-soft text-alert-ink"><AlertCircle size={18} /></span>
      <div className="text-[13.5px] font-semibold text-ink">加载失败</div>
      <p className="mt-1 max-w-[360px] text-[12px] leading-relaxed text-ink-4">未能获取数据，可能是网络或服务异常。</p>
      {onRetry && <button onClick={onRetry} className="mt-3 rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-hover">重试</button>}
    </div>
  )
}

export function EmptyNotice({ title = '暂无数据', body = '这里还没有内容。' }: { title?: string; body?: string }) {
  return <Notice icon={<Inbox size={18} />} title={title} body={body} />
}

// 状态机渲染：loading→骨架；demo→演示提示；error→错误+重试；ready 且空→空态；ready→children
export function PortalState<T>({
  state,
  data,
  reload,
  skeleton,
  emptyWhen,
  emptyTitle,
  children,
}: {
  state: ResourceState
  data: T | null
  reload?: () => void
  skeleton?: ReactNode
  emptyWhen?: (d: T) => boolean
  emptyTitle?: string
  children: (d: T) => ReactNode
}) {
  if (state === 'loading') return <>{skeleton ?? <DefaultSkeleton />}</>
  if (state === 'demo') return <DemoNotice />
  if (state === 'error') return <ErrorNotice onRetry={reload} />
  if (data == null) return <EmptyNotice title={emptyTitle} />
  if (emptyWhen && emptyWhen(data)) return <EmptyNotice title={emptyTitle} />
  // ready：进入动画（复用全局 .animate-in，从骨架硬切改为轻微上浮淡入），与内部页面编排基调一致
  return <div className="animate-in">{children(data)}</div>
}

export function DefaultSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2.5 h-6 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mb-2.5 h-9 w-full" />)}
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="mb-2.5 h-9 w-full" />)}
    </div>
  )
}

// CSV 导出：把行数组按列定义导出为 CSV 文本并下载
export function exportCsv<T>(filename: string, rows: T[], columns: { key: string; label: string; get: (r: T) => string | number }[]) {
  const head = columns.map((c) => c.label).join(',')
  const body = rows.map((r) => columns.map((c) => `"${String(c.get(r)).replace(/"/g, '""')}"`).join(',')).join('\n')
  downloadText(filename, head + '\n' + body)
}

// 横条排行榜：给经营看板展示 Top 渠道/品牌（值最大者占满，其余按比例）
export function TopBars({ items, fmt }: { items: { label: string; value: number }[]; fmt: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)))
  if (items.length === 0) return <div className="grid h-[120px] place-items-center text-[12px] text-ink-4">暂无数据</div>
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.label}>
          <div className="mb-1 flex items-center justify-between text-[12px]"><span className="truncate text-ink-2">{it.label}</span><span className="tnum shrink-0 text-ink-3">{fmt(it.value)}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (Math.abs(it.value) / max) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

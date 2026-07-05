import { Skeleton } from '../ui/primitives'

/**
 * 路由级 lazy chunk 加载时的内容区骨架 —— 放在布局 <main> 内的 Suspense fallback。
 * 只替换内容区（侧栏/顶栏常驻），避免整屏闪白。形态贴近常见页：标题 + KPI 行 + 表格。
 */
export function PageSkeleton() {
  return (
    <div className="animate-in">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-2 h-3.5 w-72" />
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2.5 h-7 w-24" />
            <Skeleton className="mt-3 h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="mb-2.5 h-9 w-full" />
        ))}
      </div>
    </div>
  )
}

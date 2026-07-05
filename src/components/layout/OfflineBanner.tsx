import { WifiOff, AlertTriangle } from 'lucide-react'
import { useHydrationStatus } from '../../lib/store'

/**
 * 真实模式数据水合降级提示：
 *   offline —— 服务不可达，全部集合取数失败，页面数据可能是上次缓存或空。
 *   partial —— 部分集合取数失败（网络/5xx），部分数据可能过期。
 * 演示模式(idle/ok) 不显示。放在内容区顶部，跨所有控制台/门户页生效。
 */
export function OfflineBanner() {
  const status = useHydrationStatus()
  if (status !== 'offline' && status !== 'partial') return null
  const offline = status === 'offline'
  return (
    <div
      role="alert"
      className={
        offline
          ? 'mb-4 flex items-center gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[12.5px] text-alert-ink'
          : 'mb-4 flex items-center gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-warn-ink'
      }
    >
      {offline ? <WifiOff size={15} className="shrink-0" /> : <AlertTriangle size={15} className="shrink-0" />}
      <span>
        {offline
          ? '服务暂时不可达，当前展示的可能是缓存或空数据，请稍后重试或联系管理员。'
          : '部分数据加载失败，页面信息可能不完整或过期，刷新可重试。'}
      </span>
    </div>
  )
}

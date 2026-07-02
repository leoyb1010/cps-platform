import { useAuth } from '../../lib/auth'
import { LandingWorkshop } from './LandingWorkshop'

/** 代理商「推广页工坊」—— 选平台开放推广的商品，生成带自己归因的落地页。
 * 用户扫码 / 点开下单即自动归到该代理名下（受理时归因预填），把 CPS 投流闭环缝上。 */
export function AgentLanding() {
  const user = useAuth()
  // 无归属主体不能生成归因页（兜底写死会把页面记到别的租户名下）
  if (!user?.scopeId) return <MissingScope />
  // 推广页归属品牌由所选商品推导（工坊内 publish 时确定），此处不再传 brandId
  return (
    <LandingWorkshop
      scope="agent"
      agentId={user.scopeId}
      title="推广页工坊"
      desc="选平台开放推广的商品，生成带你归因的落地页。用户扫码 / 点开下单即自动归到你名下——运营受理时归因自动预填，无需人工指认。"
    />
  )
}

function MissingScope() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-muted px-6 py-12 text-center">
      <div className="text-[13.5px] font-semibold text-ink">账号缺少归属主体</div>
      <p className="mt-1 max-w-[360px] text-[12px] leading-relaxed text-ink-4">当前账号未绑定代理主体，无法生成归因推广页。请联系平台管理员完成绑定。</p>
    </div>
  )
}

import { useAuth } from '../../lib/auth'
import { LandingWorkshop } from './LandingWorkshop'

/** 品牌方「落地页工坊」—— 自有商品自由组合，可定制主题色，生成品牌官方落地页（归因为品牌自营）。 */
export function BrandLanding() {
  const user = useAuth()
  // 无归属主体不能建页（兜底写死会把页面记到别的品牌名下）
  if (!user?.scopeId) return <MissingScope />
  return (
    <LandingWorkshop
      scope="brand"
      brandId={user.scopeId}
      agentId={null}
      title="落地页工坊"
      desc="把自有商品搭成套餐，一键生成可分享 / 可嵌入广告位的移动落地页。价格由平台实时计算，连续包月强制含合规退订模块。"
    />
  )
}

function MissingScope() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-muted px-6 py-12 text-center">
      <div className="text-[13.5px] font-semibold text-ink">账号缺少归属主体</div>
      <p className="mt-1 max-w-[360px] text-[12px] leading-relaxed text-ink-4">当前账号未绑定品牌主体，无法生成官方落地页。请联系平台管理员完成绑定。</p>
    </div>
  )
}

import { useAuth } from '../../lib/auth'
import { LandingWorkshop } from './LandingWorkshop'

/** 品牌方「落地页工坊」—— 自有商品自由组合，可定制主题色，生成品牌官方落地页（归因为品牌自营）。 */
export function BrandLanding() {
  const user = useAuth()
  const brandId = user?.scopeId ?? 'youdao'
  return (
    <LandingWorkshop
      scope="brand"
      brandId={brandId}
      agentId={null}
      title="落地页工坊"
      desc="把自有商品搭成套餐，一键生成可分享 / 可嵌入广告位的移动落地页。价格由平台实时计算，连续包月强制含合规退订模块。"
    />
  )
}

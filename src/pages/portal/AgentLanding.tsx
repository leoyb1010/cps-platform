import { useAuth } from '../../lib/auth'
import { LandingWorkshop } from './LandingWorkshop'

/** 代理商「推广页工坊」—— 选平台开放推广的商品，生成带自己归因的落地页。
 * 用户扫码 / 点开下单即自动归到该代理名下（受理时归因预填），把 CPS 投流闭环缝上。 */
export function AgentLanding() {
  const user = useAuth()
  const agentId = user?.scopeId ?? 'A-2041'
  // 代理推广页归属的品牌：演示态取有道（真实态由所选商品品牌决定，多品牌各生成一页）
  return (
    <LandingWorkshop
      scope="agent"
      brandId="youdao"
      agentId={agentId}
      title="推广页工坊"
      desc="选平台开放推广的商品，生成带你归因的落地页。用户扫码 / 点开下单即自动归到你名下——运营受理时归因自动预填，无需人工指认。"
    />
  )
}

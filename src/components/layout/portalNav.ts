import { LayoutDashboard, Receipt, Landmark, Package, MessageSquareWarning, FileSignature, Store, Megaphone, TrendingUp, Gauge, Repeat, Sparkles, LayoutTemplate, type LucideIcon } from 'lucide-react'

export interface PortalNavItem {
  to: string
  label: string
  icon: LucideIcon
  perm: string
}

// 品牌方门户导航（只含品牌客户该看的页，全部走 portal.brand.* 权限）
export const BRAND_NAV: PortalNavItem[] = [
  { to: '/portal/brand', label: '我的经营', icon: LayoutDashboard, perm: 'portal.brand.home' },
  { to: '/portal/brand/orders', label: '我的订单', icon: Receipt, perm: 'portal.brand.orders' },
  { to: '/portal/brand/settlement', label: '我的结算单', icon: Landmark, perm: 'portal.brand.settlement' },
  { to: '/portal/brand/onboarding', label: '我的入驻', icon: Package, perm: 'portal.brand.onboarding' },
  { to: '/portal/brand/tickets', label: '我的工单', icon: MessageSquareWarning, perm: 'portal.brand.tickets' },
  { to: '/portal/brand/products', label: '我的商品', icon: Package, perm: 'portal.brand.products' },
  { to: '/portal/brand/landing', label: '套餐落地页', icon: LayoutTemplate, perm: 'portal.brand.products' },
  { to: '/portal/brand/contracts', label: '我的增长合约', icon: FileSignature, perm: 'portal.brand.contracts' },
  { to: '/portal/brand/barter', label: '资源置换', icon: Repeat, perm: 'portal.brand.contracts' },
  { to: '/portal/brand/aigc', label: 'AIGC 素材', icon: Sparkles, perm: 'portal.aigc' },
]

// 代理商门户导航（只含代理客户该看的页，全部走 portal.agent.* 权限）
export const AGENT_NAV: PortalNavItem[] = [
  { to: '/portal/agent', label: '我的投放', icon: LayoutDashboard, perm: 'portal.agent.home' },
  { to: '/portal/agent/market', label: '选品市场', icon: Store, perm: 'portal.agent.market' },
  { to: '/portal/agent/plans', label: '我的投放计划', icon: Megaphone, perm: 'portal.agent.plans' },
  { to: '/portal/agent/payouts', label: '我的分润', icon: TrendingUp, perm: 'portal.agent.payouts' },
  { to: '/portal/agent/credit', label: '我的信用分', icon: Gauge, perm: 'portal.agent.credit' },
  { to: '/portal/agent/contracts', label: '我的接单', icon: FileSignature, perm: 'portal.agent.contracts' },
  { to: '/portal/agent/tickets', label: '相关工单', icon: MessageSquareWarning, perm: 'portal.agent.tickets' },
  { to: '/portal/agent/aigc', label: 'AIGC 素材', icon: Sparkles, perm: 'portal.aigc' },
]

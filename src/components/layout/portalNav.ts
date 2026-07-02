import { LayoutDashboard, Receipt, Landmark, Package, MessageSquareWarning, FileSignature, Store, Megaphone, TrendingUp, Gauge, Repeat, Sparkles, LayoutTemplate, Webhook, LayoutGrid, BarChart3, type LucideIcon } from 'lucide-react'

export interface PortalNavItem {
  to: string
  label: string
  icon: LucideIcon
  perm: string
}
export interface PortalNavGroup {
  title: string
  items: PortalNavItem[]
}

// 品牌方门户导航（分组：我的经营 / 商品与投放 / 资源平台 / AIGC 创作 / 接入与开发）。
// 分组是「参与什么业务」的心智地图——查自己 vs 参与平台开放业务 一目了然。一项不减。
export const BRAND_NAV_GROUPS: PortalNavGroup[] = [
  {
    title: '我的经营',
    items: [
      { to: '/portal/brand', label: '经营总览', icon: LayoutDashboard, perm: 'portal.brand.home' },
      { to: '/portal/brand/orders', label: '我的订单', icon: Receipt, perm: 'portal.brand.orders' },
      { to: '/portal/brand/settlement', label: '我的结算单', icon: Landmark, perm: 'portal.brand.settlement' },
      { to: '/portal/brand/tickets', label: '我的工单', icon: MessageSquareWarning, perm: 'portal.brand.tickets' },
    ],
  },
  {
    title: '商品与投放',
    items: [
      { to: '/portal/brand/products', label: '我的商品', icon: Package, perm: 'portal.brand.products' },
      { to: '/portal/brand/landing', label: '落地页工坊', icon: LayoutTemplate, perm: 'portal.brand.products' },
      { to: '/portal/brand/insights', label: '投放透视', icon: BarChart3, perm: 'portal.brand.orders' },
    ],
  },
  {
    title: '资源平台',
    items: [
      { to: '/portal/brand/plaza', label: '资源广场', icon: LayoutGrid, perm: 'portal.brand.contracts' },
      { to: '/portal/brand/contracts', label: '我的增长合约', icon: FileSignature, perm: 'portal.brand.contracts' },
      { to: '/portal/brand/barter', label: '资源置换', icon: Repeat, perm: 'portal.brand.contracts' },
    ],
  },
  {
    title: 'AIGC 创作',
    items: [{ to: '/portal/brand/aigc', label: 'AIGC 素材', icon: Sparkles, perm: 'portal.aigc' }],
  },
  {
    title: '接入与开发',
    items: [
      { to: '/portal/brand/onboarding', label: '我的入驻', icon: Package, perm: 'portal.brand.onboarding' },
      { to: '/portal/brand/developer', label: '开发者中心', icon: Webhook, perm: 'portal.brand.developer' },
    ],
  },
]

// 代理商门户导航（分组：我的经营 / 接单大厅 / 投放工具）。
// 「接单大厅」把 CPS 领链接 与 合约接单 归为同一"找活"心智。一项不减。
export const AGENT_NAV_GROUPS: PortalNavGroup[] = [
  {
    title: '我的经营',
    items: [
      { to: '/portal/agent', label: '我的投放', icon: LayoutDashboard, perm: 'portal.agent.home' },
      { to: '/portal/agent/payouts', label: '我的分润', icon: TrendingUp, perm: 'portal.agent.payouts' },
      { to: '/portal/agent/credit', label: '我的信用分', icon: Gauge, perm: 'portal.agent.credit' },
      { to: '/portal/agent/tickets', label: '相关工单', icon: MessageSquareWarning, perm: 'portal.agent.tickets' },
    ],
  },
  {
    title: '接单大厅',
    items: [
      { to: '/portal/agent/market', label: '选品市场', icon: Store, perm: 'portal.agent.market' },
      { to: '/portal/agent/contracts', label: '增长合约接单', icon: FileSignature, perm: 'portal.agent.contracts' },
      { to: '/portal/agent/landing', label: '推广页工坊', icon: LayoutTemplate, perm: 'portal.agent.market' },
    ],
  },
  {
    title: '投放工具',
    items: [
      { to: '/portal/agent/plans', label: '我的投放计划', icon: Megaphone, perm: 'portal.agent.plans' },
      { to: '/portal/agent/aigc', label: 'AIGC 素材', icon: Sparkles, perm: 'portal.aigc' },
    ],
  },
]

// 扁平列表（向后兼容：App.tsx 若仍按平铺引用）
export const BRAND_NAV: PortalNavItem[] = BRAND_NAV_GROUPS.flatMap((g) => g.items)
export const AGENT_NAV: PortalNavItem[] = AGENT_NAV_GROUPS.flatMap((g) => g.items)

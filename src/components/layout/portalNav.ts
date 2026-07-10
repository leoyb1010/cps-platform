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
  defaultOpen?: boolean
}

// 高频日常默认展开；增长、合作和接入等低频能力按需展开，避免一次铺满全部入口。
export const BRAND_NAV_GROUPS: PortalNavGroup[] = [
  {
    title: '日常工作',
    defaultOpen: true,
    items: [
      { to: '/portal/brand', label: '经营总览', icon: LayoutDashboard, perm: 'portal.brand.home' },
      { to: '/portal/brand/tickets', label: '我的工单', icon: MessageSquareWarning, perm: 'portal.brand.tickets' },
      { to: '/portal/brand/products', label: '我的商品', icon: Package, perm: 'portal.brand.products' },
      { to: '/portal/brand/orders', label: '我的订单', icon: Receipt, perm: 'portal.brand.orders' },
      { to: '/portal/brand/settlement', label: '我的结算单', icon: Landmark, perm: 'portal.brand.settlement' },
    ],
  },
  {
    title: '增长工具',
    items: [
      { to: '/portal/brand/landing', label: '落地页工坊', icon: LayoutTemplate, perm: 'portal.brand.products' },
      { to: '/portal/brand/insights', label: '投放透视', icon: BarChart3, perm: 'portal.brand.orders' },
      { to: '/portal/brand/aigc', label: 'AIGC 素材', icon: Sparkles, perm: 'portal.aigc' },
    ],
  },
  {
    title: '合作业务',
    items: [
      { to: '/portal/brand/plaza', label: '资源广场', icon: LayoutGrid, perm: 'portal.brand.contracts' },
      { to: '/portal/brand/contracts', label: '我的增长合约', icon: FileSignature, perm: 'portal.brand.contracts' },
      { to: '/portal/brand/barter', label: '资源置换', icon: Repeat, perm: 'portal.brand.contracts' },
    ],
  },
  {
    title: '接入设置',
    items: [
      { to: '/portal/brand/onboarding', label: '入驻进度', icon: Package, perm: 'portal.brand.onboarding' },
      { to: '/portal/brand/developer', label: '开发者中心', icon: Webhook, perm: 'portal.brand.developer' },
    ],
  },
]

// 代理商先看日常结果与待办，再进入找项目；低频制作工具折叠收纳。
export const AGENT_NAV_GROUPS: PortalNavGroup[] = [
  {
    title: '日常工作',
    defaultOpen: true,
    items: [
      { to: '/portal/agent', label: '我的投放', icon: LayoutDashboard, perm: 'portal.agent.home' },
      { to: '/portal/agent/plans', label: '投放计划', icon: Megaphone, perm: 'portal.agent.plans' },
      { to: '/portal/agent/payouts', label: '我的分润', icon: TrendingUp, perm: 'portal.agent.payouts' },
      { to: '/portal/agent/tickets', label: '相关工单', icon: MessageSquareWarning, perm: 'portal.agent.tickets' },
    ],
  },
  {
    title: '找项目',
    defaultOpen: true,
    items: [
      { to: '/portal/agent/market', label: '选品市场', icon: Store, perm: 'portal.agent.market' },
      { to: '/portal/agent/contracts', label: '增长合约接单', icon: FileSignature, perm: 'portal.agent.contracts' },
    ],
  },
  {
    title: '账户与工具',
    items: [
      { to: '/portal/agent/credit', label: '我的信用分', icon: Gauge, perm: 'portal.agent.credit' },
      { to: '/portal/agent/landing', label: '推广页工坊', icon: LayoutTemplate, perm: 'portal.agent.market' },
      { to: '/portal/agent/aigc', label: 'AIGC 素材', icon: Sparkles, perm: 'portal.aigc' },
    ],
  },
]

// 扁平列表（向后兼容：App.tsx 若仍按平铺引用）
export const BRAND_NAV: PortalNavItem[] = BRAND_NAV_GROUPS.flatMap((g) => g.items)
export const AGENT_NAV: PortalNavItem[] = AGENT_NAV_GROUPS.flatMap((g) => g.items)

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

// 客户门户同样按工作目标分类，避免把内部领域模型直接暴露给客户。
export const BRAND_NAV_GROUPS: PortalNavGroup[] = [
  {
    title: '今日工作',
    defaultOpen: true,
    items: [
      { to: '/portal/brand', label: '今日概览', icon: LayoutDashboard, perm: 'portal.brand.home' },
      { to: '/portal/brand/tickets', label: '工单', icon: MessageSquareWarning, perm: 'portal.brand.tickets' },
      { to: '/portal/brand/orders', label: '订单', icon: Receipt, perm: 'portal.brand.orders' },
      { to: '/portal/brand/settlement', label: '结算', icon: Landmark, perm: 'portal.brand.settlement' },
    ],
  },
  {
    title: '商品与增长',
    items: [
      { to: '/portal/brand/products', label: '商品管理', icon: Package, perm: 'portal.brand.products' },
      { to: '/portal/brand/landing', label: '推广页', icon: LayoutTemplate, perm: 'portal.brand.products' },
      { to: '/portal/brand/insights', label: '投放分析', icon: BarChart3, perm: 'portal.brand.orders' },
      { to: '/portal/brand/aigc', label: '素材中心', icon: Sparkles, perm: 'portal.aigc' },
    ],
  },
  {
    title: '合作与接入',
    items: [
      { to: '/portal/brand/plaza', label: '合作广场', icon: LayoutGrid, perm: 'portal.brand.contracts' },
      { to: '/portal/brand/contracts', label: '增长合约', icon: FileSignature, perm: 'portal.brand.contracts' },
      { to: '/portal/brand/barter', label: '资源置换', icon: Repeat, perm: 'portal.brand.contracts' },
      { to: '/portal/brand/onboarding', label: '接入进度', icon: Package, perm: 'portal.brand.onboarding' },
      { to: '/portal/brand/developer', label: '开发接入', icon: Webhook, perm: 'portal.brand.developer' },
    ],
  },
]

// 代理商先看日常结果与待办，再进入找项目；低频制作工具折叠收纳。
export const AGENT_NAV_GROUPS: PortalNavGroup[] = [
  {
    title: '今日工作',
    defaultOpen: true,
    items: [
      { to: '/portal/agent', label: '今日投放', icon: LayoutDashboard, perm: 'portal.agent.home' },
      { to: '/portal/agent/plans', label: '投放计划', icon: Megaphone, perm: 'portal.agent.plans' },
      { to: '/portal/agent/payouts', label: '分润提现', icon: TrendingUp, perm: 'portal.agent.payouts' },
      { to: '/portal/agent/tickets', label: '工单', icon: MessageSquareWarning, perm: 'portal.agent.tickets' },
    ],
  },
  {
    title: '找业务',
    items: [
      { to: '/portal/agent/market', label: '选品', icon: Store, perm: 'portal.agent.market' },
      { to: '/portal/agent/contracts', label: '合作接单', icon: FileSignature, perm: 'portal.agent.contracts' },
    ],
  },
  {
    title: '工具与账户',
    items: [
      { to: '/portal/agent/credit', label: '信用与账户', icon: Gauge, perm: 'portal.agent.credit' },
      { to: '/portal/agent/landing', label: '推广页', icon: LayoutTemplate, perm: 'portal.agent.market' },
      { to: '/portal/agent/aigc', label: '素材中心', icon: Sparkles, perm: 'portal.aigc' },
    ],
  },
]

// 扁平列表（向后兼容：App.tsx 若仍按平铺引用）
export const BRAND_NAV: PortalNavItem[] = BRAND_NAV_GROUPS.flatMap((g) => g.items)
export const AGENT_NAV: PortalNavItem[] = AGENT_NAV_GROUPS.flatMap((g) => g.items)

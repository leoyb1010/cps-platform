import {
  LayoutDashboard,
  Package,
  Store,
  Users,
  Receipt,
  Landmark,
  CreditCard,
  ShieldAlert,
  MessageSquareWarning,
  Scale,
  BarChart3,
  Settings,
  UsersRound,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: string
  perm?: string // RBAC: hide item if current role lacks this permission
}
export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    title: '概览',
    items: [{ to: '/', label: '经营总览', icon: LayoutDashboard, perm: 'dashboard.view' }],
  },
  {
    title: '业务',
    items: [
      { to: '/brands', label: '品牌管理', icon: Package, perm: 'brand.read' },
      { to: '/marketplace', label: '选品市场', icon: Store, perm: 'market.view' },
      { to: '/agents', label: '代理商', icon: Users, perm: 'agent.read' },
    ],
  },
  {
    title: '交易与资金',
    items: [
      { to: '/orders', label: '订单 · 订阅', icon: Receipt, perm: 'order.read' },
      { to: '/settlement', label: '清结算', icon: Landmark, perm: 'settlement.read' },
      { to: '/merchants', label: '商户号 · 号池', icon: CreditCard, perm: 'merchant.read' },
    ],
  },
  {
    title: '风控与合规',
    items: [
      { to: '/risk', label: '风控中心', icon: ShieldAlert, perm: 'risk.read' },
      { to: '/complaints', label: '投诉工单', icon: MessageSquareWarning, badge: '3', perm: 'ticket.read' },
      { to: '/compliance', label: '资金合规', icon: Scale, perm: 'compliance.view' },
    ],
  },
  {
    title: '数据',
    items: [{ to: '/analytics', label: '数据 · 归因', icon: BarChart3, perm: 'analytics.view' }],
  },
  {
    title: '系统',
    items: [
      { to: '/members', label: '成员与角色', icon: UsersRound, perm: 'member.manage' },
      { to: '/audit', label: '操作审计', icon: ScrollText, perm: 'audit.read' },
      { to: '/settings', label: '配置中心', icon: Settings, perm: 'config.write' },
    ],
  },
]

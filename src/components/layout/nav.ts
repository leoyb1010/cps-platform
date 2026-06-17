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
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: string
}
export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    title: '概览',
    items: [{ to: '/', label: '经营总览', icon: LayoutDashboard }],
  },
  {
    title: '业务',
    items: [
      { to: '/brands', label: '品牌管理', icon: Package },
      { to: '/marketplace', label: '选品市场', icon: Store },
      { to: '/agents', label: '代理商', icon: Users },
    ],
  },
  {
    title: '交易与资金',
    items: [
      { to: '/orders', label: '订单 · 订阅', icon: Receipt },
      { to: '/settlement', label: '清结算', icon: Landmark },
      { to: '/merchants', label: '商户号 · 号池', icon: CreditCard },
    ],
  },
  {
    title: '风控与合规',
    items: [
      { to: '/risk', label: '风控中心', icon: ShieldAlert },
      { to: '/complaints', label: '投诉工单', icon: MessageSquareWarning, badge: '3' },
      { to: '/compliance', label: '资金合规', icon: Scale },
    ],
  },
  {
    title: '数据',
    items: [{ to: '/analytics', label: '数据 · 归因', icon: BarChart3 }],
  },
  {
    title: '系统',
    items: [{ to: '/settings', label: '配置中心', icon: Settings }],
  },
]

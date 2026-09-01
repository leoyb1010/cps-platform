import {
  LayoutDashboard,
  Package,
  Store,
  Users,
  Receipt,
  FileSignature,
  Landmark,
  CreditCard,
  ShieldAlert,
  BarChart3,
  Settings,
  UsersRound,
  ScrollText,
  Repeat,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: string
  perm?: string // RBAC: hide item if current role lacks this permission
  anyPerm?: string[] // 任一权限命中即显示（给合并工作台用，如风控合规）
  activeMatch?: string[] // 这些路径下该项也高亮（工作台多路由共用一个入口）
}
export interface NavGroup {
  title: string
  items: NavItem[]
}

// 导航按用户要完成的工作分类，而不是按内部商业模式/领域模型分类。
// 侧栏采用单组展开：能力完整保留，但默认只暴露当前任务相关入口。
export const NAV: NavGroup[] = [
  { title: '工作台', items: [{ to: '/', label: '今日工作', icon: LayoutDashboard, perm: 'dashboard.view' }] },
  {
    title: '业务增长',
    items: [
      { to: '/brands', label: '品牌管理', icon: Package, perm: 'brand.read' },
      { to: '/products', label: '订阅商品', icon: Package, perm: 'product.read', activeMatch: ['/products', '/supermarket'] },
      { to: '/marketplace', label: '选品与投放', icon: Store, perm: 'market.view' },
      { to: '/agents', label: '代理商', icon: Users, perm: 'agent.read' },
      { to: '/orders', label: '订单与订阅', icon: Receipt, perm: 'order.read' },
      { to: '/analytics', label: '经营分析', icon: BarChart3, perm: 'analytics.view' },
    ],
  },
  {
    title: '资金与风险',
    items: [
      { to: '/settlement', label: '清结算', icon: Landmark, perm: 'settlement.read' },
      { to: '/merchants', label: '商户号与号池', icon: CreditCard, perm: 'merchant.read' },
      {
        to: '/risk',
        label: '风险与工单',
        icon: ShieldAlert,
        badge: '3',
        anyPerm: ['risk.read', 'ticket.read', 'compliance.view'],
        activeMatch: ['/risk', '/complaints', '/compliance'],
      },
    ],
  },
  {
    title: '合作工具',
    items: [
      { to: '/contracts', label: '增长合约', icon: FileSignature, perm: 'contract.read' },
      { to: '/barter', label: '资源置换', icon: Repeat, perm: 'barter.view' },
      { to: '/aigc', label: '素材中心', icon: Sparkles, perm: 'aigc.view' },
    ],
  },
  {
    title: '平台管理',
    items: [
      { to: '/members', label: '成员与权限', icon: UsersRound, perm: 'member.manage' },
      { to: '/audit', label: '操作审计', icon: ScrollText, perm: 'audit.read' },
      { to: '/settings', label: '平台设置', icon: Settings, perm: 'config.write' },
    ],
  },
]

// 扁平索引：按路径找导航项（"常用置顶"用——用户 pin 的 to 反查 item 渲染）
export const NAV_BY_TO: Record<string, NavItem> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((it) => [it.to, it]),
)

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
  Megaphone,
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
  kind?: 'board' | 'platform' // board = 一级业务板块；platform = 共享中台
}

// 五个分组：概览 → CPS 自营投流 → 交易模式 → 接入与资金 → 风控合规 → 系统。
// 合并单项分组（增长合约/资源置换/AIGC 收进「交易模式」；品牌入驻并入「接入与资金」），
// 降低"板块很多"的感知复杂度。按权限过滤后空组自动隐藏。
export const NAV: NavGroup[] = [
  // 概览
  { title: '概览', kind: 'platform', items: [{ to: '/', label: '经营总览', icon: LayoutDashboard, perm: 'dashboard.view' }] },

  // ── CPS 自营投流（自营闭环）──
  {
    title: 'CPS 自营投流',
    kind: 'board',
    items: [
      { to: '/marketplace', label: '选品市场', icon: Store, perm: 'market.view' },
      { to: '/agents', label: '代理商', icon: Users, perm: 'agent.read' },
      { to: '/orders', label: '订单 · 订阅', icon: Receipt, perm: 'order.read' },
      { to: '/analytics', label: '数据 · 归因', icon: BarChart3, perm: 'analytics.view' },
    ],
  },

  // ── 交易模式（自营之外的其它交易/履约形态）──
  {
    title: '交易模式',
    kind: 'board',
    items: [
      { to: '/contracts', label: '增长合约', icon: FileSignature, perm: 'contract.read' },
      { to: '/barter', label: '资源置换', icon: Repeat, perm: 'barter.view' },
      { to: '/aigc', label: 'AIGC 素材', icon: Sparkles, perm: 'aigc.view' },
      { to: '/products', label: '订阅商品', icon: Package, perm: 'product.read', activeMatch: ['/products', '/supermarket'] },
    ],
  },

  // ── 接入与资金（品牌入驻 → 开商户号 → 清结算，同一条资金接入链路）──
  {
    title: '接入与资金',
    kind: 'platform',
    items: [
      { to: '/brands', label: '品牌 · 入驻', icon: Package, perm: 'brand.read' },
      { to: '/settlement', label: '清结算', icon: Landmark, perm: 'settlement.read' },
      { to: '/merchants', label: '商户号 · 号池', icon: CreditCard, perm: 'merchant.read' },
    ],
  },

  // ── 风控合规（事前拦截 / 事后处置 / 资金合规 三切面合一工作台）──
  {
    title: '风控合规',
    kind: 'platform',
    items: [
      {
        to: '/risk',
        label: '风控合规',
        icon: ShieldAlert,
        badge: '3',
        anyPerm: ['risk.read', 'ticket.read', 'compliance.view'],
        activeMatch: ['/risk', '/complaints', '/compliance'],
      },
    ],
  },

  // ── 系统（低频配置 / 审计）──
  {
    title: '系统',
    kind: 'platform',
    items: [
      { to: '/members', label: '成员与角色', icon: UsersRound, perm: 'member.manage' },
      { to: '/audit', label: '操作审计', icon: ScrollText, perm: 'audit.read' },
      { to: '/settings', label: '配置中心', icon: Settings, perm: 'config.write' },
    ],
  },
]

// 板块名 → 图标（菜单分组标题旁的小图标，标识这是个业务板块）
export const BOARD_ICON: Record<string, LucideIcon> = {
  'CPS 自营投流': Megaphone,
  '交易模式': FileSignature,
}

// 扁平索引：按路径找导航项（"常用置顶"用——用户 pin 的 to 反查 item 渲染）
export const NAV_BY_TO: Record<string, NavItem> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((it) => [it.to, it]),
)

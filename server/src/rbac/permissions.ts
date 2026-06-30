// 权限点字典 + 角色预设 —— 与前端 src/lib/auth.ts 保持一致（单一可信源应由后端导出）。

export interface PermDef {
  key: string
  label: string
  group: string
}

export const PERMISSIONS: PermDef[] = [
  { key: 'dashboard.view', label: '查看经营总览', group: '概览' },
  { key: 'brand.read', label: '查看品牌', group: '业务' },
  { key: 'brand.write', label: '编辑/审核品牌', group: '业务' },
  { key: 'agent.read', label: '查看代理', group: '业务' },
  { key: 'agent.write', label: '代理审核/风控处置', group: '业务' },
  { key: 'market.view', label: '选品市场', group: '业务' },
  { key: 'order.read', label: '查看订单', group: '交易与资金' },
  { key: 'order.refund', label: '退款/退订', group: '交易与资金' },
  { key: 'contract.read', label: '查看增长合约', group: '交易与资金' },
  { key: 'contract.write', label: '创建/接单增长合约', group: '交易与资金' },
  { key: 'barter.view', label: '资源置换台账', group: '业务板块' },
  { key: 'aigc.view', label: 'AIGC 素材实验', group: '业务板块' },
  { key: 'settlement.read', label: '查看清结算', group: '交易与资金' },
  { key: 'settlement.clear', label: '发起结算/核销/提现', group: '交易与资金' },
  { key: 'merchant.read', label: '查看号池', group: '交易与资金' },
  { key: 'merchant.write', label: '号池状态干预/配置', group: '交易与资金' },
  { key: 'risk.read', label: '查看风控', group: '风控与合规' },
  { key: 'risk.write', label: '风控规则/名单', group: '风控与合规' },
  { key: 'ticket.read', label: '查看工单', group: '风控与合规' },
  { key: 'ticket.handle', label: '处理工单/退款', group: '风控与合规' },
  { key: 'compliance.view', label: '资金合规', group: '风控与合规' },
  { key: 'analytics.view', label: '数据归因', group: '数据' },
  { key: 'config.write', label: '平台配置', group: '系统' },
  { key: 'member.manage', label: '成员与角色', group: '系统' },
  { key: 'audit.read', label: '操作审计', group: '系统' },
  { key: 'product.read', label: '订阅商品查看/审核', group: '交易与资金' },
  { key: 'product.write', label: '订阅商品审核/规则', group: '交易与资金' },
  { key: 'barter.write', label: '资源置换创建/流转', group: '业务板块' },
]

// 内部权限点（super = 全部内部权限）。客户门户权限点单列，不并入此集，
// 以保持 super 的内部权限计数稳定，且让「客户能打哪些端点」在路由表上一眼可见。
export const ALL_PERMS = PERMISSIONS.map((p) => p.key)

// 客户门户专属权限点（品牌方 / 代理商）。完全独立于内部权限点：
// 客户角色只持有这些，绝不持有任何内部权限点 → 即便伪造前端路由进内部页，
// 拉数端点（标内部权限点）会被 PermsGuard 直接 403（纵深防御第二道）。
export const PORTAL_PERMISSIONS: PermDef[] = [
  { key: 'portal.brand.home', label: '品牌门户首页', group: '客户门户' },
  { key: 'portal.brand.orders', label: '品牌-我的订单', group: '客户门户' },
  { key: 'portal.brand.settlement', label: '品牌-我的结算单(脱敏)', group: '客户门户' },
  { key: 'portal.brand.onboarding', label: '品牌-我的入驻', group: '客户门户' },
  { key: 'portal.brand.tickets', label: '品牌-我的工单', group: '客户门户' },
  { key: 'portal.brand.contracts', label: '品牌-我的增长合约', group: '客户门户' },
  { key: 'portal.agent.home', label: '代理门户首页', group: '客户门户' },
  { key: 'portal.agent.market', label: '代理-选品市场', group: '客户门户' },
  { key: 'portal.agent.plans', label: '代理-我的投放计划', group: '客户门户' },
  { key: 'portal.agent.payouts', label: '代理-我的分润', group: '客户门户' },
  { key: 'portal.agent.credit', label: '代理-我的信用分', group: '客户门户' },
  { key: 'portal.agent.contracts', label: '代理-我的接单', group: '客户门户' },
  { key: 'portal.agent.tickets', label: '代理-相关工单', group: '客户门户' }, // 代理可见自己渠道的工单并协助处理

  { key: 'portal.brand.products', label: '品牌-我的订阅商品', group: '客户门户' }, // 品牌上架订阅商品
  { key: 'portal.brand.developer', label: '品牌-开发者中心(对接)', group: '客户门户' }, // CPS 连续包月对接：凭证/回调/联调日志
  { key: 'portal.aigc', label: '客户-AIGC 素材生成', group: '客户门户' }, // 品牌/代理共用的素材能力
]
export const BRAND_PERMS = [...PORTAL_PERMISSIONS.filter((p) => p.key.startsWith('portal.brand.')).map((p) => p.key), 'portal.aigc']
export const AGENT_PERMS = [...PORTAL_PERMISSIONS.filter((p) => p.key.startsWith('portal.agent.')).map((p) => p.key), 'portal.aigc']

export interface RolePreset {
  id: string
  name: string
  description: string
  permissions: string[]
}

export const ROLE_PRESETS: RolePreset[] = [
  { id: 'super', name: '平台超级管理员', description: '全部权限', permissions: ALL_PERMS },
  {
    id: 'finance',
    name: '财务 / 清结算',
    description: '结算·对账·提现·发票',
    permissions: ['dashboard.view', 'order.read', 'contract.read', 'settlement.read', 'settlement.clear', 'analytics.view', 'audit.read'],
  },
  {
    id: 'risk',
    name: '风控 / 售后',
    description: '风控·工单·退款·名单·号池',
    permissions: ['dashboard.view', 'risk.read', 'risk.write', 'ticket.read', 'ticket.handle', 'order.read', 'order.refund', 'merchant.read', 'merchant.write', 'compliance.view'],
  },
  {
    id: 'ops',
    name: '运营',
    description: '品牌·代理·选品·数据',
    permissions: ['dashboard.view', 'brand.read', 'brand.write', 'agent.read', 'agent.write', 'market.view', 'analytics.view', 'order.read', 'contract.read', 'contract.write', 'barter.view', 'aigc.view'],
  },
  {
    id: 'audit',
    name: '只读审计',
    description: '全部只读 + 审计',
    permissions: ['dashboard.view', 'brand.read', 'agent.read', 'order.read', 'contract.read', 'settlement.read', 'merchant.read', 'risk.read', 'ticket.read', 'compliance.view', 'analytics.view', 'audit.read'],
  },
  {
    // 团队管理员：可管理成员(读 + 停用)，但无 super 权限——用于验证「不可自我提权到 super」
    id: 'teamadmin',
    name: '团队管理员',
    description: '成员只读 + 停用，但不可改角色权限',
    permissions: ['dashboard.view', 'member.manage', 'audit.read'],
  },
  // ── 客户角色（只持客户门户权限，绝不含内部权限点）──
  {
    id: 'brand',
    name: '品牌方',
    description: '品牌客户门户：我的订单/结算/入驻/工单/合约',
    permissions: BRAND_PERMS,
  },
  {
    id: 'agent',
    name: '代理商',
    description: '代理客户门户：选品/投放/分润/信用分/接单',
    permissions: AGENT_PERMS,
  },
]

// 演示账户（密码统一为 demo，真实环境由用户设置）
export const SEED_USERS = [
  { id: 'U-001', name: '李运营', account: 'admin', roleId: 'super', scopeType: 'platform', scopeId: null },
  { id: 'U-002', name: '周财务', account: 'finance', roleId: 'finance', scopeType: 'platform', scopeId: null },
  { id: 'U-003', name: '陈风控', account: 'risk', roleId: 'risk', scopeType: 'platform', scopeId: null },
  { id: 'U-004', name: '王运营', account: 'ops', roleId: 'ops', scopeType: 'platform', scopeId: null },
  { id: 'U-005', name: '赵审计', account: 'audit', roleId: 'audit', scopeType: 'platform', scopeId: null },
  // 客户门户账户：品牌方 / 代理商各自专属角色 + scope 收窄到自己
  { id: 'U-006', name: '有道品牌方', account: 'brand', roleId: 'brand', scopeType: 'brand', scopeId: 'youdao' },
  { id: 'U-007', name: '代理 A-2041', account: 'agent', roleId: 'agent', scopeType: 'agent', scopeId: 'A-2041' },
  // 品牌方+只读审计角色（有 merchant.read/settlement.read）：用于验证「即使有读权限，scope 仍收窄」
  { id: 'U-008', name: '有道审计', account: 'brandaudit', roleId: 'audit', scopeType: 'brand', scopeId: 'youdao' },
  // 团队管理员（有 member.manage 非 super）：用于验证不可自我提权
  { id: 'U-009', name: '王管理', account: 'teamadmin', roleId: 'teamadmin', scopeType: 'platform', scopeId: null },
]

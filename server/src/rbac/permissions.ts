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
]

export const ALL_PERMS = PERMISSIONS.map((p) => p.key)

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
    permissions: ['dashboard.view', 'order.read', 'settlement.read', 'settlement.clear', 'analytics.view', 'audit.read'],
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
    permissions: ['dashboard.view', 'brand.read', 'brand.write', 'agent.read', 'agent.write', 'market.view', 'analytics.view', 'order.read'],
  },
  {
    id: 'audit',
    name: '只读审计',
    description: '全部只读 + 审计',
    permissions: ['dashboard.view', 'brand.read', 'agent.read', 'order.read', 'settlement.read', 'merchant.read', 'risk.read', 'ticket.read', 'compliance.view', 'analytics.view', 'audit.read'],
  },
  {
    // 团队管理员：可管理成员(读 + 停用)，但无 super 权限——用于验证「不可自我提权到 super」
    id: 'teamadmin',
    name: '团队管理员',
    description: '成员只读 + 停用，但不可改角色权限',
    permissions: ['dashboard.view', 'member.manage', 'audit.read'],
  },
]

// 演示账户（密码统一为 demo，真实环境由用户设置）
export const SEED_USERS = [
  { id: 'U-001', name: '李运营', account: 'admin', roleId: 'super', scopeType: 'platform', scopeId: null },
  { id: 'U-002', name: '周财务', account: 'finance', roleId: 'finance', scopeType: 'platform', scopeId: null },
  { id: 'U-003', name: '陈风控', account: 'risk', roleId: 'risk', scopeType: 'platform', scopeId: null },
  { id: 'U-004', name: '王运营', account: 'ops', roleId: 'ops', scopeType: 'platform', scopeId: null },
  { id: 'U-005', name: '赵审计', account: 'audit', roleId: 'audit', scopeType: 'platform', scopeId: null },
  // 数据级 RBAC 演示：品牌方账户只见自己品牌；代理账户只见自己
  { id: 'U-006', name: '有道品牌方', account: 'brand', roleId: 'ops', scopeType: 'brand', scopeId: 'youdao' },
  { id: 'U-007', name: '代理 A-2041', account: 'agent', roleId: 'ops', scopeType: 'agent', scopeId: 'A-2041' },
  // 品牌方+只读审计角色（有 merchant.read/settlement.read）：用于验证「即使有读权限，scope 仍收窄」
  { id: 'U-008', name: '有道审计', account: 'brandaudit', roleId: 'audit', scopeType: 'brand', scopeId: 'youdao' },
  // 团队管理员（有 member.manage 非 super）：用于验证不可自我提权
  { id: 'U-009', name: '王管理', account: 'teamadmin', roleId: 'teamadmin', scopeType: 'platform', scopeId: null },
]

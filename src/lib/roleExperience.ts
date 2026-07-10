import type { RoleId } from './auth'

export interface RoleExperience {
  navLabel: string
  eyebrow: string
  title: string
  description: string
  primaryLabel: string
  primaryTo: string
  readOnly?: boolean
  fullOverview?: boolean
}

export const ROLE_EXPERIENCE: Record<RoleId, RoleExperience> = {
  super: {
    navLabel: '经营总览',
    eyebrow: '平台全局',
    title: '经营总览',
    description: '先看跨业务风险与待办，再检查经营结果和资金健康。',
    primaryLabel: '本期结算预览',
    primaryTo: '/settlement',
    fullOverview: true,
  },
  finance: {
    navLabel: '财务工作台',
    eyebrow: '财务 / 清结算',
    title: '财务工作台',
    description: '先核对差异，再完成结算、提现与资金留痕。',
    primaryLabel: '进入清结算',
    primaryTo: '/settlement',
  },
  risk: {
    navLabel: '风控工作台',
    eyebrow: '风控 / 售后',
    title: '风控工作台',
    description: '优先处理临期投诉和号池告警，再复核退款与合规风险。',
    primaryLabel: '进入风控合规',
    primaryTo: '/risk',
  },
  ops: {
    navLabel: '运营工作台',
    eyebrow: '平台运营',
    title: '运营工作台',
    description: '围绕品牌、代理和订单推进投放，异常代理直接进入运营处置。',
    primaryLabel: '进入代理运营',
    primaryTo: '/agents',
  },
  audit: {
    navLabel: '审计工作台',
    eyebrow: '只读审计',
    title: '审计工作台',
    description: '只读核查业务异常、资金差异和关键操作记录，不执行处置动作。',
    primaryLabel: '查看操作审计',
    primaryTo: '/audit',
    readOnly: true,
    fullOverview: true,
  },
  teamadmin: {
    navLabel: '团队管理',
    eyebrow: '团队管理员',
    title: '团队管理',
    description: '查看成员与角色，停用或恢复团队账号，并核查关键操作记录。',
    primaryLabel: '管理成员状态',
    primaryTo: '/members',
  },
  brand: {
    navLabel: '品牌门户',
    eyebrow: '品牌方',
    title: '品牌门户',
    description: '管理商品、订单、结算和接入进度。',
    primaryLabel: '管理商品',
    primaryTo: '/portal/brand/products',
  },
  agent: {
    navLabel: '代理门户',
    eyebrow: '代理商',
    title: '代理门户',
    description: '选品、领取投放并查看分润和信用表现。',
    primaryLabel: '去选品投放',
    primaryTo: '/portal/agent/market',
  },
}

type Can = (permission: string) => boolean

/** 将总览里的下钻目标收窄到当前角色真正可达的页面。 */
export function resolveDashboardTarget(to: string, can: Can): string | null {
  if (to.startsWith('/risk/incident/')) {
    if (can('merchant.write')) return to
    return can('merchant.read') ? '/merchants' : null
  }
  if (to === '/risk') {
    if (can('risk.read') || can('ticket.read') || can('compliance.view')) return to
    return can('agent.read') ? '/agents' : null
  }
  if (to === '/complaints') return can('risk.read') || can('ticket.read') || can('compliance.view') ? to : null
  if (to === '/compliance') return can('compliance.view') ? to : null
  if (to === '/settlement/run') {
    if (can('settlement.clear')) return to
    return can('settlement.read') ? '/settlement' : null
  }
  if (to === '/settlement') return can('settlement.read') ? to : null
  if (to === '/merchants') return can('merchant.read') ? to : null
  if (to === '/agents') return can('agent.read') ? to : null
  if (to === '/orders') return can('order.read') ? to : null
  if (to === '/brands' || to.startsWith('/brands/')) return can('brand.read') ? to : null
  if (to === '/analytics') return can('analytics.view') ? to : null
  if (to === '/audit') return can('audit.read') ? to : null
  if (to === '/members') return can('member.manage') ? to : null
  if (to === '/') return can('dashboard.view') ? to : null
  return null
}

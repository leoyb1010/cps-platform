// ════════════════════════════════════════════════════════════════
//  账户 / 鉴权 / RBAC —— 双模式
//  · VITE_API_MODE=real：调真实后端 /auth/*（JWT + httpOnly refresh），
//    权限点以服务端返回为准；登录态由 access token(内存) + refresh(cookie) 维持。
//  · 否则：演示态(前端 mock + localStorage)，接口形态与后端一致。
// ════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from 'react'
import { http, isRealApi, setAccessToken } from './http'

/* ── 权限点字典（与 v4 §4 一致，按业务域分组） ── */
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
const ALL = PERMISSIONS.map((p) => p.key)

/* ── 角色 → 权限点（与 v4 §4 预设角色一致） ── */
export type RoleId = 'super' | 'finance' | 'risk' | 'ops' | 'audit'
export interface Role {
  id: RoleId
  name: string
  desc: string
  perms: string[]
}
export const ROLES: Record<RoleId, Role> = {
  super: { id: 'super', name: '平台超级管理员', desc: '全部权限', perms: ALL },
  finance: {
    id: 'finance',
    name: '财务 / 清结算',
    desc: '结算·对账·提现·发票',
    perms: ['dashboard.view', 'order.read', 'settlement.read', 'settlement.clear', 'analytics.view', 'audit.read'],
  },
  risk: {
    id: 'risk',
    name: '风控 / 售后',
    desc: '风控·工单·退款·名单·号池',
    perms: ['dashboard.view', 'risk.read', 'risk.write', 'ticket.read', 'ticket.handle', 'order.read', 'order.refund', 'merchant.read', 'merchant.write', 'compliance.view'],
  },
  ops: {
    id: 'ops',
    name: '运营',
    desc: '品牌·代理·选品·数据',
    perms: ['dashboard.view', 'brand.read', 'brand.write', 'agent.read', 'agent.write', 'market.view', 'analytics.view', 'order.read'],
  },
  audit: {
    id: 'audit',
    name: '只读审计',
    desc: '全部只读 + 审计',
    perms: ['dashboard.view', 'brand.read', 'agent.read', 'order.read', 'settlement.read', 'merchant.read', 'risk.read', 'ticket.read', 'compliance.view', 'analytics.view', 'audit.read'],
  },
}

export interface User {
  id: string
  name: string
  account: string
  roleId: RoleId
  permissions?: string[] // 真实后端模式下由服务端下发，优先于本地角色映射
  scopeType?: string
  scopeId?: string | null
}
// 演示账户（真实环境由后端校验密码哈希）
export const DEMO_USERS: User[] = [
  { id: 'U-001', name: '李运营', account: 'admin', roleId: 'super' },
  { id: 'U-002', name: '周财务', account: 'finance', roleId: 'finance' },
  { id: 'U-003', name: '陈风控', account: 'risk', roleId: 'risk' },
  { id: 'U-004', name: '王运营', account: 'ops', roleId: 'ops' },
  { id: 'U-005', name: '赵审计', account: 'audit', roleId: 'audit' },
]

/* ── session store (external, persisted) ── */
const KEY = 'cps-auth-v1'
let current: User | null = (() => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
})()
const listeners = new Set<() => void>()
function emit() {
  listeners.forEach((l) => l())
}
function persist() {
  try {
    if (current) localStorage.setItem(KEY, JSON.stringify(current))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

function setUser(u: User | null) {
  current = u
  persist()
  emit()
}

/** 真实模式：调用 /auth/login，存 access token + 服务端用户/权限。失败抛出可读错误。 */
export async function login(account: string, password = 'demo'): Promise<User> {
  if (isRealApi) {
    const r = await http.post<{ access: string; user: User }>('/auth/login', { account, password })
    setAccessToken(r.access)
    setUser(r.user)
    return r.user
  }
  const u = DEMO_USERS.find((x) => x.account === account) ?? DEMO_USERS[0]
  setUser(u)
  return u
}

export async function logout() {
  if (isRealApi) {
    await http.post('/auth/logout').catch(() => {})
    setAccessToken(null)
  }
  setUser(null)
}

/** 真实模式：角色切换需后端改成员角色；此处演示态直接本地切换以便体验权限差异。 */
export function switchRole(roleId: RoleId) {
  if (!current) return
  setUser({ ...current, roleId, permissions: ROLES[roleId].perms, name: DEMO_USERS.find((u) => u.roleId === roleId)?.name ?? current.name })
}

/** 应用启动时：真实模式用 refresh cookie 静默换取登录态；返回是否已登录。 */
export async function bootstrapAuth(): Promise<boolean> {
  if (!isRealApi) return current != null
  try {
    const r = await http.post<{ access: string; user: User }>('/auth/refresh')
    setAccessToken(r.access)
    setUser(r.user)
    return true
  } catch {
    setUser(null)
    return false
  }
}

export function useAuth() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => current,
  )
}

/* ── permission helpers ── */
export function permsOf(u: User | null): Set<string> {
  if (!u) return new Set()
  // 真实后端下发的权限点优先；否则回退到本地角色映射
  if (u.permissions && u.permissions.length) return new Set(u.permissions)
  return new Set(ROLES[u.roleId]?.perms ?? [])
}
export function useCan() {
  const u = useAuth()
  const set = permsOf(u)
  return (perm?: string) => (perm ? set.has(perm) : true)
}

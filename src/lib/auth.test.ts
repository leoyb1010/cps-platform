import { describe, it, expect } from 'vitest'
import { permsOf, ROLES, PERMISSIONS, DEMO_USERS, type User } from './auth'

const userWith = (roleId: User['roleId']): User => ({ id: 'x', name: 'x', account: 'x', roleId })

describe('RBAC · permsOf', () => {
  it('super 拥有全部权限点', () => {
    const set = permsOf(userWith('super'))
    expect(set.size).toBe(PERMISSIONS.length)
    expect(set.has('config.write')).toBe(true)
    expect(set.has('member.manage')).toBe(true)
  })

  it('finance 有结算、无品牌写', () => {
    const set = permsOf(userWith('finance'))
    expect(set.has('settlement.clear')).toBe(true)
    expect(set.has('brand.write')).toBe(false)
    expect(set.has('config.write')).toBe(false)
  })

  it('audit 全只读 + 审计，无任何写权限', () => {
    const set = permsOf(userWith('audit'))
    expect(set.has('audit.read')).toBe(true)
    expect([...set].some((p) => p.endsWith('.write') || p.endsWith('.clear') || p.endsWith('.handle') || p.endsWith('.refund'))).toBe(false)
  })

  it('null 用户 → 空权限集', () => {
    expect(permsOf(null).size).toBe(0)
  })

  it('服务端下发的 permissions 优先于本地角色映射', () => {
    const u: User = { ...userWith('audit'), permissions: ['x.custom', 'y.custom'] }
    const set = permsOf(u)
    expect(set.has('x.custom')).toBe(true)
    expect(set.has('audit.read')).toBe(false) // 不再回退到角色映射
  })
})

describe('RBAC · 角色与演示账户一致性', () => {
  it('每个演示账户的 roleId 都能在 ROLES 找到', () => {
    for (const u of DEMO_USERS) expect(ROLES[u.roleId]).toBeTruthy()
  })
  it('权限点 key 唯一', () => {
    const keys = PERMISSIONS.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

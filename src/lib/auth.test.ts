import { describe, it, expect } from 'vitest'
import { login, permsOf, ROLES, PERMISSIONS, DEMO_USERS, shouldHydratePlatformStore, type User } from './auth'

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

  it('仅平台账号水合内部控制台 store，门户账号不拉后台接口', () => {
    expect(shouldHydratePlatformStore(userWith('super'))).toBe(true)
    expect(shouldHydratePlatformStore({ ...userWith('brand'), scopeType: 'brand' })).toBe(false)
    expect(shouldHydratePlatformStore({ ...userWith('agent'), scopeType: 'agent' })).toBe(false)
  })

  it('服务端下发的 permissions 优先于本地角色映射', () => {
    const u: User = { ...userWith('audit'), permissions: ['x.custom', 'y.custom'] }
    const set = permsOf(u)
    expect(set.has('x.custom')).toBe(true)
    expect(set.has('audit.read')).toBe(false) // 不再回退到角色映射
  })

  it('服务端明确下发空权限时保持空集，不回退到本地角色', () => {
    const set = permsOf({ ...userWith('brand'), permissions: [] })
    expect(set.size).toBe(0)
    expect(set.has('portal.brand.home')).toBe(false)
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
  it('门户演示账户带 scope（brand→youdao / agent→A-2041），与服务端种子对齐', () => {
    const brand = DEMO_USERS.find((u) => u.account === 'brand')
    const agent = DEMO_USERS.find((u) => u.account === 'agent')
    expect(brand?.scopeType).toBe('brand')
    expect(brand?.scopeId).toBe('youdao')
    expect(agent?.scopeType).toBe('agent')
    expect(agent?.scopeId).toBe('A-2041')
  })
})

describe('演示登录 · 凭证校验（曾经任意账号静默回退成超管）', () => {
  it('未知账号被拒绝，而非回退为 admin', async () => {
    await expect(login('hacker', 'demo')).rejects.toThrow(/账号不存在/)
  })
  it('已知账号 + 错误密码被拒绝', async () => {
    await expect(login('admin', 'wrong')).rejects.toThrow(/密码错误/)
  })
  it('正确凭证登录成功且返回对应用户', async () => {
    const u = await login('finance', 'demo')
    expect(u.account).toBe('finance')
    expect(u.roleId).toBe('finance')
  })
})

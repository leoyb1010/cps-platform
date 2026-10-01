import { describe, expect, it } from 'vitest'
import { buildMemberUpdatePayload, canManageMember, canAssignRole } from './memberAccess'

describe('member update payload', () => {
  it('team administrators manage customers but never internal staff or themselves', () => {
    const team = { id: 'team', roleId: 'teamadmin', scopeType: 'platform' }
    expect(canManageMember(team, { id: 'brand', roleId: 'brand', scopeType: 'brand' })).toBe(true)
    expect(canManageMember(team, { id: 'finance', roleId: 'finance', scopeType: 'platform' })).toBe(false)
    expect(canManageMember(team, { id: 'team', roleId: 'teamadmin', scopeType: 'platform' })).toBe(false)
    expect(canManageMember({ ...team, scopeType: 'brand' }, { id: 'brand', roleId: 'brand', scopeType: 'brand' })).toBe(false)
  })
  it('role choices preserve scope and retain an existing scoped auditor', () => {
    expect(canAssignRole('finance', 'brand', 'brand')).toBe(false)
    expect(canAssignRole('brand', 'platform', 'ops')).toBe(false)
    expect(canAssignRole('agent', 'brand', 'brand')).toBe(false)
    expect(canAssignRole('ops', 'platform', 'finance')).toBe(true)
    expect(canAssignRole('audit', 'brand', 'audit')).toBe(true)
    expect(canAssignRole('super', 'platform', 'ops')).toBe(false)
  })
  it('团队管理员停用成员时不夹带角色字段', () => {
    expect(buildMemberUpdatePayload(
      { roleId: 'audit', status: 'active' },
      { roleId: 'audit', status: 'disabled' },
      false,
    )).toEqual({ status: 'disabled' })
  })

  it('超级管理员可单独修改角色', () => {
    expect(buildMemberUpdatePayload(
      { roleId: 'audit', status: 'active' },
      { roleId: 'ops', status: 'active' },
      true,
    )).toEqual({ roleId: 'ops' })
  })

  it('没有变化时不发送空更新', () => {
    expect(buildMemberUpdatePayload(
      { roleId: 'audit', status: 'active' },
      { roleId: 'audit', status: 'active' },
      false,
    )).toEqual({})
  })
})

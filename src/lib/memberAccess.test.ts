import { describe, expect, it } from 'vitest'
import { buildMemberUpdatePayload } from './memberAccess'

describe('member update payload', () => {
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

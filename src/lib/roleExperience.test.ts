import { describe, expect, it } from 'vitest'
import { ROLE_EXPERIENCE, resolveDashboardTarget } from './roleExperience'
import { ROLES, type RoleId } from './auth'

const canFor = (role: RoleId) => {
  const permissions = new Set(ROLES[role].perms)
  return (permission: string) => permissions.has(permission)
}

describe('role experience', () => {
  it('每个角色都有明确且不同于空白页的首页定位', () => {
    for (const role of Object.keys(ROLES) as RoleId[]) {
      expect(ROLE_EXPERIENCE[role].title).toBeTruthy()
      expect(ROLE_EXPERIENCE[role].primaryTo).toMatch(/^\//)
    }
  })

  it('财务看不到号池入口，但可进入结算执行页', () => {
    expect(resolveDashboardTarget('/merchants', canFor('finance'))).toBeNull()
    expect(resolveDashboardTarget('/settlement/run', canFor('finance'))).toBe('/settlement/run')
  })

  it('运营的代理风险待办回到代理页，而不是无权限风控页', () => {
    expect(resolveDashboardTarget('/risk', canFor('ops'))).toBe('/agents')
  })

  it('只读审计不能进处置现场和结算执行页，只能进入只读列表', () => {
    expect(resolveDashboardTarget('/risk/incident/M-1', canFor('audit'))).toBe('/merchants')
    expect(resolveDashboardTarget('/settlement/run', canFor('audit'))).toBe('/settlement')
  })

  it('团队管理员不获得业务下钻入口', () => {
    expect(resolveDashboardTarget('/merchants', canFor('teamadmin'))).toBeNull()
    expect(resolveDashboardTarget('/risk', canFor('teamadmin'))).toBeNull()
  })
})

export function buildMemberUpdatePayload(
  current: { roleId: string; status: string },
  next: { roleId: string; status: string },
  canChangeRole: boolean,
): { roleId?: string; status?: string } {
  return {
    ...(canChangeRole && next.roleId !== current.roleId ? { roleId: next.roleId } : {}),
    ...(next.status !== current.status ? { status: next.status } : {}),
  }
}

export function canManageMember(
  actor: { id: string; roleId: string; scopeType?: string } | null,
  member: { id: string; roleId: string; scopeType: string },
): boolean {
  if (!actor || (actor.scopeType ?? 'platform') !== 'platform' || actor.id === member.id || member.roleId === 'super') return false
  return actor.roleId === 'super' || (actor.roleId === 'teamadmin' && member.scopeType !== 'platform')
}

export function canAssignRole(roleId: string, scopeType: string, currentRoleId: string): boolean {
  if (roleId === 'super') return false
  if (roleId === currentRoleId) return true // preserve legacy scoped auditor accounts
  const requiredScope = roleId === 'brand' ? 'brand' : roleId === 'agent' ? 'agent' : 'platform'
  return requiredScope === scopeType
}

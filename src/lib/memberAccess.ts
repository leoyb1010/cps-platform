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

import { Body, Controller, Get, Patch, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'
import { PrismaService } from '../prisma.service'
import { RequirePerms } from '../rbac/rbac'
import { PERMISSIONS } from '../rbac/permissions'

class UpdateMemberDto {
  @IsOptional() @IsString() roleId?: string
  @IsOptional() @IsIn(['active', 'disabled']) status?: string
}

class UpdateRoleDto {
  @IsString({ each: true }) permissions!: string[]
}

@ApiTags('rbac')
@Controller()
export class MembersController {
  constructor(private prisma: PrismaService) {}

  @Get('permissions')
  @RequirePerms('member.manage')
  @ApiOperation({ summary: '权限点字典' })
  perms() {
    return PERMISSIONS
  }

  @Get('roles')
  @RequirePerms('member.manage')
  @ApiOperation({ summary: '角色列表（含权限点）' })
  async roles() {
    const rs = await this.prisma.role.findMany({ orderBy: { id: 'asc' } })
    return rs.map((r) => ({ ...r, permissions: JSON.parse(r.permissions || '[]') }))
  }

  @Patch('roles/:id')
  @RequirePerms('member.manage')
  @ApiOperation({ summary: '更新角色权限（超级管理员不可改）' })
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    if (id === 'super') return { ok: false, detail: '超级管理员权限不可修改' }
    await this.prisma.role.update({ where: { id }, data: { permissions: JSON.stringify(dto.permissions) } })
    return { ok: true, detail: `角色 ${id} 权限已更新` }
  }

  @Get('members')
  @RequirePerms('member.manage')
  @ApiOperation({ summary: '成员列表' })
  async members() {
    const us = await this.prisma.user.findMany({ include: { role: true }, orderBy: { id: 'asc' } })
    return us.map((u) => ({ id: u.id, name: u.name, account: u.account, roleId: u.roleId, roleName: u.role.name, status: u.status, scopeType: u.scopeType }))
  }

  @Patch('members/:id')
  @RequirePerms('member.manage')
  @ApiOperation({ summary: '更新成员角色 / 停用' })
  async updateMember(@Param('id') id: string, @Body() dto: UpdateMemberDto) {
    await this.prisma.user.update({ where: { id }, data: { ...(dto.roleId ? { roleId: dto.roleId } : {}), ...(dto.status ? { status: dto.status } : {}) } })
    return { ok: true, detail: `成员 ${id} 已更新` }
  }
}

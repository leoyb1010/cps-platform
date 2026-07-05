import { Body, Controller, ForbiddenException, Get, Patch, Param, Post } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { randomUUID } from 'crypto'
import * as argon2 from 'argon2'
import { PrismaService } from '../prisma.service'
import { RequirePerms, CurrentUser, type AuthUser } from '../rbac/rbac'
import { PERMISSIONS, PORTAL_PERMISSIONS } from '../rbac/permissions'

const VALID_PERMS = new Set([...PERMISSIONS, ...PORTAL_PERMISSIONS].map((p) => p.key))

class UpdateMemberDto {
  @IsOptional() @IsString() roleId?: string
  @IsOptional() @IsIn(['active', 'disabled']) status?: string
}

class UpdateRoleDto {
  @IsArray() @IsString({ each: true }) permissions!: string[]
}

class CreateMemberDto {
  @IsString() @MaxLength(40) name!: string
  @IsString() @MaxLength(40) account!: string
  @IsString() roleId!: string
  @IsIn(['platform', 'brand', 'agent']) scopeType!: string
  @IsOptional() @IsString() scopeId?: string
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
  @ApiOperation({ summary: '更新角色权限（仅超管；超级管理员角色不可改）' })
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: AuthUser) {
    // 角色/权限变更是最高信任操作：仅 super 可执行，避免 member.manage 成为提权万能键
    if (user.roleId !== 'super') throw new ForbiddenException('仅超级管理员可修改角色权限')
    if (id === 'super') return { ok: false, detail: '超级管理员权限不可修改' }
    const target = await this.prisma.role.findUnique({ where: { id } })
    if (!target) return { ok: false, detail: '角色不存在' }
    // 仅允许已知权限点，拒绝注入未定义权限
    const bad = dto.permissions.filter((p) => !VALID_PERMS.has(p))
    if (bad.length) throw new ForbiddenException(`未知权限点：${bad.join(', ')}`)
    await this.prisma.role.update({ where: { id }, data: { permissions: JSON.stringify([...new Set(dto.permissions)]) } })
    return { ok: true, detail: `角色 ${id} 权限已更新` }
  }

  @Get('members')
  @RequirePerms('member.manage')
  @ApiOperation({ summary: '成员列表' })
  async members() {
    const us = await this.prisma.user.findMany({ include: { role: true }, orderBy: { id: 'asc' } })
    return us.map((u) => ({ id: u.id, name: u.name, account: u.account, roleId: u.roleId, roleName: u.role.name, status: u.status, scopeType: u.scopeType, scopeId: u.scopeId }))
  }

  @Post('members')
  @RequirePerms('member.manage')
  @ApiOperation({ summary: '邀请制建号（含客户账户）：仅超管，强校验角色↔scope 匹配 + scopeId 存在' })
  async createMember(@Body() dto: CreateMemberDto, @CurrentUser() user: AuthUser) {
    if (user.roleId !== 'super') throw new ForbiddenException('仅超级管理员可创建成员')
    if (dto.roleId === 'super') throw new ForbiddenException('不可经此端点创建超级管理员')
    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } })
    if (!role) return { ok: false, detail: '目标角色不存在' }

    // 客户角色强制 scopeType 匹配 + scopeId 必须指向存活实体（防越权号：brand 角色却 platform scope）
    if (dto.roleId === 'brand') {
      if (dto.scopeType !== 'brand' || !dto.scopeId) throw new ForbiddenException('品牌角色必须 scopeType=brand 且提供 scopeId')
      const b = await this.prisma.brand.findFirst({ where: { id: dto.scopeId, deletedAt: null } })
      if (!b) return { ok: false, detail: `品牌 ${dto.scopeId} 不存在` }
    } else if (dto.roleId === 'agent') {
      if (dto.scopeType !== 'agent' || !dto.scopeId) throw new ForbiddenException('代理角色必须 scopeType=agent 且提供 scopeId')
      const a = await this.prisma.agent.findFirst({ where: { id: dto.scopeId, deletedAt: null } })
      if (!a) return { ok: false, detail: `代理 ${dto.scopeId} 不存在` }
    } else if (dto.scopeType !== 'platform') {
      throw new ForbiddenException('内部角色必须 scopeType=platform')
    }

    const exists = await this.prisma.user.findFirst({ where: { account: dto.account } })
    if (exists) return { ok: false, detail: `账号 ${dto.account} 已存在` }

    // 生成一次性临时密码（argon2 哈希存库，明文仅在响应返回一次供运营转交，不落日志）
    const tempPassword = randomUUID().slice(0, 10)
    const passwordHash = await argon2.hash(tempPassword)
    const id = 'U-' + randomUUID().slice(0, 8)
    await this.prisma.user.create({
      // 临时密码 → 首登强制改密：受邀人拿到一次性口令后必须改，杜绝临时密码长期有效
      data: { id, name: dto.name, account: dto.account, passwordHash, roleId: dto.roleId, scopeType: dto.scopeType, scopeId: dto.scopeId ?? null, mustChangePassword: true },
    })
    return { ok: true, detail: `已创建 ${dto.account}`, id, tempPassword }
  }

  @Patch('members/:id')
  @RequirePerms('member.manage')
  @ApiOperation({ summary: '更新成员角色 / 停用（防自我提权）' })
  async updateMember(@Param('id') id: string, @Body() dto: UpdateMemberDto, @CurrentUser() user: AuthUser) {
    // 防自我提权 / 自我停用：不能编辑自己的成员记录
    if (id === user.id) throw new ForbiddenException('不能修改自己的角色或状态')

    const data: Record<string, unknown> = {}
    if (dto.roleId) {
      // 仅 super 可变更成员角色；任何人都不得通过此端点赋予 super（super 仅由种子/DBA 设定）
      if (user.roleId !== 'super') throw new ForbiddenException('仅超级管理员可变更成员角色')
      if (dto.roleId === 'super') throw new ForbiddenException('不可经此端点赋予超级管理员')
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } })
      if (!role) return { ok: false, detail: '目标角色不存在' }
      data.roleId = dto.roleId
    }
    if (dto.status) data.status = dto.status
    if (Object.keys(data).length === 0) return { ok: false, detail: '无可更新字段' }

    // 角色/状态变更后 bump token 版本：该成员旧 access token(含旧角色/权限) 立即失效
    data.tokenVersion = { increment: 1 }
    await this.prisma.user.update({ where: { id }, data })
    return { ok: true, detail: `成员 ${id} 已更新` }
  }
}

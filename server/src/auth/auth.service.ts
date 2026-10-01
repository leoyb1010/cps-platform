import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as argon2 from 'argon2'
import { createHash, randomBytes } from 'crypto'
import { PrismaService } from '../prisma.service'
import type { AuthUser } from '../rbac/rbac'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
  ) {}

  private sha256(s: string) {
    return createHash('sha256').update(s).digest('hex')
  }

  // 抹平用户名枚举时序：用户不存在/停用时也跑一次等价 argon2 校验，避免「找不到用户」提前返回泄露时延差。
  // dummy hash 惰性生成一次并缓存（口令随机、永不匹配），后续校验耗时与真实路径一致。
  private dummyHash: string | null = null
  private async getDummyHash(): Promise<string> {
    if (!this.dummyHash) this.dummyHash = await argon2.hash(randomBytes(16).toString('hex'))
    return this.dummyHash
  }

  async toAuthUser(userId: string): Promise<AuthUser | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } })
    if (!u || u.status !== 'active') return null
    // 角色可能指向已删除/缺失的角色 → 视为无权限，避免 JSON.parse(null) 抛 500
    const permissions = u.role ? (JSON.parse(u.role.permissions || '[]') as string[]) : []
    return {
      id: u.id,
      name: u.name,
      account: u.account,
      roleId: u.roleId,
      permissions,
      scopeType: u.scopeType,
      scopeId: u.scopeId,
      mustChangePassword: u.mustChangePassword,
    }
  }

  /** 当前用户的 token 版本（用于 access token 即时失效校验）。 */
  async tokenVersionOf(userId: string): Promise<number | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true, status: true } })
    if (!u || u.status !== 'active') return null
    return u.tokenVersion
  }

  /**
   * AuthGuard 专用：一次查询取回鉴权所需全部信息（用户 + 角色权限 + tokenVersion）。
   * 每个受保护请求原本要查两次库（tokenVersionOf + toAuthUser），在高并发下把用户表读放大一倍——
   * 压测显示认证读是主要 DB 压力来源之一。合并为单次 findUnique。
   */
  async loadForAuth(userId: string): Promise<{ user: AuthUser; tokenVersion: number } | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } })
    if (!u || u.status !== 'active') return null
    // 角色可能指向已删除/缺失的角色 → 视为无权限，避免 JSON.parse(null) 抛 500
    const permissions = u.role ? (JSON.parse(u.role.permissions || '[]') as string[]) : []
    return {
      tokenVersion: u.tokenVersion,
      user: {
        id: u.id,
        name: u.name,
        account: u.account,
        roleId: u.roleId,
        permissions,
        scopeType: u.scopeType,
        scopeId: u.scopeId,
        mustChangePassword: u.mustChangePassword,
      },
    }
  }

  async validate(account: string, password: string) {
    const u = await this.prisma.user.findUnique({ where: { account } })
    if (!u || u.status !== 'active') {
      // 对不存在/停用账号也执行一次等价 argon2 校验，抹平时延，防用户名枚举
      await argon2.verify(await this.getDummyHash(), password).catch(() => false)
      throw new UnauthorizedException('账号或密码错误')
    }
    const ok = await argon2.verify(u.passwordHash, password).catch(() => false)
    if (!ok) throw new UnauthorizedException('账号或密码错误')
    return u
  }

  /**
   * 改密：校验旧密码 → 写新哈希 + 清除首登强制改密标记 → 吊销全部会话（含本次）。
   * 吊销全会话是安全动作：改密通常因怀疑泄露或首登，作废所有旧令牌可断掉潜在盗用会话。
   * 前端改密成功后需以新密码重新登录。
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!u || u.status !== 'active') throw new UnauthorizedException('账号状态异常')
    const ok = await argon2.verify(u.passwordHash, oldPassword).catch(() => false)
    if (!ok) throw new BadRequestException('原密码错误')
    if (await argon2.verify(u.passwordHash, newPassword).catch(() => false)) {
      throw new BadRequestException('新密码不能与原密码相同')
    }
    const passwordHash = await argon2.hash(newPassword)
    await this.prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({where:{id:userId,status:'active',passwordHash:u.passwordHash,tokenVersion:u.tokenVersion},data:{passwordHash,mustChangePassword:false,tokenVersion:{increment:1}}})
      if (changed.count !== 1) throw new UnauthorizedException('账号状态已变更，请重新登录')
      await tx.refreshToken.updateMany({where:{userId,revoked:false},data:{revoked:true}})
    })
    return { ok: true }
  }

  async signAccess(user: AuthUser, expectedVersion?: number) {
    const tv = expectedVersion ?? await this.tokenVersionOf(user.id)
    if (tv === null) throw new UnauthorizedException('账号不可用')
    return this.jwt.sign(
      { sub: user.id, name: user.name, roleId: user.roleId, tv },
      { secret: this.cfg.get('JWT_ACCESS_SECRET'), expiresIn: this.cfg.get('ACCESS_TTL') || '900s', algorithm: 'HS256' },
    )
  }

  async issueRefresh(userId: string, ua = '', ip = '', expectedVersion?: number) {
    const raw = randomBytes(32).toString('hex')
    const days = Number(this.cfg.get('REFRESH_TTL_DAYS') || 14)
    const expiresAt = new Date(Date.now() + days * 86400_000)
    await this.prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({where:{id:userId}})
      if (!user || user.status !== 'active' || (expectedVersion !== undefined && user.tokenVersion !== expectedVersion)) throw new UnauthorizedException('登录凭据已变更，请重新登录')
      // No-op write obtains the same row lock used by password/logout revocation.
      const locked = await tx.user.updateMany({where:{id:userId,status:'active',tokenVersion:user.tokenVersion},data:{tokenVersion:{increment:0}}})
      if (locked.count !== 1) throw new UnauthorizedException('登录凭据已变更，请重新登录')
      await tx.refreshToken.create({data:{userId,tokenHash:this.sha256(raw),ua,ip,expiresAt,tokenVersion:user.tokenVersion}})
    })
    return raw
  }

  async rotateRefresh(raw: string, ua = '', ip = '') {
    const hash = this.sha256(raw)
    const next = randomBytes(32).toString('hex')
    const days = Number(this.cfg.get('REFRESH_TTL_DAYS') || 14)
    const now = new Date()
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rec = await tx.refreshToken.findUnique({
        where: { tokenHash: hash },
        include: { user: { select: { mustChangePassword: true, status: true, tokenVersion: true } } },
      })
      if (!rec || rec.expiresAt <= now || rec.user.status !== 'active' || rec.tokenVersion !== rec.user.tokenVersion) return { kind: 'expired' as const }
      const locked = await tx.user.updateMany({where:{id:rec.userId,status:'active',tokenVersion:rec.tokenVersion},data:{tokenVersion:{increment:0}}})
      if (locked.count !== 1) return {kind:'expired' as const}
      if (rec.user.mustChangePassword) return { kind: 'password-change' as const }

      // 单条条件更新是轮换的原子认领点：并发请求只有一个能把 revoked=false 改为 true。
      const claimed = await tx.refreshToken.updateMany({ where: { id: rec.id, revoked: false }, data: { revoked: true } })
      if (claimed.count !== 1) return { kind: 'replayed' as const }
      await tx.refreshToken.create({
        data: { userId: rec.userId, tokenHash: this.sha256(next), ua, ip, expiresAt: new Date(now.getTime() + days * 86400_000), tokenVersion: rec.tokenVersion },
      })
      return { kind: 'ok' as const, userId: rec.userId, tokenVersion: rec.tokenVersion }
    })
    if (outcome.kind === 'expired') throw new UnauthorizedException('登录已过期，请重新登录')
    if (outcome.kind === 'password-change') throw new ForbiddenException('首次登录必须先修改密码')
    if (outcome.kind === 'replayed') {
      // 条件认领输家代表同一 refresh 被并发/重复使用；严格吊销整族并 bump access token 版本。
      const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash }, select: { userId: true } })
      if (rec) await this.revokeAllForUser(rec.userId)
      throw new UnauthorizedException('检测到刷新令牌重放，已注销全部会话')
    }
    return { userId: outcome.userId, refresh: next, tokenVersion: outcome.tokenVersion }
  }

  async revokeRefresh(raw?: string) {
    if (!raw) return
    await this.prisma.$transaction(async tx => {
      const rec = await tx.refreshToken.findUnique({where:{tokenHash:this.sha256(raw)}})
      if (!rec) return
      // Existing access-token revocation is account-generation based. Fence all
      // refresh credentials in that old generation as well, including rotation
      // children created just before logout acquired the user row lock.
      await tx.user.updateMany({where:{id:rec.userId,tokenVersion:rec.tokenVersion},data:{tokenVersion:{increment:1}}})
      await tx.refreshToken.updateMany({where:{userId:rec.userId,tokenVersion:rec.tokenVersion,revoked:false},data:{revoked:true}})
    })
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.$transaction(async tx => {
      await tx.user.update({where:{id:userId},data:{tokenVersion:{increment:1}}})
      await tx.refreshToken.updateMany({where:{userId,revoked:false},data:{revoked:true}})
    })
  }

  async bumpTokenVersion(userId: string) {
    await this.prisma.user.update({where:{id:userId},data:{tokenVersion:{increment:1}}})
  }
}

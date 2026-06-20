import { Injectable, UnauthorizedException } from '@nestjs/common'
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

  async toAuthUser(userId: string): Promise<AuthUser | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } })
    if (!u || u.status !== 'active') return null
    return {
      id: u.id,
      name: u.name,
      account: u.account,
      roleId: u.roleId,
      permissions: JSON.parse(u.role.permissions || '[]'),
      scopeType: u.scopeType,
      scopeId: u.scopeId,
    }
  }

  async validate(account: string, password: string) {
    const u = await this.prisma.user.findUnique({ where: { account } })
    if (!u || u.status !== 'active') throw new UnauthorizedException('账号或密码错误')
    const ok = await argon2.verify(u.passwordHash, password).catch(() => false)
    if (!ok) throw new UnauthorizedException('账号或密码错误')
    return u
  }

  signAccess(user: AuthUser) {
    return this.jwt.sign(
      { sub: user.id, name: user.name, roleId: user.roleId },
      { secret: this.cfg.get('JWT_ACCESS_SECRET'), expiresIn: this.cfg.get('ACCESS_TTL') || '900s' },
    )
  }

  async issueRefresh(userId: string, ua = '', ip = '') {
    const raw = randomBytes(32).toString('hex')
    const days = Number(this.cfg.get('REFRESH_TTL_DAYS') || 14)
    const expiresAt = new Date(Date.now() + days * 86400_000)
    await this.prisma.refreshToken.create({ data: { userId, tokenHash: this.sha256(raw), ua, ip, expiresAt } })
    return raw
  }

  async rotateRefresh(raw: string, ua = '', ip = '') {
    const hash = this.sha256(raw)
    const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } })
    if (!rec || rec.expiresAt < new Date()) throw new UnauthorizedException('登录已过期，请重新登录')
    // 重放检测：已被吊销的 refresh 又被使用 = 可能被盗用（攻击者已先轮换）。
    // 不只是拒绝本次，而是吊销该用户全部会话族，连带作废攻击者刚换得的令牌。
    if (rec.revoked) {
      await this.revokeAllForUser(rec.userId)
      throw new UnauthorizedException('检测到异常登录，已注销全部会话，请重新登录')
    }
    await this.prisma.refreshToken.update({ where: { id: rec.id }, data: { revoked: true } })
    const next = await this.issueRefresh(rec.userId, ua, ip)
    return { userId: rec.userId, refresh: next }
  }

  async revokeRefresh(raw?: string) {
    if (!raw) return
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: this.sha256(raw) }, data: { revoked: true } }).catch(() => {})
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } })
  }
}

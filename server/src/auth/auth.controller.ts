import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { IsString, MinLength } from 'class-validator'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { Public } from './auth.guard'
import { CurrentUser, type AuthUser } from '../rbac/rbac'

class LoginDto {
  @IsString() account!: string
  @IsString() @MinLength(1) password!: string
}

class ChangePasswordDto {
  @IsString() @MinLength(1) oldPassword!: string
  @IsString() @MinLength(8) newPassword!: string // 最短 8 位；强度策略可后续加正则
}

const REFRESH_COOKIE = 'cps_rt'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private cfg: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, raw: string) {
    const days = Number(this.cfg.get('REFRESH_TTL_DAYS') || 14)
    res.cookie(REFRESH_COOKIE, raw, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.cfg.get('NODE_ENV') === 'production',
      maxAge: days * 86400_000,
      // 默认 '/'，兼容直连(localhost:3001)与 nginx /api 反代两种部署；可用 REFRESH_COOKIE_PATH 覆盖
      path: this.cfg.get<string>('REFRESH_COOKIE_PATH') || '/',
    })
  }

  @Public()
  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } }) // 防爆破：每 IP 每分钟最多 10 次登录尝试
  @ApiOperation({ summary: '登录，返回 access token 与用户权限；refresh 走 httpOnly cookie' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const u = await this.auth.validate(dto.account, dto.password)
    const authUser = (await this.auth.toAuthUser(u.id))!
    const raw = await this.auth.issueRefresh(u.id, req.headers['user-agent'] || '', req.ip || '')
    this.setRefreshCookie(res, raw)
    return { access: await this.auth.signAccess(authUser), user: authUser }
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: '用 httpOnly refresh cookie 静默换取新 access' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE]
    if (!raw) throw new UnauthorizedException('无刷新令牌')
    const { userId, refresh } = await this.auth.rotateRefresh(raw, req.headers['user-agent'] || '', req.ip || '')
    const authUser = await this.auth.toAuthUser(userId)
    if (!authUser) throw new UnauthorizedException('用户不存在')
    this.setRefreshCookie(res, refresh)
    return { access: await this.auth.signAccess(authUser), user: authUser }
  }

  @Get('me')
  @ApiOperation({ summary: '当前登录用户 + 角色 + 权限点 + 数据范围' })
  me(@CurrentUser() user: AuthUser) {
    return { user }
  }

  @Post('change-password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } }) // 防猜旧密码：每 IP 每分钟 5 次
  @ApiOperation({ summary: '修改密码（校验旧密码；成功后吊销全部会话，需重新登录）' })
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.changePassword(user.id, dto.oldPassword, dto.newPassword)
    // 全会话已吊销，清掉本地 refresh cookie，前端应引导以新密码重新登录
    res.clearCookie(REFRESH_COOKIE, { path: this.cfg.get<string>('REFRESH_COOKIE_PATH') || '/' })
    return { ok: true }
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: '登出，撤销刷新令牌（公开：凭 refresh cookie，不依赖 access token）' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeRefresh(req.cookies?.[REFRESH_COOKIE])
    res.clearCookie(REFRESH_COOKIE, { path: this.cfg.get<string>('REFRESH_COOKIE_PATH') || '/' })
    return { ok: true }
  }
}

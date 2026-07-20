import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'

/** 标注公开接口（跳过登录校验），如 /auth/login。 */
export const PUBLIC_KEY = 'is_public'
export const Public = () => SetMetadata(PUBLIC_KEY, true)

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private cfg: ConfigService,
    private auth: AuthService,
    private reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])
    if (isPublic) return true
    const req = ctx.switchToHttp().getRequest()
    const header: string = req.headers['authorization'] || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new UnauthorizedException('未认证')
    let payload: { sub: string; tv?: number }
    try {
      // 显式 pin HS256，防算法混淆攻击
      payload = await this.jwt.verifyAsync(token, { secret: this.cfg.get('JWT_ACCESS_SECRET'), algorithms: ['HS256'] })
    } catch {
      throw new UnauthorizedException('登录态无效或已过期')
    }
    // token 版本校验：登出/吊销全会话/角色变更会 bump 版本，使旧 access token 立即失效
    const currentTv = await this.auth.tokenVersionOf(payload.sub)
    if (currentTv === null) throw new UnauthorizedException('用户不存在或已停用')
    if ((payload.tv ?? 0) !== currentTv) throw new UnauthorizedException('登录态已失效，请重新登录')
    const user = await this.auth.toAuthUser(payload.sub)
    if (!user) throw new UnauthorizedException('用户不存在或已停用')
    // 首登强制改密的服务端闸：mustChangePassword=true 时只放行「改密 / 查我」，其余端点一律 403。
    // 否则受邀成员拿临时密码登录后，绕过前端改密页(改地址栏/刷新恢复会话)即可长期使用临时口令。
    if (user.mustChangePassword) {
      const p: string = req.path || ''
      const allowed = p.endsWith('/auth/change-password') || p.endsWith('/auth/me')
      if (!allowed) throw new ForbiddenException('请先修改初始密码后再继续操作')
    }
    req.user = user
    return true
  }
}

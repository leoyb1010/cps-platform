import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'

/** 标注公开接口（跳过登录校验），如 /auth/login。 */
export const PUBLIC_KEY = 'is_public'
export const Public = () => SetMetadata(PUBLIC_KEY, true)
export const PASSWORD_CHANGE_ALLOWED_KEY = 'password_change_allowed'
export const AllowBeforePasswordChange = () => SetMetadata(PASSWORD_CHANGE_ALLOWED_KEY, true)

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
    // 单次查询取回 用户 + 角色权限 + tokenVersion（原为两次查询，高并发下把用户表读放大一倍）
    const loaded = await this.auth.loadForAuth(payload.sub)
    if (!loaded) throw new UnauthorizedException('用户不存在或已停用')
    // token 版本校验：登出/吊销全会话/角色变更会 bump 版本，使旧 access token 立即失效
    if ((payload.tv ?? 0) !== loaded.tokenVersion) throw new UnauthorizedException('登录态已失效，请重新登录')
    const user = loaded.user
    const passwordChangeAllowed = this.reflector.getAllAndOverride<boolean>(PASSWORD_CHANGE_ALLOWED_KEY, [ctx.getHandler(), ctx.getClass()])
    if (user.mustChangePassword && !passwordChangeAllowed) {
      throw new ForbiddenException('首次登录必须先修改密码')
    }
    req.user = user
    return true
  }
}

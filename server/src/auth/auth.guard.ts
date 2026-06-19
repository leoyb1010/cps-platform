import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common'
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
    let payload: any
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.cfg.get('JWT_ACCESS_SECRET') })
    } catch {
      throw new UnauthorizedException('登录态无效或已过期')
    }
    const user = await this.auth.toAuthUser(payload.sub)
    if (!user) throw new UnauthorizedException('用户不存在或已停用')
    req.user = user
    return true
  }
}

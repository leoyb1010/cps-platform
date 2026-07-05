import { SetMetadata, CanActivate, ExecutionContext, Injectable, ForbiddenException, createParamDecorator } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

export const PERMS_KEY = 'required_perms'
/** 标注接口所需权限点（任一满足即放行）。无标注 = 仅需登录。 */
export const RequirePerms = (...perms: string[]) => SetMetadata(PERMS_KEY, perms)

export interface AuthUser {
  id: string
  name: string
  account: string
  roleId: string
  permissions: string[]
  scopeType: string
  scopeId?: string | null
  mustChangePassword?: boolean // 首登强制改密标记，前端据此拦截到改密页
}

/** 取当前登录用户（由 AuthGuard 注入到 request.user）。 */
export const CurrentUser = createParamDecorator((_data, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user
})

@Injectable()
export class PermsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, [ctx.getHandler(), ctx.getClass()])
    if (!required || required.length === 0) return true
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user
    if (!user) throw new ForbiddenException('未认证')
    const ok = required.some((p) => user.permissions.includes(p))
    if (!ok) throw new ForbiddenException(`缺少权限：${required.join(' / ')}`)
    return true
  }
}

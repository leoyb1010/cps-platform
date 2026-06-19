import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, tap } from 'rxjs'
import { AuditService } from './audit.service'

// 统一捕获写操作(POST/PATCH/PUT/DELETE)成功后落审计，不阻塞主流程。
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest()
    const method: string = req.method
    const write = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE'
    // 登录/刷新/登出单独由 auth 记录或无需记录
    const skip = req.path?.startsWith('/auth')
    if (!write || skip) return next.handle()

    const action = `${req.method} ${req.route?.path ?? req.path}`
    return next.handle().pipe(
      tap((result) => {
        const detail = typeof result === 'object' && result && 'detail' in result ? String((result as any).detail) : `${req.method} ${req.path}`
        void this.audit.record({
          user: req.user,
          action,
          resource: (req.path || '').split('/')[1] || 'api',
          resourceId: req.params?.id ?? '',
          detail,
          ip: req.ip || '',
          ua: req.headers['user-agent'] || '',
        })
      }),
    )
  }
}

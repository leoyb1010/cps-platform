import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { MetricsService } from './metrics.service'

/** 每个请求结束后记录指标（方法 / 路由模板 / 状态码）。 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp()
    const req = http.getRequest()
    const route: string = req.route?.path ?? req.url?.split('?')[0] ?? 'unknown'
    const method: string = req.method ?? 'GET'
    const record = (status: number) => this.metrics.observe(method, route, status, Date.now())
    return next.handle().pipe(
      tap({
        next: () => record(http.getResponse().statusCode ?? 200),
        error: (e) => record(e?.status ?? 500),
      }),
    )
  }
}

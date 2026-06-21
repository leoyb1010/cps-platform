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
    // 仅用路由模板作 key（基数有界）；未匹配路由(404)归到常量桶，
    // 防 404 刷量把 raw URL 灌进 Map 造成内存无界增长。
    const route: string = req.route?.path ?? 'unmatched'
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

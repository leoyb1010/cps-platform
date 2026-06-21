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
    // 仅用路由模板作 label（基数有界）；未匹配路由(404)归到常量桶，防 404 刷量撑爆标签基数。
    const route: string = req.route?.path ?? 'unmatched'
    const method: string = req.method ?? 'GET'
    const start = process.hrtime.bigint()
    const record = (status: number) => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9
      this.metrics.observeHttp(method, route, status, seconds)
    }
    return next.handle().pipe(
      tap({
        next: () => record(http.getResponse().statusCode ?? 200),
        error: (e) => record(e?.status ?? 500),
      }),
    )
  }
}

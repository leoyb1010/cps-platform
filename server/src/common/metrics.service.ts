import { Injectable } from '@nestjs/common'

/**
 * 极简内存指标（无外部依赖）—— 以 Prometheus 文本格式暴露。
 * 计数：按 方法+状态码 分桶的请求总数 + 错误总数 + 进程运行时长。
 * 生产可换 prom-client；此实现满足抓取与告警的最小可用面。
 */
@Injectable()
export class MetricsService {
  private reqTotal = new Map<string, number>() // key: METHOD path-class status
  private errTotal = 0
  private readonly startMs = Date.now()
  private nowMs = Date.now() // 由请求驱动更新，避免依赖 Date.now() 的纯函数约束

  observe(method: string, route: string, status: number, atMs: number) {
    this.nowMs = atMs
    const key = `${method}|${route}|${status}`
    this.reqTotal.set(key, (this.reqTotal.get(key) ?? 0) + 1)
    if (status >= 500) this.errTotal += 1
  }

  render(): string {
    const lines: string[] = []
    lines.push('# HELP cps_requests_total Total HTTP requests by method/route/status')
    lines.push('# TYPE cps_requests_total counter')
    for (const [key, n] of this.reqTotal) {
      const [method, route, status] = key.split('|')
      lines.push(`cps_requests_total{method="${method}",route="${route}",status="${status}"} ${n}`)
    }
    lines.push('# HELP cps_errors_total Total 5xx responses')
    lines.push('# TYPE cps_errors_total counter')
    lines.push(`cps_errors_total ${this.errTotal}`)
    lines.push('# HELP cps_uptime_seconds Process uptime in seconds')
    lines.push('# TYPE cps_uptime_seconds gauge')
    lines.push(`cps_uptime_seconds ${Math.max(0, Math.round((this.nowMs - this.startMs) / 1000))}`)
    return lines.join('\n') + '\n'
  }
}

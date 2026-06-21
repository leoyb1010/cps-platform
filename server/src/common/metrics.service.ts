import { Injectable } from '@nestjs/common'
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client'

/**
 * 标准 Prometheus 指标（prom-client）。
 * - 默认进程指标（CPU/内存/事件循环延迟/GC）
 * - HTTP 请求延迟直方图（按 method/route/status，自带 P50/P95/P99 分位桶）
 * - 业务指标：资金动作计数、退款金额累计、审计失败计数
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry()

  private httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP 请求耗时（秒）',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  })

  private fundActions = new Counter({
    name: 'cps_fund_actions_total',
    help: '资金类动作计数（按动作与结果）',
    labelNames: ['action', 'outcome'],
    registers: [this.registry],
  })

  private refundAmount = new Counter({
    name: 'cps_refund_amount_total',
    help: '退款金额累计（元）',
    registers: [this.registry],
  })

  private auditFailures = new Counter({
    name: 'cps_audit_write_failures_total',
    help: '审计写入失败计数（best-effort 路径丢失的审计）',
    registers: [this.registry],
  })

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'cps_' })
  }

  /** 记录一次 HTTP 请求耗时（秒）。 */
  observeHttp(method: string, route: string, status: number, seconds: number) {
    this.httpDuration.observe({ method, route, status: String(status) }, seconds)
  }

  /** 记录资金动作（outcome: ok | reject | error）。 */
  recordFundAction(action: string, outcome: 'ok' | 'reject' | 'error') {
    this.fundActions.inc({ action, outcome })
  }

  /** 累计退款金额（元）。 */
  addRefundAmount(yuan: number) {
    if (yuan > 0) this.refundAmount.inc(yuan)
  }

  /** 审计写入失败 +1。 */
  recordAuditFailure() {
    this.auditFailures.inc()
  }

  /** Prometheus 文本输出。 */
  render(): Promise<string> {
    return this.registry.metrics()
  }
}

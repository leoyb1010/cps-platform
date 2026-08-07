import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { sendAlert } from './alert'

// Prisma 已知错误码 → HTTP 状态。避免「记录不存在/唯一冲突」等被当作 500。
// retryable：可预期的并发争用/暂时不可用，调用方可安全重试（用同一 Idempotency-Key）。
// 压测实测：20 路不同幂等键并发清算同一结算单时，锁竞争会产生 socket timeout / 事务过期 /
// 占位键写入失败——这些是「资源忙」而非「服务器未知错误」，泛化成 500 会让 APM/SLO 误判为故障，
// 也让客户端不知道能否安全重试。
function mapPrisma(code: string): { status: number; message: string; retryable?: boolean } | null {
  switch (code) {
    case 'P2025':
      return { status: HttpStatus.NOT_FOUND, message: '记录不存在' }
    case 'P2002':
      return { status: HttpStatus.CONFLICT, message: '资源已存在（唯一约束冲突）' }
    case 'P2003':
      return { status: HttpStatus.BAD_REQUEST, message: '关联数据无效（外键约束）' }
    case 'P2000':
      return { status: HttpStatus.BAD_REQUEST, message: '字段值超出长度限制' }
    // ── 并发争用 / 暂时不可用：明确可重试语义 ──
    case 'P2034':
      return { status: HttpStatus.CONFLICT, message: '并发写冲突，请用同一幂等键重试', retryable: true }
    case 'P2024':
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: '数据库连接池繁忙，请稍后用同一幂等键重试', retryable: true }
    case 'P2028':
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: '事务已超时关闭，请用同一幂等键重试', retryable: true }
    case 'P1008':
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: '数据库操作超时，请稍后用同一幂等键重试', retryable: true }
    case 'P1002':
    case 'P1017':
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: '数据库连接中断，请稍后用同一幂等键重试', retryable: true }
    default:
      return null
  }
}

// 无 Prisma 错误码的争用信号（SQLite socket timeout、事务过期等以普通 Error 抛出）。
// 仅匹配明确的争用/超时字样，避免把真实业务错误误判为可重试。
const CONTENTION_PATTERNS = /socket timeout|timed out|transaction (?:already closed|not found|is no longer valid)|database is locked|deadlock/i

// 统一错误响应：{ code, message }，对未知错误隐藏内部细节。
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger('Exception')
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<{ id?: string }>()
    const requestId = req?.id // pino genReqId 注入
    let status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    let message = '服务器内部错误'
    let retryable = false
    if (exception instanceof HttpException) {
      const r = exception.getResponse() as any
      message = typeof r === 'string' ? r : Array.isArray(r?.message) ? r.message.join('；') : (r?.message ?? exception.message)
      retryable = r?.retryable === true
    } else if (exception && typeof (exception as { code?: unknown }).code === 'string') {
      // 鸭子类型识别 PrismaClientKnownRequestError（避免引入重运行时类型）
      const mapped = mapPrisma((exception as { code: string }).code)
      if (mapped) {
        status = mapped.status
        message = mapped.message
        retryable = mapped.retryable ?? false
      }
    }
    // 无错误码的争用信号（SQLite socket timeout / 事务过期）：同样给可重试的 503，不当未知 500
    if (status === HttpStatus.INTERNAL_SERVER_ERROR && exception instanceof Error && CONTENTION_PATTERNS.test(exception.message)) {
      status = HttpStatus.SERVICE_UNAVAILABLE
      message = '数据库繁忙或事务超时，请稍后用同一幂等键重试'
      retryable = true
    }
    if (status >= 500) {
      this.logger.error(`[req:${requestId ?? '-'}] ${exception instanceof Error ? exception.stack : String(exception)}`)
      // P1-B9：5xx（含资金类异常、审计写失败 fail-closed 抛出的 500）主动告警到企微/钉钉机器人。
      //   fire-and-forget，不阻塞错误响应；未配 ALERT_WEBHOOK_URL 时 no-op。去抖在 sendAlert 内。
      //   可重试的争用 503 是可预期的负载信号（高并发下成片出现），按 warn 报，避免淹没真正的 critical。
      void sendAlert(retryable ? '服务暂时不可用（争用）' : '服务 5xx 异常', `[req:${requestId ?? '-'}] ${exception instanceof Error ? exception.message : String(exception)}`, retryable ? 'warn' : 'critical')
      // 外部错误聚合上报钩子：接入 Sentry 时在此 captureException（未配 SENTRY_DSN 时 no-op）。
      // if (process.env.SENTRY_DSN) Sentry.captureException(exception, { tags: { requestId } })
    }
    // retryable 提示客户端「可用同一幂等键安全重试」；配合 Retry-After 让网关/SDK 能自动退避。
    if (retryable) res.setHeader('Retry-After', '1')
    res.status(status).json({ code: status, message, ...(retryable ? { retryable: true } : {}), ...(requestId ? { requestId } : {}) })
  }
}

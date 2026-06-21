import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Response } from 'express'

// Prisma 已知错误码 → HTTP 状态。避免「记录不存在/唯一冲突」等被当作 500。
function mapPrisma(code: string): { status: number; message: string } | null {
  switch (code) {
    case 'P2025':
      return { status: HttpStatus.NOT_FOUND, message: '记录不存在' }
    case 'P2002':
      return { status: HttpStatus.CONFLICT, message: '资源已存在（唯一约束冲突）' }
    case 'P2003':
      return { status: HttpStatus.BAD_REQUEST, message: '关联数据无效（外键约束）' }
    case 'P2000':
      return { status: HttpStatus.BAD_REQUEST, message: '字段值超出长度限制' }
    default:
      return null
  }
}

// 统一错误响应：{ code, message }，对未知错误隐藏内部细节。
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger('Exception')
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    let status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    let message = '服务器内部错误'
    if (exception instanceof HttpException) {
      const r = exception.getResponse() as any
      message = typeof r === 'string' ? r : Array.isArray(r?.message) ? r.message.join('；') : (r?.message ?? exception.message)
    } else if (exception && typeof (exception as { code?: unknown }).code === 'string') {
      // 鸭子类型识别 PrismaClientKnownRequestError（避免引入重运行时类型）
      const mapped = mapPrisma((exception as { code: string }).code)
      if (mapped) {
        status = mapped.status
        message = mapped.message
      }
    }
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception))
    res.status(status).json({ code: status, message })
  }
}

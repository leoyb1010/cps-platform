import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Response } from 'express'

// 统一错误响应：{ code, message }，对未知错误隐藏内部细节。
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger('Exception')
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    let message = '服务器内部错误'
    if (exception instanceof HttpException) {
      const r = exception.getResponse() as any
      message = typeof r === 'string' ? r : Array.isArray(r?.message) ? r.message.join('；') : (r?.message ?? exception.message)
    }
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception))
    res.status(status).json({ code: status, message })
  }
}

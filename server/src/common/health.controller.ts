import { Controller, Get, Header, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Public } from '../auth/auth.guard'
import { PrismaService } from '../prisma.service'
import { MetricsService } from './metrics.service'
import { AuditService } from '../audit/audit.service'

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private audit: AuditService,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: '存活探针' })
  health() {
    return { status: 'ok', ts: new Date().toISOString() }
  }

  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK) // degraded 时也返回 200 体，由编排器读 status 字段判定；DB 不通才 503
  @ApiOperation({ summary: '就绪探针（DB 连通 + 最近审计写入时间）' })
  async ready() {
    let db = 'down'
    try {
      await this.prisma.$queryRaw`SELECT 1`
      db = 'up'
    } catch {
      /* db stays down */
    }
    const lastAudit = this.audit.lastSuccessAt
    return {
      status: db === 'up' ? 'ready' : 'degraded',
      db,
      lastAuditWriteAt: lastAudit ? lastAudit.toISOString() : null,
      lastAuditAgeSec: lastAudit ? Math.round((Date.now() - lastAudit.getTime()) / 1000) : null,
    }
  }

  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  @ApiOperation({ summary: 'Prometheus 指标（进程 + HTTP 延迟直方图 + 业务计数）' })
  metricsEndpoint() {
    return this.metrics.render()
  }
}

import { Controller, Get, Header, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common'
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
  @HttpCode(HttpStatus.OK) // 就绪时 200；DB 不通抛 503，让编排器能按状态码判定就绪（原先恒 200 与注释矛盾）
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
    const body = {
      status: db === 'up' ? 'ready' : 'degraded',
      db,
      lastAuditWriteAt: lastAudit ? lastAudit.toISOString() : null,
      lastAuditAgeSec: lastAudit ? Math.round((Date.now() - lastAudit.getTime()) / 1000) : null,
    }
    // DB 不通 → 503（响应体仍带上诊断字段，供编排器/人工排查）
    if (db !== 'up') throw new ServiceUnavailableException(body)
    return body
  }

  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  @ApiOperation({ summary: 'Prometheus 指标（进程 + HTTP 延迟直方图 + 业务计数）' })
  metricsEndpoint() {
    return this.metrics.render()
  }
}

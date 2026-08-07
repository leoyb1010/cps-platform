import { Controller, ForbiddenException, Get, Header, HttpCode, HttpStatus, Req, ServiceUnavailableException } from '@nestjs/common'
import type { Request } from 'express'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { createHash, timingSafeEqual } from 'node:crypto'
import { Public } from '../auth/auth.guard'
import { PrismaService } from '../prisma.service'
import { MetricsService } from './metrics.service'
import { AuditService } from '../audit/audit.service'

/**
 * 常量时间比较（避免按字符提前返回泄露前缀，被逐位爆破出 token）。
 * 先各自 sha256 定长化，使长度差异也不产生时间差、timingSafeEqual 不因长度不等抛错。
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

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
  metricsEndpoint(@Req() req: Request) {
    // P2-B13 纵深防御：/metrics 暴露资金业务指标（含 cps_refund_amount_total）。
    //   生产除 nginx 拦截外，强制 METRICS_TOKEN（见 main.ts assertSecrets：生产缺失即拒启），
    //   堵住绕过 nginx 直连 server:3001 抓取资金指标的口子。
    // 仅接受 Authorization: Bearer——不再接受 `?token=`：查询串会进 nginx/网关 access log，等于泄露密钥。
    const token = process.env.METRICS_TOKEN
    if (token) {
      const auth = req.headers['authorization'] || ''
      const provided = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!timingSafeEqualStr(provided, token)) throw new ForbiddenException('metrics 需授权')
    }
    return this.metrics.render()
  }
}

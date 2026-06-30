import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { ScheduleModule } from '@nestjs/schedule'
import { LoggerModule } from 'nestjs-pino'
import { randomUUID } from 'crypto'

import { PrismaService } from './prisma.service'
import { AuthService } from './auth/auth.service'
import { AuthController } from './auth/auth.controller'
import { AuthGuard } from './auth/auth.guard'
import { PermsGuard } from './rbac/rbac'
import { AuditService } from './audit/audit.service'
import { AuditController } from './audit/audit.controller'
import { AuditInterceptor } from './audit/audit.interceptor'
import { MembersController } from './members/members.controller'
import { BusinessController } from './business/business.controller'
import { AigcController } from './aigc/aigc.controller'
import { PortalController } from './portal/portal.controller'
import { MarketController } from './market/market.controller'
import { HealthController } from './common/health.controller'
import { MetricsService } from './common/metrics.service'
import { MetricsInterceptor } from './common/metrics.interceptor'
import { IdempotencyService } from './common/idempotency.service'
import { ReconciliationService } from './business/reconciliation.service'
import { SettlementService } from './business/settlement.service'
import { ReserveReleaseService } from './business/reserve-release.service'
import { FulfillmentService } from './business/fulfillment.service'
import { CpsController } from './cps/cps.controller'
import { CpsService } from './cps/cps.service'
import { SignWebhookService } from './cps/sign-webhook.service'
import { YoudaoController } from './youdao/youdao.controller'
import { ScheduledTasksService } from './business/scheduled-tasks.service'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        transport: process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' || req.url === '/metrics' },
        // 追踪 ID：复用入站 X-Request-Id（清洗 + 限长，防响应头注入/超长），否则生成；写回响应头
        genReqId: (req, res) => {
          const raw = req.headers['x-request-id']
          const candidate = typeof raw === 'string' ? raw.replace(/[^\w.-]/g, '').slice(0, 64) : ''
          const id = candidate || randomUUID()
          res.setHeader('X-Request-Id', id)
          return id
        },
      },
    }),
    JwtModule.register({}),
    // 限流：默认每 IP 每分钟 120 次；登录等敏感端点用 @Throttle 单独收紧（防爆破）
    // 测试环境跳过（套件会高频登录），避免误触发 429
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    // 定时任务调度（准备金到期释放、对账）。任务体在 ScheduledTasksService，测试环境内部跳过自动触发。
    ScheduleModule.forRoot(),
  ],
  controllers: [AuthController, AuditController, MembersController, BusinessController, AigcController, PortalController, MarketController, CpsController, YoudaoController, HealthController],
  providers: [
    PrismaService,
    AuthService,
    AuditService,
    MetricsService,
    IdempotencyService,
    ReconciliationService,
    SettlementService,
    ReserveReleaseService,
    FulfillmentService,
    ScheduledTasksService,
    CpsService,
    SignWebhookService,
    // 全局：限流 → 认证 → 鉴权
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermsGuard },
    // 拦截器：指标(先) → 审计(后)
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {
  constructor(private cfg: ConfigService) {
    void this.cfg
  }
}

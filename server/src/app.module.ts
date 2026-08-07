import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { ScheduleModule } from '@nestjs/schedule'
import { LoggerModule } from 'nestjs-pino'
import { randomUUID } from 'crypto'

import { LOG_REDACT_PATHS } from './common/log-redact'
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
import { MoneyResponseInterceptor } from './common/money.interceptor'
import { IdempotencyService } from './common/idempotency.service'
import { ReconciliationService } from './business/reconciliation.service'
import { SettlementService } from './business/settlement.service'
import { SettlementRunService } from './business/settlement-run.service'
import { ScopeService } from './business/scope.service'
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
        // 凭据脱敏（P0）：路径清单与断言测试见 common/log-redact.ts。
        redact: { paths: LOG_REDACT_PATHS, remove: true },
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
    // 压测：设 THROTTLE_LIMIT 放大阈值（仍按真实 IP 限流，只调上限，保留生产行为）；生产勿设或设回合理值
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT) || 120 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    // 定时任务调度（准备金到期释放、对账）。任务体在 ScheduledTasksService，测试环境内部跳过自动触发。
    // 测试环境不注册调度器：@Cron 的定时器句柄会让 e2e fork 在全部用例通过后仍无法退出，
    // 表现为「测试全绿但套件挂起」（发布门禁因此不可用）。ScheduledTasksService 内部本就有
    // NODE_ENV=test 的 enabled 闸挡住方法体，这里连句柄一起去掉，双保险且可确定性退出。
    ...(process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()]),
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
    SettlementRunService,
    ScopeService,
    ReserveReleaseService,
    FulfillmentService,
    ScheduledTasksService,
    CpsService,
    SignWebhookService,
    // 全局：限流 → 认证 → 鉴权
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermsGuard },
    // 拦截器：指标(先) → 审计 → 金额边界(分→元，最后作用于响应体)
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MoneyResponseInterceptor },
  ],
})
export class AppModule {
  constructor(private cfg: ConfigService) {
    void this.cfg
  }
}

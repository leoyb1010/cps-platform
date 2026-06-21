import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
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
import { HealthController } from './common/health.controller'
import { MetricsService } from './common/metrics.service'
import { MetricsInterceptor } from './common/metrics.interceptor'
import { IdempotencyService } from './common/idempotency.service'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        transport: process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' || req.url === '/metrics' },
        // 追踪 ID：复用入站 X-Request-Id，否则生成；写回响应头，便于「一条报错串联日志/审计」
        genReqId: (req, res) => {
          const incoming = (req.headers['x-request-id'] as string) || randomUUID()
          res.setHeader('X-Request-Id', incoming)
          return incoming
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
  ],
  controllers: [AuthController, AuditController, MembersController, BusinessController, HealthController],
  providers: [
    PrismaService,
    AuthService,
    AuditService,
    MetricsService,
    IdempotencyService,
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

import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'

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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        transport: process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
      },
    }),
    JwtModule.register({}),
    // 限流：默认每 IP 每分钟 120 次；登录等敏感端点用 @Throttle 单独收紧（防爆破）
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [AuthController, AuditController, MembersController, BusinessController, HealthController],
  providers: [
    PrismaService,
    AuthService,
    AuditService,
    // 全局：限流 → 认证 → 鉴权
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {
  constructor(private cfg: ConfigService) {
    void this.cfg
  }
}

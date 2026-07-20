import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect()
    // SQLite（dev/test/单机部署）：设写锁等待，否则并发写锁瞬时 SQLITE_BUSY 直接报错——
    // 登录/审计等写路径偶发 500 → 令牌为空 → 级联 401/404（e2e 全跑 SQLite 时的偶发失败根因）。
    // busy_timeout 让被锁查询等待 5s 而非立即失败。生产 PostgreSQL 不执行（PRAGMA 不适用）。
    if ((process.env.DATABASE_URL || '').startsWith('file:')) {
      await this.$executeRawUnsafe('PRAGMA busy_timeout = 5000').catch(() => undefined)
    }
  }
  async onModuleDestroy() {
    await this.$disconnect()
  }
}

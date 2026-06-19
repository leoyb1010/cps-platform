import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Public } from '../auth/auth.guard'
import { PrismaService } from '../prisma.service'

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: '存活探针' })
  health() {
    return { status: 'ok', ts: new Date().toISOString() }
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: '就绪探针（含 DB 连通）' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'ready', db: 'up' }
    } catch {
      return { status: 'degraded', db: 'down' }
    }
  }
}

import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AuditService } from './audit.service'
import { RequirePerms } from '../rbac/rbac'

@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  @RequirePerms('audit.read')
  @ApiOperation({ summary: '操作审计日志（可按类别筛选）' })
  list(@Query('category') category?: string) {
    return this.audit.list({ category })
  }
}

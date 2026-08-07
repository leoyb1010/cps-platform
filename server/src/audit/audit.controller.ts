import { Controller, ForbiddenException, Get, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AuditService } from './audit.service'
import { CurrentUser, RequirePerms, type AuthUser } from '../rbac/rbac'

@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  @RequirePerms('audit.read')
  @ApiOperation({ summary: '操作审计日志（可按类别筛选）' })
  list(@CurrentUser() user: AuthUser, @Query('category') category?: string) {
    // 审计日志是平台级横切视图（记录谁对什么资源做了什么），表本身无租户维度、无法按品牌/代理收窄。
    // 因此即使账户持有 audit.read（如 seed 的 brandaudit = audit 角色 + brand scope），
    // 非平台账户也必须挡在门外——否则品牌/代理可读到全平台跨租户的结算/提现/冲账金额与 before/after。
    if (!user || user.scopeType !== 'platform') throw new ForbiddenException('审计日志仅平台账户可查看')
    return this.audit.list({ category })
  }
}

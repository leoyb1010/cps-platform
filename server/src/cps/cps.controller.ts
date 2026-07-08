import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger'
import { IsISO8601, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { RequirePerms, CurrentUser, type AuthUser } from '../rbac/rbac'
import { CpsService } from './cps.service'

// 内部模拟触发 DTO（JWT，演示/联调用）。对外签约/退款/解约/查询/回调已迁至 YoudaoController（RSA）。
class SimChargeDto {
  @IsString() @MaxLength(40) signOrderNo!: string
}
class SimFailDto {
  @IsString() @MaxLength(40) signOrderNo!: string
  @IsOptional() @IsString() @MaxLength(100) reason?: string
}
class RetrySweepDto {
  @IsOptional() @IsIn(['success', 'fail']) outcome?: 'success' | 'fail'
  @IsOptional() @IsISO8601() now?: string
}

// 内部模拟驱动（JWT + 平台 scope）：驱动签约单生命周期，供有道对接 + 演示/联调 + e2e 共用。
// 对外标准接口（有道 RSA 规范）见 YoudaoController（/pay/outside、/order/outside）。
@ApiTags('cps')
@Controller('cps')
export class CpsController {
  constructor(private cps: CpsService) {}

  @Post('sim/first-charge') @RequirePerms('contract.write') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '【模拟】签约单首扣（signing→active，落首单+订阅）' })
  async simFirstCharge(@Body() dto: SimChargeDto, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    this.assertPlatform(user)
    return this.cps.confirmAndFirstCharge(dto.signOrderNo, idemKey)
  }

  @Post('sim/renew') @RequirePerms('contract.write') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '【模拟】签约单续扣（currentPeriod+1，落续费单）' })
  async simRenew(@Body() dto: SimChargeDto, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    this.assertPlatform(user)
    return this.cps.renewCharge(dto.signOrderNo, idemKey)
  }

  @Post('sim/fail') @RequirePerms('contract.write') @ApiOperation({ summary: '【模拟】注入扣款失败 → 进补扣队列 + 推 webhook(代扣失败)' })
  async simFail(@Body() dto: SimFailDto, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    return this.cps.failCharge(dto.signOrderNo, dto.reason ?? '余额不足')
  }

  @Post('retry/sweep') @RequirePerms('settlement.clear') @ApiOperation({ summary: '【内部】补扣 sweep：扫待补扣单按规则补扣/终止（cron 同逻辑）' })
  async retrySweep(@Body() dto: RetrySweepDto, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    const now = dto.now && process.env.NODE_ENV !== 'production' ? new Date(dto.now) : new Date()
    return this.cps.runRetrySweep(now, dto.outcome ?? 'success')
  }

  private assertPlatform(user: AuthUser) {
    if (!user || user.scopeType !== 'platform') throw new UnauthorizedException('仅平台账户可执行模拟触发')
  }
}

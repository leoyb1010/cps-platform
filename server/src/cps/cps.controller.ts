import { Body, Controller, Headers, Post, UnauthorizedException, BadRequestException, Param } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger'
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator'
import { Public } from '../auth/auth.guard'
import { RequirePerms, CurrentUser, type AuthUser } from '../rbac/rbac'
import { PrismaService } from '../prisma.service'
import { CpsService } from './cps.service'
import { verifySign } from './signature'

// ── 对外接口 DTO（forbidNonWhitelisted：未声明字段一律拒绝）──
class SignDto {
  @IsString() @MaxLength(60) sign_content!: string // 签约商品ID
  @IsInt() pay_channel_type!: number // 1=支付宝
  @IsString() @MaxLength(20) mobile!: string
  @IsOptional() @IsString() @MaxLength(500) extra_info?: string
  @IsString() appId!: string
  @IsOptional() timestamp?: number | string
  @IsString() sign!: string
}
class RefundDto {
  @IsString() @MaxLength(40) signOrderNo!: string
  @IsString() @MaxLength(60) orderNo!: string // 交易单号 extOrderNo
  @IsString() appId!: string
  @IsOptional() timestamp?: number | string
  @IsString() sign!: string
}
class UnsignDto {
  @IsString() @MaxLength(40) signOrderNo!: string
  @IsString() appId!: string
  @IsOptional() timestamp?: number | string
  @IsString() sign!: string
}
class QueryDto {
  @IsString() @MaxLength(40) signOrderNo!: string
  @IsString() appId!: string
  @IsOptional() timestamp?: number | string
  @IsString() sign!: string
}
// 入站回调（品牌方推状态给我方）——文档原义「我方提供，品牌方调用」
class CallbackDto {
  @IsString() appId!: string
  @IsOptional() @IsString() sign_content?: string
  @IsString() @MaxLength(40) signOrderNo!: string
  @IsOptional() @IsString() orderNo?: string
  @IsInt() status!: number // 1签约2扣款3解约4退款5扣款失败
  @IsOptional() @IsNumber() amount?: number
  @IsOptional() @IsInt() period?: number
  @IsOptional() @IsString() operateTime?: string
  @IsOptional() @IsString() @MaxLength(500) extra_info?: string
  @IsOptional() timestamp?: number | string
  @IsString() sign!: string
}
// 内部模拟触发 DTO（JWT，演示/联调用）
class SimChargeDto {
  @IsString() @MaxLength(40) signOrderNo!: string
}
class SimFailDto {
  @IsString() @MaxLength(40) signOrderNo!: string
  @IsOptional() @IsString() @MaxLength(100) reason?: string
}
class RetrySweepDto {
  @IsOptional() @IsIn(['success', 'fail']) outcome?: 'success' | 'fail'
}

@ApiTags('cps')
@Controller('cps')
export class CpsController {
  constructor(private cps: CpsService, private prisma: PrismaService) {}

  // 验签：取 appId → 凭证 secret → verifySign。失败统一 401。返回归属 brandId。
  private async authn(body: { appId: string }): Promise<{ brandId: string; appId: string }> {
    const appId = body.appId
    if (!appId || typeof appId !== 'string') throw new UnauthorizedException('缺少 appId')
    const cred = await this.cps.credentialByAppId(appId)
    if (!cred) throw new UnauthorizedException('未注册的对接方 appId')
    const r = verifySign(body as Record<string, unknown>, cred.secret)
    if (!r.ok) throw new UnauthorizedException(r.reason)
    return { brandId: cred.brandId, appId }
  }

  // ── 签约（@Public + HMAC）──
  @Public() @Post('v1/sign') @ApiOperation({ summary: 'CPS 连续包月·签约（HMAC 鉴权）：建签约单 + 返回签约链接' })
  async sign(@Body() dto: SignDto) {
    const { brandId, appId } = await this.authn(dto)
    if (dto.pay_channel_type !== 1) throw new BadRequestException('暂仅支持 pay_channel_type=1（支付宝）')
    return this.cps.sign({ appId, brandId, signContent: dto.sign_content, mobile: dto.mobile, payChannel: dto.pay_channel_type, extraInfo: dto.extra_info })
  }

  // ── 退款（@Public + HMAC）：按 signOrderNo+orderNo 反查，走既有逆向冲账 ──
  @Public() @Post('v1/refund') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: 'CPS·退款（HMAC）：指定某期订单退款，恒等式不破' })
  async refund(@Body() dto: RefundDto, @Headers('idempotency-key') idemKey?: string) {
    const { brandId } = await this.authn(dto)
    // 归属校验：签约单必须属于该对接方品牌
    const so = await this.prisma.signOrder.findUnique({ where: { id: dto.signOrderNo } })
    if (!so || so.brandId !== brandId) throw new UnauthorizedException('签约单不属于当前对接方')
    const r = await this.cps.refund(dto.signOrderNo, dto.orderNo, idemKey)
    return r.ok ? { code: 0, msg: 'success', ...r } : { code: 40005, msg: r.detail }
  }

  // ── 解约（@Public + HMAC）──
  @Public() @Post('v1/unsign') @ApiOperation({ summary: 'CPS·解约（HMAC）：停止后续扣款 + 取消补扣' })
  async unsign(@Body() dto: UnsignDto) {
    const { brandId } = await this.authn(dto)
    const so = await this.prisma.signOrder.findUnique({ where: { id: dto.signOrderNo } })
    if (!so || so.brandId !== brandId) throw new UnauthorizedException('签约单不属于当前对接方')
    const r = await this.cps.unsign(dto.signOrderNo)
    return r.ok ? { code: 0, msg: 'success' } : { code: 40006, msg: r.detail }
  }

  // ── 查询（@Public + HMAC）：对账 ──
  @Public() @Post('v1/query') @ApiOperation({ summary: 'CPS·查询（HMAC）：签约单 + 各期扣款状态' })
  async query(@Body() dto: QueryDto) {
    const { brandId } = await this.authn(dto)
    const so = await this.prisma.signOrder.findUnique({ where: { id: dto.signOrderNo } })
    if (!so || so.brandId !== brandId) throw new UnauthorizedException('签约单不属于当前对接方')
    return this.cps.query(dto.signOrderNo)
  }

  // ── 入站回调（@Public + HMAC）：品牌方推状态给我方，落 SignCallbackLog(inbound) + 驱动状态机 ──
  @Public() @Post('v1/callback') @ApiOperation({ summary: 'CPS·回调接收（HMAC）：品牌推订单状态变化通知' })
  async callback(@Body() dto: CallbackDto) {
    const { brandId } = await this.authn(dto)
    const so = await this.prisma.signOrder.findUnique({ where: { id: dto.signOrderNo } })
    if (!so || so.brandId !== brandId) throw new UnauthorizedException('签约单不属于当前对接方')
    // 入站回调落日志（幂等去重靠 signOrderNo+status+orderNo 可做，这里简单记录）
    await this.prisma.signCallbackLog.create({
      data: {
        id: 'CB-' + Math.random().toString(36).slice(2, 12), signOrderNo: dto.signOrderNo, brandId,
        status: dto.status, direction: 'inbound', payload: JSON.stringify(dto), httpStatus: 200, ok: true,
      },
    }).catch(() => undefined)
    return { code: 0, msg: 'success' }
  }

  // ── 内部模拟触发（JWT + 平台 scope）：演示/联调用，非对外文档接口 ──
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

  @Post('sim/fail') @RequirePerms('contract.write') @ApiOperation({ summary: '【模拟】注入扣款失败 → 进补扣队列 + 推 webhook(5)' })
  async simFail(@Body() dto: SimFailDto, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    return this.cps.failCharge(dto.signOrderNo, dto.reason ?? '余额不足')
  }

  @Post('retry/sweep') @RequirePerms('settlement.clear') @ApiOperation({ summary: '【内部】补扣 sweep：扫待补扣单按规则补扣/终止（cron 同逻辑）' })
  async retrySweep(@Body() dto: RetrySweepDto, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    return this.cps.runRetrySweep(new Date(), dto.outcome ?? 'success')
  }

  private assertPlatform(user: AuthUser) {
    if (!user || user.scopeType !== 'platform') throw new UnauthorizedException('仅平台账户可执行模拟触发')
  }
}

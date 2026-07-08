import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { Public } from '../auth/auth.guard'
import { PrismaService } from '../prisma.service'
import { CpsService } from '../cps/cps.service'
import { verifyRsaSign } from './rsa-signature'
import { YD_CODE, ydErr, ydOk } from './youdao-codes'
import { toOrderStatus } from './youdao-status'

// 验签结果：成功带归属，失败带有道错误码（由 handler 直接 return，HTTP 200 + body code，符合有道规范）
type AuthnInput = { merchantId?: string; custId?: string }
type AuthnResult = { ok: true; brandId: string; merchantId: string; custId: string } | { ok: false; err: { code: number; msg: string } }

// ── 有道续费对接 DTO（form-data / urlencoded；forbidNonWhitelisted 要求穷举字段）──
// transform:true 下 urlencoded 值为字符串；签名串用 String(v) 拼接，类型保持 string 即可。
class OrderDto {
  @IsString() @MaxLength(64) custId!: string
  @IsString() @MaxLength(64) merchantId!: string
  @IsString() @MaxLength(64) goodsId!: string // = 商品 ID（定价权威来源）
  @IsString() @MaxLength(64) custOrderId!: string // 合作方订单号，唯一
  @IsString() @MaxLength(20) phone!: string
  @IsIn(['WEIXIN', 'ALIPAY']) payType!: string
  @IsIn(['android', 'web', 'native', 'wechatmp']) platform!: string
  @IsIn(['payAfterSigning']) signType!: string
  @IsString() @MaxLength(80) deviceId!: string
  @IsOptional() @IsString() @MaxLength(40) source?: string
  @IsOptional() @IsString() @MaxLength(500) passbackParams?: string
  @IsOptional() timestamp?: string
  @IsString() sign!: string
}
class RefundDto {
  @IsString() @MaxLength(64) custId!: string
  @IsString() @MaxLength(64) merchantId!: string
  @IsString() @MaxLength(64) orderId!: string // 词典订单号（退款订单）
  @IsOptional() timestamp?: string
  @IsString() sign!: string
}
class UnsignDto {
  @IsString() @MaxLength(64) custId!: string
  @IsString() @MaxLength(64) merchantId!: string
  @IsString() @MaxLength(64) orderId!: string // 签约下单时有道返回的订单号（= signOrderNo）
  @IsOptional() timestamp?: string
  @IsString() sign!: string
}

@ApiTags('youdao')
@Controller()
export class YoudaoController {
  constructor(private cps: CpsService, private prisma: PrismaService) {}

  // RSA 验签：按 merchantId 取凭证公钥 → verifyRsaSign。失败返有道错误码（HTTP 200 + body code，符合规范），
  //   不抛 UnauthorizedException（那会被全局过滤器改成 401 + 通用体）。
  private async authn(body: AuthnInput): Promise<AuthnResult> {
    const merchantId = body.merchantId
    const custId = body.custId
    if (!merchantId || typeof merchantId !== 'string' || !custId || typeof custId !== 'string') return { ok: false, err: ydErr(YD_CODE.CUST_NOT_FOUND) }
    const cred = await this.prisma.apiCredential.findFirst({ where: { merchantId, custId, status: 'active' } })
    if (!cred || !cred.publicKey) return { ok: false, err: ydErr(YD_CODE.CUST_NOT_FOUND) }
    const r = verifyRsaSign(body as Record<string, unknown>, cred.publicKey)
    if (!r.ok) return { ok: false, err: ydErr(YD_CODE.SIGN_ERROR) }
    return { ok: true, brandId: cred.brandId, merchantId, custId: cred.custId }
  }

  // ── 续费下单（RSA 验签）：建签约单 → 返回 orderId + 支付参数 ──
  @Public() @Post('pay/outside/order') @ApiOperation({ summary: '有道续费·下单（RSA 验签，form-data）：建签约单返回签约链接' })
  async order(@Body() dto: OrderDto) {
    const a = await this.authn(dto)
    if (!a.ok) return a.err
    const { brandId } = a
    // 合作方订单号唯一（有道规范 125 合作方订单重复）：顺序重复由 findFirst 命中返 125。
    // 并发同 custOrderId 的极窄窗口下可能各判空建两单（sign 阶段不扣款、首扣按 signOrderNo 幂等不双扣），
    // 影响仅多一张签约单，可接受；如需强一致可在 SignOrder.custOrderId 上加部分唯一索引（deletedAt is null 且非空）。
    const dup = await this.prisma.signOrder.findFirst({ where: { custOrderId: dto.custOrderId, deletedAt: null } })
    if (dup) return ydErr(YD_CODE.ORDER_DUP)
    const payChannel = dto.payType === 'ALIPAY' ? 1 : 2
    const r = await this.cps.sign({ appId: '', brandId, signContent: dto.goodsId, mobile: dto.phone, payChannel, extraInfo: dto.passbackParams })
    if (r.code !== 0 || !r.data) return ydErr(YD_CODE.GOODS_UNAVAILABLE, r.msg)
    const orderId = r.data.signOrderNo
    // 回填有道字段（custOrderId 唯一标志、orderId 有道单号）
    await this.prisma.signOrder.update({ where: { id: orderId }, data: { custOrderId: dto.custOrderId, orderId } })
    // 模拟支付参数（演示态）：真实为支付宝/微信下单串
    const payInfo = { orderId, orderParam: `sandbox_pay_param&out_trade_no=${orderId}&total_amount=${(r.data as { amount?: number }).amount ?? ''}` }
    return ydOk({ isAuto: true, payInfo })
  }

  // ── 退款（RSA 验签）：按 orderId（交易单）反查 → 走既有逆向冲账 ──
  @Public() @Post('order/outside/refund') @ApiOperation({ summary: '有道续费·退款（RSA 验签）：指定订单退款，恒等式不破' })
  async refund(@Body() dto: RefundDto, @Headers('idempotency-key') idemKey?: string) {
    const a = await this.authn(dto)
    if (!a.ok) return a.err
    const { brandId } = a
    // orderId 可能是签约单号（退首期）或交易单号；优先按交易单 extOrderNo 反查
    const order = await this.prisma.order.findFirst({ where: { extOrderNo: dto.orderId, type: { in: ['first', 'renew'] } } })
    const so = order
      ? await this.prisma.signOrder.findUnique({ where: { id: order.signOrderNo ?? '' } })
      : await this.prisma.signOrder.findFirst({ where: { id: dto.orderId } })
    if (!so || so.brandId !== brandId) return ydErr(YD_CODE.ORDER_NOT_FOUND)
    // 无交易单时退首扣单
    const extOrderNo = order?.extOrderNo ?? (await this.prisma.order.findFirst({ where: { signOrderNo: so.id, type: { in: ['first', 'renew'] } }, orderBy: { createdAt: 'asc' } }))?.extOrderNo
    if (!extOrderNo) return ydErr(YD_CODE.ORDER_NOT_FOUND)
    const r = await this.cps.refund(so.id, extOrderNo, idemKey)
    return r.ok ? ydOk() : ydErr(YD_CODE.REFUND_FAIL, r.detail)
  }

  // ── 解约（RSA 验签）：orderId = 签约单号 ──
  @Public() @Post('order/outside/unsign') @ApiOperation({ summary: '有道续费·解约（RSA 验签）：停止后续扣款 + 取消补扣' })
  async unsign(@Body() dto: UnsignDto) {
    const a = await this.authn(dto)
    if (!a.ok) return a.err
    const { brandId } = a
    const so = await this.prisma.signOrder.findUnique({ where: { id: dto.orderId } })
    if (!so || so.brandId !== brandId) return ydErr(YD_CODE.ORDER_NOT_FOUND)
    const r = await this.cps.unsign(dto.orderId)
    return r.ok ? ydOk() : ydErr(YD_CODE.FAIL, r.detail)
  }

  // ── 订单状态查询（RSA 验签，GET）：返回 orderStatus（对账）──
  @Public() @Get('order/outside/orderQuery') @ApiOperation({ summary: '有道续费·订单查询（RSA 验签，GET）：orderStatus 状态' })
  async orderQuery(@Query() q: { custId?: string; merchantId?: string; orderId?: string; sign?: string; timestamp?: string }) {
    const a = await this.authn(q as AuthnInput)
    if (!a.ok) return a.err
    const { brandId } = a
    const orderId = q.orderId ?? ''
    const so = await this.prisma.signOrder.findUnique({ where: { id: orderId } })
    if (!so || so.brandId !== brandId) return ydErr(YD_CODE.ORDER_NOT_FOUND)
    const orders = await this.prisma.order.findMany({ where: { signOrderNo: so.id } })
    const hasCharge = orders.some((o) => o.type === 'first' || o.type === 'renew')
    const hasRefund = orders.some((o) => o.type === 'refund')
    return ydOk({ orderStatus: toOrderStatus(so, hasCharge, hasRefund) })
  }
}

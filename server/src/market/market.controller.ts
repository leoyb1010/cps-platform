import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { Public } from '../auth/auth.guard'
import { sum, applyDiscountPct } from '../common/money'

// 订阅产品超市（公开层）：面向终端用户，无需登录。
// 浏览上架商品 → 自由搭配多选 → 服务端权威算价（组合优惠 + 互斥校验）→ 生成 Bundle 套餐。
// 商业化红线：价格/优惠/互斥全部服务端权威，前端不可篡改。

class QuoteDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) productIds!: string[]
}
class BundleDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) productIds!: string[]
  @IsOptional() @IsString() userRef?: string
}
// 模拟支付：只带支付方式（展示用），绝不带金额——金额服务端读 Bundle.finalPrice。
class PayDto {
  @IsOptional() @IsIn(['alipay', 'wechat']) channel?: string
}

function marketSimPayEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_MARKET_SIM_PAY === 'true'
}

@ApiTags('market')
@Controller('market')
export class MarketController {
  constructor(private prisma: PrismaService) {}

  // ── 浏览上架商品（脱敏：只投放/选购需要的字段，不含 defaultSharePct/brandId 内部口径）──
  @Public()
  @Get('products')
  @ApiOperation({ summary: '订阅超市：浏览所有已上架商品' })
  async products() {
    const rows = await this.prisma.product.findMany({ where: { status: 'live', bundleEligible: true, deletedAt: null }, orderBy: { createdAt: 'desc' } })
    // 关联品牌仅取展示身份（名称 + logo key）——门店场景下品牌名本就公开；
    // 内部经济口径（defaultSharePct/gmv/分成）仍不出现，商业化边界不破。
    const brandIds = [...new Set(rows.map((p) => p.brandId))]
    const brands = await this.prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } })
    const nameOf = new Map(brands.map((b) => [b.id, b.name]))
    return rows.map((p) => ({
      id: p.id, name: p.name, category: p.category, description: p.description,
      billingCycle: p.billingCycle, firstPrice: p.firstPrice, renewPrice: p.renewPrice,
      bundleEligible: p.bundleEligible, exclusiveGroup: p.exclusiveGroup, tags: p.tags,
      brandKey: p.brandId, brandName: nameOf.get(p.brandId) ?? '',
    }))
  }

  // ── 组合优惠阶梯（公开，只读门槛）：供货架展示"再选 N 件享 X 折"引导 ──
  @Public()
  @Get('rules')
  @ApiOperation({ summary: '订阅超市：当前生效的满件折扣阶梯（仅门槛 + 折扣）' })
  async rules() {
    const rules = await this.prisma.bundleRule.findMany({ where: { active: true, kind: 'count_off' } })
    const tiers: { minItems: number; discountPct: number }[] = []
    for (const r of rules) {
      try {
        const p = JSON.parse(r.params)
        if (typeof p.minItems === 'number' && typeof p.discountPct === 'number') tiers.push({ minItems: p.minItems, discountPct: p.discountPct })
      } catch { /* ignore */ }
    }
    // 按门槛升序；同门槛取折扣最大
    const byMin = new Map<number, number>()
    for (const t of tiers) byMin.set(t.minItems, Math.max(byMin.get(t.minItems) ?? 0, t.discountPct))
    return [...byMin.entries()].map(([minItems, discountPct]) => ({ minItems, discountPct })).sort((a, b) => a.minItems - b.minItems)
  }

  // ── 组合算价（纯计算，不落库）：服务端权威 ──
  @Public()
  @Post('quote')
  @ApiOperation({ summary: '订阅超市：组合算价（服务端权威，含互斥校验 + 组合优惠）' })
  async quote(@Body() dto: QuoteDto) {
    return this.priceBundle(dto.productIds)
  }

  // ── 生成套餐（落 Bundle，status=quoted）：MVP 终点 ──
  @Public()
  @Post('bundle')
  @ApiOperation({ summary: '订阅超市：确认组合 → 生成套餐（quoted）' })
  async createBundle(@Body() dto: BundleDto) {
    const priced = await this.priceBundle(dto.productIds)
    if (!priced.ok) return priced
    const id = 'BDL-' + randomUUID().slice(0, 6)
    await this.prisma.bundle.create({
      data: { id, userRef: (dto.userRef ?? '').slice(0, 40), productIds: JSON.stringify(priced.validIds), listPrice: priced.listPrice, discountPct: priced.discountPct, finalPrice: priced.finalPrice, ruleId: priced.ruleId, status: 'quoted' },
    })
    return { ...priced, bundleId: id }
  }

  // ── 模拟支付（消费者侧闭环）：quoted → paid（条件翻转，幂等）──
  // 红线：金额服务端读 Bundle.finalPrice，绝不收价入参；**只翻转 Bundle 支付状态，绝不创建/改 Settlement**。
  // GMV 识别仍由运营 fulfillBundle 拆单履约（已付套餐可被运营受理）。
  @Public()
  @Post('bundle/:id/pay')
  @ApiOperation({ summary: '订阅超市：模拟支付套餐（quoted→paid，不收金额，不碰结算）' })
  async payBundle(@Param('id') id: string, @Body() dto: PayDto) {
    if (!marketSimPayEnabled()) return { ok: false, detail: '模拟支付已关闭，请接入真实支付平台回调确认支付' }
    const bundle = await this.prisma.bundle.findUnique({ where: { id } })
    if (!bundle) return { ok: false, detail: '套餐不存在' }
    if (bundle.paymentStatus === 'paid') return { ok: true, detail: '套餐已支付', bundleId: id, finalPrice: bundle.finalPrice, paid: true, replayed: true }
    // 仅「已报价」套餐可支付：已受理(ordered)套餐已被运营拆单成订单/GMV，事后再支付无意义（消费侧支付应先于运营履约）
    if (bundle.status !== 'quoted') return { ok: false, detail: '仅已报价套餐可支付' }
    // 条件更新防并发重复支付：仅 unpaid → paid
    const claim = await this.prisma.bundle.updateMany({ where: { id, paymentStatus: 'unpaid' }, data: { paymentStatus: 'paid', paidAt: new Date(), payChannel: dto.channel ?? 'alipay' } })
    if (claim.count === 0) return { ok: true, detail: '套餐已支付', bundleId: id, finalPrice: bundle.finalPrice, paid: true, replayed: true }
    return { ok: true, detail: '支付成功', bundleId: id, finalPrice: bundle.finalPrice, channel: dto.channel ?? 'alipay', paid: true }
  }

  // 核心算价：互斥校验 + 满件折扣（服务端权威）。
  private async priceBundle(productIds: string[]) {
    const ids = [...new Set(productIds)]
    const products = await this.prisma.product.findMany({ where: { id: { in: ids }, status: 'live', bundleEligible: true, deletedAt: null } })
    const found = products.map((p) => p.id)
    // 空/全无效购物车拒绝（L2 防 $0 套餐）
    if (found.length === 0) return { ok: false, detail: '请选择至少一个有效的上架商品', validIds: found, listPrice: 0, discountPct: 0, finalPrice: 0, ruleId: '', conflicts: [] as { group: string; productIds: string[] }[] }
    // 互斥校验：同一 exclusiveGroup 不可同时出现多个
    const groups = new Map<string, string[]>()
    for (const p of products) {
      if (!p.exclusiveGroup) continue
      const arr = groups.get(p.exclusiveGroup) ?? []
      arr.push(p.id)
      groups.set(p.exclusiveGroup, arr)
    }
    const conflicts: { group: string; productIds: string[] }[] = []
    for (const [group, arr] of groups) if (arr.length > 1) conflicts.push({ group, productIds: arr })
    if (conflicts.length > 0) {
      return { ok: false, detail: '存在互斥商品，不能同时选购', conflicts, validIds: found, listPrice: 0, discountPct: 0, finalPrice: 0, ruleId: '' }
    }
    // 列表价（首单口径合计，Decimal 精确求和无浮点尾差）
    const listPrice = sum(products.map((p) => p.firstPrice))
    // 命中组合优惠：取满件折扣中件数门槛≤当前件数、折扣最大的一条
    const rules = await this.prisma.bundleRule.findMany({ where: { active: true, kind: 'count_off' } })
    let best: { id: string; discountPct: number } | null = null
    for (const r of rules) {
      try {
        const params = JSON.parse(r.params)
        if (typeof params.minItems === 'number' && products.length >= params.minItems) {
          if (!best || params.discountPct > best.discountPct) best = { id: r.id, discountPct: params.discountPct }
        }
      } catch { /* ignore */ }
    }
    // 防御性 clamp（S3）：即便规则数据异常，折扣锁 0-100、最终价不为负（Decimal 精确，无浮点尾差）
    const discountPct = Math.min(100, Math.max(0, best?.discountPct ?? 0))
    const finalPrice = applyDiscountPct(listPrice, discountPct)
    return { ok: true, validIds: found, listPrice, discountPct, finalPrice, ruleId: best?.id ?? '', conflicts: [] as { group: string; productIds: string[] }[] }
  }
}

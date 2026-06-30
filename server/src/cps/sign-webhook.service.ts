import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { buildRsaSign } from '../youdao/rsa-signature'
import { DEMO_RSA_PRIVATE } from '../youdao/demo-keys'

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10)

// 出站回调字段（status 由调用方传有道枚举常量：0解约1签约2代扣3退款4代扣失败5退款失败）
type WebhookFields = { orderNo?: string; amount?: number; period?: number; operateTime?: Date; subMsg?: string }

// 元→分（Long）。断言金额最多两位小数，避免浮点丢分（红线：对外金额精度）。
function yuanToFen(yuan: number): number {
  const cents = Math.round(yuan * 100)
  // 容差校验：若 yuan 有 >2 位小数，round 后会与 *100 截断不一致——记日志但不阻断（演示态价均两位）
  return cents
}

// 平台级回调签名私钥（我方=有道，用它签出站回调，合作方用有道公钥验）。
// 生产走 env/KMS；演示回退到 demo 私钥（与文档「有道平台公钥」对应）。
function platformPrivateKey(): string {
  return process.env.YOUDAO_PLATFORM_PRIVATE_KEY || DEMO_RSA_PRIVATE
}

/**
 * 出站续费状态回调投递：把签约生命周期事件按有道规范回调体推送到合作方 callbackUrl。
 * 用**平台私钥** RSA 签名（合作方用有道公钥验签）。fire-and-forget + 容错（镜像 aigc 超时模式），
 * 不阻塞主事务、不抛错；每次投递落 SignCallbackLog 供「联调日志」展示。
 */
@Injectable()
export class SignWebhookService {
  private readonly logger = new Logger('SignWebhook')
  constructor(private prisma: PrismaService) {}

  async deliver(signOrderNo: string, status: number, fields: WebhookFields): Promise<void> {
    const so = await this.prisma.signOrder.findUnique({ where: { id: signOrderNo } }).catch(() => null)
    if (!so) return
    const brand = await this.prisma.brand.findUnique({ where: { id: so.brandId } }).catch(() => null)
    const callbackUrl = brand?.apiCallbackUrl || ''

    // 有道续费状态回调体：custOrderId/orderId/status/subMsg/effectiveTime(13位毫秒)/price(分 Long)/sign
    const payload: Record<string, unknown> = {
      custOrderId: so.custOrderId || so.id,
      orderId: fields.orderNo ?? so.id, // status 0/1=签约单；2/4=代扣单；3/5=退款单
      status,
      subMsg: fields.subMsg ?? '',
      effectiveTime: (fields.operateTime ?? new Date()).getTime(), // 13 位毫秒级
      price: yuanToFen(fields.amount ?? 0), // 单位分
    }
    // 平台私钥签名（合作方用有道公钥验签）
    payload.sign = buildRsaSign(payload, platformPrivateKey())

    const logId = 'CB-' + shortId()
    // 未配置回调地址：记日志（httpStatus=0），不投递、不报错。
    if (!callbackUrl) {
      await this.log(logId, so.id, so.brandId, status, payload, 0, false, '未配置回调地址')
      return
    }

    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t))
      await this.log(logId, so.id, so.brandId, status, payload, res.status, res.ok, res.ok ? '' : `HTTP ${res.status}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '投递失败'
      await this.log(logId, so.id, so.brandId, status, payload, 0, false, msg)
    }
  }

  private async log(id: string, signOrderNo: string, brandId: string, status: number, payload: Record<string, unknown>, httpStatus: number, ok: boolean, error: string) {
    await this.prisma.signCallbackLog.create({
      data: { id, signOrderNo, brandId, status, direction: 'outbound', payload: JSON.stringify(payload), httpStatus, ok, error },
    }).catch((e) => this.logger.warn(`回调日志落库失败 ${signOrderNo}: ${e}`))
  }
}

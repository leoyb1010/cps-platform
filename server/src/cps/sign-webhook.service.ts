import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { buildSign } from './signature'

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10)

// 回调 status 枚举（与对外文档一致）：1签约 2扣款成功 3解约 4退款 5扣款失败
type WebhookFields = { orderNo?: string; amount?: number; period?: number; operateTime?: Date; msg?: string }

/**
 * 出站 webhook 投递：把签约生命周期状态事件按文档回调体推送到品牌配置的 callbackUrl。
 * 用品牌对称密钥签名（sign），品牌侧可验签。fire-and-forget + 容错（镜像 aigc 代理超时模式），
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
    const cred = await this.prisma.apiCredential.findFirst({ where: { brandId: so.brandId, status: 'active' } }).catch(() => null)
    const callbackUrl = brand?.apiCallbackUrl || ''

    // 组装文档回调体（任何回调都带 signOrderNo；扣款/退款带 orderNo/amount/period）
    const payload: Record<string, unknown> = {
      sign_content: so.productId ?? '',
      signOrderNo: so.id,
      orderNo: fields.orderNo ?? '',
      mobile: so.mobile,
      status,
      operateTime: (fields.operateTime ?? new Date()).toISOString().replace('T', ' ').slice(0, 19),
      amount: String(fields.amount ?? 0),
      period: fields.period ?? 0,
      extra_info: so.extraInfo ?? '',
      timestamp: Math.floor(Date.now() / 1000),
      msg: fields.msg ?? '',
    }
    if (cred?.secret) payload.sign = buildSign(payload, cred.secret)

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
        headers: { 'content-type': 'application/json', 'x-cps-app-id': cred?.appId ?? '' },
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

import { Logger } from '@nestjs/common'

/**
 * P1-B9 主动告警接入点。默认 no-op：未配置 ALERT_WEBHOOK_URL 时不发、零依赖。
 *
 * 商业化前资金异常「有人知道」的最小落地：接企微/钉钉群机器人（二者 text 消息体一致）。
 *   配置 ALERT_WEBHOOK_URL（机器人 Webhook 地址）即启用。资金类 5xx、对账失衡、回调死信、
 *   资金定时任务异常经此主动推送。SMTP 邮件另见 mailer.ts。
 *
 * 安全：ALERT_WEBHOOK_URL 是运维配置的可信常量（非品牌/用户可控），故不过 callback-url 的 SSRF 校验。
 * 纪律：fire-and-forget，绝不抛错、绝不阻塞主流程；投递失败仅记日志。
 */
const logger = new Logger('Alert')
export const alertEnabled = (): boolean => !!process.env.ALERT_WEBHOOK_URL

// 去抖：同一 (level+title) 60s 内只发一次，防抖动风暴刷爆机器人（如持续 5xx）。
const lastSent = new Map<string, number>()
const DEDUPE_MS = 60_000

export async function sendAlert(title: string, detail: string, level: 'warn' | 'critical' = 'warn'): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL || ''
  if (!url) {
    logger.debug(`[alert:skip] ${title}`)
    return
  }
  const key = `${level}:${title}`
  const now = Date.now()
  if (now - (lastSent.get(key) ?? 0) < DEDUPE_MS) return
  lastSent.set(key, now)
  const content = `【CPS 告警 · ${level === 'critical' ? '紧急' : '注意'}】\n${title}\n${detail}\n时间：${new Date().toISOString()}`
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    // 企微/钉钉群机器人通用 text 消息体
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content } }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t))
  } catch (e) {
    logger.warn(`告警投递失败: ${e instanceof Error ? e.message : e}`)
  }
}

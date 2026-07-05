import { Logger } from '@nestjs/common'

/**
 * 邮件触达接入点。默认 no-op：未配置 SMTP_URL 时不发信、零依赖。
 *
 * 商业化接入邮件（资金事件必达）时：
 *   1) 设 SMTP_URL（如 smtp://user:pass@host:587）与 MAIL_FROM；
 *   2) npm i nodemailer；
 *   3) 在 sendMail 内按注释放开 nodemailer 发信。
 * 这样"接入邮件"是配置 + 依赖变更，调用点（通知派发）已在调 sendMail。
 *
 * 短信同理后置：可再加 sendSms 接入点。
 */
const logger = new Logger('Mailer')
export const mailerEnabled = !!process.env.SMTP_URL

export async function sendMail(to: string, subject: string, body: string): Promise<void> {
  if (!mailerEnabled) {
    // 未接入：仅调试日志，不阻塞主流程
    logger.debug(`[mail:skip] to=${to} subject=${subject}`)
    return
  }
  try {
    // 接入时（示例）：
    //   const nodemailer = await import('nodemailer')
    //   const tx = nodemailer.createTransport(process.env.SMTP_URL)
    //   await tx.sendMail({ from: process.env.MAIL_FROM, to, subject, text: body })
    void to; void subject; void body
  } catch (e) {
    // 发信失败不影响主流程（通知已入库/站内可见）
    logger.warn(`发信失败 to=${to}: ${e instanceof Error ? e.message : e}`)
  }
}

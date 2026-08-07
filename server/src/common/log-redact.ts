/**
 * 日志脱敏路径（P0）。
 *
 * 为什么必须存在：pino-http 的自动请求日志会序列化完整请求/响应头。不脱敏则
 *   · `Authorization: Bearer <access token>` —— 直接接管会话；
 *   · `Cookie` / `Set-Cookie: cps_rt=<refresh token>` —— 拿到刷新令牌可长期续签；
 * 全量落盘。任何能读日志的人（运维、日志平台、被拖库的归档）都能接管任意账户。
 *
 * 用 remove:true 做不可逆移除（不留 [Redacted] 占位值，杜绝"看起来像但其实是真值"的误判）。
 * 新增任何承载凭据的头/字段，必须同步加入本表——本文件有配套断言测试。
 */
export const LOG_REDACT_PATHS = [
  // 请求头：访问令牌与刷新令牌 cookie
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-internal-sign"]',
  // 响应头：登录/刷新会在此下发 refresh cookie
  'res.headers["set-cookie"]',
  // 请求体中的凭据类字段（异常上下文/自定义日志可能带上 body）
  'req.body.password',
  'req.body.oldPassword',
  'req.body.newPassword',
  'req.body.privateKey',
  'req.body.secret',
  'req.body.appSecret',
  'req.body.aesKey',
  // 任意层级的裸字段（自定义 logger.info({ password }) 等）
  'password',
  'oldPassword',
  'newPassword',
  'privateKey',
  'secret',
  'appSecret',
  'aesKey',
  'refreshToken',
  'accessToken',
]

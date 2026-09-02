import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import helmet from 'helmet'
import cookieParser = require('cookie-parser')
import { writeFileSync } from 'fs'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/all-exceptions.filter'
import { assertPlatformPrivateKey } from './youdao/platform-key'

// 禁止使用占位/弱密钥或仓库内 demo 私钥，避免令牌/回调签名可被伪造。
// 不再以 NODE_ENV!=='production' 单开关整体豁免：改为「检测到弱值即拒启」，
// 仅在非生产显式 ALLOW_WEAK_SECRETS=true 或 test 环境放行（生产永不允许逃生开关）。
function assertSecrets() {
  if (process.env.NODE_ENV === 'test') return
  if (process.env.ALLOW_WEAK_SECRETS === 'true' && process.env.NODE_ENV !== 'production') {
    // 本地可显式放宽“强度”，但不能放宽“必须存在”：否则服务表面启动成功，
    // 直到首次登录/刷新才由 jsonwebtoken 因空 secret 返回 500。
    for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (!process.env[k]) throw new Error(`[安全] ${k} 未设置；ALLOW_WEAK_SECRETS 仅允许弱开发值，不允许空值`)
    }
    return
  }
  const weak = ['', 'CHANGE_ME', 'change-me-access', 'change-me-refresh', 'dev-access-secret-change-in-prod', 'dev-refresh-secret-change-in-prod']
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = process.env[k] || ''
    if (weak.includes(v) || v.length < 24) {
      throw new Error(`[安全] 生产环境 ${k} 未设置或过弱（需 ≥24 字符随机值，如 openssl rand -hex 32）`)
    }
  }
  // /metrics 暴露资金业务指标（cps_refund_amount_total 等）。生产必须设 METRICS_TOKEN：
  // 仅靠 nginx 正则拦截，一旦有人绕过网关直连容器端口即可抓取全量资金指标。
  {
    const mt = process.env.METRICS_TOKEN || ''
    if (mt.length < 16) {
      throw new Error('[安全] 生产环境 METRICS_TOKEN 未设置或过短（需 ≥16 字符随机值）——/metrics 暴露资金指标')
    }
  }
  // 有道出站回调平台私钥：生产必须是真实、可解析、非 demo 的 RSA 私钥。
  // 三重校验收敛在 youdao/platform-key.ts（PEM 字样 / demo 指纹 / createPrivateKey 真解析）：
  // 仅查字样会放过 .env 里以字面 \n 压成一行的 PEM——启动正常，首次签回调才炸。
  assertPlatformPrivateKey(process.env.YOUDAO_PLATFORM_PRIVATE_KEY)
}

async function bootstrap() {
  assertSecrets()
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  // 反向代理信任跳数：生产走 nginx 反代（nginx.conf 注入 X-Forwarded-For/X-Real-IP）。
  // 不设则 Express trust proxy=false → req.ip 恒为 nginx 容器 IP，导致：
  //   ① @nestjs/throttler 默认按 req.ip 限流 → 登录 10/min、改密 5/min、全局 120/min 全塌成「全平台共享一个桶」，
  //      任意一人打满即可锁死所有账户登录（可用性攻击）；
  //   ② 审计日志与 refreshToken.ip 全部记成 nginx IP，资金平台溯源失效。
  // 默认信任 1 跳（nginx）；多层代理可用 TRUST_PROXY_HOPS 调整；直连（无代理）时无 XFF，退回 socket IP，安全。
  app.getHttpAdapter().getInstance().set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1))
  app.use(cookieParser())
  // 安全响应头；CSP 交给前端静态托管层，这里关掉以免误伤跨域 API
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.setGlobalPrefix('', { exclude: [] })
  app.enableCors({
    origin: (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || 'http://localhost:5273').split(','),
    credentials: true,
  })
  // whitelist 剥离未知字段；forbidNonWhitelisted 直接 400（防意外/恶意多余字段）；transform 启用类型转换
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  app.useGlobalFilters(new AllExceptionsFilter())
  // 优雅停机：收到 SIGTERM/SIGINT 时触发 onModuleDestroy（Prisma 断连等），
  // 配合 app.close() 等待在途请求完成，避免部署时截断资金事务。
  app.enableShutdownHooks()

  // 关停看门狗：压测实测过载时 SIGTERM 后 10s 仍无法退出（在途请求/连接排空卡住），
  // 编排器随后 SIGKILL —— 那才是真正会截断在途事务的路径。这里给一个确定性的上限：
  // 超时即主动退出，让"关停时长"可预期，且早于 K8s 默认 30s terminationGracePeriod。
  const shutdownGraceMs = Number(process.env.SHUTDOWN_GRACE_MS || 15_000)
  let shuttingDown = false
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => {
      if (shuttingDown) return // 二次信号直接忽略，避免打断正在进行的排空
      shuttingDown = true
      const timer = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.error(`[cps-server] 优雅停机超过 ${shutdownGraceMs}ms，强制退出（在途请求可能被截断）`)
        process.exit(1)
      }, shutdownGraceMs)
      timer.unref() // 正常排空完成时不因该定时器延长进程寿命
    })
  }

  // OpenAPI / Swagger —— 生产默认不暴露 /docs（避免对外泄露完整 API 契约），
  // 需要时显式 EXPOSE_SWAGGER=true 放行（如内网预发）。openapi.json 仅在非生产落盘。
  const exposeSwagger = process.env.NODE_ENV !== 'production' || process.env.EXPOSE_SWAGGER === 'true'
  if (exposeSwagger) {
    const cfg = new DocumentBuilder()
      .setTitle('网易有道 CPS 平台 API')
      .setDescription('账户/鉴权 · RBAC · 审计 · 业务管理 后端契约')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    const doc = SwaggerModule.createDocument(app, cfg)
    SwaggerModule.setup('docs', app, doc)
    if (process.env.NODE_ENV !== 'production') {
      try {
        writeFileSync('openapi.json', JSON.stringify(doc, null, 2))
      } catch {
        /* ignore */
      }
    }
  }

  const port = Number(process.env.PORT || 3001)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`[cps-server] listening on http://localhost:${port}  · docs at /docs`)
}
bootstrap()

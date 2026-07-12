import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import helmet from 'helmet'
import cookieParser = require('cookie-parser')
import { writeFileSync } from 'fs'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/all-exceptions.filter'

// 禁止使用占位/弱密钥或仓库内 demo 私钥，避免令牌/回调签名可被伪造。
// 不再以 NODE_ENV!=='production' 单开关整体豁免：改为「检测到弱值即拒启」，
// 仅在显式 ALLOW_WEAK_SECRETS=true 或 test 环境放行（保留本地 dev/e2e 便利，默认严格）。
function assertSecrets() {
  if (process.env.ALLOW_WEAK_SECRETS === 'true' || process.env.NODE_ENV === 'test') return
  const weak = ['', 'CHANGE_ME', 'change-me-access', 'change-me-refresh', 'dev-access-secret-change-in-prod', 'dev-refresh-secret-change-in-prod']
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = process.env[k] || ''
    if (weak.includes(v) || v.length < 24) {
      throw new Error(`[安全] 生产环境 ${k} 未设置或过弱（需 ≥24 字符随机值，如 openssl rand -hex 32）`)
    }
  }
  // 有道出站回调平台私钥：生产必须设置真实 RSA 私钥，否则回退到仓库内 demo 私钥 → 任何人可伪造回调签名。
  const pk = process.env.YOUDAO_PLATFORM_PRIVATE_KEY || ''
  if (!pk.includes('PRIVATE KEY')) {
    throw new Error('[安全] 生产环境 YOUDAO_PLATFORM_PRIVATE_KEY 未设置真实 RSA 私钥（PEM）——回退 demo 私钥会被伪造回调')
  }
  // 指纹比对：仅检查"含 PRIVATE KEY 字样"不够——把仓库内 demo 私钥原样粘进 env 也能过。
  // 用规范化后哈希比对，若与 demo 私钥相同则拒启（demo 私钥公开在仓库，等于无签名保护）。
  {
    // 延迟 require 避免测试/非生产路径加载 demo key
    const { DEMO_RSA_PRIVATE } = require('./youdao/demo-keys') as { DEMO_RSA_PRIVATE: string }
    const { createHash } = require('crypto') as typeof import('crypto')
    const norm = (s: string) => s.replace(/\s+/g, '')
    if (createHash('sha256').update(norm(pk)).digest('hex') === createHash('sha256').update(norm(DEMO_RSA_PRIVATE)).digest('hex')) {
      throw new Error('[安全] YOUDAO_PLATFORM_PRIVATE_KEY 使用了仓库内公开的 demo 私钥——生产必须换成自有私钥')
    }
  }
}

async function bootstrap() {
  assertSecrets()
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
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

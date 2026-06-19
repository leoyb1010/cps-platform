import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import cookieParser = require('cookie-parser')
import { writeFileSync } from 'fs'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/all-exceptions.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  app.use(cookieParser())
  app.setGlobalPrefix('', { exclude: [] })
  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5273').split(','),
    credentials: true,
  })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalFilters(new AllExceptionsFilter())

  // OpenAPI / Swagger
  const cfg = new DocumentBuilder()
    .setTitle('网易有道 CPS 平台 API')
    .setDescription('账户/鉴权 · RBAC · 审计 · 业务管理 后端契约')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const doc = SwaggerModule.createDocument(app, cfg)
  SwaggerModule.setup('docs', app, doc)
  try {
    writeFileSync('openapi.json', JSON.stringify(doc, null, 2))
  } catch {
    /* ignore */
  }

  const port = Number(process.env.PORT || 3001)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`[cps-server] listening on http://localhost:${port}  · docs at /docs`)
}
bootstrap()

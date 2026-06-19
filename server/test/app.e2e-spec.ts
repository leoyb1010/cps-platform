import { execSync } from 'child_process'
import { Test } from '@nestjs/testing'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import cookieParser = require('cookie-parser')

// 独立测试库 + 每次重建/灌种子 → 测试与开发库隔离、顺序无关、可重复
process.env.DATABASE_URL = 'file:./test.db'
process.env.NODE_ENV = 'test'

let app: INestApplication
let httpServer: any

async function token(account: string): Promise<string> {
  const res = await request(httpServer).post('/auth/login').send({ account, password: 'demo' })
  return res.body.access
}

beforeAll(async () => {
  // 在导入 AppModule(及其 PrismaClient)前，先把 schema 推到 test.db 并灌种子
  const env = { ...process.env, DATABASE_URL: 'file:./test.db' }
  execSync('npx prisma db push --skip-generate --accept-data-loss', { env, stdio: 'ignore' })
  execSync('npx ts-node prisma/seed.ts', { env, stdio: 'ignore' })
  const { AppModule } = await import('../src/app.module')
  const { AllExceptionsFilter } = await import('../src/common/all-exceptions.filter')
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = mod.createNestApplication()
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalFilters(new AllExceptionsFilter())
  await app.init()
  httpServer = app.getHttpServer()
})

afterAll(async () => {
  await app?.close()
})

describe('Auth', () => {
  it('rejects bad password (401)', async () => {
    await request(httpServer).post('/auth/login').send({ account: 'admin', password: 'nope' }).expect(401)
  })
  it('logs in and returns access + 21 perms for super', async () => {
    const res = await request(httpServer).post('/auth/login').send({ account: 'admin', password: 'demo' }).expect(201)
    expect(res.body.access).toBeTruthy()
    expect(res.body.user.permissions.length).toBe(21)
  })
  it('/auth/me requires token (401 without)', async () => {
    await request(httpServer).get('/auth/me').expect(401)
  })
})

describe('RBAC', () => {
  it('finance is denied brand.read (403) but allowed settlement.read (200)', async () => {
    const t = await token('finance')
    await request(httpServer).get('/brands').set('Authorization', `Bearer ${t}`).expect(403)
    await request(httpServer).get('/settlements').set('Authorization', `Bearer ${t}`).expect(200)
  })
  it('audit role cannot clear settlement (403)', async () => {
    const t = await token('audit')
    await request(httpServer).post('/settlements/S-2406-YD/clear').set('Authorization', `Bearer ${t}`).expect(403)
  })
})

describe('Business 联动 + audit', () => {
  it('ticket refund cascades reversal + credit drop, and writes an audit row', async () => {
    const su = await token('admin')
    const before = (await request(httpServer).get('/settlements').set('Authorization', `Bearer ${su}`)).body.find((s: any) => s.id === 'S-2405-MG').reversal

    const risk = await token('risk')
    // T-5516 属 mango → 对应 S-2405-MG
    const refund = await request(httpServer).post('/tickets/T-5516/refund').set('Authorization', `Bearer ${risk}`)
    expect([200, 201]).toContain(refund.status)
    expect(refund.body.ok).toBe(true)

    // 退款联动应冲减代理分润：S-2405-MG 的 reversal 增加
    const after = (await request(httpServer).get('/settlements').set('Authorization', `Bearer ${su}`)).body.find((s: any) => s.id === 'S-2405-MG').reversal
    expect(after).toBeGreaterThan(before)

    const audit = await request(httpServer).get('/audit-logs?category=fund').set('Authorization', `Bearer ${su}`).expect(200)
    expect(audit.body.some((a: any) => /T-5516/.test(a.detail))).toBe(true)
  })
})

describe('Health', () => {
  it('GET /health is public and ok', async () => {
    const res = await request(httpServer).get('/health').expect(200)
    expect(res.body.status).toBe('ok')
  })
})

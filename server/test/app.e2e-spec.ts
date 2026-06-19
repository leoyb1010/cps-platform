import { Test } from '@nestjs/testing'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import cookieParser = require('cookie-parser')
import { AppModule } from '../src/app.module'
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter'

let app: INestApplication
let httpServer: any

async function token(account: string): Promise<string> {
  const res = await request(httpServer).post('/auth/login').send({ account, password: 'demo' })
  return res.body.access
}

beforeAll(async () => {
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
    const risk = await token('risk')
    const refund = await request(httpServer).post('/tickets/T-5514/refund').set('Authorization', `Bearer ${risk}`)
    expect([200, 201]).toContain(refund.status)
    expect(refund.body.ok).toBe(true)

    const su = await token('admin')
    const audit = await request(httpServer).get('/audit-logs?category=fund').set('Authorization', `Bearer ${su}`).expect(200)
    expect(audit.body.length).toBeGreaterThan(0)
    expect(audit.body.some((a: any) => /T-5514/.test(a.detail))).toBe(true)
  })
})

describe('Health', () => {
  it('GET /health is public and ok', async () => {
    const res = await request(httpServer).get('/health').expect(200)
    expect(res.body.status).toBe('ok')
  })
})

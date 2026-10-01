import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { Test } from '@nestjs/testing'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import cookieParser = require('cookie-parser')
import { cleanupPrismaTestDb, resetPrismaTestDb } from '../src/test-utils/prisma-test-db'
import { PrismaService } from '../src/prisma.service'

process.env.NODE_ENV = 'test'
process.env.JWT_ACCESS_SECRET = 'role-journey-local-access-fixture-xxxxxxxx'
process.env.JWT_REFRESH_SECRET = 'role-journey-local-refresh-fixture-xxxxxxx'
let app: INestApplication
let databaseUrl: string
let db: PrismaService
beforeAll(async () => {
  databaseUrl = resetPrismaTestDb('role-journeys')
  execFileSync(resolve('node_modules/.bin/ts-node'), ['prisma/seed.ts'], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: ['ignore', 'ignore', 'pipe'], timeout: 120_000,
  })
  const { AppModule } = await import('../src/app.module')
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = mod.createNestApplication()
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  await app.init()
  db = app.get(PrismaService)
})
afterAll(async () => { await app?.close(); cleanupPrismaTestDb(databaseUrl) })
async function login(account: string) {
  return request(app.getHttpServer()).post('/auth/login').send({ account, password: 'demo' }).expect(201)
}
async function access(account: string) { return (await login(account)).body.access as string }

describe('additional round 1: each actual seeded role', () => {
  const journeys = [
    ['admin', '/members', '/portal/summary'], ['finance', '/settlements', '/members'],
    ['risk', '/tickets', '/settlements'], ['ops', '/brands', '/members'],
    ['audit', '/audit-logs', '/members'], ['teamadmin', '/members', '/settlements'],
    ['brand', '/portal/summary', '/orders'], ['agent', '/portal/summary', '/brands'],
    ['brandaudit', '/orders', '/audit-logs'],
  ]
  it.each(journeys)('%s can complete its read journey and cannot enter another role endpoint', async (account, allowed, denied) => {
    const token = await access(account)
    await request(app.getHttpServer()).get(allowed).auth(token, { type: 'bearer' }).expect(200)
    await request(app.getHttpServer()).get(denied).auth(token, { type: 'bearer' }).expect(403)
  })
  it('anonymous cannot read operations or staff but can inspect public marketplace', async () => {
    await request(app.getHttpServer()).get('/orders').expect(401)
    await request(app.getHttpServer()).get('/members').expect(401)
    await request(app.getHttpServer()).get('/market/products').expect(200)
  })
  it.each([['U-004', 'brand'], ['U-006', 'finance'], ['U-006', 'agent']])('admin cannot create incompatible role/scope via PATCH %s → %s', async (id, roleId) => {
    const admin = await access('admin')
    await request(app.getHttpServer()).patch(`/members/${id}`).auth(admin, { type: 'bearer' }).send({ roleId }).expect(403)
  })
})

describe('additional round 2: cross-role, stale session and recovery', () => {
  it('a tenant-scoped staff permission never opens the global member directory or changes another tenant', async () => {
    const original = await db.user.findUniqueOrThrow({ where: { id: 'U-006' } })
    await db.role.create({ data: { id: 'tenant-staff-fixture', name: 'Synthetic tenant manager', permissions: JSON.stringify(['member.manage']) } })
    await db.user.update({ where: { id: original.id }, data: { roleId: 'tenant-staff-fixture' } })
    try {
      const tenant = await access('brand')
      for (const path of ['/members', '/roles', '/permissions']) {
        await request(app.getHttpServer()).get(path).auth(tenant, { type: 'bearer' }).expect(403)
      }
      await request(app.getHttpServer()).patch('/members/U-007').auth(tenant, { type: 'bearer' }).send({ status: 'disabled' }).expect(403)
      expect((await db.user.findUniqueOrThrow({ where: { id: 'U-007' } })).status).toBe('active')
    } finally { await db.user.update({ where: { id: original.id }, data: { roleId: original.roleId } }) }
  })
  it('valid platform reassignment revokes old access/refresh and a fresh login recovers with new permissions', async () => {
    const old = await login('finance')
    const admin = await access('admin')
    await request(app.getHttpServer()).patch('/members/U-002').auth(admin, { type: 'bearer' }).send({ roleId: 'ops' }).expect(200)
    await request(app.getHttpServer()).get('/settlements').auth(old.body.access, { type: 'bearer' }).expect(401)
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', old.headers['set-cookie']).expect(401)
    const fresh = await access('finance')
    await request(app.getHttpServer()).get('/brands').auth(fresh, { type: 'bearer' }).expect(200)
    await request(app.getHttpServer()).get('/settlements').auth(fresh, { type: 'bearer' }).expect(403)
    await request(app.getHttpServer()).patch('/members/U-002').auth(admin, { type: 'bearer' }).send({ roleId: 'finance' }).expect(200)
  })
  it('brand query tampering stays scoped, and read-only auditors cannot refund', async () => {
    const brandAudit = await access('brandaudit')
    const orders = await request(app.getHttpServer()).get('/orders?brandId=mango').auth(brandAudit, { type: 'bearer' }).expect(200)
    const rows = Array.isArray(orders.body) ? orders.body : orders.body.items
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row: { brandId: string }) => row.brandId === 'youdao')).toBe(true)
    for (const account of ['audit', 'brandaudit']) {
      await request(app.getHttpServer()).post('/orders/O-1/refund').auth(await access(account), { type: 'bearer' }).send({}).expect(403)
    }
  })
})

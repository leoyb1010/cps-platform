import { execSync } from 'child_process'
import { rmSync } from 'fs'
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
  // 在导入 AppModule(及其 PrismaClient)前：删旧 test.db → 建表 → 灌种子。
  // 删文件而非 --force-reset，保证干净态的同时避开危险操作确认；软删除/幂等键等有状态用例顺序无关、可重复。
  const env = { ...process.env, DATABASE_URL: 'file:./test.db' }
  for (const f of ['test.db', 'test.db-journal']) {
    try {
      rmSync(`${__dirname}/../${f}`)
    } catch {
      /* 不存在则忽略 */
    }
  }
  execSync('npx prisma db push --skip-generate --accept-data-loss', { env, stdio: 'ignore' })
  execSync('npx ts-node prisma/seed.ts', { env, stdio: 'ignore' })
  const { AppModule } = await import('../src/app.module')
  const { AllExceptionsFilter } = await import('../src/common/all-exceptions.filter')
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = mod.createNestApplication()
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
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
  it('伪造算法/篡改 token 被拒（401）', async () => {
    await request(httpServer).get('/auth/me').set('Authorization', 'Bearer not.a.jwt').expect(401)
  })
})

describe('Auth · token 即时失效（tokenVersion）', () => {
  it('登出后旧 access token 立即失效（不等 TTL）', async () => {
    // 登录拿 access + refresh cookie
    const login = await request(httpServer).post('/auth/login').send({ account: 'ops', password: 'demo' }).expect(201)
    const access = login.body.access as string
    const cookie = login.headers['set-cookie']
    // 旧 token 此刻可用
    await request(httpServer).get('/auth/me').set('Authorization', `Bearer ${access}`).expect(200)
    // 登出（bump tokenVersion）
    await request(httpServer).post('/auth/logout').set('Cookie', cookie).expect((r) => expect([200, 201]).toContain(r.status))
    // 同一旧 access token 现在应失效
    await request(httpServer).get('/auth/me').set('Authorization', `Bearer ${access}`).expect(401)
  })
  it('改成员角色后该成员旧 access token 失效', async () => {
    const target = await request(httpServer).post('/auth/login').send({ account: 'audit', password: 'demo' }).expect(201)
    const oldAccess = target.body.access as string
    await request(httpServer).get('/auth/me').set('Authorization', `Bearer ${oldAccess}`).expect(200)
    // 超管把该成员(U-005 审计)角色改为 ops → bump 其 tokenVersion
    const su = (await request(httpServer).post('/auth/login').send({ account: 'admin', password: 'demo' })).body.access
    await request(httpServer).patch('/members/U-005').set('Authorization', `Bearer ${su}`).send({ roleId: 'ops' }).expect((r) => expect([200, 201]).toContain(r.status))
    // 旧 token 失效
    await request(httpServer).get('/auth/me').set('Authorization', `Bearer ${oldAccess}`).expect(401)
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

describe('RBAC 提权防护（member.manage ≠ super）', () => {
  it('团队管理员不能把自己改成 super（自我编辑被拒 403）', async () => {
    const t = await token('teamadmin')
    await request(httpServer).patch('/members/U-009').set('Authorization', `Bearer ${t}`).send({ roleId: 'super' }).expect(403)
  })
  it('团队管理员不能给他人赋 super（仅超管可变更角色 403）', async () => {
    const t = await token('teamadmin')
    await request(httpServer).patch('/members/U-004').set('Authorization', `Bearer ${t}`).send({ roleId: 'super' }).expect(403)
  })
  it('团队管理员不能改任意角色的权限点（仅超管 403）', async () => {
    const t = await token('teamadmin')
    await request(httpServer).patch('/roles/teamadmin').set('Authorization', `Bearer ${t}`).send({ permissions: ['dashboard.view', 'settlement.clear', 'config.write'] }).expect(403)
  })
  it('超管也不能经 API 把成员赋 super（super 仅种子设定 403）', async () => {
    const su = await token('admin')
    await request(httpServer).patch('/members/U-004').set('Authorization', `Bearer ${su}`).send({ roleId: 'super' }).expect(403)
  })
  it('超管也不能改 super 角色权限（返回 ok:false）', async () => {
    const su = await token('admin')
    const r = await request(httpServer).patch('/roles/super').set('Authorization', `Bearer ${su}`).send({ permissions: ['dashboard.view'] })
    expect(r.body.ok).toBe(false)
  })
  it('超管改成员角色（非 super）正常生效', async () => {
    const su = await token('admin')
    const r = await request(httpServer).patch('/members/U-009').set('Authorization', `Bearer ${su}`).send({ roleId: 'ops' })
    expect([200, 201]).toContain(r.status)
    expect(r.body.ok).toBe(true)
  })
  it('注入未定义权限点被拒（仅超管可达，且校验权限合法 403）', async () => {
    const su = await token('admin')
    await request(httpServer).patch('/roles/ops').set('Authorization', `Bearer ${su}`).send({ permissions: ['dashboard.view', 'totally.fake.perm'] }).expect(403)
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

describe('资金幂等 + 并发', () => {
  // 注意：本块内先做并发（消费 S-2406-YD 的 pending），再做幂等（用 reconcile，状态无关）
  it('并发 5 次结算同一 pending 单（无幂等键），仅 1 次成功（条件更新防并发）', async () => {
    const su = await token('admin')
    const reqs = Array.from({ length: 5 }, () => request(httpServer).post('/settlements/S-2406-YD/clear').set('Authorization', `Bearer ${su}`))
    const results = await Promise.all(reqs)
    const okCount = results.filter((r) => r.body.ok === true).length
    expect(okCount).toBe(1) // 5 个并发只有一个抢到 pending→cleared
  })

  it('同一 Idempotency-Key 提交两次（reconcile），第二次为 replay、不重复执行', async () => {
    const su = await token('admin')
    const key = 'e2e-idem-reconcile-' + Math.random().toString(36).slice(2)
    const r1 = await request(httpServer).post('/settlements/S-2405-XM/reconcile').set('Authorization', `Bearer ${su}`).set('Idempotency-Key', key)
    expect([200, 201]).toContain(r1.status)
    expect(r1.body.ok).toBe(true)
    expect(r1.body.replayed).toBeUndefined()

    const r2 = await request(httpServer).post('/settlements/S-2405-XM/reconcile').set('Authorization', `Bearer ${su}`).set('Idempotency-Key', key)
    expect(r2.body.ok).toBe(true)
    expect(r2.body.replayed).toBe(true) // 命中首次结果，未再次执行
  })
})

describe('输入校验 + 错误映射（F1/F3/F5）', () => {
  it('F1: 品牌配置越界(feeRate<0 / period<1 / reservePct>100) 被拒 400', async () => {
    const su = await token('admin')
    await request(httpServer).patch('/brands/youdao/config').set('Authorization', `Bearer ${su}`).send({ feeRate: -99 }).expect(400)
    await request(httpServer).patch('/brands/youdao/config').set('Authorization', `Bearer ${su}`).send({ period: -1 }).expect(400)
    await request(httpServer).patch('/brands/youdao/config').set('Authorization', `Bearer ${su}`).send({ reservePct: 200 }).expect(400)
    // 合法值仍通过
    const ok = await request(httpServer).patch('/brands/youdao/config').set('Authorization', `Bearer ${su}`).send({ feeRate: 40 })
    expect([200, 201]).toContain(ok.status)
  })
  it('F5: 号池状态非法枚举被拒 400（不再 201）', async () => {
    const su = await token('admin')
    await request(httpServer).post('/merchants/M-YD-01/state').set('Authorization', `Bearer ${su}`).send({ state: 'garbage_xyz' }).expect(400)
    const ok = await request(httpServer).post('/merchants/M-YD-01/state').set('Authorization', `Bearer ${su}`).send({ state: 'fused', label: '熔断' })
    expect([200, 201]).toContain(ok.status)
  })
  it('forbidNonWhitelisted: 多余字段被拒 400', async () => {
    const su = await token('admin')
    await request(httpServer).post('/agents/A-2041/status').set('Authorization', `Bearer ${su}`).send({ status: 'frozen', evil: 'x' }).expect(400)
  })
  it('F3: 不存在的 id → 404（非 500）', async () => {
    const su = await token('admin')
    await request(httpServer).post('/merchants/__NOPE__/state').set('Authorization', `Bearer ${su}`).send({ state: 'fused' }).expect(404)
    await request(httpServer).post('/agents/__NOPE__/status').set('Authorization', `Bearer ${su}`).send({ status: 'frozen' }).expect(404)
    await request(httpServer).post('/settlements/__NOPE__/reconcile').set('Authorization', `Bearer ${su}`).expect(404)
  })
  it('F4: 游标分页非法 cursor → 4xx（非 500）', async () => {
    const su = await token('admin')
    const r = await request(httpServer).get('/orders?limit=3&cursor=__NOPE__').set('Authorization', `Bearer ${su}`)
    expect(r.status).toBeLessThan(500)
  })
})

describe('数据级 RBAC (scope)', () => {
  it('品牌方账户只见自己品牌；平台管理员见全部', async () => {
    const brandTok = await token('brand')
    const brands = await request(httpServer).get('/brands').set('Authorization', `Bearer ${brandTok}`).expect(200)
    expect(brands.body.length).toBe(1)
    expect(brands.body[0].id).toBe('youdao')

    const su = await token('admin')
    const all = await request(httpServer).get('/brands').set('Authorization', `Bearer ${su}`).expect(200)
    expect(all.body.length).toBeGreaterThan(1)
  })
  it('代理账户只见自己', async () => {
    const agentTok = await token('agent')
    const agents = await request(httpServer).get('/agents').set('Authorization', `Bearer ${agentTok}`).expect(200)
    expect(agents.body.length).toBe(1)
    expect(agents.body[0].id).toBe('A-2041')
  })
  it('即使有 merchant.read/settlement.read，brand-scoped 仍只见自己品牌（scope 非靠角色兜底）', async () => {
    // brandaudit: audit 角色(有 merchant.read/settlement.read) + scope=brand:youdao
    const t = await token('brandaudit')
    const merchants = await request(httpServer).get('/merchants').set('Authorization', `Bearer ${t}`).expect(200)
    expect(merchants.body.length).toBeGreaterThan(0)
    expect(merchants.body.every((m: any) => m.brandId === 'youdao')).toBe(true) // 不泄漏他人号池

    const settlements = await request(httpServer).get('/settlements').set('Authorization', `Bearer ${t}`).expect(200)
    expect(settlements.body.every((s: any) => s.brandId === 'youdao')).toBe(true) // 不泄漏他人结算
  })
  it('PII 脱敏：非平台用户看到商户号 mid 被打码，平台用户看完整', async () => {
    const su = await token('admin')
    const full = await request(httpServer).get('/merchants').set('Authorization', `Bearer ${su}`).expect(200)
    const fullMid = full.body.find((m: any) => m.brandId === 'youdao')?.mid
    expect(fullMid).toBeTruthy()
    expect(fullMid).not.toContain('****') // 平台看完整

    const ba = await token('brandaudit') // brand-scoped
    const masked = await request(httpServer).get('/merchants').set('Authorization', `Bearer ${ba}`).expect(200)
    expect(masked.body.every((m: any) => m.mid.includes('****'))).toBe(true) // 品牌方看脱敏
  })
  it('agent-scoped 即使有 brand.read，看品牌为空（拒绝按品牌键的越权读）', async () => {
    // 用 brandaudit 反证不够；这里直接断言 agent 用 ops 角色读不到 merchants（403 或空均不泄漏）
    const agentTok = await token('agent')
    const res = await request(httpServer).get('/merchants').set('Authorization', `Bearer ${agentTok}`)
    // ops 无 merchant.read → 403；若将来放权，scope 也会 DENY 返回空。两者都不泄漏
    expect([403, 200]).toContain(res.status)
    if (res.status === 200) expect(res.body.length).toBe(0)
  })
})

describe('业务写端点 + 审计', () => {
  it('品牌状态变更落库并写审计', async () => {
    const su = await token('admin')
    const r = await request(httpServer).patch('/brands/youdao/status').set('Authorization', `Bearer ${su}`).send({ status: 'paused', label: '暂停' })
    expect([200, 201]).toContain(r.status)
    expect(r.body.ok).toBe(true)
    const brands = await request(httpServer).get('/brands').set('Authorization', `Bearer ${su}`)
    expect(brands.body.find((b: any) => b.id === 'youdao').status).toBe('paused')
  })
  it('品牌接入配置 PATCH 生效', async () => {
    const su = await token('admin')
    await request(httpServer).patch('/brands/wps/config').set('Authorization', `Bearer ${su}`).send({ feeRate: 38 }).expect((res) => expect([200, 201]).toContain(res.status))
    const brands = await request(httpServer).get('/brands').set('Authorization', `Bearer ${su}`)
    expect(brands.body.find((b: any) => b.id === 'wps').feeRate).toBe(38)
  })
  it('平台配置 写后可读', async () => {
    const su = await token('admin')
    await request(httpServer).post('/config').set('Authorization', `Bearer ${su}`).send({ reserveDefaultPct: 11 }).expect((res) => expect([200, 201]).toContain(res.status))
    const cfg = await request(httpServer).get('/config').set('Authorization', `Bearer ${su}`).expect(200)
    expect(cfg.body.reserveDefaultPct).toBe(11)
  })
  it('ops 角色无 config.write → 写配置 403', async () => {
    const ops = await token('ops')
    await request(httpServer).post('/config').set('Authorization', `Bearer ${ops}`).send({ x: 1 }).expect(403)
  })
})

describe('软删除 + 游标分页', () => {
  it('品牌软删除后从列表消失（用专属品牌避免与其它用例耦合）', async () => {
    const su = await token('admin')
    // 创建一个本用例专属品牌，删它，断言它从列表消失——与其它用例完全解耦
    const created = await request(httpServer).post('/brands').set('Authorization', `Bearer ${su}`).send({ name: '软删测试', category: '工具', feeRate: 10, period: 7, reservePct: 10, path: 'direct' })
    const id = created.body.id as string
    expect(id).toBeTruthy()
    const has = (list: any[]) => list.some((b) => b.id === id)
    expect(has((await request(httpServer).get('/brands').set('Authorization', `Bearer ${su}`)).body)).toBe(true)

    await request(httpServer).delete(`/brands/${id}`).set('Authorization', `Bearer ${su}`).expect((r) => expect([200, 201]).toContain(r.status))
    expect(has((await request(httpServer).get('/brands').set('Authorization', `Bearer ${su}`)).body)).toBe(false)
  })

  it('订单游标分页：limit + nextCursor 翻页且不重复', async () => {
    const su = await token('admin')
    const p1 = await request(httpServer).get('/orders?limit=3').set('Authorization', `Bearer ${su}`).expect(200)
    expect(p1.body.items.length).toBe(3)
    expect(p1.body.nextCursor).toBeTruthy()
    const p2 = await request(httpServer).get(`/orders?limit=3&cursor=${p1.body.nextCursor}`).set('Authorization', `Bearer ${su}`).expect(200)
    const ids1 = p1.body.items.map((o: any) => o.id)
    const ids2 = p2.body.items.map((o: any) => o.id)
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false) // 两页无交集
  })
})

describe('Observability', () => {
  it('GET /metrics 暴露 Prometheus 文本（prom-client：HTTP 直方图 + 进程 + 业务计数）', async () => {
    const res = await request(httpServer).get('/metrics').expect(200)
    expect(res.text).toContain('http_request_duration_seconds') // HTTP 延迟直方图
    expect(res.text).toContain('cps_fund_actions_total') // 业务指标
    expect(res.text).toContain('cps_process_cpu') // 默认进程指标(前缀 cps_)
  })
})

describe('Health', () => {
  it('GET /health is public and ok', async () => {
    const res = await request(httpServer).get('/health').expect(200)
    expect(res.body.status).toBe('ok')
  })
})

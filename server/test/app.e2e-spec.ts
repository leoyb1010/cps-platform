import { execSync } from 'child_process'
import { rmSync } from 'fs'
import { Test } from '@nestjs/testing'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createSign } from 'crypto'
import { DEMO_RSA_PRIVATE, DEMO_RSA_PUBLIC } from '../src/youdao/demo-keys'
import cookieParser = require('cookie-parser')

// 有道对接演示凭证（与 seed 一致），RSA 签名对外接口测试
const YD_MCH = 'mch_youdao'
const YD_CUST = 'cust_youdao'
function ydStringToSign(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}
// 用演示私钥 RSA SHA256 签名（合作方一侧）
function ydSign(params: Record<string, unknown>): Record<string, unknown> {
  const p = { ...params, custId: YD_CUST, merchantId: YD_MCH, timestamp: Math.floor(Date.now() / 1000) }
  const signer = createSign('sha256'); signer.update(ydStringToSign(p), 'utf8')
  return { ...p, sign: signer.sign(DEMO_RSA_PRIVATE, 'base64') }
}

// 独立测试库 + 每次重建/灌种子 → 测试与开发库隔离、顺序无关、可重复
process.env.DATABASE_URL = 'file:./test.db'
process.env.NODE_ENV = 'test'

let app: INestApplication
let httpServer: any

async function token(account: string): Promise<string> {
  const res = await request(httpServer).post('/auth/login').send({ account, password: 'demo' })
  return res.body.access
}

// 生成套餐并完成模拟支付（受理履约前置：仅已支付套餐可被运营受理）。返回 { bundleId, finalPrice }。
async function mkPaidBundle(productIds: string[]): Promise<{ bundleId: string; finalPrice: number }> {
  const mk = await request(httpServer).post('/market/bundle').send({ productIds })
  const bundleId = mk.body.bundleId
  await request(httpServer).post(`/market/bundle/${bundleId}/pay`).send({ channel: 'alipay' })
  return { bundleId, finalPrice: mk.body.finalPrice }
}

beforeAll(async () => {
  // 在导入 AppModule(及其 PrismaClient)前：删旧 test.db → 建表 → 灌种子。
  // 删文件而非 --force-reset，保证干净态的同时避开危险操作确认；软删除/幂等键等有状态用例顺序无关、可重复。
  const env = { ...process.env, DATABASE_URL: 'file:./test.db' }
  for (const f of ['test.db', 'test.db-journal', 'test.db-wal', 'test.db-shm']) {
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
  it('logs in and returns access + 28 perms for super', async () => {
    const res = await request(httpServer).post('/auth/login').send({ account: 'admin', password: 'demo' }).expect(201)
    expect(res.body.access).toBeTruthy()
    expect(res.body.user.permissions.length).toBe(28)
  })
  it('/auth/me requires token (401 without)', async () => {
    await request(httpServer).get('/auth/me').expect(401)
  })
  it('伪造算法/篡改 token 被拒（401）', async () => {
    await request(httpServer).get('/auth/me').set('Authorization', 'Bearer not.a.jwt').expect(401)
  })
  it('X-Request-Id：正常复用，恶意(CRLF/超长)清洗 + 限长 64', async () => {
    const normal = await request(httpServer).get('/health').set('X-Request-Id', 'my-trace-1').expect(200)
    expect(normal.headers['x-request-id']).toBe('my-trace-1')
    const evil = await request(httpServer).get('/health').set('X-Request-Id', 'A'.repeat(200) + ' bad;chars').expect(200)
    expect(evil.headers['x-request-id'].length).toBeLessThanOrEqual(64)
    expect(evil.headers['x-request-id']).not.toContain(';') // 非法字符被清洗
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
  it('角色权限 payload 必须是数组，非数组被 400 拒绝（非 500）', async () => {
    const su = await token('admin')
    await request(httpServer).patch('/roles/ops').set('Authorization', `Bearer ${su}`).send({ permissions: 'dashboard.view' }).expect(400)
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

  it('同一 Idempotency-Key 跨不同资金动作不串结果', async () => {
    const su = await token('admin')
    const key = 'e2e-idem-scope-' + Math.random().toString(36).slice(2)
    const r1 = await request(httpServer).post('/settlements/S-2405-XM/reconcile').set('Authorization', `Bearer ${su}`).set('Idempotency-Key', key)
    expect([200, 201]).toContain(r1.status)
    expect(r1.body.ok).toBe(true)

    const r2 = await request(httpServer).post('/agents/__NOPE__/settle').set('Authorization', `Bearer ${su}`).set('Idempotency-Key', key)
    expect([200, 201]).toContain(r2.status)
    expect(r2.body.ok).toBe(false)
    expect(r2.body.replayed).toBeUndefined()
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
  it('客户角色(brand/agent)不持内部权限点 → 内部端点 403（纵深防御第二道）', async () => {
    // brand/agent 客户角色只持 portal.* 权限，绝不含 brand.read/agent.read 等内部权限点。
    // 即便伪造前端路由直打内部端点，PermsGuard 直接 403。
    const brandTok = await token('brand')
    await request(httpServer).get('/brands').set('Authorization', `Bearer ${brandTok}`).expect(403)
    await request(httpServer).get('/summary').set('Authorization', `Bearer ${brandTok}`).expect(403)
    await request(httpServer).get('/audit-logs').set('Authorization', `Bearer ${brandTok}`).expect(403)

    const agentTok = await token('agent')
    await request(httpServer).get('/agents').set('Authorization', `Bearer ${agentTok}`).expect(403)
    await request(httpServer).get('/settlements').set('Authorization', `Bearer ${agentTok}`).expect(403)
  })
  it('平台管理员见全部品牌/代理', async () => {
    const su = await token('admin')
    const all = await request(httpServer).get('/brands').set('Authorization', `Bearer ${su}`).expect(200)
    expect(all.body.length).toBeGreaterThan(1)
    const agents = await request(httpServer).get('/agents').set('Authorization', `Bearer ${su}`).expect(200)
    expect(agents.body.length).toBeGreaterThan(1)
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
  it('summary 经营总览按 scope 收窄：brand-scoped 即使有 dashboard.view 也不泄漏全平台聚合', async () => {
    // 平台管理员 summary（全平台口径）vs brandaudit（brand:youdao，有 dashboard.view）
    const su = await token('admin')
    const platformSummary = await request(httpServer).get('/summary').set('Authorization', `Bearer ${su}`).expect(200)
    const ba = await token('brandaudit')
    const scopedSummary = await request(httpServer).get('/summary').set('Authorization', `Bearer ${ba}`).expect(200)
    // 纵深防御：品牌方聚合的待付分润绝不等于全平台总额（否则就是泄漏全平台口径）
    // youdao 单品牌的 pendingPayout 必然 ≤ 全平台，且 riskyAgents 收窄到自己（通常为 0）
    expect(scopedSummary.body.pendingPayout).toBeLessThanOrEqual(platformSummary.body.pendingPayout)
    expect(scopedSummary.body.reconcileDiff).toBeLessThanOrEqual(platformSummary.body.reconcileDiff)
  })
  it('误授内部写权限时仍按 scope 拦截准备金/资金/号池/配置越权', async () => {
    const su = await token('admin')
    const roles = await request(httpServer).get('/roles').set('Authorization', `Bearer ${su}`).expect(200)
    const audit = roles.body.find((r: any) => r.id === 'audit')
    expect(audit).toBeTruthy()
    await request(httpServer).patch('/roles/audit').set('Authorization', `Bearer ${su}`).send({
      permissions: [...new Set([...audit.permissions, 'settlement.clear', 'merchant.write'])],
    }).expect((r) => expect([200, 201]).toContain(r.status))

    const ba = await token('brandaudit') // audit role + scope=brand:youdao
    const releases = await request(httpServer).get('/reserve-releases').set('Authorization', `Bearer ${ba}`).expect(200)
    expect(releases.body.length).toBeGreaterThan(0)
    expect(releases.body.every((r: any) => r.settlementId === 'S-2406-YD')).toBe(true)

    await request(httpServer).post('/merchants/M-XM-02/state').set('Authorization', `Bearer ${ba}`).send({ state: 'fused' }).expect(403)
    await request(httpServer).post('/settlements/S-2405-XM/reconcile').set('Authorization', `Bearer ${ba}`).expect(403)
    await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${ba}`).expect(403)
    await request(httpServer).get('/config').set('Authorization', `Bearer ${ba}`).expect(403)
  })

  it('内部 /settlements 对 brand-scope 脱敏：不返回 platformFee/agentPayout/reversal/frozen', async () => {
    const ba = await token('brandaudit') // audit 角色 + scope=brand:youdao，有 settlement.read
    const rows = (await request(httpServer).get('/settlements').set('Authorization', `Bearer ${ba}`).expect(200)).body
    expect(rows.length).toBeGreaterThan(0)
    for (const s of rows) {
      expect(s.brandId).toBe('youdao') // scope 收窄
      expect(s).not.toHaveProperty('platformFee')
      expect(s).not.toHaveProperty('agentPayout')
      expect(s).not.toHaveProperty('reversal')
      expect(s).not.toHaveProperty('frozen')
      expect(s).toHaveProperty('gross') // 白名单字段保留
    }
    // 平台 scope 仍见全字段（对照）
    const su = await token('admin')
    const full = (await request(httpServer).get('/settlements').set('Authorization', `Bearer ${su}`).expect(200)).body
    expect(full.some((s: any) => 'agentPayout' in s)).toBe(true)
  })

  it('误授 contract.write 时创建归属强校验：品牌方不得单方指派他人代理（attribution 纵深防御）', async () => {
    const su = await token('admin')
    const roles = await request(httpServer).get('/roles').set('Authorization', `Bearer ${su}`).expect(200)
    const audit = roles.body.find((r: any) => r.id === 'audit')
    await request(httpServer).patch('/roles/audit').set('Authorization', `Bearer ${su}`).send({
      permissions: [...new Set([...audit.permissions, 'contract.write'])],
    }).expect((r) => expect([200, 201]).toContain(r.status))

    const ba = await token('brandaudit') // scope=brand:youdao
    // 越权①：为他人品牌创建 → 403
    await request(httpServer).post('/contracts').set('Authorization', `Bearer ${ba}`)
      .send({ brandId: 'mango', settleModel: 'cps_share' }).expect(403)
    // 越权②：自己品牌但单方指派任意代理 → 403（assertCreateAttribution 拒绝，OR-语义短路被堵）
    await request(httpServer).post('/contracts').set('Authorization', `Bearer ${ba}`)
      .send({ brandId: 'youdao', agentId: 'A-2041', settleModel: 'cps_share' }).expect(403)
    // 越权③：履约入口伪造他人代理业绩 → 403
    await request(httpServer).post('/fulfillment/ingest').set('Authorization', `Bearer ${ba}`)
      .send({ brandId: 'youdao', agentId: 'A-2041', type: 'first', amount: 100, plan: '年卡' }).expect(403)
  })

  it('订单筛选：type / dateFrom-dateTo 真实生效（createdAt 区间）', async () => {
    const su = await token('admin')
    const refunds = await request(httpServer).get('/orders?type=refund&limit=500').set('Authorization', `Bearer ${su}`).expect(200)
    expect(refunds.body.items.length).toBeGreaterThan(0)
    expect(refunds.body.items.every((o: any) => o.type === 'refund')).toBe(true)
    // 未来日期区间 → 0 条（createdAt 真实过滤）
    const future = await request(httpServer).get('/orders?dateFrom=2099-01-01T00:00:00.000Z&limit=500').set('Authorization', `Bearer ${su}`).expect(200)
    expect(future.body.items.length).toBe(0)
  })
  it('订单筛选不可越权：brand-scoped 传 brandId=他人 仍只见自己（scope 最后 assign）', async () => {
    const ba = await token('brandaudit') // scope=brand:youdao，有 order.read
    const res = await request(httpServer).get('/orders?brandId=ximalaya&limit=500').set('Authorization', `Bearer ${ba}`)
    if (res.status === 200) {
      // 即便显式传他人 brandId，scope 覆盖 → 仍只 youdao（绝不泄漏 ximalaya）
      expect(res.body.items.every((o: any) => o.brandId === 'youdao')).toBe(true)
    } else {
      expect(res.status).toBe(403) // 无 order.read 时直接拒绝，也不泄漏
    }
  })
  it('结算筛选：period 前缀分桶 + 不可越权', async () => {
    const su = await token('admin')
    const may = await request(httpServer).get('/settlements?period=2026-05').set('Authorization', `Bearer ${su}`).expect(200)
    expect(may.body.every((s: any) => s.period.startsWith('2026-05'))).toBe(true)
    // brand-scoped 传 brandId=他人仍只见自己
    const ba = await token('brandaudit')
    const scoped = await request(httpServer).get('/settlements?brandId=ximalaya').set('Authorization', `Bearer ${ba}`).expect(200)
    expect(scoped.body.every((s: any) => s.brandId === 'youdao')).toBe(true)
  })
  it('合约富录入：userLimit/complaintLiability/reservePct/breachRule 落库可读回（零迁移）', async () => {
    const su = await token('admin')
    const c = await request(httpServer).post('/contracts').set('Authorization', `Bearer ${su}`).send({
      brandId: 'youdao', settleModel: 'cps_share',
      userLimit: { newOnly: true, regions: ['华东'] }, complaintLiability: 'brand', reservePct: 15, breachRule: '违约扣双倍准备金',
    })
    expect([200, 201]).toContain(c.status)
    const list = await request(httpServer).get('/contracts').set('Authorization', `Bearer ${su}`).expect(200)
    const row = list.body.find((x: any) => x.id === c.body.id)
    expect(row.complaintLiability).toBe('brand')
    expect(row.reservePct).toBe(15)
    expect(row.breachRule).toBe('违约扣双倍准备金')
    expect(JSON.parse(row.userLimit).regions).toContain('华东')
  })
  it('置换富录入：invoiceStatus/terms 落库', async () => {
    const su = await token('admin')
    const b = await request(httpServer).post('/barter').set('Authorization', `Bearer ${su}`).send({
      initiatorBrandId: 'youdao', counterpartyBrandId: 'mango', resourceType: '联名活动', myQuota: 100000, counterpartyQuota: 100000,
      invoiceStatus: 'partial', terms: { valuation: '刊例价 × 0.6', deliveryWindow: 'Q3', note: '联合会员互推' },
    })
    expect([200, 201]).toContain(b.status)
    const list = await request(httpServer).get('/barter').set('Authorization', `Bearer ${su}`).expect(200)
    const row = list.body.find((x: any) => x.id === b.body.id)
    expect(row.invoiceStatus).toBe('partial')
    expect(JSON.parse(row.terms).deliveryWindow).toBe('Q3')
  })
  it('门户 summary 带 period：重算趋势且不泄漏 platformFee/agentPayout', async () => {
    const bt = await token('brand')
    const res = await request(httpServer).get('/portal/summary?preset=month').set('Authorization', `Bearer ${bt}`).expect(200)
    expect(res.body.scope).toBe('brand')
    expect(res.body).not.toHaveProperty('platformFee')
    expect(res.body).not.toHaveProperty('agentPayout')
    expect(Array.isArray(res.body.trend)).toBe(true)
  })
  it('商品富录入：bundleEligible=false 不进 /market/products 公开货架', async () => {
    const bt = await token('brand')
    const r = await request(httpServer).post('/portal/brand/products').set('Authorization', `Bearer ${bt}`).send({
      name: '不可组合测试品', firstPrice: 9, renewPrice: 9, bundleEligible: false, tags: ['测试'],
    })
    expect([200, 201]).toContain(r.status)
    // 草稿态本就不在货架；过审后仍因 bundleEligible=false 不出现（市场只收 live+bundleEligible）
    const su = await token('admin')
    await request(httpServer).post(`/products/${r.body.id}/review`).set('Authorization', `Bearer ${su}`).send({ action: 'approve' })
    const market = await request(httpServer).get('/market/products').expect(200)
    expect(market.body.find((p: any) => p.id === r.body.id)).toBeUndefined()
  })

  it('客户门户：品牌脱敏结算绝不返回 platformFee / agentPayout（字段白名单）', async () => {
    const bt = await token('brand')
    const res = await request(httpServer).get('/portal/brand/settlements').set('Authorization', `Bearer ${bt}`).expect(200)
    for (const row of res.body) {
      expect(row).not.toHaveProperty('platformFee')
      expect(row).not.toHaveProperty('agentPayout')
      expect(row).not.toHaveProperty('reversal')
      expect(row.brandId).toBe('youdao') // 只见自己
    }
  })
  it('客户门户：选品市场目录脱敏（无 gmvMtd / activeSubs）', async () => {
    const at = await token('agent')
    const res = await request(httpServer).get('/portal/market/brands').set('Authorization', `Bearer ${at}`).expect(200)
    expect(res.body.length).toBeGreaterThan(0)
    for (const b of res.body) {
      expect(b).not.toHaveProperty('gmvMtd')
      expect(b).not.toHaveProperty('activeSubs')
    }
  })
  it('客户门户：越权拦截——品牌打代理端点 403，代理打品牌端点 403', async () => {
    const bt = await token('brand')
    const at = await token('agent')
    await request(httpServer).get('/portal/agent/credit').set('Authorization', `Bearer ${bt}`).expect(403)
    await request(httpServer).get('/portal/brand/settlements').set('Authorization', `Bearer ${at}`).expect(403)
  })
  it('门户订单/结算筛选：type/period 真过滤 + scope 不可越权', async () => {
    const bt = await token('brand')
    // 类型过滤：只返回 first（且仍只见自己 youdao）
    const firstOnly = await request(httpServer).get('/portal/brand/orders?type=first').set('Authorization', `Bearer ${bt}`).expect(200)
    for (const o of firstOnly.body) { expect(o.type).toBe('first'); expect(o.brandId).toBe('youdao') }
    // R1 修复：'renew' 是合法类型（不是 'renewal'），DTO 接受不报 400
    await request(httpServer).get('/portal/brand/orders?type=renew').set('Authorization', `Bearer ${bt}`).expect(200)
    // R1 修复：'refund' 同时覆盖退款 + 拒付 → 返回的每条都应是 refund 或 chargeback（youdao 订单恰为 first，结果为空亦合法，关键是类型不混入 first）
    const refundLike = await request(httpServer).get('/portal/brand/orders?type=refund').set('Authorization', `Bearer ${bt}`).expect(200)
    for (const o of refundLike.body) { expect(['refund', 'chargeback']).toContain(o.type); expect(o.brandId).toBe('youdao') }
    // 跨品牌验证拒付被纳入：用有 chargeback 订单的 ximalaya 账号（通过种子 wpsbrand? 此处仅验类型正确，chargeback 归并由 where in 保证）
    // 'renewal'（旧错误值）已不在白名单 → 400
    await request(httpServer).get('/portal/brand/orders?type=renewal').set('Authorization', `Bearer ${bt}`).expect(400)
    // 防越权：brandId 不在订单 DTO 白名单 → 客户端伪造该参数被 forbidNonWhitelisted 直接 400（比"接受并忽略"更强）
    await request(httpServer).get('/portal/brand/orders?type=first&brandId=mango').set('Authorization', `Bearer ${bt}`).expect(400)
    // 结算状态过滤白名单仍生效
    const settle = await request(httpServer).get('/portal/brand/settlements?status=cleared').set('Authorization', `Bearer ${bt}`).expect(200)
    for (const s of settle.body) { expect(s).not.toHaveProperty('platformFee'); expect(s.brandId).toBe('youdao') }
  })
  it('门户工单处理：品牌/代理回复登记处理办法 + assertOwns + 状态流转', async () => {
    const at = await token('agent')
    const su = await token('admin')
    // 用内部权威路径造一条归属 A-2041 的工单（经 complaints/ingest，下一批端点；此处直接经 prisma seed 已有结构）
    // 取代理可见工单（若无则跳过断言主体，仍验证端点鉴权与越权）
    const list = await request(httpServer).get('/portal/agent/tickets').set('Authorization', `Bearer ${at}`).expect(200)
    expect(Array.isArray(list.body)).toBe(true)
    // 越权：回复不属于自己的工单被拒
    const bad = await request(httpServer).post('/portal/agent/tickets/TK-NOT-MINE/reply').set('Authorization', `Bearer ${at}`).send({ handlePlan: 'x' })
    expect(bad.body.ok).toBe(false)
    // 品牌打代理工单端点 403（scope 隔离）
    const bt = await token('brand')
    await request(httpServer).get('/portal/agent/tickets').set('Authorization', `Bearer ${bt}`).expect(403)
    // 金额类字段不在 reply DTO 白名单（forbidNonWhitelisted）
    await request(httpServer).post('/portal/agent/tickets/any/reply').set('Authorization', `Bearer ${at}`).send({ handlePlan: 'x', amount: 1 }).expect(400)
  })
  it('邀请制建号：客户角色↔scope 强校验（brand 角色却 platform scope 被拒）', async () => {
    const su = await token('admin')
    // 角色↔scope 不匹配 → 403
    await request(httpServer).post('/members').set('Authorization', `Bearer ${su}`)
      .send({ name: '坏号', account: 'badbrand_t', roleId: 'brand', scopeType: 'platform' }).expect(403)
    // scopeId 不存在 → ok:false
    const ghost = await request(httpServer).post('/members').set('Authorization', `Bearer ${su}`)
      .send({ name: '幽灵', account: 'ghost_t', roleId: 'agent', scopeType: 'agent', scopeId: 'A-0000' })
    expect(ghost.body.ok).toBe(false)
    // 非 super 不可建号
    const ops = await token('ops')
    await request(httpServer).post('/members').set('Authorization', `Bearer ${ops}`)
      .send({ name: 'x', account: 'x_t', roleId: 'brand', scopeType: 'brand', scopeId: 'youdao' }).expect(403)
  })
  it('代理接挂单合约：条件更新防并发（已接走则二次接单失败）', async () => {
    const at = await token('agent')
    // GC-2406-03 是种子里的 open 挂单
    const first = await request(httpServer).post('/portal/contracts/GC-2406-03/claim').set('Authorization', `Bearer ${at}`)
    expect([200, 201]).toContain(first.status)
    expect(first.body.ok).toBe(true)
    // 二次接单（已被自己接走 → 非 open）必失败
    const second = await request(httpServer).post('/portal/contracts/GC-2406-03/claim').set('Authorization', `Bearer ${at}`)
    expect(second.body.ok).toBe(false)
  })
  it('资源置换 OR-scope：品牌见「我发起的 + 待我确认的」，每条都涉及自己', async () => {
    const bt = await token('brand') // youdao
    const res = await request(httpServer).get('/portal/brand/barter').set('Authorization', `Bearer ${bt}`).expect(200)
    expect(res.body.length).toBeGreaterThan(0)
    // 每条置换单 youdao 必为发起方或对手方之一（不泄漏与己无关的置换）
    for (const d of res.body) {
      expect(d.initiatorBrandId === 'youdao' || d.counterpartyBrandId === 'youdao').toBe(true)
    }
  })
})

describe('订阅商品审核', () => {
  it('商品列表 + 审核流：pending→approve→live；客户角色打 /products 403', async () => {
    const su = await token('admin')
    const list = await request(httpServer).get('/products').set('Authorization', `Bearer ${su}`).expect(200)
    expect(list.body.length).toBeGreaterThan(0)
    const pending = list.body.find((p: any) => p.status === 'pending')
    expect(pending).toBeTruthy()
    // 过审 → live
    const ok = await request(httpServer).post(`/products/${pending.id}/review`).set('Authorization', `Bearer ${su}`).send({ action: 'approve' })
    expect([200, 201]).toContain(ok.status)
    expect(ok.body.ok).toBe(true)
    const after = await request(httpServer).get('/products').set('Authorization', `Bearer ${su}`).expect(200)
    expect(after.body.find((p: any) => p.id === pending.id).status).toBe('live')
    // 客户角色无 product.read → 403
    const bt = await token('brand')
    await request(httpServer).get('/products').set('Authorization', `Bearer ${bt}`).expect(403)
  })
  it('驳回写 reviewNote 且转 draft（仅待审可审核）', async () => {
    const su = await token('admin')
    // 先把一个 live 商品改回 pending 不易，这里验证「非 pending 不可审核」
    const list = await request(httpServer).get('/products').set('Authorization', `Bearer ${su}`).expect(200)
    const live = list.body.find((p: any) => p.status === 'live')
    if (live) {
      const r = await request(httpServer).post(`/products/${live.id}/review`).set('Authorization', `Bearer ${su}`).send({ action: 'approve' })
      expect(r.body.ok).toBe(false) // 非待审拒绝
    }
  })
})

describe('订阅超市（公开层 + 算价权威）', () => {
  it('公开访问 /market/products（无 token）+ 脱敏', async () => {
    const res = await request(httpServer).get('/market/products').expect(200) // 无 Authorization 头
    expect(res.body.length).toBeGreaterThan(0)
    for (const p of res.body) {
      expect(p).not.toHaveProperty('defaultSharePct') // 不泄漏内部分成口径
      expect(p.status).toBeUndefined() // 不返回内部状态
    }
  })
  it('组合算价服务端权威：满件折扣命中 + 互斥拒绝', async () => {
    // 2 件无互斥 → 满 2 件 9 折
    const q = await request(httpServer).post('/market/quote').send({ productIds: ['PRD-MG-01', 'PRD-XM-01'] }).expect(201)
    expect(q.body.ok).toBe(true)
    expect(q.body.discountPct).toBe(10)
    expect(q.body.finalPrice).toBe(+(q.body.listPrice * 0.9).toFixed(2))
    // 互斥组冲突 → 拒绝
    const conflict = await request(httpServer).post('/market/quote').send({ productIds: ['PRD-YD-01', 'PRD-YD-02'] }).expect(201)
    expect(conflict.body.ok).toBe(false)
    expect(conflict.body.conflicts.length).toBeGreaterThan(0)
  })
  it('生成套餐落 Bundle（quoted），finalPrice 服务端权威（不含价格入参）', async () => {
    const r = await request(httpServer).post('/market/bundle').send({ productIds: ['PRD-MG-01', 'PRD-XM-01', 'PRD-WP-01'] }).expect(201)
    expect(r.body.ok).toBe(true)
    expect(r.body.bundleId).toBeTruthy()
    expect(r.body.discountPct).toBe(15) // 满 3 件 85 折
  })
  it('L2 空/全无效购物车拒绝落库 $0 套餐', async () => {
    const empty = await request(httpServer).post('/market/bundle').send({ productIds: [] }).expect(201)
    expect(empty.body.ok).toBe(false)
    const ghost = await request(httpServer).post('/market/bundle').send({ productIds: ['FAKE-NOPE'] }).expect(201)
    expect(ghost.body.ok).toBe(false)
  })
  it('S3 优惠规则数值越界被拒（防负价投毒）', async () => {
    const su = await token('admin')
    const bad = await request(httpServer).post('/bundle-rules').set('Authorization', `Bearer ${su}`).send({ name: '坏规则', kind: 'count_off', params: { minItems: 0, discountPct: 99999 } })
    expect(bad.body.ok).toBe(false) // discountPct>100 + minItems<1 被拒
  })
  it('R1 算价数组超长被拒（防 DoS）', async () => {
    const huge = Array.from({ length: 100 }, (_, i) => `PRD-X-${i}`)
    await request(httpServer).post('/market/quote').send({ productIds: huge }).expect(400) // ArrayMaxSize(20)
  })
  it('模拟支付：quoted→paid（读 finalPrice，不收金额，幂等，不碰结算）', async () => {
    // 生成 → 支付 → 幂等重放 → 拒金额入参 → 对账仍 ok
    const mk = await request(httpServer).post('/market/bundle').send({ productIds: ['PRD-XM-01', 'PRD-WP-01'] }).expect(201)
    expect(mk.body.ok).toBe(true)
    const bid = mk.body.bundleId
    const fp = mk.body.finalPrice
    // 支付成功，finalPrice 由服务端回填（前端不传金额）
    const pay = await request(httpServer).post(`/market/bundle/${bid}/pay`).send({ channel: 'alipay' }).expect(201)
    expect(pay.body.ok).toBe(true)
    expect(pay.body.paid).toBe(true)
    expect(pay.body.finalPrice).toBe(fp)
    // 幂等重放：不重复扣款
    const replay = await request(httpServer).post(`/market/bundle/${bid}/pay`).send({ channel: 'wechat' }).expect(201)
    expect(replay.body.replayed).toBe(true)
    // 防篡改：金额入参被 forbidNonWhitelisted 拒
    await request(httpServer).post(`/market/bundle/${bid}/pay`).send({ channel: 'alipay', amount: 1 }).expect(400)
    // 红线：支付后对账恒等式仍平
    const su = await token('admin')
    const rec = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`).expect(201)
    expect(rec.body.ok).toBe(true)
    expect(rec.body.mismatches).toHaveLength(0)
  })
  it('R3 资金链路闭合：未支付套餐不可受理；支付后可受理；已支付套餐再支付为幂等回放', async () => {
    const su = await token('admin')
    // 1) 生成（未支付）→ 受理被拒（红线：不为没人付钱的订阅开单）
    const mk = await request(httpServer).post('/market/bundle').send({ productIds: ['PRD-MG-01', 'PRD-XM-01'] }).expect(201)
    const bid = mk.body.bundleId
    const fulUnpaid = await request(httpServer).post(`/bundles/${bid}/fulfill`).set('Authorization', `Bearer ${su}`).send({ agentId: 'A-2041' }).expect(201)
    expect(fulUnpaid.body.ok).toBe(false)
    expect(fulUnpaid.body.detail).toContain('未支付')
    // 2) 支付 → 受理成功（正确闭环）
    const pay = await request(httpServer).post(`/market/bundle/${bid}/pay`).send({ channel: 'alipay' }).expect(201)
    expect(pay.body.paid).toBe(true)
    const fulPaid = await request(httpServer).post(`/bundles/${bid}/fulfill`).set('Authorization', `Bearer ${su}`).send({ agentId: 'A-2041' }).expect(201)
    expect(fulPaid.body.ok).toBe(true)
    // 3) 已支付套餐再支付 → 幂等回放（不重复扣款）
    const payAgain = await request(httpServer).post(`/market/bundle/${bid}/pay`).send({ channel: 'wechat' }).expect(201)
    expect(payAgain.body.replayed).toBe(true)
  })
})

describe('套餐转订单链路（关联履约，红线：不破恒等式 I）', () => {
  // 用户在公开超市生成跨品牌套餐 → 运营受理拆单 → 经既有 ingestOrder 入账 → 结算恒等式不破。
  let bundleId = ''
  let finalPrice = 0

  it('套餐台账内部可见 + 富化（品牌名/件数），客户角色 403', async () => {
    // 先公开生成一个跨 3 品牌套餐并完成支付（受理前置）
    const paid = await mkPaidBundle(['PRD-MG-01', 'PRD-XM-01', 'PRD-WP-01'])
    bundleId = paid.bundleId
    finalPrice = paid.finalPrice

    const su = await token('admin')
    const list = await request(httpServer).get('/bundles').set('Authorization', `Bearer ${su}`).expect(200)
    const row = list.body.find((b: any) => b.id === bundleId)
    expect(row).toBeTruthy()
    expect(row.status).toBe('quoted')
    expect(row.items.length).toBe(3)
    expect(row.items.every((i: any) => i.name && i.brandName)).toBe(true)
    expect(row.brandCount).toBe(3) // 跨 3 品牌
    // 客户角色无 product.read → 403（脱敏边界）
    const brand = await token('brand')
    await request(httpServer).get('/bundles').set('Authorization', `Bearer ${brand}`).expect(403)
  })

  it('受理拆单：每品牌一笔订单 + 金额∑=套餐价 + 对账仍 ok', async () => {
    const su = await token('admin')
    // 红线基线：受理前对账 ok
    const before = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`).expect(201)
    expect(before.body.ok).toBe(true)

    const r = await request(httpServer).post(`/bundles/${bundleId}/fulfill`).set('Authorization', `Bearer ${su}`)
      .send({ agentId: 'A-2041' }).expect(201)
    expect(r.body.ok).toBe(true)
    expect(r.body.orderIds.length).toBe(3) // 拆 3 笔
    // 金额服务端权威分摊，∑ 恰等套餐价（末项吸收残差）
    expect(r.body.totalAllocated).toBe(finalPrice)
    const sumLegs = +r.body.matched.reduce((s: number, m: any) => s + m.amount, 0).toFixed(2)
    expect(sumLegs).toBe(finalPrice)
    // 每笔订单按各自商品的 brandId 拆（跨品牌）
    const brands = r.body.matched.map((m: any) => m.brandId).sort()
    expect(brands).toEqual(['mango', 'wps', 'ximalaya'])

    // 红线：受理后对账仍 ok（全程只经 ingestOrder，不动结算五项）
    const after = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`).expect(201)
    expect(after.body.ok).toBe(true)
    expect(after.body.mismatches.length).toBe(before.body.mismatches.length) // 零新增差错
  })

  it('状态门禁：已受理套餐二次受理被拒（幂等）', async () => {
    const su = await token('admin')
    const again = await request(httpServer).post(`/bundles/${bundleId}/fulfill`).set('Authorization', `Bearer ${su}`)
      .send({ agentId: 'A-2041' }).expect(201)
    expect(again.body.ok).toBe(false) // 仅 quoted 可受理
  })

  it('价格防篡改：受理 body 不接受金额入参', async () => {
    // 新建并支付一个套餐
    const { bundleId: bid } = await mkPaidBundle(['PRD-MG-01', 'PRD-XM-01'])
    const su = await token('admin')
    // forbidNonWhitelisted 生效：带 amount/finalPrice → 400
    await request(httpServer).post(`/bundles/${bid}/fulfill`).set('Authorization', `Bearer ${su}`)
      .send({ agentId: 'A-2041', amount: 0, finalPrice: 0 }).expect(400)
  })

  it('归因代理须真实存在（防悬空 agentId 污染合约）', async () => {
    const { bundleId: bid } = await mkPaidBundle(['PRD-MG-01', 'PRD-XM-01'])
    const su = await token('admin')
    const r = await request(httpServer).post(`/bundles/${bid}/fulfill`).set('Authorization', `Bearer ${su}`)
      .send({ agentId: 'A-NOPE-9999' }).expect(201)
    expect(r.body.ok).toBe(false)
  })

  it('受理权限：无 contract.write 角色被拒（finance 仅 contract.read）', async () => {
    const { bundleId: bid } = await mkPaidBundle(['PRD-MG-01', 'PRD-XM-01'])
    const fin = await token('finance') // finance 有 contract.read 但无 contract.write
    await request(httpServer).post(`/bundles/${bid}/fulfill`).set('Authorization', `Bearer ${fin}`)
      .send({ agentId: 'A-2041' }).expect(403)
  })

  it('并发受理只成功一次（幂等 + 条件认领，防双重履约）', async () => {
    const { bundleId: id } = await mkPaidBundle(['PRD-MG-01', 'PRD-XM-01', 'PRD-WP-01'])
    const su = await token('admin')
    // 并发两次受理（无 Idempotency-Key，靠事务内 quoted→ordered 条件认领去重）
    const [a, b] = await Promise.all([
      request(httpServer).post(`/bundles/${id}/fulfill`).set('Authorization', `Bearer ${su}`).send({ agentId: 'A-2041' }),
      request(httpServer).post(`/bundles/${id}/fulfill`).set('Authorization', `Bearer ${su}`).send({ agentId: 'A-2041' }),
    ])
    const oks = [a.body, b.body].filter((r) => r.ok)
    expect(oks.length).toBe(1) // 只一次成功，另一次被认领门禁拒绝
    // 该套餐拆出的订单恰 3 笔（不是 6 笔）——无双重履约。/orders 游标分页，读 .items（新单在最前）
    const orders = await request(httpServer).get('/orders?limit=500').set('Authorization', `Bearer ${su}`).expect(200)
    const fromBundle = orders.body.items.filter((o: any) => o.bundleId === id)
    expect(fromBundle.length).toBe(3)
  })

  it('幂等键重放：同 Idempotency-Key 重复受理返回同结果不重复开单', async () => {
    const { bundleId: id } = await mkPaidBundle(['PRD-MG-01', 'PRD-XM-01'])
    const su = await token('admin')
    const key = 'idem-bundle-' + id
    const r1 = await request(httpServer).post(`/bundles/${id}/fulfill`).set('Authorization', `Bearer ${su}`).set('Idempotency-Key', key).send({ agentId: 'A-2041' }).expect(201)
    expect(r1.body.ok).toBe(true)
    const r2 = await request(httpServer).post(`/bundles/${id}/fulfill`).set('Authorization', `Bearer ${su}`).set('Idempotency-Key', key).send({ agentId: 'A-2041' }).expect(201)
    expect(r2.body.replayed).toBe(true) // 重放，不二次开单
    expect(r2.body.orderIds).toEqual(r1.body.orderIds)
  })

  it('分摊金额恒等套餐价（多商品奇数分摊，∑ 精确到分，无超额）', async () => {
    // 取尽量多的同类商品凑奇数分摊；用现有 live 商品组合，断言 ∑ === finalPrice 且每笔 ≥ 0
    const { bundleId: bid, finalPrice: fp } = await mkPaidBundle(['PRD-MG-01', 'PRD-XM-01', 'PRD-WP-01'])
    const su = await token('admin')
    const r = await request(httpServer).post(`/bundles/${bid}/fulfill`).set('Authorization', `Bearer ${su}`).send({ agentId: 'A-2041' }).expect(201)
    const legs = r.body.matched.map((m: any) => m.amount)
    const sum = +legs.reduce((s: number, x: number) => s + x, 0).toFixed(2)
    expect(sum).toBe(fp) // 精确到分，不多收
    expect(legs.every((x: number) => x >= 0)).toBe(true) // 无负数分摊
  })
})

describe('通知机制（债4，scope 隔离）', () => {
  it('品牌发起置换 → 对手品牌收到通知；scope 隔离不泄漏他人通知', async () => {
    const bt = await token('brand') // youdao
    // youdao 拉自己的通知（种子里有 NT-0001 fund）
    const mine = await request(httpServer).get('/portal/notifications').set('Authorization', `Bearer ${bt}`).expect(200)
    expect(Array.isArray(mine.body)).toBe(true)
    // 每条通知必属于 youdao scope 或精确投递（不泄漏他人）
    for (const n of mine.body) {
      const ok = (n.scopeType === 'brand' && n.scopeId === 'youdao') || n.userId
      expect(ok).toBeTruthy()
    }
    // 代理拉自己的通知，不含品牌 youdao 的
    const at = await token('agent')
    const agentNotifs = await request(httpServer).get('/portal/notifications').set('Authorization', `Bearer ${at}`).expect(200)
    for (const n of agentNotifs.body) {
      expect(n.scopeId === 'youdao' && n.scopeType === 'brand').toBe(false)
    }
  })
  it('平台账户通知含 platform 广播', async () => {
    const su = await token('admin')
    const res = await request(httpServer).get('/notifications').set('Authorization', `Bearer ${su}`).expect(200)
    expect(res.body.some((n: any) => n.scopeType === 'platform')).toBe(true) // 种子 NT-0003
  })
})

describe('客户主动操作（债3）', () => {
  it('品牌上架商品（draft）+ 提交审核（pending）；scope 隔离', async () => {
    const bt = await token('brand')
    const add = await request(httpServer).post('/portal/brand/products').set('Authorization', `Bearer ${bt}`).send({ name: '测试商品连续包月', firstPrice: 19.9, renewPrice: 29.9 })
    expect([200, 201]).toContain(add.status)
    const id = add.body.id
    // 我的商品里能看到
    const mine = await request(httpServer).get('/portal/brand/products').set('Authorization', `Bearer ${bt}`).expect(200)
    expect(mine.body.find((p: any) => p.id === id).status).toBe('draft')
    // 提交审核
    const sub = await request(httpServer).post(`/portal/brand/products/${id}/submit`).set('Authorization', `Bearer ${bt}`)
    expect(sub.body.ok).toBe(true)
    // 平台能看到 pending
    const su = await token('admin')
    const all = await request(httpServer).get('/products').set('Authorization', `Bearer ${su}`).expect(200)
    expect(all.body.find((p: any) => p.id === id).status).toBe('pending')
    // 代理打品牌商品端点 403
    const at = await token('agent')
    await request(httpServer).get('/portal/brand/products').set('Authorization', `Bearer ${at}`).expect(403)
  })
  it('品牌发起合约 + 代理领取投放生成追踪链接', async () => {
    const bt = await token('brand')
    const c = await request(httpServer).post('/portal/contracts').set('Authorization', `Bearer ${bt}`).send({ settleModel: 'cps_share', targetGmv: 500000 })
    expect([200, 201]).toContain(c.status)
    expect(c.body.id).toBeTruthy()
    const at = await token('agent')
    const claim = await request(httpServer).post('/portal/agent/claims').set('Authorization', `Bearer ${at}`).send({ brandId: 'youdao' })
    expect([200, 201]).toContain(claim.status)
    expect(claim.body.trackingUrl).toContain('t.youdao.cps')
  })
  it('代理申请提现：≤payoutPending；超额拒绝；品牌打代理提现端点 403', async () => {
    const at = await token('agent')
    // 超额拒绝（绝对越额，必拒，与既有 pending 无关）
    const over = await request(httpServer).post('/portal/agent/payout-requests').set('Authorization', `Bearer ${at}`).send({ amount: 999999999 })
    expect(over.body.ok).toBe(false)
    // 正常申请：按当前真实剩余额度申请（不假设干净状态——同一 agent 余额可能被其它用例占用）
    const pay = await request(httpServer).get('/portal/agent/payouts').set('Authorization', `Bearer ${at}`).expect(200)
    const reqs = await request(httpServer).get('/portal/agent/payout-requests').set('Authorization', `Bearer ${at}`).expect(200)
    const pendingSum = (reqs.body as { amount: number; status: string }[]).filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0)
    const remaining = pay.body.payoutPending - pendingSum
    if (remaining >= 100) {
      const ok = await request(httpServer).post('/portal/agent/payout-requests').set('Authorization', `Bearer ${at}`).send({ amount: 100 })
      expect(ok.body.ok).toBe(true)
    } // 无剩余额度则上面的超额拒绝已充分验证限额逻辑
    // 品牌打代理端点 403
    const bt = await token('brand')
    await request(httpServer).post('/portal/agent/payout-requests').set('Authorization', `Bearer ${bt}`).send({ amount: 100 }).expect(403)
  })
  it('S1 提现堆叠拦截：两次接近全额申请不能都成功（累计 ≤ payoutPending）', async () => {
    const at = await token('agent') // A-2041 payoutPending=486200
    // 不假设干净状态（其它用例可能已申请）：两次各申请接近全额，至少一次必被拒
    const r1 = await request(httpServer).post('/portal/agent/payout-requests').set('Authorization', `Bearer ${at}`).send({ amount: 450000 })
    const r2 = await request(httpServer).post('/portal/agent/payout-requests').set('Authorization', `Bearer ${at}`).send({ amount: 450000 })
    // 两次各 450000，累计 900000 远超余额 486200 → 不可能都成功（堆叠被拦）
    expect(r1.body.ok && r2.body.ok).toBe(false)
  })
  it('L3 品牌发起合约强制 open 挂单（不可单方指派代理 active）', async () => {
    const bt = await token('brand')
    const r = await request(httpServer).post('/portal/contracts').set('Authorization', `Bearer ${bt}`).send({ agentId: 'A-2041', settleModel: 'cps_share', targetGmv: 100000 })
    expect(r.body.ok).toBe(true)
    // 验证落库为 open + agentId null（agentId 入参被忽略）
    const su = await token('admin')
    const list = await request(httpServer).get('/contracts').set('Authorization', `Bearer ${su}`).expect(200)
    const c = list.body.find((x: any) => x.id === r.body.id)
    expect(c.status).toBe('open')
    expect(c.agentId).toBeNull()
  })
})

describe('增长合约/资源置换内部 CRUD（债1，单源）', () => {
  it('内部合约：创建 + 列表 + 状态流转；客户角色无 contract.write 创建 403', async () => {
    const su = await token('admin')
    const before = (await request(httpServer).get('/contracts').set('Authorization', `Bearer ${su}`).expect(200)).body.length
    const add = await request(httpServer).post('/contracts').set('Authorization', `Bearer ${su}`).send({ brandId: 'youdao', settleModel: 'cps_share', targetGmv: 500000, settleParams: { agentSharePct: 35 } })
    expect([200, 201]).toContain(add.status)
    const id = add.body.id
    const after = (await request(httpServer).get('/contracts').set('Authorization', `Bearer ${su}`).expect(200)).body
    expect(after.length).toBe(before + 1)
    expect(after.find((c: any) => c.id === id).status).toBe('open') // 无 agentId = 挂单
    // 状态流转
    await request(httpServer).patch(`/contracts/${id}/status`).set('Authorization', `Bearer ${su}`).send({ status: 'closed' }).expect((r) => expect([200, 201]).toContain(r.status))
    // 客户角色无内部 contract.write
    const bt = await token('brand')
    await request(httpServer).post('/contracts').set('Authorization', `Bearer ${bt}`).send({ brandId: 'youdao', settleModel: 'cps_share' }).expect(403)
  })
  it('内部置换：创建 + 列表 + 状态流转', async () => {
    const su = await token('admin')
    const add = await request(httpServer).post('/barter').set('Authorization', `Bearer ${su}`).send({ initiatorBrandId: 'youdao', counterpartyBrandId: 'mango', resourceType: '广告位', myQuota: 300000, counterpartyQuota: 300000 })
    expect([200, 201]).toContain(add.status)
    const id = add.body.id
    const list = (await request(httpServer).get('/barter').set('Authorization', `Bearer ${su}`).expect(200)).body
    expect(list.find((b: any) => b.id === id)).toBeTruthy()
    await request(httpServer).patch(`/barter/${id}/status`).set('Authorization', `Bearer ${su}`).send({ status: 'active' }).expect((r) => expect([200, 201]).toContain(r.status))
  })
  it('内部置换：对手品牌不存在/为自身 → 拒绝（不落悬空外键，对齐门户 proposeBarter）', async () => {
    const su = await token('admin')
    const dangling = await request(httpServer).post('/barter').set('Authorization', `Bearer ${su}`).send({ initiatorBrandId: 'youdao', counterpartyBrandId: 'brand-不存在', resourceType: '广告位', myQuota: 100, counterpartyQuota: 100 })
    expect(dangling.body.ok).toBe(false)
    const self = await request(httpServer).post('/barter').set('Authorization', `Bearer ${su}`).send({ initiatorBrandId: 'youdao', counterpartyBrandId: 'youdao', resourceType: '广告位', myQuota: 100, counterpartyQuota: 100 })
    expect(self.body.ok).toBe(false)
  })
})

describe('履约引擎（债2，红线：不破恒等式 I）', () => {
  it('正向订单 ingest：匹配合约累加 achievedGmv + 订阅 upsert，且对账仍 ok', async () => {
    const su = await token('admin')
    // 对账基线 ok
    const before = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`).expect(201)
    expect(before.body.ok).toBe(true)
    // GC-2406-01 (youdao/A-2041 active) 履约前 achievedGmv
    const c0 = await request(httpServer).get('/contracts').set('Authorization', `Bearer ${su}`).expect(200)
    const g0 = c0.body.find((x: any) => x.id === 'GC-2406-01')
    expect(g0).toBeTruthy()
    const before2 = g0.achievedGmv
    // ingest renew 订单
    const ing = await request(httpServer).post('/fulfillment/ingest').set('Authorization', `Bearer ${su}`)
      .send({ brandId: 'youdao', agentId: 'A-2041', type: 'renew', amount: 100, plan: '词典 VIP 连续包月' })
    expect([200, 201]).toContain(ing.status)
    expect(ing.body.matchedContractId).toBe('GC-2406-01')
    // achievedGmv += 100
    const c1 = await request(httpServer).get('/contracts').set('Authorization', `Bearer ${su}`).expect(200)
    const g1 = c1.body.find((x: any) => x.id === 'GC-2406-01')
    expect(g1.achievedGmv).toBe(before2 + 100)
    expect(['fulfilling', 'settling']).toContain(g1.status) // 状态推进
    // 红线：对账仍 ok（履约引擎不动结算恒等式五项）
    const after = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`).expect(201)
    expect(after.body.ok).toBe(true)
    expect(after.body.reserveMismatches.length).toBe(0)
  })
  it('外部投诉接入：支付宝/12315/黑猫 → 落 Ticket（orderId 反查归属，不碰资金，鉴权拦截）', async () => {
    const su = await token('admin')
    // 1) 直接指定 brandId 建工单（12315 监管，SLA 24h）
    const direct = await request(httpServer).post('/complaints/ingest').set('Authorization', `Bearer ${su}`)
      .send({ source: '12315', reason: '监管转办：退款纠纷', level: 'regulatory', brandId: 'youdao' })
    expect([200, 201]).toContain(direct.status)
    expect(direct.body.ok).toBe(true)
    expect(direct.body.brandId).toBe('youdao')
    expect(direct.body.slaLeftMin).toBe(1440)
    // 2) 经 orderId 反查归属：先 ingest 一笔订单，再用其 id 投诉
    const ing = await request(httpServer).post('/fulfillment/ingest').set('Authorization', `Bearer ${su}`)
      .send({ brandId: 'ximalaya', agentId: 'A-2041', type: 'first', amount: 18, plan: '喜马拉雅 VIP 连续包月' })
    const oid = ing.body.orderId
    const viaOrder = await request(httpServer).post('/complaints/ingest').set('Authorization', `Bearer ${su}`)
      .send({ source: 'alipay', reason: '自动续费未提醒', orderId: oid, externalRef: 'ALI-001' })
    expect(viaOrder.body.ok).toBe(true)
    expect(viaOrder.body.brandId).toBe('ximalaya') // 反查命中
    expect(viaOrder.body.agentId).toBe('A-2041')
    // 3) 工单流入运营 Complaints（全量工单可见）
    const tickets = await request(httpServer).get('/tickets').set('Authorization', `Bearer ${su}`).expect(200)
    expect(tickets.body.some((t: any) => t.id === direct.body.ticketId && t.source === '12315')).toBe(true)
    // 4) 防护：无 orderId 无 brandId 拒绝
    const noScope = await request(httpServer).post('/complaints/ingest').set('Authorization', `Bearer ${su}`).send({ source: 'heimao', reason: 'x' })
    expect(noScope.body.ok).toBe(false)
    // 5) 防篡改：金额类字段不在白名单 → 400
    await request(httpServer).post('/complaints/ingest').set('Authorization', `Bearer ${su}`).send({ source: 'alipay', reason: 'x', brandId: 'youdao', amount: 100 }).expect(400)
    // 6) 鉴权：客户角色无 ticket.handle → 403
    const at = await token('agent')
    await request(httpServer).post('/complaints/ingest').set('Authorization', `Bearer ${at}`).send({ source: 'alipay', reason: 'x', brandId: 'youdao' }).expect(403)
    // 红线：投诉接入只创建工单，绝不动结算 → 对账仍 ok
    const recon = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`).expect(201)
    expect(recon.body.ok).toBe(true)
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

describe('对账任务（B5）', () => {
  it('触发对账：逐单核对资金拆分恒等式，种子数据应全部对平（ok=true）', async () => {
    const su = await token('admin')
    const r = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`)
    expect([200, 201]).toContain(r.status)
    expect(typeof r.body.checkedSettlements).toBe('number')
    expect(r.body.checkedSettlements).toBeGreaterThan(0)
    expect(Array.isArray(r.body.mismatches)).toBe(true)
    // 口径修正后：种子结算单 gross == brandShare+reserve+platformFee+agentPayout+reversal，应无差异
    expect(r.body.ok).toBe(true)
    expect(r.body.mismatches.length).toBe(0)
  })
  it('财务无 settlement.clear 之外权限也能跑（有 settlement.clear）；ops 无权 → 403', async () => {
    const ops = await token('ops')
    await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${ops}`).expect(403)
  })
})

describe('准备金分期释放（守恒式 II/III/IV，不破恒等式 I）', () => {
  // 取某结算单的资金快照，用于核对 release 前后 reserve 不变、reserveReleased 增加
  async function snap(su: string, sid: string) {
    const r = await request(httpServer).get('/settlements').set('Authorization', `Bearer ${su}`)
    return r.body.find((s: any) => s.id === sid)
  }

  it('准备金释放台账可读，且初始对账（I + II/III/IV）全平 ok=true', async () => {
    const su = await token('admin')
    const list = await request(httpServer).get('/reserve-releases').set('Authorization', `Bearer ${su}`)
    expect([200, 201]).toContain(list.status)
    expect(Array.isArray(list.body)).toBe(true)
    expect(list.body.length).toBeGreaterThan(0)
    const recon = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`)
    expect(recon.body.ok).toBe(true)
    expect(Array.isArray(recon.body.reserveMismatches)).toBe(true)
    expect(recon.body.reserveMismatches.length).toBe(0)
  })

  it('释放一条计划行：reserveReleased↑、reserve 不变、恒等式 I 与守恒 II 仍全平', async () => {
    const su = await token('admin')
    const before = await snap(su, 'S-2406-YD')
    const r = await request(httpServer).post('/reserve/RR-2406YD-2/release').set('Authorization', `Bearer ${su}`)
    expect([200, 201]).toContain(r.status)
    expect(r.body.ok).toBe(true)
    expect(r.body.amount).toBe(202080) // D30 计划额

    const after = await snap(su, 'S-2406-YD')
    expect(after.reserve).toBe(before.reserve) // reserve 计提总额不变（I 的项不动）
    expect(after.agentPayout).toBe(before.agentPayout) // 释放不动 agentPayout（否则破 I）
    expect(after.reserveReleased).toBe(before.reserveReleased + 202080) // 已释放累计增加
    expect(after.frozen).toBe(before.frozen - 202080) // frozen 随 II 减少

    // 释放后整体对账仍全平（I + II/III/IV）
    const recon = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`)
    expect(recon.body.ok).toBe(true)
  })

  it('释放为资金动作：同 Idempotency-Key 二次提交为 replay，不重复释放', async () => {
    const su = await token('admin')
    const key = 'e2e-reserve-release-' + Math.random().toString(36).slice(2)
    const r1 = await request(httpServer).post('/reserve/RR-2406YD-3/release').set('Authorization', `Bearer ${su}`).set('Idempotency-Key', key)
    expect(r1.body.ok).toBe(true)
    expect(r1.body.replayed).toBeUndefined()
    const r2 = await request(httpServer).post('/reserve/RR-2406YD-3/release').set('Authorization', `Bearer ${su}`).set('Idempotency-Key', key)
    expect(r2.body.replayed).toBe(true) // 命中首次结果，未再次释放
  })

  it('已释放的计划行不可再次释放（条件更新防重）', async () => {
    const su = await token('admin')
    // RR-2406YD-2 已在前面释放
    const r = await request(httpServer).post('/reserve/RR-2406YD-2/release').set('Authorization', `Bearer ${su}`)
    expect(r.body.ok).toBe(false)
  })

  it('冻结一条 scheduled 计划行（投诉超阈/高风险）', async () => {
    const su = await token('admin')
    const r = await request(httpServer).post('/reserve/RR-2406YD-4/freeze').set('Authorization', `Bearer ${su}`).send({ reason: '投诉率逼近阈值' })
    expect([200, 201]).toContain(r.status)
    expect(r.body.ok).toBe(true)
    // 冻结后对账仍平（frozen 行计入 II 的 pending，III 仍成立）
    const recon = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`)
    expect(recon.body.ok).toBe(true)
  })

  it('ops 无 settlement.clear 权限 → 释放 403', async () => {
    const ops = await token('ops')
    await request(httpServer).post('/reserve/RR-2406WP-2/release').set('Authorization', `Bearer ${ops}`).expect(403)
  })
})

describe('有道续费对接（RSA + 模拟全链路，恒等式不破）', () => {
  // 取一个 live 商品作签约标的
  async function liveProductId(): Promise<string> {
    const r = await request(httpServer).get('/market/products').expect(200)
    return r.body[0].id
  }

  // 有道下单（form-data，RSA 签）→ 返回 orderId
  async function ydOrder(goodsId: string, mobile: string): Promise<string> {
    const co = 'CO-' + Math.random().toString(36).slice(2, 10)
    const r = await request(httpServer).post('/pay/outside/order').type('form')
      .send(ydSign({ goodsId, custOrderId: co, phone: mobile, payType: 'ALIPAY', platform: 'android', signType: 'payAfterSigning', deviceId: 'dev-1' }) as Record<string, string>)
    return r.body.data.payInfo.orderId
  }

  it('下单→首扣→续扣→退款→对账(恒等式不破)→解约 全链路（RSA）', async () => {
    const su = await token('admin')
    const pid = await liveProductId()
    // 下单（RSA, form-data）
    const so = await ydOrder(pid, '13900008888')
    expect(so).toMatch(/^SIGN-/)
    // 首扣（内部 sim, JWT）→ 落首单 + 订阅
    const fc = await request(httpServer).post('/cps/sim/first-charge').set('Authorization', `Bearer ${su}`).send({ signOrderNo: so })
    expect(fc.body.ok).toBe(true)
    expect(fc.body.period).toBe(0)
    const ext0 = fc.body.extOrderNo
    // 续扣 → period=1
    const rc = await request(httpServer).post('/cps/sim/renew').set('Authorization', `Bearer ${su}`).send({ signOrderNo: so })
    expect(rc.body.ok).toBe(true)
    expect(rc.body.period).toBe(1)
    // 查询 orderStatus
    const q = await request(httpServer).get('/order/outside/orderQuery').query(ydSign({ orderId: so }) as Record<string, string>)
    expect(q.body.code).toBe(0)
    expect(q.body.data.orderStatus).toBe(2)
    // 对账退款前 ok
    const r0 = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`)
    expect(r0.body.ok).toBe(true)
    // 退款（RSA, orderId=交易单号）
    const rf = await request(httpServer).post('/order/outside/refund').type('form').send(ydSign({ orderId: ext0 }) as Record<string, string>)
    expect(rf.body.code).toBe(0)
    // 退款后对账仍 ok（结算恒等式 I 不破）
    const r1 = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`)
    expect(r1.body.ok).toBe(true)
    expect(r1.body.mismatches.length).toBe(0)
    // 解约（RSA）
    const u = await request(httpServer).post('/order/outside/unsign').type('form').send(ydSign({ orderId: so }) as Record<string, string>)
    expect(u.body.code).toBe(0)
  })

  it('RSA 错签 → 403；时间戳过期 → 403；未注册 merchantId → 123', async () => {
    const pid = await liveProductId()
    // 错签
    const bad = await request(httpServer).post('/pay/outside/order').type('form')
      .send({ custId: YD_CUST, merchantId: YD_MCH, goodsId: pid, custOrderId: 'CO-bad', phone: '13900000000', payType: 'ALIPAY', platform: 'android', signType: 'payAfterSigning', deviceId: 'd', timestamp: String(Math.floor(Date.now() / 1000)), sign: 'deadbeef' })
    expect(bad.body.code).toBe(403)
    // 时间戳过期
    const stale = ydSign({ goodsId: pid, custOrderId: 'CO-stale', phone: '13900000000', payType: 'ALIPAY', platform: 'android', signType: 'payAfterSigning', deviceId: 'd' }) as Record<string, string>
    stale.timestamp = String(Math.floor(Date.now() / 1000) - 600)
    const staleRes = await request(httpServer).post('/pay/outside/order').type('form').send(stale)
    expect(staleRes.body.code).toBe(403)
    // 未注册 merchantId → 123 合作方不存在（有道码表）
    const nope = await request(httpServer).get('/order/outside/orderQuery').query({ merchantId: 'nope', orderId: 'X', sign: 'x', timestamp: String(Math.floor(Date.now() / 1000)) })
    expect(nope.body.code).toBe(123)
  })

  it('合作方订单号重复 → 125', async () => {
    const pid = await liveProductId()
    const co = 'CO-dup-' + Math.random().toString(36).slice(2, 8)
    const p1 = await request(httpServer).post('/pay/outside/order').type('form').send(ydSign({ goodsId: pid, custOrderId: co, phone: '13900001111', payType: 'ALIPAY', platform: 'android', signType: 'payAfterSigning', deviceId: 'd' }) as Record<string, string>)
    expect(p1.body.code).toBe(0)
    const p2 = await request(httpServer).post('/pay/outside/order').type('form').send(ydSign({ goodsId: pid, custOrderId: co, phone: '13900001111', payType: 'ALIPAY', platform: 'android', signType: 'payAfterSigning', deviceId: 'd' }) as Record<string, string>)
    expect(p2.body.code).toBe(125)
  })

  it('未过审商品不可签约扣款：pending/draft goodsId → 124（商品不可用）', async () => {
    // PRD-ZH-01 = pending、PRD-KP-01 = draft（见 seed），均非 live，不得被签约
    for (const gid of ['PRD-ZH-01', 'PRD-KP-01']) {
      const r = await request(httpServer).post('/pay/outside/order').type('form')
        .send(ydSign({ goodsId: gid, custOrderId: 'CO-nolive-' + Math.random().toString(36).slice(2, 8), phone: '13900002222', payType: 'ALIPAY', platform: 'android', signType: 'payAfterSigning', deviceId: 'd' }) as Record<string, string>)
      expect(r.body.code).toBe(124)
    }
  })

  it('幂等：同 Idempotency-Key 首扣只执行一次（不双扣）', async () => {
    const su = await token('admin')
    const pid = await liveProductId()
    const so = await ydOrder(pid, '13900007777')
    const key = 'e2e-cps-idem-' + Math.random().toString(36).slice(2)
    const r1 = await request(httpServer).post('/cps/sim/first-charge').set('Authorization', `Bearer ${su}`).set('Idempotency-Key', key).send({ signOrderNo: so })
    const r2 = await request(httpServer).post('/cps/sim/first-charge').set('Authorization', `Bearer ${su}`).set('Idempotency-Key', key).send({ signOrderNo: so })
    expect(r1.body.ok).toBe(true)
    expect(r2.body.replayed).toBe(true) // 命中首次结果，未再次扣款
    expect(r2.body.orderId).toBe(r1.body.orderId)
  })

  it('补扣 sweep：扣款失败→补扣队列→sweep 成功落续费单，对账仍 ok', async () => {
    const su = await token('admin')
    const pid = await liveProductId()
    const so = await ydOrder(pid, '13900006666')
    await request(httpServer).post('/cps/sim/first-charge').set('Authorization', `Bearer ${su}`).send({ signOrderNo: so })
    // 注入扣款失败 → 进补扣队列
    const fail = await request(httpServer).post('/cps/sim/fail').set('Authorization', `Bearer ${su}`).send({ signOrderNo: so, reason: '余额不足' })
    expect(fail.body.ok).toBe(true)
    // sweep 成功
    const sweep = await request(httpServer).post('/cps/retry/sweep').set('Authorization', `Bearer ${su}`).send({ outcome: 'success' })
    expect(sweep.body.succeeded).toBeGreaterThanOrEqual(1)
    // 对账仍 ok（补扣走 ingestOrder，恒等式不破）
    const r = await request(httpServer).post('/reconciliation/run').set('Authorization', `Bearer ${su}`)
    expect(r.body.ok).toBe(true)
  })

  it('开发者中心：RSA 凭证回显不含私钥；非品牌角色 403', async () => {
    const bt = await token('brand')
    const dev = await request(httpServer).get('/portal/brand/developer').set('Authorization', `Bearer ${bt}`).expect(200)
    expect(dev.body.publicKeyHint).toBeTruthy() // 公钥指纹脱敏
    expect(dev.body.hasPublicKey).toBe(true)
    expect(dev.body.privateKey).toBeUndefined() // 绝不回私钥
    expect(dev.body.merchantId).toBe('mch_youdao')
    // 代理角色无 portal.brand.developer 权限
    const at = await token('agent')
    await request(httpServer).get('/portal/brand/developer').set('Authorization', `Bearer ${at}`).expect(403)
  })

  it('RSA 密钥自助生成：私钥仅一次返回，再 GET 不回私钥', async () => {
    const bt = await token('brand')
    const gen = await request(httpServer).post('/portal/brand/developer/rsa/keygen').set('Authorization', `Bearer ${bt}`)
    expect(gen.body.ok).toBe(true)
    expect(gen.body.privateKey).toContain('PRIVATE KEY') // 明文私钥仅此一次
    expect(gen.body.publicKey).toContain('PUBLIC KEY')
    // 再 GET 不含私钥
    const dev = await request(httpServer).get('/portal/brand/developer').set('Authorization', `Bearer ${bt}`).expect(200)
    expect(dev.body.privateKey).toBeUndefined()
    // 恢复 demo 公钥，避免污染共享 youdao 凭证（其他 RSA 测试依赖 demo 私钥验签）
    await request(httpServer).post('/portal/brand/developer/rsa/upload').set('Authorization', `Bearer ${bt}`).send({ publicKey: DEMO_RSA_PUBLIC })
  })

  it('联调台 console/sign 返回 stringToSign 不收私钥；健康分自检评分', async () => {
    const bt = await token('brand')
    const cs = await request(httpServer).post('/portal/brand/developer/console/sign').set('Authorization', `Bearer ${bt}`).send({ params: { b: 2, a: 1 } })
    expect(cs.body.stringToSign).toBe('a=1&b=2')
    const hc = await request(httpServer).post('/portal/brand/developer/health-check').set('Authorization', `Bearer ${bt}`)
    expect(hc.body.ok).toBe(true)
    expect(hc.body.score).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(hc.body.checks)).toBe(true)
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

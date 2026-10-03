import { All, Controller, Req, Res, ForbiddenException } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { createHash, createHmac } from 'crypto'
import type { Request, Response } from 'express'
import { PrismaService } from '../prisma.service'
import { RequirePerms, type AuthUser } from '../rbac/rbac'

// AIGC 素材引擎代理。
// agent-studio 作为独立微服务运行（默认 http://127.0.0.1:48787），自带内容引擎 /
// 模型网关 / 积分账本 / Playwright 渲染。cps 不复制其逻辑，只做一层带鉴权的反向代理：
//   /aigc/factory/*  → {AIGC_SERVICE_URL}/api/factory/*
//   /aigc/billing/*  → {AIGC_SERVICE_URL}/api/billing/*
// 这样素材能力既能被 cps 控制台调用（经 aigc.view 鉴权），也能被客户后期独立使用
// （直连微服务）——边界清晰，两栈各自干净。
@ApiExcludeController()
@Controller('aigc')
export class AigcController {
  constructor(private cfg: ConfigService, private prisma: PrismaService) {}

  private base(): string {
    return this.cfg.get<string>('AIGC_SERVICE_URL') || 'http://127.0.0.1:48787'
  }

  private internalSecret(): string {
    return this.cfg.get<string>('AIGC_INTERNAL_SECRET') || ''
  }

  // P0-7：把 CPS 登录态映射为可信租户工作区 id（客户端无法伪造——服务端按 scope 生成 + HMAC 签名注入）。
  //   brand / agent 各自独立工作区；平台员工共用 platform 工作区。下游按 workspaceId 隔离作业/积分。
  private tenantWorkspace(user: AuthUser): string {
    if (user.scopeType === 'brand' && user.scopeId) return `brand-${user.scopeId}`
    if (user.scopeType === 'agent' && user.scopeId) return `agent-${user.scopeId}`
    if (user.scopeType === 'platform') return 'platform'
    throw new ForbiddenException('素材工作区身份不完整')
  }

  private signTenant(workspaceId: string, userId: string, secret: string): string {
    return createHmac('sha256', secret).update(`${workspaceId}\n${userId}`).digest('hex')
  }

  // 生成成功后在 CPS 侧建 Asset 归属记录（债5）：素材挂到发起方品牌/代理。
  // 弱引用 agent-studio 的 job.id，不复制素材内容；微服务侧仍是素材真身。
  private async recordAsset(user: AuthUser, job: Record<string, unknown>, body: Record<string, unknown> = {}): Promise<boolean> {
    if (!job.id || job.status !== 'completed') return false
    try {
      const ownership = { brandId: user.scopeType === 'brand' ? user.scopeId : null, agentId: user.scopeType === 'agent' ? user.scopeId : null }
      const existing = await this.prisma.asset.findFirst({ where: { jobId: String(job.id), ...ownership } })
      if (existing) return true
      const id = 'AST-' + createHash('sha256').update(JSON.stringify([user.scopeType, user.scopeId, job.id])).digest('hex').slice(0, 32)
      await this.prisma.asset.upsert({
        where: { id }, update: {}, create: {
          id, ...ownership,
          assetType: String(job.asset_type ?? job.assetType ?? body.assetType ?? ''),
          jobId: String(job.id), prompt: String(job.prompt ?? body.prompt ?? '').slice(0, 120), status: 'generated',
        },
      })
      return true
    } catch { return false } // The completed engine result remains retrievable; reads retry registration.
  }

  @All('factory/*path')
  @RequirePerms('aigc.view', 'portal.aigc')
  async factory(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, '/api/factory/')
  }

  @All('billing/*path')
  @RequirePerms('aigc.view', 'portal.aigc')
  async billing(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, '/api/billing/')
  }

  private async proxy(req: Request, res: Response, prefix: '/api/factory/' | '/api/billing/') {
    // 取 cps 路由后缀（factory/xxx → xxx），拼到 agent-studio 的 /api/<prefix>/xxx
    const tail = req.path.replace(/^\/aigc\/(factory|billing)\//, '')
    // 纵深防御：拒绝 ../（含 %2e 编码形态）穿越出 /api/factory|billing 前缀，
    // 否则持 aigc.view 的用户可经代理打到 agent-studio 的任意路由
    let decodedTail = tail
    try { decodedTail = decodeURIComponent(tail) } catch { /* 非法编码按原文检查 */ }
    if (decodedTail.includes('..')) {
      res.status(400).json({ code: 400, message: '非法路径' })
      return
    }
    const user = (req as Request & { user?: AuthUser }).user

    // P0-7：剥离客户端传入的 workspaceId/userId（query + body）——租户身份一律由服务端按登录态注入，
    //   客户端不得自选租户。即便这里漏删，下游 agent-studio 也只认签名服务端头，无法被冒用（纵深防御）。
    const rawQs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : ''
    const params = new URLSearchParams(rawQs)
    params.delete('workspaceId'); params.delete('userId')
    const qs = params.toString() ? `?${params.toString()}` : ''
    const target = this.base() + prefix + tail + qs

    const fwdBody: Record<string, unknown> = { ...((req.body as Record<string, unknown>) ?? {}) }
    delete fwdBody.workspaceId; delete fwdBody.userId
    if (tail === 'generate' && req.headers['idempotency-key']) {
      const operationKey = req.headers['idempotency-key']
      if (typeof operationKey !== 'string' || (fwdBody.operationKey && fwdBody.operationKey !== operationKey)) {
        res.status(400).json({ message: '生成请求标识冲突' }); return
      }
      fwdBody.operationKey = operationKey
    }

    // 可信租户头：按登录 scope 生成 workspaceId + HMAC 签名注入。需两侧配 AIGC_INTERNAL_SECRET；
    // Missing signing configuration must never merge distinct tenants into default.
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const secret = this.internalSecret()
    if (!user || !secret) {
      res.status(503).json({ code: 503, message: '素材工作区安全连接尚未配置，请联系管理员' })
      return
    }
    if (user && secret) {
      const ws = this.tenantWorkspace(user)
      const uid = user.id || 'cps-user'
      headers['x-internal-workspace-id'] = ws
      headers['x-internal-user-id'] = uid
      headers['x-internal-sign'] = this.signTenant(ws, uid, secret)
    }

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(fwdBody),
      })
      // Only the owned-job PNG endpoint can return binary data. Never embed
      // generated HTML under the CPS origin or decode PNG bytes as UTF-8.
      if (upstream.ok && /^jobs\/[^/]+\/assets\/\d{1,2}$/.test(tail)) {
        if (upstream.headers.get('content-type')?.split(';')[0] !== 'image/png') {
          res.status(502).json({ message: '素材格式不可预览' })
          return
        }
        const bytes = Buffer.from(await upstream.arrayBuffer())
        res.setHeader('content-type', 'image/png')
        res.setHeader('x-content-type-options', 'nosniff')
        res.setHeader('content-security-policy', "default-src 'none'; sandbox")
        res.setHeader('cache-control', 'private, no-store')
        res.setHeader('content-disposition', 'inline; filename="generated.png"')
        res.status(upstream.status).send(bytes)
        return
      }
      let text = await upstream.text()
      // 生成成功 → 在 CPS 侧建 Asset 归属（仅 factory/generate，且有客户 scope）
      if (upstream.ok && user?.scopeId && (tail === 'generate' || tail === 'jobs' || /^(jobs|operations)\/[^/]+$/.test(tail))) {
        const result = JSON.parse(text)
        const jobs = Array.isArray(result.jobs) ? result.jobs : result.job ? [result.job] : []
        for (const job of jobs) if (job.status === 'completed') {
          job.assetRegistration = await this.recordAsset(user, job, req.body ?? {}) ? 'registered' : 'pending'
        }
        if (result.job) result.assetRegistration = result.job.assetRegistration
        text = JSON.stringify(result)
      }
      res.status(upstream.status)
      res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json')
      res.send(text)
    } catch {
      // 微服务未启动：返回明确的 503，前端据此显示"素材服务未连接"，不谎报。
      res.status(503).json({
        code: 503,
        message: 'AIGC 素材服务未连接（agent-studio 微服务未启动）',
        hint: '在 services/agent-studio 启动微服务后重试，或设置 AIGC_SERVICE_URL',
      })
    }
  }
}

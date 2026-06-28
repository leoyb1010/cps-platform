import { All, Controller, Req, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
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

  // 生成成功后在 CPS 侧建 Asset 归属记录（债5）：素材挂到发起方品牌/代理。
  // 弱引用 agent-studio 的 job.id，不复制素材内容；微服务侧仍是素材真身。
  private async recordAsset(user: AuthUser, body: Record<string, unknown>, resultText: string) {
    try {
      const r = JSON.parse(resultText)
      if (!r.ok || !r.job?.id) return
      await this.prisma.asset.create({
        data: {
          id: 'AST-' + randomUUID().slice(0, 6),
          brandId: user.scopeType === 'brand' ? user.scopeId : null,
          agentId: user.scopeType === 'agent' ? user.scopeId : null,
          assetType: String(body.assetType ?? ''),
          jobId: String(r.job.id),
          prompt: String(body.prompt ?? '').slice(0, 120),
          status: 'generated',
        },
      })
    } catch { /* 归属落库失败不影响素材生成主流程 */ }
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
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''
    const target = this.base() + prefix + tail + qs

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers: { 'content-type': 'application/json' },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      })
      const text = await upstream.text()
      // 生成成功 → 在 CPS 侧建 Asset 归属（仅 factory/generate，且有客户 scope）
      if (upstream.ok && tail === 'generate' && (req as Request & { user?: AuthUser }).user?.scopeId) {
        await this.recordAsset((req as Request & { user: AuthUser }).user, req.body ?? {}, text)
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

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Request } from 'express'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { MONEY_FIELDS, toYuan } from './money'

/**
 * P1-B7 金额边界转换（整数分 → 元）。
 *
 * 约定：DB + 全部后端服务以「分」为单位（整数精确）。面向前端（admin/门户）的 HTTP 响应在此
 * 统一把金额字段 分→元 转回，使前端契约不变（前端仍收元、展示零改动）。
 *
 * 例外：有道对外接口（合作方按有道规范收「分 Long」的 price，以及 total_amount 走支付参数）单位口径
 * 逐字段不同，不能统一转换——故 EXTERNAL_PREFIXES 下的响应整体跳过，由 youdao/cps 控制器各自显式处理。
 *
 * 字段判定用「精确字段名」白名单（MONEY_FIELDS），避免误伤 reservePct/agentShareSnapshot/discountPct
 * 等比率字段。新增金额字段务必同步加入此集合（否则该字段会以「分」返回 = 100×）。
 */

// 有道对外（合作方按分口径）路由前缀：整体跳过统一转换。
const EXTERNAL_PREFIXES = ['/pay/outside', '/order/outside', '/pay/', '/order/']

function isExternal(path: string): boolean {
  return EXTERNAL_PREFIXES.some((p) => path.startsWith(p))
}

// 递归把 money 字段 分→元。数组/对象深走；Date/null/基本类型原样。防环用 seen 集。
function convert(node: unknown, seen: WeakSet<object>): unknown {
  if (node === null || typeof node !== 'object') return node
  if (node instanceof Date) return node
  if (seen.has(node as object)) return node
  seen.add(node as object)
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = convert(node[i], seen)
    return node
  }
  const obj = node as Record<string, unknown>
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (typeof v === 'number' && MONEY_FIELDS.has(k)) obj[k] = toYuan(v)
    else if (v && typeof v === 'object') obj[k] = convert(v, seen)
  }
  return obj
}

@Injectable()
export class MoneyResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>()
    const path = req?.path || req?.url || ''
    if (isExternal(path)) return next.handle() // 有道对外：控制器自行按分/元逐字段处理
    return next.handle().pipe(map((body) => convert(body, new WeakSet())))
  }
}

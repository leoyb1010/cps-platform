// ════════════════════════════════════════════════════════════════
//  L3 API 契约层（蓝本）—— 资源化接口定义
//  当前由 L2 mock store 实现；上生产时替换为真实后端，签名不变。
//  约定：写操作幂等键、资金类二次确认+审计、列表 cursor 分页、统一错误码。
// ════════════════════════════════════════════════════════════════
import * as store from './store'
import type { Order, Complaint, Settlement, Agent, MerchantAccount, Brand } from './data'

export interface ListQuery {
  q?: string
  filter?: Record<string, string>
  cursor?: string
  limit?: number
}
export interface Paged<T> {
  items: T[]
  nextCursor?: string
}

// 当前实现：直接读 L2 store 快照（同步）。生产实现：HTTP 调用，返回 Promise。
function page<T>(items: T[], query?: ListQuery): Paged<T> {
  const q = query?.q?.trim().toLowerCase()
  const filtered = q ? items.filter((x) => JSON.stringify(x).toLowerCase().includes(q)) : items
  const limit = query?.limit ?? 50
  return { items: filtered.slice(0, limit) }
}

export const api = {
  // ── 品牌 ──
  brands: {
    list: (q?: ListQuery): Paged<Brand> => page(store.getStore().brands, q),
    get: (id: string) => store.getStore().brands.find((b) => b.id === id),
    create: (input: store.NewBrandInput) => store.addBrand(input),
    setStatus: (id: string, status: Brand['status'], label: string) => store.setBrandStatus(id, status, label),
  },
  // ── 代理 ──
  agents: {
    list: (q?: ListQuery): Paged<Agent> => page(store.getStore().agents, q),
    setStatus: (id: string, status: Agent['status'], label: string) => store.setAgentStatus(id, status, label),
    settle: (id: string) => store.settleAgent(id),
  },
  // ── 商户号 ──
  merchants: {
    list: (q?: ListQuery): Paged<MerchantAccount> => page(store.getStore().merchants, q),
    create: (input: { brandId: string; channel: 'wechat' | 'alipay' | 'bank'; weight: number }) => store.addMerchant(input),
    setState: (id: string, state: MerchantAccount['state'], label: string) => store.setMerchantState(id, state, label),
  },
  // ── 订单 / 订阅 ──
  orders: {
    list: (q?: ListQuery): Paged<Order> => page(store.getStore().orders, q),
    refund: (id: string) => store.refundOrder(id), // 幂等：重复退款无副作用
  },
  // ── 清结算 ──
  settlements: {
    list: (q?: ListQuery): Paged<Settlement> => page(store.getStore().settlements, q),
    clear: (id: string) => store.clearSettlement(id), // 资金操作：生产需二次确认 + 审计
    reconcile: (id: string) => store.reconcileSettlement(id),
  },
  // ── 工单 ──
  tickets: {
    list: (q?: ListQuery): Paged<Complaint> => page(store.getStore().complaints, q),
    refund: (id: string) => store.resolveTicketWithRefund(id), // 联动：退款→冲账→分润→信用分
    update: (id: string, patch: Partial<Complaint>, note?: string) => store.updateTicket(id, patch, note),
  },
}

// ════════════════════════════════════════════════════════════════
//  集成适配器接口（可插拔）—— 生产对接，当前为契约占位
// ════════════════════════════════════════════════════════════════

/** 持牌分账：只下发指令，资金本体不过平台（规避二清） */
export interface SplitPaymentAdapter {
  name: string // 连连 / 汇付 / 微信官方分账 / 支付宝分账 / 银行存管
  /** 下发分账指令；返回受理回执（不经手资金） */
  dispatch(order: { orderId: string; amount: number; splits: { account: string; amount: number }[] }): Promise<{ accepted: boolean; receiptId: string }>
  /** 拉取对账回执 */
  reconcile(period: string): Promise<{ rows: { orderId: string; settled: number }[] }>
}

/** 转化回传：把签约/支付成功回传给投放平台优化模型 */
export interface AttributionAdapter {
  name: string // 巨量 / 快手 / 广点通 / 百度 / 支付宝
  report(event: { clickId: string; type: 'sign' | 'pay'; value: number }): Promise<{ ok: boolean }>
}

/** 灵活用工开票：个人佣金合规化（规避无票打款税务风险） */
export interface PayoutInvoiceAdapter {
  name: string // 众包 / 灵活用工平台
  issue(payout: { agentId: string; amount: number }): Promise<{ invoiceId: string; status: 'issued' | 'pending' }>
}

/**
 * L3 迁移说明：
 * 1. 以上 api.* 的方法签名即后端 REST/GraphQL 契约蓝本；
 * 2. 后端落地清结算/对账/风控/路由/归因/状态机六大引擎（见 产品升级计划-v2 §5.2）；
 * 3. 适配器接 1 家持牌分账 MVP + 1 家容灾；转化回传逐平台接入；
 * 4. 多租户隔离 + RBAC 三级 + 全量审计 + 加密脱敏（《个保法》）；
 * 5. 把现有有道业务作为首个租户迁入，新老双跑对账后切换。
 */

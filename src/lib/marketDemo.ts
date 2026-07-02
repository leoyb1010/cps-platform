import { brands } from './data'
import type { MarketProduct, Quote, BundleTier } from './marketApi'

/**
 * 订阅超市 · 演示模式数据层。
 * 真实模式货架/算价/成套/支付全部走服务端权威；此处让「演示模式打开 /market 一片空白、
 * 提示需连接后端」的断层消失——货架从种子品牌套餐合成，算价逻辑与服务端 priceBundle 同口径
 * （满件折扣取最优一条 + exclusiveGroup 互斥校验），金额四舍五入到分。
 */

const TIERS: BundleTier[] = [
  { minItems: 2, discountPct: 10 },
  { minItems: 3, discountPct: 15 },
]

const round2 = (n: number) => Math.round(n * 100) / 100

function synthProducts(): MarketProduct[] {
  const out: MarketProduct[] = []
  for (const b of brands) {
    if (b.status !== 'live') continue
    b.plans.forEach((p, i) => {
      out.push({
        id: `PRD-${b.id}-${i + 1}`,
        name: p.name,
        category: (b.category.split('/')[0] ?? '').trim() || '订阅服务',
        description: p.equity || `${b.name} 官方订阅权益`,
        billingCycle: p.autoRenew ? 'continuous' : p.cycle === '年' ? 'yearly' : 'monthly',
        firstPrice: p.firstPrice,
        renewPrice: p.renewPrice,
        bundleEligible: true,
        // 同品牌多套餐互斥（对齐服务端种子 youdao-vip 语义）：演示互斥选购的产品体验
        exclusiveGroup: b.plans.length > 1 ? `${b.id}-vip` : '',
        tags: JSON.stringify((p.equity || '').split(' · ').filter(Boolean).slice(0, 2)),
        brandKey: b.id,
        brandName: b.name,
      })
    })
  }
  return out
}

let cache: MarketProduct[] | null = null
const productsSync = () => (cache ??= synthProducts())

function priceBundle(productIds: string[]): Quote {
  const ids = [...new Set(productIds)]
  const all = productsSync()
  const chosen = all.filter((p) => ids.includes(p.id))
  if (chosen.length === 0)
    return { ok: false, detail: '请选择至少一个有效的上架商品', validIds: [], listPrice: 0, discountPct: 0, finalPrice: 0, ruleId: '', conflicts: [] }
  // 互斥校验：同 exclusiveGroup 不可同选
  const groups = new Map<string, string[]>()
  for (const p of chosen) {
    if (!p.exclusiveGroup) continue
    groups.set(p.exclusiveGroup, [...(groups.get(p.exclusiveGroup) ?? []), p.id])
  }
  const conflicts = [...groups.entries()].filter(([, arr]) => arr.length > 1).map(([group, productIds]) => ({ group, productIds }))
  if (conflicts.length > 0)
    return { ok: false, detail: '存在互斥商品，不能同时选购', conflicts, validIds: chosen.map((p) => p.id), listPrice: 0, discountPct: 0, finalPrice: 0, ruleId: '' }
  const listPrice = round2(chosen.reduce((s, p) => s + p.firstPrice, 0))
  const best = TIERS.filter((t) => chosen.length >= t.minItems).sort((a, b) => b.discountPct - a.discountPct)[0]
  const discountPct = best?.discountPct ?? 0
  const finalPrice = round2(listPrice * (1 - discountPct / 100))
  return { ok: true, validIds: chosen.map((p) => p.id), listPrice, discountPct, finalPrice, ruleId: best ? `BR-DEMO-${best.minItems}` : '', conflicts: [] }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export const marketDemo = {
  async products(): Promise<MarketProduct[]> {
    await wait(160) // 保留骨架屏一瞬，接近真实网络手感
    return productsSync()
  },
  async rules(): Promise<BundleTier[]> {
    return TIERS
  },
  async quote(productIds: string[]): Promise<Quote> {
    await wait(120)
    return priceBundle(productIds)
  },
  async createBundle(productIds: string[]): Promise<Quote & { bundleId?: string }> {
    await wait(220)
    const q = priceBundle(productIds)
    if (!q.ok) return q
    return { ...q, bundleId: 'B-DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase() }
  },
  async pay(bundleId: string, _channel: string): Promise<{ ok: boolean; detail?: string; finalPrice?: number; paid?: boolean }> {
    await wait(420)
    void bundleId
    return { ok: true, detail: '支付成功（演示）', paid: true }
  },
}

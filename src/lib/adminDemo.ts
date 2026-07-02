import { brands, agents } from './data'

// ════════════════════════════════════════════════════════════════
//  控制台演示数据层 —— 让「订阅商品」审核台/组合规则/套餐受理台账在演示态可看。
//  与 marketDemo/portalDemo 同思路：从种子合成，能看不能真正落库（写操作演示态本地态）。
//  真实模式一律走 bizApi 服务端，本文件不参与。
// ════════════════════════════════════════════════════════════════

export interface DemoProduct {
  id: string; brandId: string; brandName: string; brandMark: string; name: string; category: string; description: string
  billingCycle: string; firstPrice: number; renewPrice: number; defaultSharePct: number
  status: string; reviewNote: string; tags: string
}
export interface DemoBundleRule { id: string; name: string; kind: string; params: string; active: boolean }
export interface DemoBundleItem { productId: string; name: string; brandId: string; brandName: string; firstPrice: number }
export interface DemoBundleRow {
  id: string; userRef: string; status: string; paymentStatus?: string; payChannel?: string; listPrice: number; discountPct: number
  finalPrice: number; ruleId: string; createdAt: string; items: DemoBundleItem[]; brandCount: number
}
export interface DemoAgentLite { id: string; name: string }

// 商品：从 live 品牌套餐合成（与 marketDemo 同 id 规则 PRD-<brand>-N，口径一致）。
// 掺入不同审核态（live / pending / draft），让审核台有事可审。
function synthProducts(): DemoProduct[] {
  const out: DemoProduct[] = []
  const catOf = (c: string) => (c.split('/')[0] ?? '').trim() || '订阅服务'
  brands.forEach((b, bi) => {
    if (b.status === 'paused') return
    b.plans.forEach((p, i) => {
      // 大部分 live；每个品牌第 2 个套餐设为待审，个别下架/草稿，制造审核台样态
      const status = i === 1 ? 'pending' : bi % 4 === 3 ? 'draft' : 'live'
      out.push({
        id: `PRD-${b.id}-${i + 1}`,
        brandId: b.id,
        brandName: b.name,
        brandMark: b.mark,
        name: p.name,
        category: catOf(b.category),
        description: p.equity || `${b.name} 官方订阅权益`,
        billingCycle: p.autoRenew ? 'continuous' : p.cycle === '年' ? 'yearly' : 'monthly',
        firstPrice: p.firstPrice,
        renewPrice: p.renewPrice,
        defaultSharePct: 30 - i * 2,
        status,
        reviewNote: '',
        tags: JSON.stringify((p.equity || '').split(' · ').filter(Boolean).slice(0, 2)),
      })
    })
  })
  return out
}

const RULES: DemoBundleRule[] = [
  { id: 'BR-01', name: '满 2 件享 9 折', kind: 'count_off', params: JSON.stringify({ minItems: 2, discountPct: 10 }), active: true },
  { id: 'BR-02', name: '满 3 件享 85 折', kind: 'count_off', params: JSON.stringify({ minItems: 3, discountPct: 15 }), active: true },
]

// 套餐台账：合成 2 张用户已生成的套餐（1 已支付待受理 / 1 未支付），让受理台账有内容。
function synthBundles(prods: DemoProduct[]): DemoBundleRow[] {
  const pick = (ids: string[]) => ids.map((id) => prods.find((p) => p.id === id)).filter(Boolean) as DemoProduct[]
  const toItems = (ps: DemoProduct[]): DemoBundleItem[] => ps.map((p) => ({ productId: p.id, name: p.name, brandId: p.brandId, brandName: p.brandName, firstPrice: p.firstPrice }))
  const live = prods.filter((p) => p.status === 'live')
  const set1 = pick([live[0]?.id, live[1]?.id].filter(Boolean) as string[])
  const set2 = pick([live[0]?.id, live[2]?.id, live[3]?.id].filter(Boolean) as string[])
  const sum = (ps: DemoProduct[]) => +ps.reduce((a, p) => a + p.firstPrice, 0).toFixed(2)
  const mk = (id: string, ps: DemoProduct[], discountPct: number, paid: boolean): DemoBundleRow => {
    const listPrice = sum(ps)
    return {
      id, userRef: 'U-' + id.slice(-4), status: 'quoted', paymentStatus: paid ? 'paid' : 'unpaid',
      payChannel: paid ? 'alipay' : undefined, listPrice, discountPct,
      finalPrice: +(listPrice * (1 - discountPct / 100)).toFixed(2), ruleId: discountPct ? 'BR-01' : '',
      createdAt: '今天', items: toItems(ps), brandCount: new Set(ps.map((p) => p.brandId)).size,
    }
  }
  return [
    mk('B-DEMO01', set1, 10, true),
    mk('B-DEMO02', set2, 15, false),
  ].filter((b) => b.items.length > 0)
}

let _products: DemoProduct[] | null = null
export function demoProducts(): DemoProduct[] {
  return (_products ??= synthProducts())
}
export function demoBundleRules(): DemoBundleRule[] {
  return RULES
}
export function demoBundles(): DemoBundleRow[] {
  return synthBundles(demoProducts())
}
export function demoAgentsLite(): DemoAgentLite[] {
  return agents.filter((a) => a.status === 'active').map((a) => ({ id: a.id, name: a.name }))
}

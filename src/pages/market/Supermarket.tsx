import { useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingBag, Check, Sparkles, ArrowRight, CheckCircle2, Tag, ShieldCheck, Zap, Plus, ExternalLink, Wallet } from 'lucide-react'
import { marketApi, type MarketProduct, type Quote, type BundleTier } from '../../lib/marketApi'
import { isRealApi } from '../../lib/http'
import { money, cx } from '../../lib/format'
import { resolveBrandLogo } from '../../lib/brandLogos'
import { useCountUp } from '../../lib/useCountUp'
import { useApi, bizApi } from '../../lib/adminApi'
import { demoBundles, demoAgentsLite } from '../../lib/adminDemo'
import { Badge, BrandMark, Button, CardTitle, TableShell, Th, Td, Row } from '../../components/ui/primitives'
import { Modal, useToast } from '../../components/ui/overlays'
import { Field, Select } from '../../components/ui/forms'
import { useAnchoredPopover, DetailPopover } from '../../components/ui/popover'

const CYCLE: Record<string, string> = { monthly: '月付', yearly: '年付', continuous: '连续包月' }

/* 商品卡 logo：复用 BrandMark（真实品牌 logo，回退首字） */
function ProductLogo({ p, size = 40 }: { p: MarketProduct; size?: number }) {
  return <BrandMark brand={p.brandKey ?? p.brandName} mark={p.name.slice(0, 1)} size={size} />
}

/**
 * 订阅超市。两种渲染上下文：
 * - 独立公开页（/market，免登录终端用户货架）：embedded=false，自带顶栏 + Hero 全屏外壳。
 * - 系统内平级 tab（控制台内，与素材/合约同级）：embedded=true，去掉自带外壳，
 *   套进 AppLayout 的内容区，标题走 PageHeader，与其它 tab 一致不跳页。
 */
export default function Supermarket({ embedded = false }: { embedded?: boolean }) {
  const [products, setProducts] = useState<MarketProduct[]>([])
  const [tiers, setTiers] = useState<BundleTier[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [cat, setCat] = useState<'全部' | string>('全部')
  const [done, setDone] = useState<{ bundleId: string; finalPrice: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [genErr, setGenErr] = useState('')
  const [paid, setPaid] = useState(false)
  const [paying, setPaying] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quoteSeq = useRef(0)

  useEffect(() => {
    // 演示/真实两种模式都能逛：marketApi 在演示模式回落到本地合成货架 + 同口径算价
    Promise.all([marketApi.products(), marketApi.rules().catch(() => [])])
      .then(([ps, ts]) => {
        setProducts(ps); setTiers(ts)
        // 落地页深链 #/market?pre=id1,id2 → 预选这些商品（仅取存在的有效 id）
        const pre = new URLSearchParams((location.hash.split('?')[1] ?? '')).get('pre')
        if (pre) {
          const valid = pre.split(',').filter((id) => ps.some((p) => p.id === id))
          if (valid.length) setSelected(valid)
        }
      })
      .catch(() => setLoadErr(true))
      .finally(() => setLoading(false))
  }, [])

  // 选择变化 → debounce 调服务端算价（价格服务端权威）。序号守卫防竞态（A1）。
  useEffect(() => {
    if (selected.length === 0) { setQuote(null); return }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      const seq = ++quoteSeq.current
      marketApi.quote(selected).then((q) => { if (seq === quoteSeq.current) setQuote(q) }).catch(() => {})
    }, 220)
  }, [selected])

  const cats = useMemo(() => ['全部', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))], [products])
  const visible = products.filter((p) => cat === '全部' || p.category === cat)
  const selectedGroups = new Set(products.filter((p) => selected.includes(p.id) && p.exclusiveGroup).map((p) => p.exclusiveGroup))
  const chosen = selected.map((id) => products.find((x) => x.id === id)).filter(Boolean) as MarketProduct[]

  // 升级优惠引导：找出比当前件数更高的下一档阶梯
  const nextTier = useMemo(() => {
    const n = selected.length
    return [...tiers].sort((a, b) => a.minItems - b.minItems).find((t) => t.minItems > n) ?? null
  }, [tiers, selected.length])

  const animatedFinal = useCountUp(quote?.ok ? quote.finalPrice : 0)
  const saved = quote?.ok ? quote.listPrice - quote.finalPrice : 0

  const toggle = (p: MarketProduct) => { setDone(null); setPaid(false); setSelected((s) => s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]) }
  const generate = async () => {
    setBusy(true); setGenErr(''); setPaid(false)
    try {
      const r = await marketApi.createBundle(selected)
      if (r.ok && r.bundleId) setDone({ bundleId: r.bundleId, finalPrice: r.finalPrice })
      else setGenErr(r.detail ?? '生成失败，请调整后重试')
    } catch { setGenErr('网络异常，请稍后重试') } finally { setBusy(false) }
  }
  // 模拟支付：调 pay 端点（quoted→paid，不传金额）
  const pay = async (channel: string) => {
    if (!done) return
    setPaying(true); setGenErr('')
    try {
      const r = await marketApi.pay(done.bundleId, channel)
      if (r.ok && r.paid) setPaid(true)
      else setGenErr(r.detail ?? '支付失败，请重试')
    } catch { setGenErr('支付网络异常，请重试') } finally { setPaying(false) }
  }

  // 货架与算价侧栏的全部状态/动作打成一包，两种上下文复用同一 ShelfBody。
  const shelfProps: ShelfProps = {
    products, visible, cats, cat, setCat, tiers, loading, selected, selectedGroups,
    chosen, nextTier, quote, animatedFinal, saved, done, busy, genErr, toggle, generate,
    paid, paying, pay,
    reset: () => { setSelected([]); setDone(null); setQuote(null); setPaid(false) },
  }

  // ── 系统内平级 tab（embedded）：去掉独立外壳，套进 AppLayout 内容区 ──
  if (embedded) {
    return (
      <>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="t-h1">订阅超市</h1>
            <p className="mt-1 text-[13px] text-ink-3">品牌上架商品的组合货架。用户自由多选搭配，服务端实时权威算价（满件折扣 + 互斥校验）生成套餐。</p>
          </div>
          <a href="#/market" target="_blank" rel="noreferrer" className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-muted">
            <ExternalLink size={13} /> 预览公开页
          </a>
        </div>
        {loadErr
          ? <div className="rounded-2xl border border-dashed border-line bg-surface-muted p-10 text-center text-[13px] text-ink-3">货架加载失败：{isRealApi ? '请确认后端服务已启动后刷新重试。' : '请刷新重试。'}</div>
          : <><ShelfBody {...shelfProps} /><BundlesPanel /></>}
      </>
    )
  }

  // ── 独立公开页（/market）：自带顶栏 + Hero 全屏外壳 ──
  return (
    <div className="min-h-screen bg-canvas">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 flex h-[58px] items-center gap-2.5 border-b border-line bg-canvas/85 px-5 backdrop-blur-md sm:px-8">
        <img src="./youdao-logo.png" alt="网易有道" className="logo-mark h-[22px] w-auto" />
        <span className="h-[18px] w-px shrink-0 bg-line" />
        <div className="flex items-center gap-2"><ShoppingBag size={16} className="text-brand" /><span className="text-[13px] font-semibold text-ink">订阅超市</span></div>
        <span className="ml-1 hidden rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand-ink sm:inline">自由搭配 · 组合更省</span>
        <div className="ml-auto flex items-center gap-1.5 text-[11.5px] text-ink-4"><ShieldCheck size={13} className="text-good-ink" /> 平台担保结算</div>
      </header>

      {/* Hero —— 双列：左主张 + 右浮动示例套餐卡 */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/[0.08] blur-3xl" />
        <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 rounded-full bg-brand/[0.05] blur-3xl" />
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
          <div className="animate-in">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/[0.05] px-2.5 py-1 text-[11.5px] font-medium text-brand-ink"><Sparkles size={12} /> 多品牌订阅 · 一站搭配</div>
            <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[44px] lg:text-[50px]">把喜欢的订阅<br /><span className="text-brand">装进一个套餐</span></h1>
            <p className="mt-4 max-w-[48ch] text-[14.5px] leading-relaxed text-ink-3">浏览品牌官方上架的订阅商品，勾选你想要的，自由组合成专属套餐。选得越多越优惠，价格由平台实时计算，组合即省。</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-3">
              <span className="inline-flex items-center gap-1.5"><Tag size={13} className="text-brand" /> 满件折扣自动叠加</span>
              <span className="inline-flex items-center gap-1.5"><Zap size={13} className="text-brand" /> 实时算价 0 等待</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-brand" /> 价格平台权威</span>
            </div>
          </div>
          {/* 右：浮动示例套餐卡（取前 3 个商品组成示意，纯展示） */}
          <HeroSampleCard products={products} />
        </div>
      </section>

      {/* 社会证明带 */}
      <section className="border-b border-line bg-surface-muted/40">
        <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 sm:px-8 md:grid-cols-4">
          {[
            { icon: <ShieldCheck size={15} />, t: '平台担保结算', s: '资金清结算合规' },
            { icon: <Zap size={15} />, t: '实时权威算价', s: '价格不可篡改' },
            { icon: <ShoppingBag size={15} />, t: `${products.length || 'N'}+ 商品在架`, s: '品牌官方上架' },
            { icon: <Tag size={15} />, t: '组合自动省', s: '满件折扣叠加' },
          ].map((x, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">{x.icon}</span>
              <div><div className="text-[12.5px] font-medium text-ink">{x.t}</div><div className="text-[11px] text-ink-4">{x.s}</div></div>
            </div>
          ))}
        </div>
      </section>

      <main className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
        {loadErr
          ? <div className="rounded-2xl border border-dashed border-line bg-surface-muted p-10 text-center text-[13px] text-ink-3">货架加载失败：{isRealApi ? '请确认后端服务已启动后刷新重试。' : '请刷新重试。'}</div>
          : <ShelfBody {...shelfProps} />}
      </main>
    </div>
  )
}

/* Hero 右侧浮动示例套餐卡：取前 3 个商品组成示意（不可交互，仅营造高级感） */
function HeroSampleCard({ products }: { products: MarketProduct[] }) {
  const sample = products.slice(0, 3)
  if (sample.length === 0) return <div className="hidden lg:block" />
  const list = sample.reduce((s, p) => s + p.firstPrice, 0)
  const final = +(list * 0.85).toFixed(2)
  return (
    <div className="animate-in mx-auto w-full max-w-[360px] lg:ml-auto">
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-pop)]">
        <div className="mb-3 flex items-center gap-2"><Sparkles size={14} className="text-brand" /><span className="text-[12.5px] font-semibold text-ink">示例套餐</span><span className="ml-auto tnum rounded-full bg-good-soft/60 px-2 py-0.5 text-[10.5px] font-medium text-good-ink">省 {Math.round((1 - final / list) * 100)}%</span></div>
        <div className="space-y-2.5">
          {sample.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5">
              <BrandMark brand={p.brandKey ?? p.brandName} mark={p.name.slice(0, 1)} size={30} />
              <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-medium text-ink">{p.name}</div><div className="text-[10.5px] text-ink-4">{p.brandName}</div></div>
              <span className="tnum shrink-0 text-[12px] text-ink-3">{money(p.firstPrice)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
          <div><div className="text-[11px] text-ink-4 line-through tnum">{money(list)}</div><div className="text-[11.5px] font-medium text-ink">套餐价</div></div>
          <span className="tnum text-[24px] font-semibold leading-none text-brand">{money(final)}</span>
        </div>
      </div>
      <p className="mt-2.5 text-center text-[11px] text-ink-4">↓ 下方自由搭配你的专属套餐</p>
    </div>
  )
}

/* ── 货架 + 算价侧栏（独立页 / 内嵌 tab 复用） ───────────── */

interface ShelfProps {
  products: MarketProduct[]
  visible: MarketProduct[]
  cats: string[]
  cat: string
  setCat: (c: string) => void
  tiers: BundleTier[]
  loading: boolean
  selected: string[]
  selectedGroups: Set<string>
  chosen: MarketProduct[]
  nextTier: BundleTier | null
  quote: Quote | null
  animatedFinal: number
  saved: number
  done: { bundleId: string; finalPrice: number } | null
  busy: boolean
  genErr: string
  paid: boolean
  paying: boolean
  pay: (channel: string) => void
  toggle: (p: MarketProduct) => void
  generate: () => void
  reset: () => void
}

function ShelfBody(s: ShelfProps) {
  // 商品详情气泡：点「详情」在按钮旁锚定弹出（不触发选中）
  const detail = useAnchoredPopover()
  const [detailP, setDetailP] = useState<MarketProduct | null>(null)
  let detailTags: string[] = []; if (detailP) { try { detailTags = JSON.parse(detailP.tags) } catch { /* */ } }
  return (
    <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1fr_340px]">
      {/* 左：货架 */}
      <div>
        {/* 类目 + 阶梯优惠条 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {s.cats.map((c) => (
              <button key={c} onClick={() => s.setCat(c)} className={cx('rounded-full border px-3 py-1 text-[12px] transition-all', s.cat === c ? 'border-brand bg-brand/[0.06] font-medium text-brand' : 'border-line text-ink-3 hover:border-line-strong hover:bg-surface-muted')}>{c}</button>
            ))}
          </div>
          {s.tiers.length > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-good-soft/60 px-2.5 py-1 text-[11.5px] font-medium text-good-ink">
              <Tag size={12} /> {[...s.tiers].sort((a, b) => a.minItems - b.minItems).map((t) => `满${t.minItems}件${(100 - t.discountPct) / 10}折`).join(' · ')}
            </div>
          )}
        </div>

        {/* 商品网格 */}
        {s.loading ? (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-[148px] rounded-2xl" />)}
          </div>
        ) : (
          <div key={s.cat} className="stagger grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {s.visible.map((p) => {
              const on = s.selected.includes(p.id)
              const blocked = !on && p.exclusiveGroup !== '' && s.selectedGroups.has(p.exclusiveGroup)
              let tags: string[] = []; try { tags = JSON.parse(p.tags) } catch { /* */ }
              return (
                <div key={p.id} role="button" tabIndex={blocked ? -1 : 0} aria-pressed={on} aria-disabled={blocked}
                  onClick={() => !blocked && s.toggle(p)}
                  onKeyDown={(e) => { if (!blocked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); s.toggle(p) } }}
                  className={cx('group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200',
                    on ? 'border-brand bg-brand/[0.035] shadow-[inset_0_0_0_1.5px_var(--color-brand),0_4px_16px_-6px_rgba(245,51,59,.25)] cursor-pointer'
                      : blocked ? 'cursor-not-allowed border-line bg-surface-muted opacity-55'
                        : 'cursor-pointer border-line bg-surface hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[var(--shadow-pop)]')}>
                  {on && <span className="animate-pop absolute right-3.5 top-3.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-brand text-white shadow-sm"><Check size={14} strokeWidth={3} /></span>}
                  {!on && !blocked && <span className="absolute right-3.5 top-3.5 grid h-[22px] w-[22px] place-items-center rounded-full border border-line text-ink-4 opacity-0 transition-opacity group-hover:opacity-100"><Plus size={13} /></span>}
                  <div className="flex items-start gap-3">
                    <ProductLogo p={p} size={44} />
                    <div className="min-w-0 flex-1 pr-6">
                      <div className="truncate text-[14.5px] font-semibold text-ink">{p.name}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-4">{p.brandName || p.category}</div>
                    </div>
                  </div>
                  <div className="mt-2.5 line-clamp-1 text-[12px] text-ink-3">{p.description}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-ink-4">{CYCLE[p.billingCycle] ?? p.billingCycle}</span>
                    {tags.slice(0, 2).map((t) => <span key={t} className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-ink-4">{t}</span>)}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="tnum text-[19px] font-semibold text-brand">{money(p.firstPrice)}</span>
                      <span className="text-[11px] text-ink-4">首单</span>
                      <span className="text-[11px] text-ink-4">· 续费 {money(p.renewPrice)}</span>
                    </div>
                    {/* 详情按钮：stopPropagation 不触发选中 */}
                    <button onClick={(e) => { e.stopPropagation(); setDetailP(p); detail.openAt(e) }}
                      className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11.5px] font-medium text-ink-3 transition-colors hover:border-brand/40 hover:text-brand">详情</button>
                  </div>
                  {blocked && <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-warn-soft/60 px-1.5 py-0.5 text-[10.5px] font-medium text-warn-ink">已选同类，二选一</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 右：sticky 算价侧栏 */}
      <div className="lg:sticky lg:top-[76px] lg:self-start">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 border-b border-line bg-surface-muted/60 px-5 py-3.5">
            <Sparkles size={15} className="text-brand" />
            <span className="text-[13.5px] font-semibold text-ink">我的订阅套餐</span>
            {s.chosen.length > 0 && <span className="ml-auto tnum rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-ink">{s.chosen.length} 件</span>}
          </div>

          <div className="p-5">
            {s.chosen.length === 0 ? (
              <div className="py-6 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-muted text-ink-4"><ShoppingBag size={20} /></div>
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink-4">勾选左侧商品开始组合<br />选 2 件以上即享组合优惠</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {s.chosen.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5">
                      <ProductLogo p={p} size={26} />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{p.name}</span>
                      <span className="tnum shrink-0 text-[12.5px] text-ink-3">{money(p.firstPrice)}</span>
                      <button onClick={() => s.toggle(p)} className="shrink-0 text-ink-4 transition-colors hover:text-alert-ink" aria-label="移除"><span className="text-[15px] leading-none">×</span></button>
                    </div>
                  ))}
                </div>

                {s.nextTier && (!s.quote || s.quote.ok) && (
                  <div className="animate-row mt-3 flex items-center gap-2 rounded-lg border border-brand/20 bg-brand/[0.04] px-2.5 py-2 text-[11.5px] text-brand-ink">
                    <Tag size={13} className="shrink-0" />
                    <span>再选 <b className="tnum">{s.nextTier.minItems - s.selected.length}</b> 件，立享 <b>{(100 - s.nextTier.discountPct) / 10} 折</b></span>
                  </div>
                )}

                <div className="mt-3 border-t border-line pt-3">
                  {s.quote?.conflicts && s.quote.conflicts.length > 0 ? (
                    <div className="rounded-lg bg-alert-soft/50 px-2.5 py-2 text-[12px] text-alert-ink">存在互斥商品，请调整选择后再生成套餐</div>
                  ) : s.quote?.ok ? (
                    <>
                      <div className="flex items-center justify-between text-[12.5px] text-ink-3"><span>原价合计</span><span className={cx('tnum', s.quote.discountPct > 0 && 'text-ink-4 line-through')}>{money(s.quote.listPrice)}</span></div>
                      {s.quote.discountPct > 0 && (
                        <div className="animate-row mt-1.5 flex items-center justify-between text-[12.5px] text-good-ink">
                          <span className="inline-flex items-center gap-1"><Tag size={11} /> 组合优惠 {s.quote.discountPct}% off</span>
                          <span className="tnum font-medium">− {money(s.saved)}</span>
                        </div>
                      )}
                      <div className="mt-3 flex items-end justify-between">
                        <span className="text-[12.5px] font-medium text-ink">套餐首单价</span>
                        <span className="tnum text-[26px] font-semibold leading-none text-brand">{money(s.animatedFinal)}</span>
                      </div>
                      {s.saved > 0 && <div className="mt-1.5 text-right text-[11px] text-good-ink">已为你省下 {money(s.saved)}</div>}
                    </>
                  ) : <div className="py-1 text-[12px] text-ink-4">计算中…</div>}
                </div>

                {!s.done ? (
                  <button onClick={s.generate} disabled={s.busy || !s.quote?.ok}
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-3 text-[13.5px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(245,51,59,.45)] transition-all hover:bg-brand-hover active:scale-[0.99] disabled:opacity-50 disabled:shadow-none">
                    {s.busy ? '生成中…' : <>生成我的订阅套餐 <ArrowRight size={15} /></>}
                  </button>
                ) : s.paid ? (
                  /* 支付成功态 —— 闭环终点 */
                  <div className="animate-pop mt-4 rounded-xl border border-good/40 bg-good-soft/50 p-4 text-center">
                    <CheckCircle2 size={28} className="mx-auto text-good-ink" />
                    <div className="mt-2 text-[14px] font-semibold text-ink">支付成功</div>
                    <div className="mt-0.5 text-[11.5px] text-ink-4">订阅套餐 {s.done.bundleId} 已开通</div>
                    <div className="mt-2 tnum text-[15px] font-semibold text-good-ink">已付 {money(s.done.finalPrice)}</div>
                    <div className="mt-2 rounded-lg bg-surface/70 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-3">凭套餐号将由平台为你拆单开通各项订阅，可在「我的订阅」查看进度。</div>
                    <button onClick={s.reset} className="mt-3 text-[12px] font-medium text-brand hover:underline">再搭一个 →</button>
                  </div>
                ) : (
                  /* 套餐已生成 → 选支付方式 → 去支付 */
                  <div className="animate-pop mt-4 rounded-xl border border-good/30 bg-good-soft/40 p-4">
                    <div className="text-center">
                      <CheckCircle2 size={24} className="mx-auto text-good-ink" />
                      <div className="mt-1.5 text-[13px] font-semibold text-ink">套餐已生成 · 待支付</div>
                      <div className="mt-0.5 text-[11px] text-ink-4">{s.done.bundleId}</div>
                      <div className="mt-1.5 tnum text-[22px] font-semibold leading-none text-brand">{money(s.done.finalPrice)}</div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button disabled={s.paying} onClick={() => s.pay('alipay')}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-[12.5px] font-semibold text-ink transition-all hover:border-[#1677ff]/50 hover:bg-[#1677ff]/5 active:scale-[0.98] disabled:opacity-50">
                        <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-[#1677ff] text-[9px] font-bold text-white">支</span>支付宝
                      </button>
                      <button disabled={s.paying} onClick={() => s.pay('wechat')}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-[12.5px] font-semibold text-ink transition-all hover:border-[#07c160]/50 hover:bg-[#07c160]/5 active:scale-[0.98] disabled:opacity-50">
                        <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-[#07c160] text-[9px] font-bold text-white">微</span>微信
                      </button>
                    </div>
                    <button disabled={s.paying} onClick={() => s.pay('alipay')}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(245,51,59,.45)] transition-all hover:bg-brand-hover active:scale-[0.99] disabled:opacity-60">
                      {s.paying ? '支付处理中…' : <><Wallet size={14} /> 去支付 {money(s.done.finalPrice)}</>}
                    </button>
                    <div className="mt-2 text-center text-[10.5px] text-ink-4">演示模式 · 模拟支付不会真实扣款</div>
                    <button onClick={s.reset} className="mt-1.5 block w-full text-center text-[12px] font-medium text-brand hover:underline">重新搭配 →</button>
                  </div>
                )}
                {s.genErr && <div className="mt-2 rounded-lg bg-alert-soft/50 px-2.5 py-1.5 text-[12px] text-alert-ink">{s.genErr}</div>}
              </>
            )}
          </div>
        </div>
        <p className="mt-3 px-1 text-[11px] leading-relaxed text-ink-4">价格由平台实时计算，组合优惠以最终套餐价为准。生成套餐后可凭套餐号下单。</p>
      </div>

      {/* 商品详情气泡：完整介绍 + 计费/续费/标签 */}
      {detail.open && detailP && (
        <DetailPopover anchor={detail.anchorRect} onClose={detail.close}
          title={<span className="flex items-center gap-2"><ProductLogo p={detailP} size={28} />{detailP.name}</span>}
          desc={detailP.brandName || detailP.category}>
          <div className="space-y-3">
            <p className="text-[12.5px] leading-relaxed text-ink-2">{detailP.description || '暂无详细介绍。'}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-surface-muted px-3 py-2">
                <div className="text-[10.5px] text-ink-4">首单价</div>
                <div className="tnum mt-0.5 text-[15px] font-semibold text-brand">{money(detailP.firstPrice)}</div>
              </div>
              <div className="rounded-lg bg-surface-muted px-3 py-2">
                <div className="text-[10.5px] text-ink-4">续费价</div>
                <div className="tnum mt-0.5 text-[15px] font-semibold text-ink">{money(detailP.renewPrice)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-ink-4">计费周期</span>
              <span className="font-medium text-ink-2">{CYCLE[detailP.billingCycle] ?? detailP.billingCycle}</span>
            </div>
            {detailTags.length > 0 && (
              <div className="flex flex-wrap gap-1 border-t border-line/70 pt-2.5">
                {detailTags.map((t) => <span key={t} className="rounded-md bg-brand-soft/50 px-2 py-0.5 text-[10.5px] text-brand-ink">{t}</span>)}
              </div>
            )}
          </div>
        </DetailPopover>
      )}
    </div>
  )
}

/* ── 套餐台账（运营侧，仅内嵌 tab 渲染）：用户生成的套餐 → 受理拆单履约 ───── */

interface BundleItem { productId: string; name: string; brandId: string; brandName: string; firstPrice: number }
interface BundleRow {
  id: string; userRef: string; status: string; paymentStatus?: string; payChannel?: string; listPrice: number; discountPct: number
  finalPrice: number; ruleId: string; createdAt: string; items: BundleItem[]; brandCount: number
}
interface AgentLite { id: string; name: string }

const BUNDLE_STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'neutral' }> = {
  quoted: { label: '已报价', tone: 'warn' },
  ordered: { label: '已受理', tone: 'good' },
  draft: { label: '草稿', tone: 'neutral' },
}
const PAY_LABEL: Record<string, string> = { alipay: '支付宝', wechat: '微信' }
// 台账筛选维度（默认「待受理」优先）
type LedgerFilter = 'pending' | 'paid' | 'ordered' | 'all'
const LEDGER_FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: 'pending', label: '待受理' },
  { value: 'paid', label: '已支付' },
  { value: 'ordered', label: '已受理' },
  { value: 'all', label: '全部' },
]

// 套餐受理台账：用户在超市生成的套餐 → 运营受理拆单履约。
// 导出供「订阅商品」控制台页作为「套餐受理」Tab 复用（与超市 embedded 视图同源）。
export function BundlesPanel() {
  const toast = useToast()
  // 演示态 fallback：种子合成的套餐台账（1 已支付待受理 / 1 未支付），让受理台账在演示模式可看
  const bundlesApi = useApi(() => bizApi.bundles<BundleRow[]>(), [], isRealApi ? null : (demoBundles() as BundleRow[]))
  const agentsApi = useApi(() => bizApi.agents<AgentLite[]>(), [], isRealApi ? null : (demoAgentsLite() as AgentLite[]))
  const [acceptId, setAcceptId] = useState<string | null>(null)
  const [agentId, setAgentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<LedgerFilter>('pending')

  const bundles = bundlesApi.data ?? []
  const agents = agentsApi.data ?? []
  const active = bundles.find((b) => b.id === acceptId) ?? null
  const quotedCount = bundles.filter((b) => b.status === 'quoted').length
  // 待受理 = 已报价（含已支付/未支付都可受理）；已支付 = paymentStatus==paid；已受理 = ordered
  const counts = {
    pending: bundles.filter((b) => b.status === 'quoted').length,
    paid: bundles.filter((b) => b.paymentStatus === 'paid').length,
    ordered: bundles.filter((b) => b.status === 'ordered').length,
    all: bundles.length,
  }
  const view = bundles.filter((b) =>
    filter === 'all' ? true : filter === 'pending' ? b.status === 'quoted' : filter === 'paid' ? b.paymentStatus === 'paid' : b.status === 'ordered')

  const accept = async () => {
    if (!active) return
    if (!agentId) { toast({ tone: 'info', text: '请选择归因代理' }); return }
    setBusy(true)
    try {
      const r = await bizApi.fulfillBundle(active.id, { agentId })
      if (r.ok) {
        toast({ tone: 'good', text: `套餐已受理 · 拆 ${r.orderIds?.length ?? 0} 笔订单 ¥${r.totalAllocated ?? active.finalPrice}` })
        setAcceptId(null); setAgentId(''); bundlesApi.reload()
      } else toast({ tone: 'alert', text: r.detail ?? '受理失败' })
    } catch { toast({ tone: 'alert', text: '网络异常，请重试' }) } finally { setBusy(false) }
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line p-5 pb-3.5">
        <div className="flex items-center justify-between">
          <CardTitle title="套餐台账" desc="用户在超市生成的套餐。已支付套餐运营受理后按商品拆单，经履约引擎落订单 → 合约 → 结算。" />
          <div className="flex items-center gap-2">
            {quotedCount > 0 && <Badge tone="warn">{quotedCount} 待受理</Badge>}
            <button onClick={() => bundlesApi.reload()} className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-3 transition-colors hover:bg-surface-sunken hover:text-ink">刷新</button>
          </div>
        </div>
        {/* 状态筛选 chips（带计数，待受理优先）*/}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {LEDGER_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={cx('rounded-full border px-3 py-1 text-[12px] transition-all', filter === f.value ? 'border-brand bg-brand/[0.06] font-medium text-brand' : 'border-line text-ink-3 hover:border-line-strong hover:bg-surface-muted')}>
              {f.label}<span className="tnum ml-1 text-ink-4">{counts[f.value]}</span>
            </button>
          ))}
        </div>
      </div>
      {view.length === 0 ? (
        <div className="p-8 text-center text-[12.5px] text-ink-4">{bundlesApi.loading ? '加载中…' : bundles.length === 0 ? '暂无套餐。用户在订阅超市生成套餐后将出现在这里。' : '该筛选下暂无套餐。'}</div>
      ) : (
        <TableShell className="px-2 pb-2" head={<><Th className="pl-3">套餐号 / 商品</Th><Th right>件数</Th><Th right>套餐价</Th><Th right>支付</Th><Th right>状态</Th><Th right>操作</Th></>}>
          {view.map((b) => {
            const st = BUNDLE_STATUS[b.status] ?? BUNDLE_STATUS.draft
            const paid = b.paymentStatus === 'paid'
            const shown = b.items.slice(0, 2)
            const more = b.items.length - shown.length
            return (
              <Row key={b.id}>
                <Td className="pl-3">
                  <div className="text-[12.5px] font-medium text-ink tnum">{b.id}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {shown.map((it) => (
                      <span key={it.productId} className="inline-flex max-w-[140px] items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-ink-3">
                        {(resolveBrandLogo(it.brandId) || resolveBrandLogo(it.brandName)) && <BrandDot brand={it.brandId} />}
                        <span className="truncate">{it.name}</span>
                      </span>
                    ))}
                    {more > 0 && <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-ink-4">+{more}</span>}
                  </div>
                </Td>
                <Td right mono>{b.items.length}{b.brandCount > 1 && <span className="ml-1 text-[10px] text-ink-4">· {b.brandCount}牌</span>}</Td>
                <Td right mono>
                  <span className="font-semibold text-brand">{money(b.finalPrice)}</span>
                  {b.discountPct > 0 && <span className="ml-1 text-[10px] text-good-ink">{b.discountPct}%off</span>}
                </Td>
                <Td right>{paid ? <Badge tone="good" dot>已付{b.payChannel ? `·${PAY_LABEL[b.payChannel] ?? ''}` : ''}</Badge> : <span className="text-[11.5px] text-ink-4">未支付</span>}</Td>
                <Td right><Badge tone={st.tone}>{st.label}</Badge></Td>
                <Td right>
                  {b.status === 'quoted'
                    ? (paid
                      ? <button onClick={() => { setAcceptId(b.id); setAgentId('') }} className="rounded-md px-2 py-1 text-[12px] font-medium text-brand hover:bg-brand-soft">受理 → 生成订单</button>
                      : <span className="text-[12px] text-ink-4" title="套餐未支付，不可受理">待支付</span>)
                    : <span className="text-[12px] text-ink-4">—</span>}
                </Td>
              </Row>
            )
          })}
        </TableShell>
      )}

      <Modal open={!!acceptId} onClose={() => setAcceptId(null)} width={460} title="受理套餐 → 生成订单"
        footer={<><Button variant="ghost" onClick={() => setAcceptId(null)}>取消</Button><Button variant="primary" onClick={accept} disabled={busy}>{busy ? '受理中…' : '确认受理'}</Button></>}>
        {active && (
          <>
            <div className="rounded-lg border border-line bg-surface-muted p-3 text-[12px]">
              <div className="flex items-center justify-between"><span className="text-ink-3">套餐号</span><span className="tnum font-medium text-ink">{active.id}</span></div>
              <div className="mt-1.5 flex items-center justify-between"><span className="text-ink-3">套餐价（权威）</span><span className="tnum font-semibold text-brand">{money(active.finalPrice)}</span></div>
              <div className="mt-1.5 text-[11px] leading-relaxed text-ink-4">受理后按各商品首单价比例拆 {active.items.length} 笔订单（金额合计 = 套餐价），跨 {active.brandCount} 个品牌分别经履约引擎入账。价格服务端权威，不可改。</div>
            </div>
            <div className="mt-3">
              <Field label="归因代理" hint="拆出的订单都归因到该代理，命中其在投合约则累加履约 GMV">
                <Select value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={!!agentsApi.error}>
                  <option value="">选择代理…</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}（{a.id}）</option>)}
                </Select>
              </Field>
              {agentsApi.error && <div className="mt-1.5 rounded-md bg-warn-soft/60 px-2.5 py-1.5 text-[11.5px] text-warn-ink">无法加载代理列表（需要代理读取权限）。请用具备权限的账号受理。</div>}
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

/* 套餐项里的小品牌点（mini logo） */
function BrandDot({ brand }: { brand: string }) {
  const logo = resolveBrandLogo(brand)
  if (!logo) return null
  return <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: logo.color }} />
}

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, ShieldCheck, Sparkles, Wallet, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { marketApi, type MarketProduct, type Quote } from '../../lib/marketApi'
import { getLandingPage, recordLandingOrder, recordLandingView, brandColorOf, brandName, isContinuous, type LandingPage as LP } from '../../lib/landing'
import { money } from '../../lib/format'
import { isRealApi } from '../../lib/http'
import { BrandMark } from '../../components/ui/primitives'

/**
 * 落地页公开渲染页 —— 移动优先、单 CTA、直达支付。
 * 三种上下文同一渲染器：官方页(agentId=null) / 代理归因页 / 广告位(?embed=1 去壳)。
 * 价格服务端权威（/market/quote）；连续包月强制渲染合规模块（扣费告知 + 退订入口）。
 * 归因：下单绑 refPageId → 台账累加 → 运营受理时归因预填。
 */
export default function LandingPage() {
  const { id = '' } = useParams()
  const page = getLandingPage(id)
  const embed = new URLSearchParams(location.hash.split('?')[1] ?? '').get('embed') === '1'

  const [products, setProducts] = useState<MarketProduct[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<'browse' | 'paying' | 'done'>('browse')
  const [err, setErr] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    // :id 变化先整体复位（避免 /land/A 支付完成态残留到 /land/B）；seq 防 A 的慢响应落到 B
    const s = ++seq.current
    setPhase('browse'); setProducts([]); setQuote(null); setErr(''); setLoading(true)
    if (!page) { setLoading(false); return }
    recordLandingView(page.id)
    marketApi.products()
      .then((all) => {
        const mine = page.productIds.map((pid) => all.find((p) => p.id === pid)).filter(Boolean) as MarketProduct[]
        if (s !== seq.current) return null
        setProducts(mine)
        // 有商品被下架/删除 → 报错而非静默按子集算价：否则连续包月合规提示会因商品缺失被绕过，
        // 用户却仍按原价被扣（合规红线）。
        if (mine.length !== page.productIds.length) { setErr('套餐内有商品已下架，暂不可购买'); return null }
        return marketApi.quote(page.productIds)
      })
      .then((q) => { if (q && s === seq.current) setQuote(q) })
      .catch(() => { if (s === seq.current) setErr('商品加载失败，请刷新重试') })
      .finally(() => { if (s === seq.current) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const theme = page?.theme ?? '#f5333b'
  const hasContinuous = products.some((p) => isContinuous(p.billingCycle))
  const savedPct = quote?.ok && quote.listPrice > 0 ? Math.round((1 - quote.finalPrice / quote.listPrice) * 100) : 0
  // 套餐可跨品牌（页面 brandId 只是第一个商品的品牌），页眉按实际品牌数渲染
  const pageBrands = [...new Set(products.map((p) => p.brandKey))]

  const pay = async () => {
    if (!page || !quote?.ok) return
    if (!getLandingPage(page.id)) { setErr('该落地页已下线'); return } // 页面可能已被创建者删除
    setPhase('paying'); setErr('')
    try {
      const bundle = await marketApi.createBundle(page.productIds)
      if (!bundle.ok || !bundle.bundleId) { setErr(bundle.detail ?? '下单失败'); setPhase('browse'); return }
      const r = await marketApi.pay(bundle.bundleId, 'alipay')
      if (r.ok && r.paid) {
        recordLandingOrder(page.id, quote.finalPrice) // 归因台账累加
        setPhase('done')
      } else { setErr(r.detail ?? '支付失败'); setPhase('browse') }
    } catch { setErr('网络异常，请重试'); setPhase('browse') }
  }

  if (!page) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-6 text-center">
        <div>
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-sunken text-ink-4"><AlertCircle size={22} /></div>
          <div className="text-[15px] font-semibold text-ink">落地页不存在或已下线</div>
          <p className="mt-1.5 text-[12.5px] text-ink-4">请向分享者确认最新链接。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas" style={{ ['--lp' as string]: theme }}>
      <div className="mx-auto min-h-screen max-w-[440px] bg-surface shadow-[var(--shadow-pop)]">
        {/* 页眉：品牌认证条（embed 去掉）。多品牌套餐叠加展示品牌标并以平台担保背书，不冒用单一品牌认证 */}
        {!embed && (
          <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
            {pageBrands.length > 1 ? (
              <>
                <div className="flex shrink-0 -space-x-2">
                  {pageBrands.slice(0, 3).map((b) => <span key={b} className="rounded-full ring-2 ring-surface"><BrandMark brand={b} size={30} /></span>)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    多品牌联合套餐
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-good-soft px-1.5 py-0.5 text-[10px] font-medium text-good-ink"><ShieldCheck size={10} /> 平台担保</span>
                  </div>
                  <div className="text-[10.5px] text-ink-4">平台担保结算 · 随时可退</div>
                </div>
              </>
            ) : (
              <>
                <BrandMark brand={page.brandId} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    {brandName(page.brandId)}
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-good-soft px-1.5 py-0.5 text-[10px] font-medium text-good-ink"><ShieldCheck size={10} /> 官方认证</span>
                  </div>
                  <div className="text-[10.5px] text-ink-4">平台担保结算 · 随时可退</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 主视觉 banner（会员卡 + 折扣徽章 3D）：营造转化氛围，底部渐隐到内容区 */}
        <div className="relative overflow-hidden">
          <img src="./img/hero-landing-bundle.webp" alt="" className="h-[180px] w-full object-cover object-top" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />
        </div>

        <div className="px-5 pb-6 pt-3">
          {/* 主张 */}
          <div className="mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `color-mix(in srgb, ${theme} 12%, transparent)`, color: theme }}>
            <Sparkles size={11} /> 组合订阅 · 一站开通
          </div>
          <h1 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">{page.title || '专属订阅套餐'}</h1>
          {page.subtitle && <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">{page.subtitle}</p>}

          {/* 卖点三条 */}
          {page.points.length > 0 && (
            <div className="mt-4 space-y-2">
              {page.points.map((pt, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px] text-ink-2">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-white" style={{ background: theme }}><Check size={11} strokeWidth={3} /></span>
                  {pt}
                </div>
              ))}
            </div>
          )}

          {/* 商品清单 */}
          <div className="mt-5 rounded-2xl border border-line bg-surface-muted/50 p-4">
            {loading ? (
              <div className="space-y-2.5">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
            ) : (
              <div className="space-y-2.5">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5">
                    <BrandMark brand={p.brandKey} mark={p.name.slice(0, 1)} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">{p.name}</div>
                      <div className="text-[10.5px] text-ink-4">首单 {money(p.firstPrice)} · 续费 {money(p.renewPrice)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 报价失效（商品下架/互斥调整）：给出明确出口，不留死胡同 */}
          {quote && !quote.ok && (
            <div className="mt-5 rounded-xl border border-alert/25 bg-alert-soft/40 p-4 text-center">
              <div className="text-[13px] font-medium text-alert-ink">{quote.detail || '套餐商品已调整，暂不可购买'}</div>
              <a href="#/market" className="mt-2 inline-block text-[12.5px] font-medium hover:underline" style={{ color: theme }}>去订阅超市逛逛 →</a>
            </div>
          )}

          {/* 价格 + CTA */}
          {quote?.ok && (
            <div className="mt-5">
              <div className="flex items-end justify-between">
                <div>
                  {savedPct > 0 && <div className="text-[11.5px] text-ink-4 line-through tnum">{money(quote.listPrice)}</div>}
                  <div className="text-[11.5px] font-medium text-ink-3">套餐首单价{savedPct > 0 && <span className="ml-1 rounded bg-good-soft px-1.5 py-0.5 text-[10px] text-good-ink">立省 {savedPct}%</span>}</div>
                </div>
                <span className="tnum text-[30px] font-semibold leading-none" style={{ color: theme }}>{money(quote.finalPrice)}</span>
              </div>

              {phase === 'done' ? (
                <div className="animate-pop mt-4 rounded-2xl border border-good/40 bg-good-soft/50 p-5 text-center">
                  <img src="./img/illust-success.webp" alt="" className="mx-auto -mb-1 h-24 w-24 object-contain" />
                  <div className="mt-1 text-[15px] font-semibold text-ink">订阅开通中</div>
                  <div className="mt-0.5 text-[11.5px] text-ink-4">已付 {money(quote.finalPrice)} · 平台正为你拆单开通各项订阅</div>
                  <a href="#/market/me" className="mt-3 inline-block text-[12.5px] font-medium hover:underline" style={{ color: theme }}>查看开通进度 →</a>
                </div>
              ) : (
                <button
                  onClick={pay}
                  disabled={phase === 'paying' || isRealApi}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-transform active:scale-[0.99] disabled:opacity-60"
                  style={{ background: theme }}
                >
                  {isRealApi ? '在线支付即将开放' : phase === 'paying' ? '支付处理中…' : <><Wallet size={16} /> 立即订阅 {money(quote.finalPrice)}</>}
                </button>
              )}
              {err && <div className="mt-2 rounded-lg bg-alert-soft/50 px-2.5 py-1.5 text-center text-[12px] text-alert-ink">{err}</div>}
            </div>
          )}

          {/* 连续包月强制合规模块（事前防线：扣费告知 + 退订入口，不可配置关闭） */}
          {hasContinuous && (
            <div className="mt-5 rounded-xl border border-line bg-surface-muted/40 p-3.5">
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-2"><Info size={12} /> 自动续费说明</div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-4">
                本套餐含连续包月商品，首月优惠后将按各商品续费价自动扣费，可随时在「我的订阅」一键退订，退订后不再扣费。
              </p>
              <a href="#/market/me" className="mt-1.5 inline-block text-[11px] font-medium" style={{ color: theme }}>管理订阅 / 退订入口 →</a>
            </div>
          )}

          {/* 平台担保底栏 */}
          <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-ink-4">
            <ShieldCheck size={12} className="text-good-ink" /> 平台担保结算 · 资金清结算合规 · 支持随时退订
          </div>
          <div className="mt-2 text-center text-[10px] text-ink-5">{isRealApi ? '在线支付渠道接入中，敬请期待' : '演示模式 · 模拟支付不会真实扣款'}</div>
        </div>
      </div>
    </div>
  )
}

// 供工坊预览复用：一个迷你落地页卡（不含支付逻辑）
export function LandingPreview({ page, products, quote }: { page: Pick<LP, 'title' | 'subtitle' | 'points' | 'theme' | 'brandId'>; products: MarketProduct[]; quote: Quote | null }) {
  const theme = page.theme || brandColorOf(page.brandId)
  const savedPct = quote?.ok && quote.listPrice > 0 ? Math.round((1 - quote.finalPrice / quote.listPrice) * 100) : 0
  return (
    <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <BrandMark brand={page.brandId} size={22} />
        <span className="text-[11.5px] font-semibold text-ink">{brandName(page.brandId)}</span>
        <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-good-soft px-1.5 py-0.5 text-[9px] text-good-ink"><ShieldCheck size={9} /> 认证</span>
      </div>
      <div className="p-4">
        <div className="text-[16px] font-semibold leading-tight text-ink">{page.title || '专属订阅套餐'}</div>
        {page.subtitle && <p className="mt-1 line-clamp-2 text-[11px] text-ink-3">{page.subtitle}</p>}
        <div className="mt-2.5 space-y-1">
          {page.points.filter(Boolean).map((pt, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-ink-2"><span className="grid h-3 w-3 place-items-center rounded-full text-white" style={{ background: theme }}><Check size={8} strokeWidth={3} /></span>{pt}</div>
          ))}
        </div>
        <div className="mt-3 flex items-end justify-between border-t border-line pt-2.5">
          <div className="text-[10px] text-ink-4">{products.length} 项 · 套餐价{savedPct > 0 && <span className="ml-1 text-good-ink">省{savedPct}%</span>}</div>
          <span className="tnum text-[20px] font-semibold" style={{ color: theme }}>{quote?.ok ? money(quote.finalPrice) : '—'}</span>
        </div>
        <button className="mt-3 w-full rounded-xl py-2.5 text-[12.5px] font-semibold text-white" style={{ background: theme }}>立即订阅</button>
      </div>
    </div>
  )
}

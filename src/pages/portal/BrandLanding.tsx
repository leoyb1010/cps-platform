import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Sparkles, Tag, ShoppingBag } from 'lucide-react'
import { PageHeader, Card, CardTitle, BrandMark } from '../../components/ui/primitives'
import { useToast } from '../../components/ui/overlays'
import { EmptyState } from '../../components/ui/forms'
import { usePortalResource, PortalState, DefaultSkeleton } from '../../components/portal/kit'
import { portalApi } from '../../lib/portalApi'
import { marketApi, type Quote } from '../../lib/marketApi'
import { money, cx } from '../../lib/format'

/* 品牌方「套餐落地页」预览 —— 把自己 live + 可组合的商品搭成示例套餐，
 * 价格调 /market/quote 服务端权威算（前端不算），生成可分享的公开页深链 #/market?pre=<ids>。
 * 零持久化、零 schema：纯预览 + 引流。 */

interface BrandProduct {
  id: string; name: string; category: string; status: string; firstPrice: number; renewPrice: number
  billingCycle: string; bundleEligible: boolean; exclusiveGroup: string; tags: string
}

export function BrandLanding() {
  const toast = useToast()
  const { data, state, reload } = usePortalResource<BrandProduct[]>(() => portalApi.brandProducts())
  const [sel, setSel] = useState<string[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const seq = useRef(0)

  const all = data ?? []
  const eligible = all.filter((p) => p.status === 'live' && p.bundleEligible)
  const chosen = sel.map((id) => eligible.find((p) => p.id === id)).filter(Boolean) as BrandProduct[]

  // 选择变化 → 服务端权威算价（≥1 件才算；前端绝不本地算价）
  useEffect(() => {
    if (sel.length === 0) { setQuote(null); return }
    const s = ++seq.current
    marketApi.quote(sel).then((q) => { if (s === seq.current) setQuote(q) }).catch(() => {})
  }, [sel])

  const toggle = (id: string) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])
  const deepLink = useMemo(() => `${location.origin}${location.pathname}#/market?pre=${sel.join(',')}`, [sel])
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(deepLink); toast({ tone: 'good', text: '落地页链接已复制' }) }
    catch { toast({ tone: 'info', text: deepLink }) }
  }

  return (
    <>
      <PageHeader title="套餐落地页" desc="把你的上架商品搭成示例套餐，价格由平台实时计算。生成可分享的落地页链接，用户打开即预选这些商品。" />
      <PortalState state={state} data={data} reload={reload} skeleton={<DefaultSkeleton />} emptyWhen={() => eligible.length === 0}
        emptyTitle="暂无可组合的上架商品（先在「我的商品」上架并过审 live + 可组合）">
        {() => (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
            {/* 左：选商品 */}
            <Card pad={false}>
              <div className="p-5 pb-3"><CardTitle title="选择组合商品" desc="勾选要放进落地页套餐的商品（仅你自己已上架、可组合的商品）" /></div>
              <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2">
                {eligible.map((p) => {
                  const on = sel.includes(p.id)
                  let tags: string[] = []; try { tags = JSON.parse(p.tags) } catch { /* */ }
                  return (
                    <button key={p.id} onClick={() => toggle(p.id)}
                      className={cx('relative rounded-xl border p-4 text-left transition-all',
                        on ? 'border-brand bg-brand/[0.04] shadow-[inset_0_0_0_1.5px_var(--color-brand)]' : 'border-line bg-surface hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[var(--shadow-pop)]')}>
                      {on && <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand text-white"><Check size={13} strokeWidth={3} /></span>}
                      <div className="pr-6 text-[13.5px] font-semibold text-ink">{p.name}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-4">{p.category || '订阅'}</div>
                      <div className="mt-2 flex items-baseline gap-1.5"><span className="tnum text-[17px] font-semibold text-brand">{money(p.firstPrice)}</span><span className="text-[11px] text-ink-4">首单 · 续费 {money(p.renewPrice)}</span></div>
                      {tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{tags.slice(0, 3).map((t) => <span key={t} className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-ink-4">{t}</span>)}</div>}
                    </button>
                  )
                })}
              </div>
            </Card>

            {/* 右：落地页预览 */}
            <div className="lg:sticky lg:top-[76px] lg:self-start">
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-2 border-b border-line bg-surface-muted/60 px-5 py-3.5"><Sparkles size={15} className="text-brand" /><span className="text-[13.5px] font-semibold text-ink">落地页预览</span></div>
                <div className="p-5">
                  {chosen.length === 0 ? (
                    <EmptyState icon={<ShoppingBag size={20} />} title="勾选左侧商品" desc="组合成套餐后这里实时预览权威价格" />
                  ) : (
                    <>
                      <div className="space-y-2">
                        {chosen.map((p) => (
                          <div key={p.id} className="flex items-center gap-2.5">
                            <BrandMark size={24} />
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{p.name}</span>
                            <span className="tnum shrink-0 text-[12.5px] text-ink-3">{money(p.firstPrice)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 border-t border-line pt-3">
                        {quote?.conflicts && quote.conflicts.length > 0 ? (
                          <div className="rounded-lg bg-alert-soft/50 px-2.5 py-2 text-[12px] text-alert-ink">含互斥商品，用户侧无法同时选购，请调整。</div>
                        ) : quote?.ok ? (
                          <>
                            <div className="flex items-center justify-between text-[12.5px] text-ink-3"><span>原价合计</span><span className={cx('tnum', quote.discountPct > 0 && 'text-ink-4 line-through')}>{money(quote.listPrice)}</span></div>
                            {quote.discountPct > 0 && <div className="mt-1.5 flex items-center justify-between text-[12.5px] text-good-ink"><span className="inline-flex items-center gap-1"><Tag size={11} /> 组合优惠 {quote.discountPct}% off</span><span className="tnum font-medium">− {money(quote.listPrice - quote.finalPrice)}</span></div>}
                            <div className="mt-2.5 flex items-end justify-between"><span className="text-[12.5px] font-medium text-ink">套餐首单价</span><span className="tnum text-[24px] font-semibold leading-none text-brand">{money(quote.finalPrice)}</span></div>
                          </>
                        ) : <div className="py-1 text-[12px] text-ink-4">计算中…</div>}
                      </div>
                      <button onClick={copyLink} disabled={!quote?.ok} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50">
                        <Copy size={14} /> 复制落地页链接
                      </button>
                      <a href={`#/market?pre=${sel.join(',')}`} target="_blank" rel="noreferrer" className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-muted">
                        <ExternalLink size={13} /> 在订阅超市预览
                      </a>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-3 px-1 text-[11px] leading-relaxed text-ink-4">价格由平台实时计算，组合优惠以最终套餐价为准。本页仅生成预览与引流链接，不创建订单。</p>
            </div>
          </div>
        )}
      </PortalState>
    </>
  )
}

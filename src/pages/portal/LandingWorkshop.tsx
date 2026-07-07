import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Sparkles, Tag, ShoppingBag, Trash2, ExternalLink, Code2, Palette } from 'lucide-react'
import { PageHeader, Card, CardTitle, BrandMark, Badge } from '../../components/ui/primitives'
import { useToast, Confirm } from '../../components/ui/overlays'
import { EmptyState } from '../../components/ui/forms'
import { usePortalResource, PortalState, DefaultSkeleton } from '../../components/portal/kit'
import { portalApi } from '../../lib/portalApi'
import { marketApi, type Quote, type MarketProduct } from '../../lib/marketApi'
import { money, cx, copyText } from '../../lib/format'
import { LandingPreview } from '../market/LandingPage'
import { createLandingPage, deleteLandingPage, useLandingPages, landingUrl, landingIframeSnippet, brandColorOf, type LandingPage } from '../../lib/landing'

interface BrandProduct {
  id: string; name: string; category: string; status: string; firstPrice: number; renewPrice: number
  billingCycle: string; bundleEligible: boolean; exclusiveGroup: string; tags: string
  brandKey?: string // 代理工坊（市场货架）携带；品牌工坊自有商品不带，回落到 brandId prop
}

/**
 * 落地页/推广页工坊 —— 品牌与代理共用同一底层。
 * 差异由 props 注入：品牌官方页(agentId=null，可改主题色) vs 代理归因页(绑 agentId，价格/合规不可动)。
 * 产出：可分享链接 + iframe 片段 + 台账（曝光/下单/转化金额）。
 */
export function LandingWorkshop({
  scope, // 'brand' | 'agent'
  brandId,
  agentId,
  title,
  desc,
}: {
  scope: 'brand' | 'agent'
  brandId?: string // 品牌工坊必传；代理工坊省略（页面归属品牌由所选商品推导）
  agentId: string | null
  title: string
  desc: string
}) {
  const toast = useToast()
  // 品牌工坊取自己商品；代理工坊取市场上开放推广的商品（演示态：全部 live 可组合商品）
  const fetcher: () => Promise<BrandProduct[]> = scope === 'brand'
    ? () => portalApi.brandProducts<BrandProduct[]>()
    : async () => (await marketApi.products()).map((p) => ({ id: p.id, name: p.name, category: p.category, status: 'live', firstPrice: p.firstPrice, renewPrice: p.renewPrice, billingCycle: p.billingCycle, bundleEligible: p.bundleEligible, exclusiveGroup: p.exclusiveGroup, tags: p.tags, brandKey: p.brandKey }))
  const { data, state, reload } = usePortalResource<BrandProduct[]>(fetcher)

  const [sel, setSel] = useState<string[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [pageTitle, setPageTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [points, setPoints] = useState<string[]>(['', '', ''])
  const [theme, setTheme] = useState<string>(brandColorOf(brandId ?? ''))
  const [channel, setChannel] = useState('')
  const seq = useRef(0)
  const pointsDirty = useRef(false) // 用户手动编辑过卖点（含清空）后不再自动填充
  const [delId, setDelId] = useState<string | null>(null) // 待确认删除的落地页（删除会毁掉页面+台账，需二次确认）

  const all = data ?? []
  const eligible = all.filter((p) => p.status === 'live' && p.bundleEligible)
  const chosen = sel.map((id) => eligible.find((p) => p.id === id)).filter(Boolean) as BrandProduct[]
  // 品牌台账显式要求 agentId 为 null，排除代理归因页（它们也带 brandId）
  const myPages = useLandingPages(scope === 'brand' ? { brandId, agentId: null } : { agentId: agentId ?? '__none__' })
  // 页面归属品牌：跟随所选商品（代理可跨品牌选品），无选品时回落到 brandId prop
  const derivedBrand = chosen[0]?.brandKey ?? brandId ?? ''

  // 默认卖点：未手动编辑时随选品实时重算（取消勾选不残留旧卖点）；一旦手动编辑则完全交还用户
  useEffect(() => {
    if (pointsDirty.current) return
    const auto: string[] = []
    for (const p of chosen) {
      try { const t = JSON.parse(p.tags) as string[]; auto.push(...t) } catch { /* */ }
      if (auto.length >= 3) break
    }
    setPoints([auto[0] ?? '', auto[1] ?? '', auto[2] ?? ''])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel])

  useEffect(() => {
    if (sel.length === 0) { seq.current++; setQuote(null); return } // 递增序号，废弃选品的在途报价不落地
    const s = ++seq.current
    marketApi.quote(sel).then((q) => { if (s === seq.current) setQuote(q) }).catch(() => {})
  }, [sel])

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const conflicts = quote && !quote.ok && quote.conflicts?.length

  // 代理工坊主题色跟随归属品牌（不可自定义）；品牌工坊用用户所选主题
  const effectiveTheme = scope === 'agent' ? brandColorOf(derivedBrand) : theme
  const preview = useMemo(
    () => ({ title: pageTitle, subtitle, points, theme: effectiveTheme, brandId: derivedBrand }),
    [pageTitle, subtitle, points, effectiveTheme, derivedBrand],
  )

  const publish = () => {
    if (!quote?.ok) return
    // 报价须与当前选品一致：改选后报价未返回时不允许用旧价发布
    if ([...sel].sort().join() !== [...(quote.validIds ?? [])].sort().join()) { toast({ tone: 'info', text: '价格计算中，请稍候再试' }); return }
    if (!pageTitle.trim()) { toast({ tone: 'info', text: '给落地页起个标题吧' }); return }
    const page = createLandingPage({
      brandId: derivedBrand, agentId, productIds: sel, title: pageTitle.trim(), subtitle: subtitle.trim(),
      points: points.filter(Boolean), theme: effectiveTheme, channel: channel.trim(),
    })
    toast({ tone: 'good', text: `落地页已生成 · ${page.id}` })
    setSel([]); setPageTitle(''); setSubtitle(''); setPoints(['', '', '']); setChannel('')
    pointsDirty.current = false
  }

  return (
    <>
      <PageHeader title={title} desc={desc} />
      <PortalState state={state} data={data} reload={reload} skeleton={<DefaultSkeleton />} emptyWhen={() => eligible.length === 0}
        emptyTitle={scope === 'brand' ? '暂无可组合的上架商品（先在「我的商品」上架并过审）' : '暂无可推广的开放商品'}>
        {() => (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
            {/* 左：配置 */}
            <div className="space-y-4">
              {/* 选商品 */}
              <Card pad={false}>
                <div className="p-5 pb-3"><CardTitle title="① 选择组合商品" desc={scope === 'brand' ? '勾选要放进落地页的自有商品' : '勾选要推广的商品（下单自动归因到你）'} /></div>
                <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2">
                  {eligible.map((p) => {
                    const on = sel.includes(p.id)
                    return (
                      <button key={p.id} onClick={() => toggle(p.id)}
                        className={cx('relative rounded-xl border p-4 text-left transition-all',
                          on ? 'border-brand bg-brand/[0.04] shadow-[inset_0_0_0_1.5px_var(--color-brand)]' : 'border-line bg-surface hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[var(--shadow-pop)]')}>
                        {on && <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand text-white"><Check size={13} strokeWidth={3} /></span>}
                        <div className="flex items-center gap-2.5">
                          <BrandMark brand={p.brandKey} mark={p.name.slice(0, 1)} size={30} />
                          <div className="min-w-0 pr-6">
                            <div className="truncate text-[13.5px] font-semibold text-ink">{p.name}</div>
                            <div className="mt-0.5 text-[11px] text-ink-4">{p.category || '订阅'}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-1.5"><span className="tnum text-[16px] font-semibold text-brand">{money(p.firstPrice)}</span><span className="text-[11px] text-ink-4">首单 · 续费 {money(p.renewPrice)}</span></div>
                      </button>
                    )
                  })}
                </div>
              </Card>

              {/* 编辑文案 */}
              <Card>
                <CardTitle title="② 编辑落地页" desc={scope === 'agent' ? '价格与合规模块由平台锁定，你可编辑标题与卖点' : '标题、卖点与主题色可定制'} />
                <div className="space-y-3">
                  <Labeled label="标题"><input aria-label="标题" value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} placeholder="如：学习 + 娱乐 一站开通，组合更省" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand" /></Labeled>
                  <Labeled label="副标题（选填）"><input aria-label="副标题" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="一句话说明套餐价值" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand" /></Labeled>
                  <Labeled label="卖点三条">
                    <div className="space-y-2">
                      {points.map((pt, i) => (
                        <input key={i} aria-label={`卖点 ${i + 1}`} value={pt} onChange={(e) => { pointsDirty.current = true; setPoints((ps) => ps.map((x, k) => (k === i ? e.target.value : x))) }} placeholder={`卖点 ${i + 1}`} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] outline-none focus:border-brand" />
                      ))}
                    </div>
                  </Labeled>
                  <div className="grid grid-cols-2 gap-3">
                    {scope === 'brand' && (
                      <Labeled label="主题色">
                        <div className="flex items-center gap-2">
                          <input aria-label="主题色" type="color" value={theme} onChange={(e) => setTheme(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-surface" />
                          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-4"><Palette size={12} /> {theme}</span>
                        </div>
                      </Labeled>
                    )}
                    <Labeled label="渠道标记（选填）"><input aria-label="渠道标记" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="信息流 / 公众号 / 私域" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] outline-none focus:border-brand" /></Labeled>
                  </div>
                </div>
              </Card>

              {/* 已生成台账 */}
              {myPages.length > 0 && (
                <Card pad={false}>
                  <div className="p-5 pb-3"><CardTitle title="我的落地页" desc="曝光 / 下单 / 转化金额（演示态本地累加）" /></div>
                  <div className="divide-y divide-line/70 px-5 pb-4">
                    {myPages.map((pg) => <PageRow key={pg.id} pg={pg} onCopy={(u) => copy(u, toast)} onDelete={() => setDelId(pg.id)} />)}
                  </div>
                </Card>
              )}
            </div>

            {/* 右：实时预览 + 发布 */}
            <div className="lg:sticky lg:top-[76px] lg:self-start">
              <div className="overflow-hidden rounded-2xl border border-line bg-surface-muted/40 p-5">
                <div className="mb-3 flex items-center gap-2"><Sparkles size={15} className="text-brand" /><span className="text-[13px] font-semibold text-ink">实时预览</span></div>
                {chosen.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line bg-surface p-8"><EmptyState icon={<ShoppingBag size={20} />} title="勾选商品开始" desc="左侧选品 + 填标题，这里实时预览" /></div>
                ) : conflicts ? (
                  <div className="rounded-lg bg-alert-soft/50 px-3 py-2.5 text-[12px] text-alert-ink">含互斥商品，用户无法同时选购，请调整选品。</div>
                ) : (
                  <>
                    <LandingPreview page={preview} products={chosen as unknown as MarketProduct[]} quote={quote} />
                    {quote?.ok && quote.discountPct > 0 && (
                      <div className="mt-3 flex items-center justify-center gap-1 text-[11.5px] text-good-ink"><Tag size={11} /> 组合优惠 {quote.discountPct}% off · 省 {money(quote.listPrice - quote.finalPrice)}</div>
                    )}
                    <button onClick={publish} disabled={!quote?.ok} className="mt-4 w-full rounded-xl bg-brand px-4 py-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50">
                      生成落地页
                    </button>
                    <p className="mt-2 text-center text-[11px] text-ink-4">生成后可复制链接 / iframe 投放</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </PortalState>
      <Confirm
        open={!!delId}
        onClose={() => setDelId(null)}
        onConfirm={() => { if (delId) { deleteLandingPage(delId); toast({ tone: 'info', text: '落地页已删除' }) } setDelId(null) }}
        title="删除落地页"
        tone="alert"
        confirmText="删除"
        body="删除后该落地页链接立即失效，曝光/下单台账一并清除，不可恢复。确认删除？"
      />
    </>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 block text-[12px] font-medium text-ink-2">{label}</div>
      {children}
    </div>
  )
}

function copy(text: string, toast: ReturnType<typeof useToast>) {
  copyText(text).then((ok) => toast(ok ? { tone: 'good', text: '已复制' } : { tone: 'info', text }))
}

function PageRow({ pg, onCopy, onDelete }: { pg: LandingPage; onCopy: (u: string) => void; onDelete: () => void }) {
  const [showEmbed, setShowEmbed] = useState(false)
  const conv = pg.views > 0 ? ((pg.orders / pg.views) * 100).toFixed(1) : '0.0'
  return (
    <div className="py-3">
      <div className="flex items-center gap-2">
        <span className="tnum text-[12.5px] font-medium text-ink">{pg.id}</span>
        {pg.channel && <Badge tone="neutral">{pg.channel}</Badge>}
        <span className="ml-auto flex items-center gap-1">
          <IconBtn title="复制链接" onClick={() => onCopy(landingUrl(pg.id))}><Copy size={13} /></IconBtn>
          <a href={`#/land/${pg.id}`} target="_blank" rel="noreferrer" className="grid h-7 w-7 place-items-center rounded-md text-ink-4 hover:bg-surface-muted hover:text-brand" title="打开落地页"><ExternalLink size={13} /></a>
          <IconBtn title="iframe 代码" onClick={() => setShowEmbed((v) => !v)}><Code2 size={13} /></IconBtn>
          <IconBtn title="删除" onClick={onDelete}><Trash2 size={13} /></IconBtn>
        </span>
      </div>
      <div className="mt-1 truncate text-[11.5px] text-ink-3">{pg.title}</div>
      <div className="mt-1.5 flex items-center gap-4 text-[11px] text-ink-4">
        <span>曝光 <b className="tnum text-ink-2">{pg.views}</b></span>
        <span>下单 <b className="tnum text-ink-2">{pg.orders}</b></span>
        <span>转化率 <b className="tnum text-ink-2">{conv}%</b></span>
        <span>金额 <b className="tnum text-brand">{money(pg.revenue)}</b></span>
      </div>
      {showEmbed && (
        <div className="mt-2 rounded-lg bg-surface-sunken p-2.5">
          <code className="block break-all text-[10.5px] leading-relaxed text-ink-3">{landingIframeSnippet(pg.id)}</code>
          <button onClick={() => onCopy(landingIframeSnippet(pg.id))} className="mt-1.5 text-[11px] font-medium text-brand hover:underline">复制 iframe 代码</button>
        </div>
      )}
    </div>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-md text-ink-4 transition-colors hover:bg-surface-muted hover:text-brand">{children}</button>
}

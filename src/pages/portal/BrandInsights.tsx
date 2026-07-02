import { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, Users, AlertTriangle } from 'lucide-react'
import { PageHeader, Card, CardTitle, Badge, BrandMark } from '../../components/ui/primitives'
import { portalApi } from '../../lib/portalApi'
import { money, pct } from '../../lib/format'

/**
 * 投放透视 —— 品牌看清"我的商品被谁在投、投得怎样"（G1 缺口）。
 * 按商品聚合代理投放数据（代理编号脱敏为量级，不给对方客户资产细节）。
 * 数据源：门户 summary（真实态服务端聚合），演示态本地合成代表性视图。
 */
interface BrandSummary { gmvMtd?: number; orders?: number; renewalRate?: number; complaintRate?: number }

// 演示：代理投放透视（真实态由 scoped 聚合端点下发，代理脱敏为编号）
const AGENT_ROWS = [
  { agent: 'A-2041', tier: '企业', firstOrders: 8200, gmv: 2440000, renewal: 71.2, complaint: 0.31, refund: 2.1, material: 12 },
  { agent: 'A-5521', tier: '企业', firstOrders: 5100, gmv: 1520000, renewal: 64.8, complaint: 0.44, refund: 2.8, material: 8 },
  { agent: 'A-3372', tier: '个人', firstOrders: 2300, gmv: 690000, renewal: 60.1, complaint: 0.58, refund: 3.3, material: 5 },
  { agent: 'A-4410', tier: '个人', firstOrders: 900, gmv: 260000, renewal: 52.4, complaint: 1.02, refund: 5.4, material: 3 },
]
const PRODUCT_ROWS = [
  { name: '词典 VIP 连续包月', agents: 4, gmv: 3210000, conv: 3.4, ltv: 104 },
  { name: '词典 VIP 年卡', agents: 2, gmv: 1180000, conv: 2.1, ltv: 168 },
]

export function BrandInsights() {
  const [sum, setSum] = useState<BrandSummary>({})
  useEffect(() => { portalApi.summary<BrandSummary>().then(setSum).catch(() => {}) }, [])
  const totalGmv = AGENT_ROWS.reduce((s, a) => s + a.gmv, 0)
  const maxGmv = Math.max(1, ...AGENT_ROWS.map((a) => a.gmv))

  return (
    <>
      <PageHeader title="投放透视" desc="你的商品被哪些代理在投、投得怎样。代理身份已脱敏为编号，仅展示投放量级与质量。" />
      {(() => (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi icon={<Users size={15} />} label="在投代理" value={String(AGENT_ROWS.length)} sub="覆盖企业 + 个人" />
              <Kpi icon={<TrendingUp size={15} />} label="代理带来 GMV" value={money(totalGmv)} sub={`占品牌 ${sum.gmvMtd ? Math.round((totalGmv / sum.gmvMtd) * 100) : 62}%`} />
              <Kpi icon={<BarChart3 size={15} />} label="平均续费率" value={pct(AGENT_ROWS.reduce((s, a) => s + a.renewal, 0) / AGENT_ROWS.length)} sub="代理投放留存质量" />
              <Kpi icon={<AlertTriangle size={15} />} label="高投诉代理" value={String(AGENT_ROWS.filter((a) => a.complaint >= 1).length)} sub="投诉率 ≥1%，需关注" tone={AGENT_ROWS.some((a) => a.complaint >= 1) ? 'warn' : 'good'} />
            </div>

            {/* 商品维度 */}
            <Card className="mt-4">
              <CardTitle title="按商品聚合" desc="每个商品被多少代理在投、转化与净 LTV" />
              <div className="space-y-2.5">
                {PRODUCT_ROWS.map((p) => (
                  <div key={p.name} className="flex items-center gap-3 rounded-lg border border-line px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-ink">{p.name}</div>
                      <div className="mt-0.5 text-[11px] text-ink-4">{p.agents} 个代理在投 · 转化率 {pct(p.conv)}</div>
                    </div>
                    <div className="text-right">
                      <div className="tnum text-[14px] font-semibold text-ink">{money(p.gmv)}</div>
                      <div className="text-[11px] text-good-ink">净 LTV ¥{p.ltv}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* 代理维度 */}
            <Card className="mt-4">
              <CardTitle title="按代理聚合" desc="投放量级 + 质量（续费/投诉/退款）· 代理身份脱敏" />
              <div className="space-y-2.5">
                {AGENT_ROWS.map((a) => (
                  <div key={a.agent} className="rounded-lg border border-line px-3.5 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BrandMark mark={a.agent.slice(-2)} size={26} />
                        <div>
                          <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">代理 {a.agent} <Badge tone="neutral">{a.tier}</Badge></div>
                          <div className="text-[11px] text-ink-4">首单 {a.firstOrders.toLocaleString()} · 素材 {a.material} 条</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tnum text-[13px] font-semibold text-ink">{money(a.gmv)}</div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-ink-4">续费 {pct(a.renewal)}</span>
                          <span className={a.complaint >= 1 ? 'text-alert-ink' : 'text-ink-4'}>投诉 {pct(a.complaint)}</span>
                        </div>
                      </div>
                    </div>
                    {/* GMV 占比条 */}
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${(a.gmv / maxGmv) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-4">仅展示代理投放到你商品的量级与质量。代理的客户资产、其它品牌数据均不可见（数据隔离）。</p>
            </Card>
          </>
      ))()}
    </>
  )
}

function Kpi({ icon, label, value, sub, tone = 'neutral' }: { icon: React.ReactNode; label: string; value: string; sub: string; tone?: 'neutral' | 'warn' | 'good' }) {
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-[12px] text-ink-3"><span className={tone === 'warn' ? 'text-warn-ink' : 'text-ink-4'}>{icon}</span>{label}</div>
      <div className="tnum mt-1.5 text-[22px] font-semibold text-ink">{value}</div>
      <div className="mt-1 text-[11.5px] text-ink-4">{sub}</div>
    </Card>
  )
}

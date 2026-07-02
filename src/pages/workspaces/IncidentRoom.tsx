import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldAlert, Activity, Zap, Ban, Gauge, RotateCcw, TriangleAlert, CheckCircle2 } from 'lucide-react'
import { PageHeader, Card, CardTitle, Badge, Button, BrandMark, TONE } from '../../components/ui/primitives'
import { Sparkline } from '../../components/ui/charts'
import { useToast } from '../../components/ui/overlays'
import { useStore, setMerchantState } from '../../lib/store'
import { brandById, type MerchantState } from '../../lib/data'
import { money, cx } from '../../lib/format'

/**
 * 风险处置舱 —— 全屏聚焦容器（路由，可分享可回退），把处置一个事件所需的
 * 上下文/动作/留痕聚合到一屏，不再让运营去号池/订单/代理三页人肉拼。
 * 核心：动作带「影响预演」——看得见后果才敢按按钮（小白的安全网）。
 */
export default function IncidentRoom() {
  const { mid = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  // 单次 useStore：hooks 必须无条件且次数恒定——曾在 JSX 三元里按分支调用 useStore()，
  // 留痕从空变非空时 hooks 数量改变，React 直接崩掉整个控制台（无 ErrorBoundary 时白屏）。
  const { merchants, orders, activity } = useStore()
  const m = merchants.find((x) => x.id === mid)

  if (!m) {
    return (
      <>
        <div className="mb-4 flex items-center gap-2"><button onClick={() => nav('/risk')} className="grid h-8 w-8 place-items-center rounded-lg text-ink-4 hover:bg-surface-muted"><ArrowLeft size={16} /></button><PageHeader title="处置舱" desc="未找到该商户号" /></div>
        <Card><div className="py-10 text-center text-[13px] text-ink-4">商户号 {mid} 不存在或已下线。</div></Card>
      </>
    )
  }

  const brand = brandById(m.brandId)
  // 承接方要能真的接量：熔断/暂停新签的兄弟号不算改道池（文案承诺"健康兄弟号"）
  const siblings = merchants.filter((x) => x.brandId === m.brandId && x.id !== m.id && x.state !== 'fused' && x.state !== 'paused')
  const relatedOrders = orders.filter((o) => o.mid === m.id).slice(0, 6)
  const trail = activity.filter((a) => a.text.includes(m.id))
  // 影响预演：熔断该号 → 其权重份额按健康兄弟号权重比例改道
  const sibWeight = siblings.reduce((s, x) => s + x.weight, 0)
  const reroute = siblings.map((x) => ({ id: x.id, share: sibWeight > 0 ? (x.weight / sibWeight) : 0 }))
  const dailyGmv = m.gmvMtd / 30
  const health = m.state === 'fused' ? 'red' : m.state === 'paused' || m.state === 'watch' ? 'amber' : m.complaintRate >= 1 ? 'amber' : 'green'
  const HT = { red: 'alert', amber: 'warn', green: 'good' } as const

  // 建议动作（规则引擎默认：投诉率越阈值 → 熔断；否则降权观察）
  const suggested: MerchantState = m.complaintRate >= 1.2 || m.chargebackRate >= 0.6 ? 'fused' : m.complaintRate >= 0.8 ? 'paused' : 'watch'

  const act = (next: MerchantState, label: string) => {
    setMerchantState(m.id, next, label)
    toast({ tone: next === 'healthy' ? 'good' : 'alert', text: `${m.id} 已${label}` })
  }

  // 30 天投诉曲线（演示：围绕当前值抖动）
  const trend = Array.from({ length: 14 }, (_, i) => Math.max(0.1, m.complaintRate * (0.7 + 0.5 * Math.sin(i / 2) + i * 0.02)))

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => nav('/risk')} className="grid h-8 w-8 place-items-center rounded-lg text-ink-4 hover:bg-surface-muted"><ArrowLeft size={16} /></button>
        <PageHeader title={`处置舱 · ${m.id}`} desc="事件上下文 · 处置动作(带影响预演) · 留痕，一屏完成" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* 左：事件上下文 */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <BrandMark brand={m.brandId} size={40} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">{m.id}</span>
                    <Badge tone={HT[health]} dot>{m.state === 'fused' ? '已熔断' : m.state === 'paused' ? '已暂停' : m.state === 'watch' ? '观察中' : '健康'}</Badge>
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-4">{brand?.name} · {m.mid}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="tnum text-[20px] font-semibold text-ink">{m.complaintRate.toFixed(2)}%</div>
                <div className="text-[11px] text-ink-4">近 7 天投诉率</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { k: '升级投诉', v: `${m.escalatedRate.toFixed(2)}%`, tone: m.escalatedRate >= 0.1 ? 'alert' : 'good' as const },
                { k: '拒付率', v: `${m.chargebackRate.toFixed(2)}%`, tone: m.chargebackRate >= 0.5 ? 'alert' : 'good' as const },
                { k: '72h 完结', v: `${m.close72h}%`, tone: m.close72h >= 95 ? 'good' : 'warn' as const },
                { k: '进单权重', v: String(m.weight), tone: 'neutral' as const },
              ].map((x) => (
                <div key={x.k} className="rounded-lg border border-line px-3 py-2">
                  <div className="text-[11px] text-ink-4">{x.k}</div>
                  <div className={cx('tnum mt-0.5 text-[15px] font-semibold', TONE[x.tone as 'good'].ink)}>{x.v}</div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-3"><Activity size={12} /> 近 14 天投诉率走势</div>
              <Sparkline data={trend} tone={health === 'red' ? 'alert' : 'warn'} w={520} h={44} />
            </div>
          </Card>

          {/* 关联订单 */}
          <Card>
            <CardTitle title="关联订单流" desc={`经 ${m.id} 的近期订单`} />
            {relatedOrders.length === 0 ? (
              <div className="py-6 text-center text-[12.5px] text-ink-4">该商户号暂无关联订单记录</div>
            ) : (
              <div className="space-y-1.5">
                {relatedOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[12.5px]">
                    <span className="tnum text-ink-2">{o.id}</span>
                    <span className="text-ink-3">{o.plan}</span>
                    <span className={cx('tnum font-medium', o.amount < 0 ? 'text-alert-ink' : 'text-ink')}>{o.amount < 0 ? '−' : ''}¥{Math.abs(o.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* 右：处置动作 + 留痕 */}
        <div className="space-y-4">
          <Card>
            <CardTitle title="处置动作" desc="带影响预演 · 看得见后果再决定" right={<Badge tone="brand">建议：{suggested === 'fused' ? '熔断' : suggested === 'paused' ? '暂停新签' : '降权观察'}</Badge>} />

            {/* 影响预演 */}
            <div className="mb-3 rounded-lg border border-brand/20 bg-brand-soft/30 p-3">
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-brand-ink"><TriangleAlert size={12} /> 熔断影响预演</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
                熔断 {m.id} → 约 <b className="tnum">{money(Math.round(dailyGmv))}</b>/日 流水将按权重改道
                {reroute.length ? '：' : '（无健康兄弟号可承接，需先扩号池）'}
              </p>
              {reroute.length > 0 && (
                <div className="mt-2 space-y-1">
                  {reroute.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-[11px]">
                      <span className="tnum text-ink-2">{r.id}</span>
                      <span className="tnum text-ink-4">承接 {Math.round(r.share * 100)}% · ~{money(Math.round(dailyGmv * r.share))}/日</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ActBtn icon={<Ban size={15} />} label="熔断停单" tone="alert" active={m.state === 'fused'} suggested={suggested === 'fused'} onClick={() => act('fused', '熔断')} />
              <ActBtn icon={<Gauge size={15} />} label="暂停新签" tone="warn" active={m.state === 'paused'} suggested={suggested === 'paused'} onClick={() => act('paused', '暂停新签')} />
              <ActBtn icon={<ShieldAlert size={15} />} label="降权观察" tone="warn" active={m.state === 'watch'} suggested={suggested === 'watch'} onClick={() => act('watch', '降权观察')} />
              <ActBtn icon={<RotateCcw size={15} />} label="恢复健康" tone="good" active={m.state === 'healthy'} onClick={() => act('healthy', '恢复健康')} />
            </div>
          </Card>

          {/* 留痕（本商户号的活动流片段） */}
          <Card pad={false}>
            <div className="flex items-center gap-2 border-b border-line px-5 pt-5 pb-3">
              <Zap size={14} className="text-brand" /><span className="text-[13px] font-semibold">处置留痕</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto px-4 py-2">
              {trail.length === 0 ? (
                <div className="px-2 py-6 text-center text-[12px] text-ink-4">尚无处置记录 · 执行动作后在此留痕</div>
              ) : (
                trail.map((it) => (
                  <div key={it.id} className="flex items-start gap-2.5 px-2 py-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(--color-${it.tone === 'neutral' ? 'ink-4' : it.tone})` }} />
                    <div className="min-w-0 flex-1"><div className="text-[12px] leading-snug text-ink-2">{it.text}</div><div className="tnum text-[10.5px] text-ink-5">{it.t}</div></div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {m.state !== 'healthy' && (
            <div className="flex items-center gap-2 rounded-xl border border-good/25 bg-good-soft/30 px-4 py-3 text-[12px] text-good-ink">
              <CheckCircle2 size={15} /> 处置已生效 · 48h 后系统将自动生成复盘卡对比投诉率前后变化
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ActBtn({ icon, label, tone, active, suggested, onClick }: { icon: React.ReactNode; label: string; tone: 'alert' | 'warn' | 'good'; active?: boolean; suggested?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={active}
      className={cx('relative flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[12.5px] font-medium transition-all',
        active ? 'cursor-default border-line bg-surface-muted text-ink-4' : 'border-line bg-surface text-ink-2 hover:-translate-y-px hover:shadow-[var(--shadow-card)]',
        !active && tone === 'alert' && 'hover:border-alert hover:text-alert-ink',
        !active && tone === 'warn' && 'hover:border-warn hover:text-warn-ink',
        !active && tone === 'good' && 'hover:border-good hover:text-good-ink')}>
      {icon}{label}
      {active && <span className="ml-1 text-[10px]">· 当前</span>}
      {suggested && !active && <span className="absolute -right-1 -top-1 rounded-full bg-brand px-1.5 py-0.5 text-[8.5px] font-semibold text-white">建议</span>}
    </button>
  )
}

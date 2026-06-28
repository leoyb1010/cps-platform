import { useState } from 'react'
import { Target, GitBranch, Layers3 } from 'lucide-react'
import {
  Card,
  CardTitle,
  Stat,
  PageHeader,
  Button,
  Segmented,
  BrandMark,
  TableShell,
  Th,
  Td,
  Row,
} from '../components/ui/primitives'
import { AreaLine, Bars, Gauge } from '../components/ui/charts'
import { Modal, useToast } from '../components/ui/overlays'
import { Field, Select, Input } from '../components/ui/forms'
import { Term } from '../components/ui/Term'
import { kpi, series, RNSC_BREAKDOWN } from '../lib/data'
import { useStore, setAttributionConfig, type AttributionConfig } from '../lib/store'
import { useViewMode } from '../lib/prefs'
import { money, int, pct, cx } from '../lib/format'

const FUNNEL = [
  { stage: '曝光', value: 100, n: '4,820万', tone: 'neutral' as const },
  { stage: '点击', value: 4.2, n: '202万', tone: 'info' as const },
  { stage: '落地页', value: 3.1, n: '149万', tone: 'info' as const },
  { stage: '签约首单', value: 0.62, n: '29.9万', tone: 'good' as const },
  { stage: '次月续费', value: 0.4, n: '19.3万', tone: 'brand' as const },
]

export default function Analytics() {
  const { brands, agents, attributionConfig } = useStore()
  const expert = useViewMode() === 'expert'
  const [view, setView] = useState<'agent' | 'brand' | 'channel'>('agent')
  const toast = useToast()
  const [cfg, setCfg] = useState(false)

  return (
    <>
      <PageHeader
        title="数据 · 归因"
        desc="统一追踪 ID（代理×品牌×套餐×渠道×素材）。多平台转化回传，首单与续费归因到代理，T+0 预测 LTV 指导出价。"
        actions={<Button variant="primary" onClick={() => setCfg(true)}>归因模型设置</Button>}
      />

      {cfg && <AttrModal current={attributionConfig} onClose={() => setCfg(false)} onSaved={() => toast({ tone: 'good', text: '归因模型已更新' })} />}

      {/* 北极星 R-NSC：仪表对目标 + 瀑布分解（口径透明，估算项诚实标注） */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardTitle title={<Term k="rnsc">R-NSC 北极星</Term>} desc="风险调整后净订阅贡献 · 对本月目标" />
          <Gauge value={kpi.rnscMtd / 10000} max={kpi.rnscTarget / 10000} target={kpi.rnscTarget / 10000} status={kpi.rnscMtd >= kpi.rnscTarget ? '达标' : kpi.rnscMtd >= kpi.rnscTarget * 0.8 ? '接近' : '待追'} decimals={0} />
          <div className="mt-3 flex items-center justify-between text-[12px]">
            <span className="text-ink-3">本月 <b className="tnum text-ink">{money(kpi.rnscMtd)}</b></span>
            {(() => { const d = ((kpi.rnscMtd - kpi.rnscPrevMtd) / kpi.rnscPrevMtd) * 100; const up = d >= 0; return <span className={cx('tnum font-medium', up ? 'text-good-ink' : 'text-alert-ink')}>{up ? '▲' : '▼'} {Math.abs(d).toFixed(1)}% 环比</span> })()}
          </div>
        </Card>
        <Card className="lg:col-span-3">
          <CardTitle title="R-NSC 构成分解" desc="从基础流水逐项扣减到净贡献 · 估算项已标注" />
          <div className="space-y-1.5">
            {RNSC_BREAKDOWN.map((it) => {
              const pos = it.value >= 0
              const wPct = Math.min(100, (Math.abs(it.value) / 28420000) * 100)
              return (
                <div key={it.label} className="flex items-center gap-2.5">
                  <span className="w-[150px] shrink-0 truncate text-[11.5px] text-ink-2">{it.label}{it.estimated && <span className="ml-1 text-[10px] text-ink-4">估</span>}</span>
                  <div className="flex-1">
                    <div className="h-4 overflow-hidden rounded bg-surface-sunken">
                      <div className={cx('h-full rounded', pos ? 'bg-good/70' : 'bg-alert/60')} style={{ width: `${Math.max(wPct, 2)}%` }} />
                    </div>
                  </div>
                  <span className={cx('tnum w-[88px] shrink-0 text-right text-[11.5px] font-medium', pos ? 'text-good-ink' : 'text-alert-ink')}>{pos ? '+' : '−'}{money(Math.abs(it.value))}</span>
                </div>
              )
            })}
            <div className="flex items-center justify-between border-t border-line pt-2 text-[12.5px]">
              <span className="font-medium text-ink">= R-NSC 净贡献</span>
              <span className="tnum font-semibold text-brand">{money(kpi.rnscMtd)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 护栏指标条（与北极星同屏，防止只追规模） */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label={<Term k="ltvCac">净 LTV ÷ CAC</Term>} value={kpi.ltvCac.toFixed(2)} hint="护栏 · >2 可接受 · >3 健康" sub={<span>净 LTV ¥{kpi.netLtv} · CAC ¥{kpi.cac}</span>} deltaTone={kpi.ltvCac >= 3 ? 'good' : kpi.ltvCac >= 2 ? 'warn' : 'alert'} /></Card>
        <Card><Stat label={<Term k="renew30">D30 续费率</Term>} value={pct(kpi.renewalRate, 1)} hint="护栏 · 判断是否真 LTV" sub={<span>真 LTV 核心驱动</span>} deltaTone={kpi.renewalRate >= 60 ? 'good' : 'warn'} /></Card>
        <Card><Stat label={<Term k="complaintRate">投诉率</Term>} value={pct(kpi.complaintRate, 2)} hint="护栏 · 商户号红线" sub={<span>近 7 天累计</span>} deltaTone={kpi.complaintRate < 1 ? 'good' : 'alert'} /></Card>
        <Card><Stat label="归因覆盖率" value="99.4%" hint="去重防劫持后" sub={<span>追踪 ID 命中</span>} deltaTone="good" /></Card>
      </div>

      {/* 漏斗 + LTV */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle title="转化归因漏斗" desc="曝光 → 点击 → 落地页 → 签约 → 续费" right={<GitBranch size={15} className="text-ink-3" />} />
          <div className="space-y-2.5">
            {FUNNEL.map((s) => (
              <div key={s.stage} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[12px] text-ink-2">{s.stage}</span>
                <div className="flex-1">
                  <div className="h-6 overflow-hidden rounded-md bg-surface-sunken">
                    <div className="flex h-full items-center rounded-md pl-2 text-[11px] font-medium text-white" style={{ width: `${Math.max(s.value, 6)}%`, background: `var(--color-${s.tone === 'neutral' ? 'ink-3' : s.tone})` }}>
                    </div>
                  </div>
                </div>
                <span className="tnum w-20 shrink-0 text-right text-[12px] text-ink-3">{s.n}</span>
                <span className="tnum w-12 shrink-0 text-right text-[12px] font-medium text-ink">{s.value}%</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle title="LTV 累计曲线" desc="12 个月累计净 LTV" right={<Target size={15} className="text-ink-3" />} />
          <AreaLine data={series.ltvCurve} tone="brand" height={150} />
          <div className="mt-2 flex items-center justify-between text-[12px]">
            <span className="text-ink-3">首月 ¥40</span>
            <span className="font-medium text-ink">12 月累计 ¥104</span>
          </div>
        </Card>
      </div>

      {/* 留存 cohort */}
      <Card className="mt-4">
        <CardTitle title="连续包月留存（同期群）" desc="开月为 100%，逐月衰减，续费率是 LTV 的核心驱动" />
        <Bars data={series.renewalCohort} labels={['开月', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月']} tone="brand" height={150} format={(v) => `${Math.round(v)}%`} />
      </Card>

      {/* 多视角（深度切面，专家视图展开） */}
      {expert && (
      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle title="多视角看板" desc="同一份归因数据的不同切面" right={<Layers3 size={15} className="text-ink-3" />} />
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'agent', label: '代理视角' },
              { value: 'brand', label: '品牌视角' },
              { value: 'channel', label: '渠道视角' },
            ]}
          />
        </div>

        {view === 'agent' && (
          <TableShell className="px-2 pb-2" head={<><Th className="pl-3">代理</Th><Th right>消耗</Th><Th right>首单数</Th><Th right>首单 ROI</Th><Th right>续费率</Th><Th right>净 LTV/CAC</Th></>}>
            {agents.filter((a) => a.spendMtd > 0).sort((x, y) => y.spendMtd - x.spendMtd).map((a) => (
              <Row key={a.id}>
                <Td className="pl-3"><span className="text-[12.5px] font-medium text-ink">{a.name}</span><div className="text-[11px] text-ink-4">{a.id}</div></Td>
                <Td right mono>{money(a.spendMtd)}</Td>
                <Td right mono>{int(a.firstOrders)}</Td>
                <Td right mono><span className={a.roi >= 1.5 ? 'text-good-ink' : 'text-warn-ink'}>{a.roi.toFixed(2)}</span></Td>
                <Td right mono>{pct(a.renewalRate)}</Td>
                <Td right mono className="font-medium text-ink">{(a.roi * 1.25).toFixed(2)}</Td>
              </Row>
            ))}
          </TableShell>
        )}

        {view === 'brand' && (
          <TableShell className="px-2 pb-2" head={<><Th className="pl-3">品牌</Th><Th right>获客量</Th><Th right>客诉率</Th><Th right>退款率</Th><Th right>续费率</Th><Th right>本月基础流水</Th></>}>
            {brands.filter((b) => b.status === 'live').sort((x, y) => y.gmvMtd - x.gmvMtd).map((b) => (
              <Row key={b.id}>
                <Td className="pl-3"><div className="flex items-center gap-2.5"><BrandMark brand={b.id} mark={b.mark} size={26} /><span className="text-[12.5px] font-medium text-ink">{b.name}</span></div></Td>
                <Td right mono>{int(b.activeSubs)}</Td>
                <Td right mono><span className={b.complaintRate >= 0.9 ? 'text-warn-ink' : 'text-ink-2'}>{pct(b.complaintRate)}</span></Td>
                <Td right mono>{pct(b.chargebackRate, 2)}</Td>
                <Td right mono>{pct(b.renewalRate)}</Td>
                <Td right mono className="font-medium text-ink">{money(b.gmvMtd)}</Td>
              </Row>
            ))}
          </TableShell>
        )}

        {view === 'channel' && (
          <TableShell className="px-2 pb-2" head={<><Th className="pl-3">投放渠道</Th><Th right>消耗占比</Th><Th right>CPA</Th><Th right>首单 ROI</Th><Th right>续费率</Th></>}>
            {[
              { c: '巨量引擎', share: 42, cpa: 38, roi: 1.74, ren: 65 },
              { c: '快手磁力', share: 24, cpa: 41, roi: 1.61, ren: 62 },
              { c: '微信广点通', share: 18, cpa: 44, roi: 1.55, ren: 67 },
              { c: '百度', share: 9, cpa: 47, roi: 1.42, ren: 60 },
              { c: '支付宝', share: 7, cpa: 36, roi: 1.81, ren: 70 },
            ].map((x) => (
              <Row key={x.c}>
                <Td className="pl-3"><span className="text-[12.5px] font-medium text-ink">{x.c}</span></Td>
                <Td right mono>{x.share}%</Td>
                <Td right mono>¥{x.cpa}</Td>
                <Td right mono><span className={x.roi >= 1.6 ? 'text-good-ink' : 'text-warn-ink'}>{x.roi.toFixed(2)}</span></Td>
                <Td right mono>{pct(x.ren, 0)}</Td>
              </Row>
            ))}
          </TableShell>
        )}
      </Card>
      )}
    </>
  )
}

function AttrModal({ current, onClose, onSaved }: { current: AttributionConfig; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AttributionConfig>({ ...current })
  const set = <K extends keyof AttributionConfig>(k: K, v: AttributionConfig[K]) => setForm((f) => ({ ...f, [k]: v }))
  const save = () => { setAttributionConfig(form); onClose(); onSaved() }
  return (
    <Modal open onClose={onClose} width={520} title="归因模型设置" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><button onClick={save} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">保存</button></>}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="首单归因窗口"><Select value={form.firstClickWindow} onChange={(e) => set('firstClickWindow', e.target.value as AttributionConfig['firstClickWindow'])}><option value="1">点击后 1 天</option><option value="7">点击后 7 天</option><option value="14">点击后 14 天</option></Select></Field>
          <Field label="续费归因方式"><Select value={form.renewAttribution} onChange={(e) => set('renewAttribution', e.target.value as AttributionConfig['renewAttribution'])}><option value="first">归因首单代理</option><option value="last">归因末次触点</option></Select></Field>
        </div>
        <Field label="去重粒度"><Select value={form.dedupe} onChange={(e) => set('dedupe', e.target.value as AttributionConfig['dedupe'])}><option value="device">设备 + 手机号</option><option value="phone">仅手机号</option></Select></Field>
        <Field label="点击劫持判定阈值（秒）" hint="点击-转化时差低于此值判为劫持"><Input type="number" value={form.hijackThresholdSec} onChange={(e) => set('hijackThresholdSec', +e.target.value)} /></Field>
        <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">回传对接：巨量 / 快手 / 广点通 / 百度 / 支付宝 转化 API，回传"签约/支付成功"优化投放模型。</div>
        <div className="rounded-lg border border-line p-3 text-[11px] leading-relaxed text-ink-4">配置即时保存并持久化，应用于后续新订单的归因计算；不回溯重算历史展示数据。</div>
      </div>
    </Modal>
  )
}

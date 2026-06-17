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
import { AreaLine, Bars } from '../components/ui/charts'
import { Modal, useToast } from '../components/ui/overlays'
import { Field, Select, Input } from '../components/ui/forms'
import { kpi, series } from '../lib/data'
import { useStore } from '../lib/store'
import { money, int, pct } from '../lib/format'

const FUNNEL = [
  { stage: '曝光', value: 100, n: '4,820万', tone: 'neutral' as const },
  { stage: '点击', value: 4.2, n: '202万', tone: 'info' as const },
  { stage: '落地页', value: 3.1, n: '149万', tone: 'info' as const },
  { stage: '签约首单', value: 0.62, n: '29.9万', tone: 'good' as const },
  { stage: '次月续费', value: 0.4, n: '19.3万', tone: 'brand' as const },
]

export default function Analytics() {
  const { brands, agents } = useStore()
  const [view, setView] = useState<'agent' | 'brand' | 'channel'>('agent')
  const toast = useToast()
  const [cfg, setCfg] = useState(false)

  return (
    <>
      <PageHeader
        title="数据 · 归因"
        desc="统一追踪 ID（代理×品牌×套餐×渠道×素材）· 多平台转化回传 · 首单与续费归因到代理 · T+0 预测 LTV 指导出价。"
        actions={<Button variant="primary" onClick={() => setCfg(true)}>归因模型设置</Button>}
      />

      <Modal open={cfg} onClose={() => setCfg(false)} width={520} title="归因模型设置" footer={<><Button variant="ghost" onClick={() => setCfg(false)}>取消</Button><button onClick={() => { setCfg(false); toast({ tone: 'good', text: '归因模型已更新' }) }} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">保存</button></>}>
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="首单归因窗口"><Select defaultValue="7"><option value="1">点击后 1 天</option><option value="7">点击后 7 天</option><option value="14">点击后 14 天</option></Select></Field>
            <Field label="续费归因方式"><Select defaultValue="first"><option value="first">归因首单代理</option><option value="last">归因末次触点</option></Select></Field>
          </div>
          <Field label="去重粒度"><Select defaultValue="device"><option value="device">设备 + 手机号</option><option value="phone">仅手机号</option></Select></Field>
          <Field label="点击劫持判定阈值（秒）" hint="点击-转化时差低于此值判为劫持"><Input type="number" defaultValue={3} /></Field>
          <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">回传对接：巨量 / 快手 / 广点通 / 百度 / 支付宝 转化 API，回传"签约/支付成功"优化投放模型。</div>
        </div>
      </Modal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="净 LTV ÷ CAC" value={kpi.ltvCac.toFixed(2)} hint="北极星指标" sub={<span>净 LTV ¥{kpi.netLtv} · CAC ¥{kpi.cac}</span>} /></Card>
        <Card><Stat label="首单转化率" value={pct(0.62, 2)} sub={<span>曝光 → 签约</span>} /></Card>
        <Card><Stat label="归因覆盖率" value="99.4%" sub={<span>去重防劫持后</span>} /></Card>
        <Card><Stat label="T+0 LTV 预测误差" value="±6.8%" deltaTone="good" sub={<span>首单期即可出价</span>} /></Card>
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
        <CardTitle title="连续包月留存（同期群）" desc="开月为 100%，逐月衰减 —— 续费率是 LTV 的核心驱动" />
        <Bars data={series.renewalCohort} labels={['开月', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月']} tone="brand" height={150} format={(v) => `${Math.round(v)}%`} />
      </Card>

      {/* 多视角 */}
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
          <TableShell className="px-2 pb-2" head={<><Th className="pl-3">品牌</Th><Th right>获客量</Th><Th right>客诉率</Th><Th right>退款率</Th><Th right>续费率</Th><Th right>本月 GMV</Th></>}>
            {brands.filter((b) => b.status === 'live').sort((x, y) => y.gmvMtd - x.gmvMtd).map((b) => (
              <Row key={b.id}>
                <Td className="pl-3"><div className="flex items-center gap-2.5"><BrandMark mark={b.mark} size={26} /><span className="text-[12.5px] font-medium text-ink">{b.name}</span></div></Td>
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
    </>
  )
}

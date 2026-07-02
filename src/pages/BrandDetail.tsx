import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Check, Sliders, CreditCard, Boxes, ShieldAlert } from 'lucide-react'
import {
  Card,
  CardTitle,
  Stat,
  Badge,
  Button,
  BrandMark,
  TableShell,
  Th,
  Td,
  Row,
  ThresholdBar,
} from '../components/ui/primitives'
import { AreaLine } from '../components/ui/charts'
import { Modal, useToast } from '../components/ui/overlays'
import { Field, Input, Select } from '../components/ui/forms'
import {
  merchantsByBrand,
  SETTLE_PATH_LABEL,
  CHANNEL_LABEL,
  MERCHANT_STATE,
  MERCHANT_THRESHOLD,
  series,
  type SettlePath,
} from '../lib/data'
import { useStore, updateBrandConfig, triggerOrderSync } from '../lib/store'
import { money, int, pct } from '../lib/format'

export default function BrandDetail() {
  const { id } = useParams()
  const { brands } = useStore()
  const toast = useToast()
  const [edit, setEdit] = useState(false)
  const b = brands.find((x) => x.id === id)
  if (!b)
    return (
      <div className="grid h-64 place-items-center text-ink-3">
        未找到该品牌 · <Link to="/brands" className="ml-1 text-ink underline">返回列表</Link>
      </div>
    )
  const pool = merchantsByBrand(b.id)

  return (
    <>
      <Link to="/brands" className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> 品牌管理
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <BrandMark brand={b.id} mark={b.mark} size={46} />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[21px] font-semibold tracking-tight text-ink">{b.name}</h1>
              <Badge tone={b.status === 'live' ? 'good' : b.status === 'review' ? 'warn' : 'neutral'} dot>
                {b.status === 'live' ? '在投' : b.status === 'review' ? '审核中' : '已暂停'}
              </Badge>
            </div>
            <div className="mt-1 text-[13px] text-ink-3">{b.category} · 接入于 {b.joinedAt}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEdit(true)}><Sliders size={14} /> 编辑配置</Button>
          <Button variant="primary" busyMs={500} onClick={() => { triggerOrderSync(b.id); toast({ tone: 'good', text: `${b.name} 订单回传同步完成` }) }}>同步订单回传</Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="本月 GMV" value={b.gmvMtd > 0 ? money(b.gmvMtd) : '—'} /></Card>
        <Card><Stat label="活跃订阅" value={int(b.activeSubs)} /></Card>
        <Card><Stat label="续费率" value={b.renewalRate > 0 ? pct(b.renewalRate) : '—'} deltaTone="good" /></Card>
        <Card><Stat label="投诉率 / 阈值" value={pct(b.complaintRate)} sub={<span>红线 {pct(b.thresholds.complaint)}</span>} /></Card>
      </div>

      {/* 配置驱动接入 */}
      <Card className="mt-4">
        <CardTitle title="接入配置（全参数化）" desc="以下均为配置项 · 接入新品牌 = 填配置 + 接回传，不改代码" right={<Badge tone="info">配置驱动</Badge>} />
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-4">
          <ConfigItem label="结算主体费率" value={`${b.feeRate}%`} note="给「平台+代理」总分润" />
          <ConfigItem label="资金路径" value={SETTLE_PATH_LABEL[b.path]} note={b.path === 'direct' ? '直连商户号' : b.path === 'licensed' ? '持牌分账' : '直连+分账'} />
          <ConfigItem label="结算账期" value={`T+${b.period}`} note="结算给代理周期" />
          <ConfigItem label="风险准备金" value={`${b.reservePct}%`} note="账期冻结比例" />
          <ConfigItem label="投诉率阈值" value={pct(MERCHANT_THRESHOLD.complaint)} note="近7天累计红线" />
          <ConfigItem label="升级投诉阈值" value={pct(MERCHANT_THRESHOLD.escalated)} note="升级投诉红线" />
          <ConfigItem label="72h 完结率" value={`≥ ${MERCHANT_THRESHOLD.close72h}%`} note="投诉完结达标线" />
          <ConfigItem label="订单回传" value="已对接" note="签约/续费/退款 API" ok />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 套餐 */}
        <Card>
          <CardTitle title="会员套餐" desc="连续包月 · 首期价引流 + 续期价" right={<Boxes size={15} className="text-ink-3" />} />
          <div className="space-y-3">
            {b.plans.map((p) => (
              <div key={p.name} className="rounded-xl border border-line p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-ink">{p.name}</span>
                  {p.autoRenew && <Badge tone="brand">连续包月</Badge>}
                </div>
                <div className="mt-2 flex items-baseline gap-4">
                  <div>
                    <span className="tnum text-[18px] font-semibold text-ink">¥{p.firstPrice}</span>
                    <span className="ml-1 text-[11px] text-ink-4">首{p.cycle}</span>
                  </div>
                  <div className="text-ink-4">→</div>
                  <div>
                    <span className="tnum text-[14px] font-medium text-ink-2">¥{p.renewPrice}</span>
                    <span className="ml-1 text-[11px] text-ink-4">续{p.cycle}</span>
                  </div>
                </div>
                <div className="mt-2 text-[11.5px] text-ink-3">{p.equity}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* 通道 + 趋势 */}
        <div className="space-y-4">
          <Card>
            <CardTitle title="支付通道" right={<CreditCard size={15} className="text-ink-3" />} />
            <div className="space-y-2">
              {b.channels.map((c) => (
                <div key={c.type} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-medium text-ink">{CHANNEL_LABEL[c.type]}</span>
                    <Badge tone={c.direct ? 'good' : 'info'}>{c.direct ? '直连' : '持牌分账'}</Badge>
                  </div>
                  <span className="tnum text-[12px] text-ink-3">扣率 {pct(c.rate, 2)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle title="续费 LTV 曲线" desc="留存衰减 · 决定净 LTV" />
            <AreaLine data={series.ltvCurve} tone="brand" height={120} />
          </Card>
        </div>
      </div>

      {/* 该品牌号池 */}
      <Card className="mt-4" pad={false}>
        <div className="p-5 pb-3">
          <CardTitle title="品牌专属号池" desc="按品牌隔离 · 健康度独立监控" right={<Link to="/merchants" className="text-[12px] text-ink-3 hover:text-ink">号池管理</Link>} />
        </div>
        <TableShell
          className="px-2 pb-2"
          head={<><Th className="pl-3">商户号</Th><Th>通道</Th><Th>状态</Th><Th className="w-44">投诉率 vs 阈值</Th><Th right>本月交易额</Th><Th right>权重</Th></>}
        >
          {pool.map((m) => {
            const st = MERCHANT_STATE[m.state]
            return (
              <Row key={m.id}>
                <Td className="pl-3"><div className="text-[12.5px] font-medium text-ink">{m.id}</div><div className="text-[11px] text-ink-4">{m.mid}</div></Td>
                <Td>{CHANNEL_LABEL[m.channel]}</Td>
                <Td><Badge tone={st.tone} dot>{st.label}</Badge></Td>
                <Td><ThresholdBar value={m.complaintRate} warn={b.thresholds.complaint * 0.6} limit={b.thresholds.complaint} /></Td>
                <Td right mono className="font-medium text-ink">{money(m.gmvMtd)}</Td>
                <Td right mono><span className={m.weight === 0 ? 'text-alert-ink' : 'text-ink'}>{m.weight}</span></Td>
              </Row>
            )
          })}
        </TableShell>
      </Card>

      {b.path === 'direct' && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface p-4 text-[12.5px] leading-relaxed text-ink-3">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-good-ink" />
          <span><span className="font-medium text-ink-2">直连对账：</span>资金直达品牌商户号，平台仅获取订单回传用于归因与结算。平台用自采的签约/支付成功事件与品牌回传逐笔比对，监控续费率异常下跌，防止漏报克扣。</span>
        </div>
      )}

      {edit && <EditConfig brandId={b.id} feeRate={b.feeRate} period={b.period} reservePct={b.reservePct} path={b.path} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); toast({ tone: 'good', text: '配置已保存' }) }} />}
    </>
  )
}

function EditConfig({ brandId, feeRate, period, reservePct, path, onClose, onSaved }: { brandId: string; feeRate: number; period: number; reservePct: number; path: SettlePath; onClose: () => void; onSaved: () => void }) {
  // 数值以字符串暂存、保存时钳制（对齐 Settings 的 NumField）：清空不落 0（回退原值），越界收敛到边界
  const [f, setF] = useState({ feeRate: String(feeRate), period: String(period), reservePct: String(reservePct), path })
  const clamp = (v: string, min: number, max: number, prev: number) => (v.trim() === '' || Number.isNaN(+v) ? prev : Math.min(max, Math.max(min, +v)))
  const save = () => {
    updateBrandConfig(brandId, {
      feeRate: clamp(f.feeRate, 1, 100, feeRate),
      period: clamp(f.period, 1, 365, period),
      reservePct: clamp(f.reservePct, 0, 100, reservePct),
      path: f.path,
    })
    onSaved()
  }
  return (
    <Modal open onClose={onClose} title="编辑接入配置" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><button onClick={save} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">保存</button></>}>
      <div className="space-y-3.5">
        <Field label="资金路径"><Select value={f.path} onChange={(e) => setF({ ...f, path: e.target.value as SettlePath })}><option value="direct">直连</option><option value="licensed">持牌分账</option><option value="mixed">混合</option></Select></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="费率 %" hint="1–100"><Input type="number" min={1} max={100} value={f.feeRate} onChange={(e) => setF({ ...f, feeRate: e.target.value })} /></Field>
          <Field label="账期 T+" hint="1–365"><Input type="number" min={1} max={365} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
          <Field label="准备金 %" hint="0–100"><Input type="number" min={0} max={100} value={f.reservePct} onChange={(e) => setF({ ...f, reservePct: e.target.value })} /></Field>
        </div>
        <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] text-ink-3">风控阈值采用支付平台统一口径，不在此覆盖；保存即生效（变更进审计）。</div>
      </div>
    </Modal>
  )
}

function ConfigItem({ label, value, note, ok }: { label: string; value: string; note: string; ok?: boolean }) {
  return (
    <div>
      <div className="text-[11.5px] text-ink-4">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="tnum text-[15px] font-semibold text-ink">{value}</span>
        {ok && <Check size={13} className="text-good-ink" />}
      </div>
      <div className="text-[11px] text-ink-4">{note}</div>
    </div>
  )
}

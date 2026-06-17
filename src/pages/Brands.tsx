import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Settings2, ArrowRight } from 'lucide-react'
import {
  Card,
  Stat,
  PageHeader,
  Badge,
  Button,
  Segmented,
  BrandMark,
  TableShell,
  Th,
  Td,
  Row,
} from '../components/ui/primitives'
import { Meter } from '../components/ui/charts'
import { Modal, useToast } from '../components/ui/overlays'
import { Steps, Field, Input, Select } from '../components/ui/forms'
import { SETTLE_PATH_LABEL, type SettlePath } from '../lib/data'
import { useStore, addBrand, setBrandStatus, type NewBrandInput } from '../lib/store'
import { money, int, pct, cx } from '../lib/format'

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'neutral' }> = {
  live: { label: '在投', tone: 'good' },
  review: { label: '审核中', tone: 'warn' },
  paused: { label: '已暂停', tone: 'neutral' },
}
const PATH_TONE: Record<SettlePath, 'good' | 'info' | 'violet'> = { direct: 'good', licensed: 'info', mixed: 'violet' }

const blankForm: NewBrandInput = {
  name: '', mark: '', category: '工具 / 知识', path: 'direct', feeRate: 42, period: 7, reservePct: 8,
  planName: '', firstPrice: 19.9, renewPrice: 39.9, channel: 'wechat',
}

export default function Brands() {
  const nav = useNavigate()
  const toast = useToast()
  const { brands } = useStore()
  const [f, setF] = useState<'all' | 'live' | 'review'>('all')
  const [wizard, setWizard] = useState(false)

  const liveGmv = brands.filter((b) => b.status === 'live').reduce((s, b) => s + b.gmvMtd, 0)
  const totalSubs = brands.reduce((s, b) => s + b.activeSubs, 0)
  const list = brands.filter((b) => (f === 'all' ? true : b.status === f))

  return (
    <>
      <PageHeader
        title="品牌管理"
        desc="配置驱动接入：费率 / 套餐 / 支付通道 / 商户号 / 风控阈值 / 结算规则全部参数化。新品牌接入 = 填配置 + 接回传，不改代码。"
        actions={
          <>
            <Button variant="ghost" onClick={() => toast({ tone: 'info', text: '接入字段模板：费率/套餐/通道/商户号/阈值/回传（配置驱动）' })}><Settings2 size={14} /> 接入字段模板</Button>
            <Button variant="primary" onClick={() => setWizard(true)}><Plus size={14} /> 邀请品牌入驻</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card mark><Stat label="在投品牌" value={String(brands.filter((b) => b.status === 'live').length)} sub={<span>审核中 {brands.filter((b) => b.status === 'review').length} · 暂停 {brands.filter((b) => b.status === 'paused').length}</span>} /></Card>
        <Card mark><Stat label="在投品牌 GMV" value={money(liveGmv)} sub={<span>本月累计</span>} /></Card>
        <Card mark><Stat label="活跃订阅总数" value={int(totalSubs)} sub={<span>连续包月口径</span>} /></Card>
        <Card mark><Stat label="平均续费率" value={pct(63.8)} deltaTone="good" sub={<span>北极星核心驱动</span>} /></Card>
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <h3 className="text-[14px] font-semibold text-ink">品牌列表</h3>
          <Segmented value={f} onChange={setF} options={[{ value: 'all', label: '全部' }, { value: 'live', label: '在投' }, { value: 'review', label: '审核中' }]} />
        </div>
        <TableShell
          className="px-2 pb-2"
          head={<><Th className="pl-3">品牌</Th><Th>品类</Th><Th>资金路径</Th><Th right>费率</Th><Th right>账期</Th><Th>投诉率 / 阈值</Th><Th right>本月 GMV</Th><Th right>续费率</Th><Th right>状态</Th><Th right>操作</Th></>}
        >
          {list.map((b) => {
            const overThresh = b.complaintRate >= b.thresholds.complaint
            return (
              <Row key={b.id}>
                <Td className="pl-3">
                  <button onClick={() => nav(`/brands/${b.id}`)} className="flex items-center gap-2.5 text-left">
                    <BrandMark mark={b.mark} size={30} />
                    <div><div className="text-[13px] font-medium text-ink hover:text-brand">{b.name}</div><div className="text-[11px] text-ink-4">{b.plans.length} 个套餐 · {b.channels.length} 条通道</div></div>
                  </button>
                </Td>
                <Td><span className="text-[12px]">{b.category}</span></Td>
                <Td><Badge tone={PATH_TONE[b.path]}>{SETTLE_PATH_LABEL[b.path]}</Badge></Td>
                <Td right mono className="font-medium text-ink">{b.feeRate}%</Td>
                <Td right mono>T+{b.period}</Td>
                <Td>
                  {b.status === 'review' ? <span className="text-[12px] text-ink-4">待开量</span> : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (b.complaintRate / b.thresholds.complaint) * 100)}%`, background: overThresh ? 'var(--color-alert)' : b.complaintRate >= b.thresholds.complaint * 0.6 ? 'var(--color-warn)' : 'var(--color-good)' }} /></div>
                      <span className={cx('tnum text-[11.5px]', overThresh ? 'text-alert-ink' : 'text-ink-3')}>{pct(b.complaintRate)}</span>
                    </div>
                  )}
                </Td>
                <Td right mono className="font-medium text-ink">{b.gmvMtd > 0 ? money(b.gmvMtd) : '—'}</Td>
                <Td right mono>{b.renewalRate > 0 ? pct(b.renewalRate) : '—'}</Td>
                <Td right><Badge tone={STATUS[b.status].tone} dot>{STATUS[b.status].label}</Badge></Td>
                <Td right>
                  {b.status === 'review' ? (
                    <button onClick={() => { setBrandStatus(b.id, 'live', '审核通过，已上架'); toast({ tone: 'good', text: `${b.name} 审核通过` }) }} className="rounded-md px-2 py-1 text-[12px] font-medium text-good-ink hover:bg-good-soft">通过</button>
                  ) : b.status === 'live' ? (
                    <button onClick={() => { setBrandStatus(b.id, 'paused', '已暂停投放'); toast({ tone: 'warn', text: `${b.name} 已暂停` }) }} className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-3 hover:bg-surface-sunken">暂停</button>
                  ) : (
                    <button onClick={() => { setBrandStatus(b.id, 'live', '已恢复在投'); toast({ tone: 'good', text: `${b.name} 已恢复` }) }} className="rounded-md px-2 py-1 text-[12px] font-medium text-good-ink hover:bg-good-soft">恢复</button>
                  )}
                </Td>
                <Td right><ArrowRight size={14} className="text-ink-4" /></Td>
              </Row>
            )
          })}
        </TableShell>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {(['direct', 'licensed', 'mixed'] as SettlePath[]).map((p) => {
          const bs = brands.filter((b) => b.path === p)
          return (
            <Card key={p}>
              <div className="flex items-center justify-between"><Badge tone={PATH_TONE[p]}>{SETTLE_PATH_LABEL[p]}</Badge><span className="tnum text-[13px] font-medium text-ink">{bs.length} 个品牌</span></div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
                {p === 'direct' && '用户付款直达品牌商户号，资金不过平台账户，合规最干净。适合大品牌 / 强信任。'}
                {p === 'licensed' && '资金走持牌机构分账系统，平台仅下发分账指令。适合新品牌 / 需统一分账。'}
                {p === 'mixed' && '核心套餐直连、长尾走分账，系统同时支持两套清结算逻辑。'}
              </p>
              <div className="mt-3"><Meter value={(bs.length / brands.length) * 100} tone={PATH_TONE[p]} /></div>
            </Card>
          )
        })}
      </div>

      {wizard && <OnboardWizard onClose={() => setWizard(false)} onDone={(name) => { setWizard(false); toast({ tone: 'good', text: `${name} 已提交入驻，进入审核` }) }} />}
    </>
  )
}

function OnboardWizard({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<NewBrandInput>({ ...blankForm })
  const set = <K extends keyof NewBrandInput>(k: K, v: NewBrandInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const steps = ['主体与品类', '套餐与定价', '费率 / 通道 / 阈值']
  const canNext = step === 0 ? form.name.trim().length > 0 : step === 1 ? form.planName.trim().length > 0 : true
  const submit = () => { addBrand(form); onDone(form.name) }
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title="邀请品牌入驻 · 配置驱动"
      footer={
        <>
          {step > 0 && <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>上一步</Button>}
          {step < 2 ? (
            <button disabled={!canNext} onClick={() => setStep((s) => s + 1)} className={cx('rounded-lg px-3 py-1.5 text-[13px] font-medium text-white', canNext ? 'bg-brand hover:bg-brand-hover' : 'cursor-not-allowed bg-ink-4')}>下一步</button>
          ) : (
            <button onClick={submit} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">提交审核</button>
          )}
        </>
      }
    >
      <div className="mb-5"><Steps steps={steps} current={step} /></div>
      {step === 0 && (
        <div className="space-y-3.5">
          <Field label="品牌名称" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="如：网易云音乐 黑胶 VIP" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="品牌简称(标记)" hint="1 字"><Input value={form.mark} onChange={(e) => set('mark', e.target.value.slice(0, 1))} placeholder="网" /></Field>
            <Field label="品类"><Select value={form.category} onChange={(e) => set('category', e.target.value)}><option>工具 / 知识</option><option>音视频 / 泛娱乐</option><option>生活服务 / 电商</option></Select></Field>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3.5">
          <Field label="套餐名称" required><Input value={form.planName} onChange={(e) => set('planName', e.target.value)} placeholder="如：黑胶 VIP 连续包月" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="首期价 ¥"><Input type="number" value={form.firstPrice} onChange={(e) => set('firstPrice', +e.target.value)} /></Field>
            <Field label="续期价 ¥"><Input type="number" value={form.renewPrice} onChange={(e) => set('renewPrice', +e.target.value)} /></Field>
          </div>
          <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] text-ink-3">连续包月：首期价引流、续期价为正价；落地页须含自动续费告知与退订入口。</div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="资金路径"><Select value={form.path} onChange={(e) => set('path', e.target.value as SettlePath)}><option value="direct">直连</option><option value="licensed">持牌分账</option><option value="mixed">混合</option></Select></Field>
            <Field label="支付通道"><Select value={form.channel} onChange={(e) => set('channel', e.target.value as NewBrandInput['channel'])}><option value="wechat">微信支付</option><option value="alipay">支付宝</option><option value="bank">银行分账</option></Select></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="费率 %" hint="平台+代理"><Input type="number" value={form.feeRate} onChange={(e) => set('feeRate', +e.target.value)} /></Field>
            <Field label="账期 T+"><Input type="number" value={form.period} onChange={(e) => set('period', +e.target.value)} /></Field>
            <Field label="准备金 %"><Input type="number" value={form.reservePct} onChange={(e) => set('reservePct', +e.target.value)} /></Field>
          </div>
          <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">风控阈值默认采用支付平台口径：投诉率&lt;1% · 升级投诉&lt;0.1% · 72h 完结率≥95%，提交后可在品牌详情覆盖。</div>
        </div>
      )}
    </Modal>
  )
}

import { useState } from 'react'
import { Download, FileSignature } from 'lucide-react'
import {
  Card,
  CardTitle,
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
import { useToast } from '../components/ui/overlays'
import { DetailPopover, Info, useAnchoredPopover, type AnchorRect } from '../components/ui/popover'
import {
  brandById,
  agentById,
  SETTLE_MODEL_LABEL,
  CONTRACT_STATUS,
  COMPLAINT_LIABILITY_LABEL,
  type GrowthContract,
  type SettleModel,
} from '../lib/data'
import { Field, Input, Select, CheckGroup } from '../components/ui/forms'
import { Wizard } from '../components/ui/Wizard'
import { useStore } from '../lib/store'
import { useApi, bizApi } from '../lib/adminApi'
import { money, pct, cx } from '../lib/format'

export default function Contracts() {
  const toast = useToast()
  const { brands } = useStore()
  // 单源：增长合约从真实后端读（Prisma），不再用前端 mock store
  const contractsApi = useApi(() => bizApi.contracts<GrowthContract[]>(), [])
  const contracts = contractsApi.data ?? []
  const [f, setF] = useState<'all' | SettleModel>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const pop = useAnchoredPopover()
  const [wizard, setWizard] = useState(false)
  const list = contracts.filter((c) => (f === 'all' ? true : c.settleModel === f))
  const active = contracts.find((c) => c.id === openId) ?? null

  const total = contracts.length
  const liveCount = contracts.filter((c) => c.status === 'active' || c.status === 'fulfilling').length
  const targetSum = contracts.reduce((s, c) => s + c.targetGmv, 0)
  const achievedSum = contracts.reduce((s, c) => s + c.achievedGmv, 0)
  const fulfillRate = targetSum ? (achievedSum / targetSum) * 100 : 0
  const openQuota = contracts.filter((c) => c.status === 'open' || c.status === 'fulfilling').reduce((s, c) => s + Math.max(0, c.targetGmv - c.achievedGmv), 0)

  return (
    <>
      <PageHeader
        title="增长合约"
        desc="品牌发单、渠道接单：把商品 / 渠道 / 对价 / 投诉责任 / 准备金 / 违约都写清楚。先做可信合约，不做开放市场。"
        actions={
          <>
            <Segmented
              value={f}
              onChange={setF}
              options={[
                { value: 'all', label: '全部' },
                { value: 'cps_share', label: 'CPS 分成' },
                { value: 'floor_tiered', label: '保底+阶梯' },
                { value: 'mutual_quota', label: '互销额度' },
              ]}
            />
            <Button variant="primary" onClick={() => setWizard(true)}><FileSignature size={14} /> 发起增长合约</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card mark><Stat label="合约总数" value={String(total)} sub={<span>执行中 {liveCount}</span>} /></Card>
        <Card mark><Stat label="整体履约率" value={pct(fulfillRate)} deltaTone={fulfillRate >= 60 ? 'good' : 'warn'} sub={<span>已履约 ÷ 目标</span>} /></Card>
        <Card mark><Stat label="在途额度" value={money(openQuota)} sub={<span>挂单 + 履约中缺口</span>} /></Card>
        <Card mark><Stat label="三种交易模型" value="3" hint="CPS分成 / 保底+阶梯 / 互销额度" sub={<span>不开放自定对价</span>} /></Card>
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle title="合约列表" desc="品牌 ↔ 渠道 · 结算模型、履约进度、投诉责任" />
          <Button variant="ghost" onClick={() => { const csv = '﻿合约号,品牌,渠道,结算模型,LTV窗口,投诉责任,准备金%,目标,已履约,状态\n' + contracts.map((c) => [c.id, brandById(c.brandId)?.name, c.agentId ?? '挂单中', SETTLE_MODEL_LABEL[c.settleModel].label, c.ltvWindow, COMPLAINT_LIABILITY_LABEL[c.complaintLiability], c.reservePct, c.targetGmv, c.achievedGmv, CONTRACT_STATUS[c.status].label].join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '增长合约.csv'; a.click(); URL.revokeObjectURL(a.href); toast({ tone: 'good', text: '合约明细已导出 CSV' }) }}><Download size={14} /> 导出</Button>
        </div>
        <TableShell
          className="px-2 pb-2"
          head={
            <>
              <Th className="pl-3">合约号</Th>
              <Th>品牌 / 渠道</Th>
              <Th>结算模型</Th>
              <Th>LTV 窗口</Th>
              <Th>投诉责任</Th>
              <Th right>履约进度</Th>
              <Th right>状态</Th>
            </>
          }
        >
          {list.map((c) => {
            const b = brandById(c.brandId)
            const prog = c.targetGmv ? Math.min(100, (c.achievedGmv / c.targetGmv) * 100) : 0
            const st = CONTRACT_STATUS[c.status]
            return (
              <Row key={c.id} onClick={(e) => { setOpenId(c.id); pop.openAt(e) }}>
                <Td className="pl-3"><span className="tnum text-[12.5px] font-medium text-ink">{c.id}</span></Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <BrandMark brand={b.id} mark={b.mark} size={26} />
                    <div>
                      <div className="text-[12.5px] text-ink-2">{b.name}</div>
                      <div className="tnum text-[11px] text-ink-4">{c.agentId ?? '— 挂单中'}</div>
                    </div>
                  </div>
                </Td>
                <Td><span className="text-[12px]">{SETTLE_MODEL_LABEL[c.settleModel].label}</span></Td>
                <Td><span className="tnum text-[12px]">{c.ltvWindow}</span></Td>
                <Td><span className="text-[12px]">{COMPLAINT_LIABILITY_LABEL[c.complaintLiability]}</span></Td>
                <Td right>
                  <div className="ml-auto w-[120px]">
                    <div className="mb-1 flex items-center justify-between text-[11px]"><span className="tnum text-ink-3">{pct(prog)}</span><span className="text-ink-4">{money(c.achievedGmv)}</span></div>
                    <Meter value={prog} tone={c.status === 'breached' ? 'alert' : 'brand'} />
                  </div>
                </Td>
                <Td right><Badge tone={st.tone} dot={c.status === 'breached'}>{st.label}</Badge></Td>
              </Row>
            )
          })}
        </TableShell>
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12px] text-ink-3">
          <span>共 {list.length} 份合约</span>
          <span className="text-ink-4">合约只记条款，结算仍按既有清结算执行（条款接入结算为下一阶段）</span>
        </div>
      </Card>

      <ContractDrawer contract={active} anchor={pop.anchorRect} onClose={() => { setOpenId(null); pop.close() }} />
      {wizard && <ContractWizard brands={brands.filter((b) => b.status === 'live')} onClose={() => setWizard(false)} onDone={(n) => { toast({ tone: 'good', text: `增长合约已发起：${n}（挂单中）` }); contractsApi.reload() }} />}
    </>
  )
}

const REGIONS = ['华东', '华北', '华南', '华中', '西南', '东北', '西北']
const CROWDS = ['学生', '职场', '银发', '宝妈', '游戏', '泛娱乐']

function ContractWizard({ brands, onClose, onDone }: { brands: { id: string; name: string }[]; onClose: () => void; onDone: (name: string) => void }) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    brandId: brands[0]?.id ?? '', settleModel: 'cps_share' as SettleModel, ltvWindow: 'D30' as 'D30' | 'D60' | 'D90',
    complaintLiability: 'agent' as 'agent' | 'brand' | 'shared', reservePct: 10, targetGmv: 1000000,
    feePct: 42, agentSharePct: 30, floorAmount: 50000, quota: 1000000,
    crowdScope: 'all' as 'all' | 'new' | 'old', regions: [] as string[], crowds: [] as string[],
    releaseRule: 'standard', breachRule: 'reserve_forfeit',
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const steps = ['品牌 + 模型', '结算参数', '用户限定', '风控条款']
  const submit = async () => {
    setBusy(true)
    const settleParams =
      form.settleModel === 'cps_share' ? { feePct: form.feePct, agentSharePct: form.agentSharePct }
        : form.settleModel === 'floor_tiered' ? { floorAmount: form.floorAmount, agentSharePct: form.agentSharePct }
          : { quota: form.quota }
    const userLimit = { newOnly: form.crowdScope === 'new', oldOnly: form.crowdScope === 'old', regions: form.regions, crowd: form.crowds }
    try {
      await bizApi.addContract({
        brandId: form.brandId, settleModel: form.settleModel, ltvWindow: form.ltvWindow, targetGmv: form.targetGmv,
        settleParams, userLimit, complaintLiability: form.complaintLiability, reservePct: form.reservePct,
        reserveReleaseRule: { template: form.releaseRule }, breachRule: form.breachRule,
      })
      onClose(); onDone(brandById(form.brandId)?.name ?? form.brandId)
    } finally { setBusy(false) }
  }
  return (
    <Wizard open onClose={onClose} width={560} title="发起增长合约" steps={steps} current={step}
      onBack={() => setStep((s) => s - 1)} onNext={() => setStep((s) => s + 1)} onSubmit={submit}
      canNext={step !== 0 || !!form.brandId} submitting={busy} submitLabel="发起合约">
      {step === 0 && (
        <div className="space-y-3.5">
          <Field label="品牌（商品）"><Select value={form.brandId} onChange={(e) => set('brandId', e.target.value)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="结算模型"><Select value={form.settleModel} onChange={(e) => set('settleModel', e.target.value as SettleModel)}><option value="cps_share">CPS 分成</option><option value="floor_tiered">保底+阶梯</option><option value="mutual_quota">互销额度</option></Select></Field>
            <Field label="LTV 窗口"><Select value={form.ltvWindow} onChange={(e) => set('ltvWindow', e.target.value as 'D30' | 'D60' | 'D90')}><option>D30</option><option>D60</option><option>D90</option></Select></Field>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3.5">
          <Field label="目标 GMV ¥"><Input type="number" value={form.targetGmv} onChange={(e) => set('targetGmv', +e.target.value)} /></Field>
          {form.settleModel === 'cps_share' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="平台费率 %" hint="占可分配池"><Input type="number" value={form.feePct} onChange={(e) => set('feePct', +e.target.value)} /></Field>
              <Field label="代理分成 %" hint="占可分配池"><Input type="number" value={form.agentSharePct} onChange={(e) => set('agentSharePct', +e.target.value)} /></Field>
            </div>
          )}
          {form.settleModel === 'floor_tiered' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="保底额 ¥"><Input type="number" value={form.floorAmount} onChange={(e) => set('floorAmount', +e.target.value)} /></Field>
              <Field label="超额分成 %"><Input type="number" value={form.agentSharePct} onChange={(e) => set('agentSharePct', +e.target.value)} /></Field>
            </div>
          )}
          {form.settleModel === 'mutual_quota' && (
            <Field label="互销额度 ¥"><Input type="number" value={form.quota} onChange={(e) => set('quota', +e.target.value)} /></Field>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3.5">
          <Field label="客群范围"><Segmented value={form.crowdScope} onChange={(v) => set('crowdScope', v as 'all' | 'new' | 'old')} options={[{ value: 'all', label: '不限' }, { value: 'new', label: '仅新客' }, { value: 'old', label: '仅老客' }]} /></Field>
          <Field label="地域定向" hint="留空＝不限"><CheckGroup options={REGIONS} value={form.regions} onChange={(v) => set('regions', v)} /></Field>
          <Field label="人群定向" hint="留空＝不限"><CheckGroup options={CROWDS} value={form.crowds} onChange={(v) => set('crowds', v)} /></Field>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="准备金 %"><Input type="number" value={form.reservePct} onChange={(e) => set('reservePct', +e.target.value)} /></Field>
            <Field label="投诉责任"><Select value={form.complaintLiability} onChange={(e) => set('complaintLiability', e.target.value as 'agent' | 'brand' | 'shared')}><option value="agent">渠道承担</option><option value="brand">品牌承担</option><option value="shared">双方共担</option></Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="准备金释放计划"><Select value={form.releaseRule} onChange={(e) => set('releaseRule', e.target.value)}><option value="standard">标准（D7/D30/D60/D90）</option><option value="conservative">保守（重后置）</option><option value="fast">快速（重前置）</option></Select></Field>
            <Field label="违约处理"><Select value={form.breachRule} onChange={(e) => set('breachRule', e.target.value)}><option value="reserve_forfeit">没收准备金</option><option value="double_clawback">双倍追偿</option><option value="suspend">暂停合作</option></Select></Field>
          </div>
          <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">合约发起后为「挂单中」，等待渠道接单；本阶段合约登记条款，资金动作在清结算完成。</div>
        </div>
      )}
    </Wizard>
  )
}

function ContractDrawer({ contract, anchor, onClose }: { contract: GrowthContract | null; anchor: AnchorRect | null; onClose: () => void }) {
  if (!contract) return null
  const c = contract
  const b = brandById(c.brandId)
  const a = c.agentId ? agentById(c.agentId) : null
  const st = CONTRACT_STATUS[c.status]
  const sm = SETTLE_MODEL_LABEL[c.settleModel]
  const prog = c.targetGmv ? Math.min(100, (c.achievedGmv / c.targetGmv) * 100) : 0
  return (
    <DetailPopover
      anchor={anchor}
      onClose={onClose}
      width={400}
      title={<span className="tnum">{c.id}</span>}
      desc={<span>{b?.name} · {sm.label}</span>}
      footer={<Button variant="ghost" onClick={onClose}>关闭</Button>}
    >
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted p-3.5">
        <div>
          <div className="text-[12.5px] font-medium text-ink">{b?.name}</div>
          <div className="mt-0.5 text-[11px] text-ink-4">接单渠道：{a?.name ?? '— 挂单中，等待渠道接单'}</div>
        </div>
        <Badge tone={st.tone} dot={c.status === 'breached'}>{st.label}</Badge>
      </div>

      {/* 履约进度 */}
      <div className="mt-4 rounded-lg border border-line p-3.5">
        <div className="mb-1.5 flex items-center justify-between text-[12px]">
          <span className="text-ink-3">履约进度</span>
          <span className="tnum text-ink">{money(c.achievedGmv)} / {money(c.targetGmv)}（{pct(prog)}）</span>
        </div>
        <Meter value={prog} tone={c.status === 'breached' ? 'alert' : 'brand'} animate />
      </div>

      {/* PDF 7.1 合约字段表 */}
      <div className="mt-5">
        <div className="mb-2.5 flex items-center gap-2"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[13px] font-semibold">合约条款</span></div>
        <div className="grid grid-cols-2 gap-3 text-[12.5px]">
          <Info k="商品" v={b?.name ?? c.brandId} />
          <Info k="渠道" v={a?.name ?? '挂单中'} />
          <Info k="用户限制" v={c.userLimit} />
          <Info k="结算模型" v={<span>{sm.label}<span className="ml-1 text-[11px] text-ink-4">{sm.desc}</span></span>} />
          <Info k="LTV 窗口" v={c.ltvWindow} />
          <Info k="投诉责任" v={COMPLAINT_LIABILITY_LABEL[c.complaintLiability]} />
          <Info k="风险准备金" v={`扣 ${c.reservePct}% · 分期释放`} />
          <Info k="违约处理" v={c.breachNote} />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-line bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">
        <span className="font-medium text-ink-2">说明：</span>本阶段合约仅登记条款与履约进度，准备金分期释放、按合约口径冲账等资金动作在下一阶段接入（见风险清结算账本）。
      </div>
    </DetailPopover>
  )
}

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
import { DocModal } from '../components/ui/DocModal'
import { Steps, Field, Input, Select } from '../components/ui/forms'
import { SETTLE_PATH_LABEL, SETTLE_PATH_TONE as PATH_TONE, type SettlePath } from '../lib/data'
import { useStore, addBrand, setBrandStatus, type NewBrandInput } from '../lib/store'
import { money, int, pct, cx } from '../lib/format'
import { isRealApi } from '../lib/http'

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'neutral' }> = {
  live: { label: '在投', tone: 'good' },
  review: { label: '审核中', tone: 'warn' },
  paused: { label: '已暂停', tone: 'neutral' },
}

const blankForm: NewBrandInput = {
  name: '', mark: '', category: '工具 / 知识', path: 'direct', feeRate: 42, period: 7, reservePct: 8,
  planName: '', firstPrice: 19.9, renewPrice: 39.9, channel: 'wechat',
}

// 入驻业务种类：先选种类，再录入该种类对应的待审字段。
type BizType = 'cps' | 'growth' | 'barter' | 'aigc'
const BIZ_TYPES: { id: BizType; name: string; desc: string }[] = [
  { id: 'cps', name: 'CPS 投流', desc: '卖连续包月会员，代理投流分成' },
  { id: 'growth', name: '增长合约', desc: '品牌互销，按增长合约结算' },
  { id: 'barter', name: '资源置换', desc: '广告/会员资源等值置换' },
  { id: 'aigc', name: 'AIGC 素材', desc: '积分制生成投放素材' },
]
// 可选录入模块（用户可点选增减）：key→该模块的字段标签集，按业务种类提供不同候选。
const OPTIONAL_MODULES: Record<BizType, { id: string; label: string; fields: string[] }[]> = {
  cps: [
    { id: 'pool', label: '商户号绑定', fields: ['绑定商户号', '号池权重'] },
    { id: 'landing', label: '落地页合规', fields: ['落地页 URL', '自动续费告知截图'] },
    { id: 'threshold', label: '风控阈值覆盖', fields: ['投诉率阈值 %', '升级投诉阈值 %'] },
  ],
  growth: [
    { id: 'tier', label: '阶梯分成表', fields: ['保底额', '阶梯档位'] },
    { id: 'crowd', label: '人群限制', fields: ['新客/老客', '地域'] },
    { id: 'release', label: '准备金释放计划', fields: ['释放节奏', '冻结条件'] },
  ],
  barter: [
    { id: 'catalog', label: '资源目录', fields: ['资源类型', '可置换额度'] },
    { id: 'valuation', label: '估值凭证', fields: ['估值口径', '凭证链接'] },
  ],
  aigc: [
    { id: 'credits', label: '积分配额', fields: ['初始积分', '按量单价'] },
    { id: 'reflow', label: '转化回流', fields: ['接入 CPS 链路', '归因窗口'] },
  ],
}

export default function Brands() {
  const nav = useNavigate()
  const toast = useToast()
  const { brands } = useStore()
  const [f, setF] = useState<'all' | 'live' | 'review'>('all')
  const [wizard, setWizard] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)

  const liveGmv = brands.filter((b) => b.status === 'live').reduce((s, b) => s + b.gmvMtd, 0)
  const totalSubs = brands.reduce((s, b) => s + b.activeSubs, 0)
  const list = brands.filter((b) => (f === 'all' ? true : b.status === f))

  // 平均续费率：真实模式从 store 的 brands 按 gmvMtd 加权平均，无品牌（分母 0）→null 显示 '—'；演示模式保留标杆 63.8
  const gmvSum = brands.reduce((s, b) => s + b.gmvMtd, 0)
  const avgRenewal = isRealApi
    ? (gmvSum > 0 ? brands.reduce((s, b) => s + b.renewalRate * b.gmvMtd, 0) / gmvSum : null)
    : 63.8

  return (
    <>
      <PageHeader
        title="品牌 · 入驻"
        desc="配置驱动接入：费率 / 套餐 / 支付通道 / 商户号 / 风控阈值 / 结算规则全部参数化。新品牌接入 = 填配置 + 接回传，不改代码。"
        actions={
          <>
            <Button variant="ghost" onClick={() => setTplOpen(true)}><Settings2 size={14} /> 接入字段模板</Button>
            <Button variant="primary" onClick={() => setWizard(true)}><Plus size={14} /> 邀请品牌入驻</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card mark><Stat label="在投品牌" value={String(brands.filter((b) => b.status === 'live').length)} sub={<span>审核中 {brands.filter((b) => b.status === 'review').length} · 暂停 {brands.filter((b) => b.status === 'paused').length}</span>} /></Card>
        <Card mark><Stat label="在投品牌基础流水" value={money(liveGmv)} sub={<span>本月累计</span>} /></Card>
        <Card mark><Stat label="活跃订阅总数" value={int(totalSubs)} sub={<span>连续包月口径</span>} /></Card>
        <Card mark><Stat label="平均续费率" value={avgRenewal === null ? <span className="text-ink-4">—</span> : pct(avgRenewal)} deltaTone="good" sub={<span>北极星核心驱动</span>} /></Card>
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <h3 className="text-[14px] font-semibold text-ink">品牌列表</h3>
          <Segmented value={f} onChange={setF} options={[{ value: 'all', label: '全部' }, { value: 'live', label: '在投' }, { value: 'review', label: '审核中' }]} />
        </div>
        <TableShell
          className="px-2 pb-2"
          head={<><Th className="pl-3">品牌</Th><Th>品类</Th><Th>资金路径</Th><Th right>费率</Th><Th right>账期</Th><Th>投诉率 / 阈值</Th><Th right>本月基础流水</Th><Th right>续费率</Th><Th right>状态</Th><Th right>操作</Th></>}
        >
          {list.map((b) => {
            const overThresh = b.complaintRate >= b.thresholds.complaint
            return (
              <Row key={b.id}>
                <Td className="pl-3">
                  <button onClick={() => nav(`/brands/${b.id}`)} className="flex items-center gap-2.5 text-left">
                    <BrandMark brand={b.id} mark={b.mark} size={30} />
                    <div><div className="text-[13px] font-medium text-ink transition-colors hover:text-brand">{b.name}</div><div className="text-[11px] text-ink-4">{b.plans.length} 个套餐 · {b.channels.length} 条通道</div></div>
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

      {wizard && <OnboardWizard onClose={() => setWizard(false)} onDone={(name, biz) => { setWizard(false); const bn = BIZ_TYPES.find((t) => t.id === biz)?.name ?? ''; toast({ tone: 'good', text: `${name}（${bn}）已提交入驻，进入审核 · 下一步：到成员页为品牌开通门户账号` }) }} />}
      <DocModal
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        title="接入字段模板"
        intro="配置驱动接入：新品牌 = 填配置 + 接回传，不改代码。下列为各业务种类的待审字段清单。"
        sections={[
          { heading: '主体（公共）', bullets: ['品牌名称（必填）', '品牌简称 / 标记（1 字）', '品类'] },
          { heading: 'CPS 投流', bullets: ['套餐名称 / 首期价 / 续期价', '费率 % / 账期 T+ / 准备金 %', '资金路径 / 支付通道 / 商户号', '风控阈值（投诉率/升级投诉/72h 完结）', '订单回传对接'] },
          { heading: '增长合约', bullets: ['结算模型（CPS分成/保底+阶梯/互销额度）', 'LTV 窗口 / 投诉责任 / 违约处理'] },
          { heading: '资源置换', bullets: ['资源类型 / 可置换额度', '估值口径 / 估值凭证 / 开票方式'] },
          { heading: 'AIGC 素材', bullets: ['可生成类型 / 初始积分配额', '是否接入 CPS 回流 / 归因窗口'] },
        ]}
        downloadName="接入字段模板.txt"
      />
    </>
  )
}

function OnboardWizard({ onClose, onDone }: { onClose: () => void; onDone: (name: string, biz: BizType) => void }) {
  const [step, setStep] = useState(0)
  const [biz, setBiz] = useState<BizType | null>(null)
  const [form, setForm] = useState<NewBrandInput>({ ...blankForm })
  const [modules, setModules] = useState<string[]>([]) // 已点选的可选录入模块 id
  const [agreed, setAgreed] = useState(false) // 最后一步须勾选同意平台服务协议方可提交
  const set = <K extends keyof NewBrandInput>(k: K, v: NewBrandInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const toggleModule = (id: string) => setModules((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))

  // 步骤：选业务种类 → 主体 → 该种类专属配置
  const steps = ['业务种类', '品牌主体', biz === 'cps' ? '投流配置' : biz === 'growth' ? '合约条款' : biz === 'barter' ? '资源与估值' : '素材配置']
  const canNext = step === 0 ? biz !== null : step === 1 ? form.name.trim().length > 0 : true
  const isCps = biz === 'cps'
  const submit = () => {
    // CPS 走完整 addBrand；其它种类也建一条待审品牌记录（便于在列表出现），用默认资金参数
    addBrand(form)
    onDone(form.name, biz ?? 'cps')
  }
  const optMods = biz ? OPTIONAL_MODULES[biz] : []

  return (
    <Modal
      open
      onClose={onClose}
      width={580}
      title="邀请品牌入驻 · 按业务种类配置"
      footer={
        <>
          {step > 0 && <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>上一步</Button>}
          {step < 2 ? (
            <button disabled={!canNext} onClick={() => setStep((s) => s + 1)} className={cx('rounded-lg px-3 py-1.5 text-[13px] font-medium text-white', canNext ? 'bg-brand hover:bg-brand-hover' : 'cursor-not-allowed bg-ink-4')}>下一步</button>
          ) : (
            <button disabled={!agreed} onClick={submit} className={cx('rounded-lg px-3 py-1.5 text-[13px] font-medium text-white', agreed ? 'bg-brand hover:bg-brand-hover' : 'cursor-not-allowed bg-ink-4')}>提交审核</button>
          )}
        </>
      }
    >
      <div className="mb-5"><Steps steps={steps} current={step} /></div>

      {/* 步骤 0：选业务种类 */}
      {step === 0 && (
        <div className="space-y-2.5">
          <div className="text-[12.5px] text-ink-3">这个品牌入驻来做哪类业务？不同业务录入的待审信息不同。</div>
          <div className="grid grid-cols-2 gap-2.5">
            {BIZ_TYPES.map((t) => (
              <button key={t.id} onClick={() => setBiz(t.id)} className={cx('rounded-xl border p-3 text-left transition-colors', biz === t.id ? 'border-brand bg-brand/[0.05] shadow-[inset_0_0_0_1px_rgba(245,51,59,0.3)]' : 'border-line hover:bg-surface-muted')}>
                <div className={cx('text-[13px] font-semibold', biz === t.id ? 'text-brand' : 'text-ink')}>{t.name}</div>
                <div className="mt-1 text-[11px] leading-snug text-ink-4">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 步骤 1：品牌主体（公共） */}
      {step === 1 && (
        <div className="space-y-3.5">
          <Field label="品牌名称" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="如：网易云音乐 黑胶 VIP" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="品牌简称(标记)" hint="1 字"><Input value={form.mark} onChange={(e) => set('mark', e.target.value.slice(0, 1))} placeholder="网" /></Field>
            <Field label="品类"><Select value={form.category} onChange={(e) => set('category', e.target.value)}><option>工具 / 知识</option><option>音视频 / 泛娱乐</option><option>生活服务 / 电商</option></Select></Field>
          </div>
        </div>
      )}

      {/* 步骤 2：按业务种类的专属配置 + 可点选增加录入模块 */}
      {step === 2 && (
        <div className="space-y-3.5">
          {isCps && (
            <>
              <Field label="套餐名称"><Input value={form.planName} onChange={(e) => set('planName', e.target.value)} placeholder="如：黑胶 VIP 连续包月" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="首期价 ¥"><Input type="number" value={form.firstPrice} onChange={(e) => set('firstPrice', +e.target.value)} /></Field>
                <Field label="续期价 ¥"><Input type="number" value={form.renewPrice} onChange={(e) => set('renewPrice', +e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="费率 %" hint="平台+代理"><Input type="number" value={form.feeRate} onChange={(e) => set('feeRate', +e.target.value)} /></Field>
                <Field label="账期 T+"><Input type="number" value={form.period} onChange={(e) => set('period', +e.target.value)} /></Field>
                <Field label="准备金 %"><Input type="number" value={form.reservePct} onChange={(e) => set('reservePct', +e.target.value)} /></Field>
              </div>
            </>
          )}
          {biz === 'growth' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="结算模型"><Select defaultValue="cps_share"><option value="cps_share">CPS 分成</option><option value="floor_tiered">保底+阶梯</option><option value="mutual_quota">互销额度</option></Select></Field>
              <Field label="LTV 窗口"><Select defaultValue="D30"><option>D30</option><option>D60</option><option>D90</option></Select></Field>
              <Field label="投诉责任"><Select defaultValue="agent"><option value="agent">渠道承担</option><option value="brand">品牌承担</option><option value="shared">双方共担</option></Select></Field>
              <Field label="准备金 %"><Input type="number" value={form.reservePct} onChange={(e) => set('reservePct', +e.target.value)} /></Field>
            </div>
          )}
          {biz === 'barter' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="可置换资源"><Select defaultValue="ad"><option value="ad">广告位</option><option value="member">会员权益</option><option value="push">Push 推送</option></Select></Field>
              <Field label="估值口径"><Input placeholder="如：刊例价 × 0.6 折" /></Field>
              <Field label="可置换额度 ¥"><Input type="number" placeholder="1000000" /></Field>
              <Field label="开票方式"><Select defaultValue="both"><option value="both">双向开票</option><option value="one">单向</option></Select></Field>
            </div>
          )}
          {biz === 'aigc' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="可生成类型"><Select defaultValue="image"><option value="image">图片</option><option value="video">短视频</option><option value="copy">文案</option></Select></Field>
              <Field label="初始积分配额"><Input type="number" placeholder="10000" /></Field>
              <Field label="接入 CPS 回流"><Select defaultValue="yes"><option value="yes">是</option><option value="no">否</option></Select></Field>
              <Field label="归因窗口"><Select defaultValue="D30"><option>D30</option><option>D60</option></Select></Field>
            </div>
          )}
          {!isCps && (
            <div className="rounded-lg border border-dashed border-warn/30 bg-warn-soft/30 p-2.5 text-[11px] leading-relaxed text-warn-ink">
              以上 {biz === 'growth' ? '增长合约' : biz === 'barter' ? '资源置换' : '素材'} 专属参数为接入预览，本向导仅创建品牌主体；该业务的条款与资金配置请在对应板块录入。
            </div>
          )}

          {/* 可点选增加录入模块 */}
          <div className="rounded-lg border border-line p-3">
            <div className="mb-2 text-[11.5px] font-medium text-ink-2">按需添加录入模块</div>
            <div className="flex flex-wrap gap-2">
              {optMods.map((m) => {
                const on = modules.includes(m.id)
                return (
                  <button key={m.id} onClick={() => toggleModule(m.id)} className={cx('rounded-full border px-2.5 py-1 text-[11.5px] transition-colors', on ? 'border-brand bg-brand/[0.06] text-brand' : 'border-line text-ink-3 hover:bg-surface-muted')}>
                    {on ? '− ' : '+ '}{m.label}
                  </button>
                )
              })}
            </div>
            {modules.length > 0 && (
              <div className="mt-3 space-y-3 border-t border-line pt-3">
                {optMods.filter((m) => modules.includes(m.id)).map((m) => (
                  <div key={m.id}>
                    <div className="mb-1.5 text-[11.5px] font-medium text-ink-2">{m.label}</div>
                    <div className="grid grid-cols-2 gap-3">
                      {m.fields.map((f) => (
                        <Field key={f} label={f}><Input placeholder={f} /></Field>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">
            {isCps ? '风控阈值默认：投诉率<1%，升级投诉<0.1% · 72h 完结率≥95%，提交后可在详情覆盖。' : '该业务种类的资料提交后进入待审；合约/置换/素材的资金动作在对应板块完成。'}
          </div>

          {/* 提交前须同意平台服务协议：未勾选不可提交 */}
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-[12px] leading-relaxed text-ink-3">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-brand" />
            <span>我已阅读并同意<a href="#/legal/terms" target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">《平台服务协议》</a>与<a href="#/legal/privacy" target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">《隐私政策》</a>，确认所填入驻资料真实有效。</span>
          </label>
        </div>
      )}
    </Modal>
  )
}

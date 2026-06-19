import { useState } from 'react'
import { Zap, ShieldAlert, Activity, Layers, ArrowRight } from 'lucide-react'
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
  ThresholdBar,
  TONE,
} from '../components/ui/primitives'
import { Meter } from '../components/ui/charts'
import { Drawer, Modal, useToast } from '../components/ui/overlays'
import { Timeline, Field, Select, Input } from '../components/ui/forms'
import {
  brandById,
  MERCHANT_STATE,
  MERCHANT_THRESHOLD,
  CHANNEL_LABEL,
  type MerchantState,
  type MerchantAccount,
} from '../lib/data'
import { useStore, setMerchantState, addMerchant } from '../lib/store'
import { money, int, pct, cx } from '../lib/format'

const STATES: { key: MerchantState; desc: string }[] = [
  { key: 'healthy', desc: '7天投诉率<1% · 升级<0.1%' },
  { key: 'watch', desc: '升级0.05–0.1% 或 72h完结90–95%' },
  { key: 'throttled', desc: '首次管控7天 · 老订单照常续费' },
  { key: 'paused', desc: '二次管控21天 · 不可新签' },
  { key: 'fused', desc: '三次/严重 · 全量交易暂停' },
]

export default function Merchants() {
  const { merchants, brands } = useStore()
  const toast = useToast()
  const [filter, setFilter] = useState<'all' | 'risk'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [nf, setNf] = useState({ brandId: brands[0].id, channel: 'wechat' as 'wechat' | 'alipay' | 'bank', weight: 30 })
  const activeM = merchants.find((m) => m.id === openId) ?? null
  const counts = {
    healthy: merchants.filter((m) => m.state === 'healthy').length,
    watch: merchants.filter((m) => m.state === 'watch').length,
    suspend: merchants.filter((m) => m.state === 'throttled' || m.state === 'paused').length,
    halt: merchants.filter((m) => m.state === 'fused').length,
  }
  const totalGmv = merchants.reduce((s, m) => s + m.gmvMtd, 0)
  const totalTx = merchants.reduce((s, m) => s + m.txCount, 0)
  const avgClose = merchants.reduce((s, m) => s + m.close72h, 0) / (merchants.length || 1)

  const brandsWithPools = brands.filter((b) => merchants.some((m) => m.brandId === b.id))

  return (
    <>
      <PageHeader
        title="商户号 · 号池"
        desc="号池按品牌严格隔离 · 投诉率/升级投诉率逼近阈值自动降权与熔断 · 健康度反向控制投放。"
        actions={
          <>
            <Button variant="ghost" onClick={() => toast({ tone: 'info', text: '路由日志：按健康度加权分配进单，详见每笔分配明细' })}>
              <Activity size={14} /> 路由日志
            </Button>
            <Button variant="primary" onClick={() => setNewOpen(true)}>新增商户号</Button>
          </>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <Stat label="健康号 / 总数" value={`${counts.healthy}`} unit={`/ ${merchants.length}`} sub={<span>整改警告 {counts.watch}</span>}>
            <Meter value={(counts.healthy / (merchants.length || 1)) * 100} tone="good" />
          </Stat>
        </Card>
        <Card>
          <Stat label="暂停新签 / 暂停交易" value={`${counts.suspend} / ${counts.halt}`} sub={<span className="text-alert-ink">已触发支付平台管控</span>} />
        </Card>
        <Card>
          <Stat label="平均 72h 投诉完结率" value={pct(avgClose, 1)} hint="90–95% 整改警告，<90% 暂停新签" sub={<span>达标线 ≥ 95%</span>}>
            <Meter value={avgClose} tone={avgClose >= 95 ? 'good' : 'warn'} />
          </Stat>
        </Card>
        <Card>
          <Stat label="号池本月交易" value={money(totalGmv)} sub={<span>{int(totalTx)} 笔 · 决定新签承接基数</span>} />
        </Card>
      </div>

      {/* 状态机 */}
      <Card className="mt-4">
        <CardTitle
          title="商户号健康状态机"
          desc="支付平台管控口径 · 投诉率<1%（近7天累计）· 升级投诉<0.1% · 72h 完结率≥95%"
        />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          {STATES.map((s, i) => {
            const st = MERCHANT_STATE[s.key]
            const n = merchants.filter((m) => m.state === s.key).length
            return (
              <div key={s.key} className="flex flex-1 items-center gap-2">
                <div className={cx('flex-1 rounded-xl border p-3.5', st.tone === 'good' ? 'border-good/30' : st.tone === 'warn' ? 'border-warn/30' : st.tone === 'alert' ? 'border-alert/30' : 'border-line', st.tone !== 'neutral' && TONE[st.tone].soft)}>
                  <div className="flex items-center justify-between">
                    <span className={cx('text-[13px] font-semibold', TONE[st.tone].ink)}>{st.label}</span>
                    <span className={cx('tnum text-[15px] font-semibold', TONE[st.tone].ink)}>{n}</span>
                  </div>
                  <p className={cx('mt-1 text-[11.5px] leading-snug', TONE[st.tone].ink, 'opacity-80')}>{s.desc}</p>
                </div>
                {i < STATES.length - 1 && <ArrowRight size={16} className="hidden shrink-0 text-ink-4 lg:block" />}
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-surface-muted p-3 text-[12.5px] leading-relaxed text-ink-3">
          <Zap size={15} className="mt-0.5 shrink-0 text-warn-ink" />
          <span>
            <span className="font-medium text-ink-2">投放联动与管控升级：</span>
            逼近红线时平台先内部降低进单权重并收紧投放（早于支付平台管控）。一旦被支付平台暂停新签：首次 7 天、二次 21 天、三次有暂停交易风险——其中「暂停新签」仅限制新订单，老订单续费照常。把投诉率作为投放的第二目标函数（第一为 ROI / LTV）。
          </span>
        </div>
      </Card>

      {/* 智能路由 + 号池隔离 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle title="智能进单路由" desc="实时按健康度分配权重" right={<Badge tone="good" dot>运行中</Badge>} />
          <div className="space-y-3">
            {merchants
              .filter((m) => m.brandId === 'youdao')
              .map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="tnum w-16 shrink-0 text-[12px] font-medium text-ink">{m.id}</span>
                  <div className="flex-1">
                    <Meter value={m.weight} tone={MERCHANT_STATE[m.state].tone === 'neutral' ? 'neutral' : MERCHANT_STATE[m.state].tone} />
                  </div>
                  <span className="tnum w-10 shrink-0 text-right text-[12px] text-ink-3">{m.weight}%</span>
                </div>
              ))}
          </div>
          <p className="mt-3 text-[11.5px] text-ink-4">示例：网易有道号池。健康号承接主流量，预警号自动降权，熔断号权重归零。</p>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle
            title="号池隔离视图"
            desc="一个品牌的违规不污染其它品牌的商户号"
            right={<Layers size={15} className="text-ink-3" />}
          />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {brandsWithPools.map((b) => {
              const pool = merchants.filter((m) => m.brandId === b.id)
              const worst = Math.max(...pool.map((m) => MERCHANT_STATE[m.state].step))
              const worstState = (Object.keys(MERCHANT_STATE) as MerchantState[]).find((k) => MERCHANT_STATE[k].step === worst)!
              const tone = MERCHANT_STATE[worstState].tone
              return (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <BrandMark mark={b.mark} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium text-ink">{b.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {pool.map((m) => (
                        <span
                          key={m.id}
                          title={`${m.id} · ${MERCHANT_STATE[m.state].label}`}
                          className="h-1.5 flex-1 rounded-full"
                          style={{ background: `var(--color-${MERCHANT_STATE[m.state].tone === 'neutral' ? 'ink-4' : MERCHANT_STATE[m.state].tone})` }}
                        />
                      ))}
                    </div>
                  </div>
                  <Badge tone={tone}>{pool.length} 号</Badge>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* 明细表 */}
      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle title="商户号明细" desc="投诉率 / 升级投诉率 / 拒付率 对照品牌阈值" />
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: '全部' },
              { value: 'risk', label: '仅风险号' },
            ]}
          />
        </div>
        <TableShell
          className="px-2 pb-2"
          head={
            <>
              <Th className="pl-3">商户号 / 品牌</Th>
              <Th>通道</Th>
              <Th>状态</Th>
              <Th className="w-44">投诉率 vs 红线(1%)</Th>
              <Th right>升级投诉</Th>
              <Th right>72h完结</Th>
              <Th right>拒付率</Th>
              <Th right>限额占用</Th>
              <Th right>本月交易额</Th>
              <Th right>权重</Th>
              <Th right>人工干预</Th>
            </>
          }
        >
          {merchants
            .filter((m) => (filter === 'all' ? true : m.state !== 'healthy'))
            .map((m) => {
              const b = brandById(m.brandId)!
              const st = MERCHANT_STATE[m.state]
              return (
                <Row key={m.id}>
                  <Td className="pl-3">
                    <button onClick={() => setOpenId(m.id)} className="flex items-center gap-2.5 text-left">
                      <BrandMark mark={b.mark} size={26} />
                      <div>
                        <div className="text-[12.5px] font-medium text-ink transition-colors hover:text-brand">{m.id}</div>
                        <div className="text-[11px] text-ink-4">{m.mid}</div>
                      </div>
                    </button>
                  </Td>
                  <Td>{CHANNEL_LABEL[m.channel]}</Td>
                  <Td><Badge tone={st.tone} dot>{st.label}</Badge></Td>
                  <Td>
                    <ThresholdBar value={m.complaintRate} warn={MERCHANT_THRESHOLD.complaintWarn} limit={MERCHANT_THRESHOLD.complaint} />
                  </Td>
                  <Td right mono>
                    <span className={m.escalatedRate >= MERCHANT_THRESHOLD.escalated ? 'text-alert-ink' : m.escalatedRate >= MERCHANT_THRESHOLD.escalatedWarn ? 'text-warn-ink' : ''}>{pct(m.escalatedRate, 2)}</span>
                  </Td>
                  <Td right mono>
                    <span className={m.close72h < MERCHANT_THRESHOLD.close72hWarn ? 'text-alert-ink' : m.close72h < MERCHANT_THRESHOLD.close72h ? 'text-warn-ink' : 'text-ink-2'}>{pct(m.close72h, 0)}</span>
                  </Td>
                  <Td right mono>{pct(m.chargebackRate, 2)}</Td>
                  <Td right mono>
                    <span className={m.limitUsedPct >= 70 ? 'text-warn-ink' : 'text-ink-3'}>{m.limitUsedPct}%</span>
                  </Td>
                  <Td right mono className="font-medium text-ink">{money(m.gmvMtd)}</Td>
                  <Td right mono>
                    <span className={m.weight === 0 ? 'text-alert-ink' : 'text-ink'}>{m.weight}</span>
                  </Td>
                  <Td right>
                    {m.state === 'fused' ? (
                      <button onClick={() => { setMerchantState(m.id, 'healthy', '健康'); toast({ tone: 'good', text: `${m.id} 已恢复进单` }) }} className="rounded-md px-2 py-1 text-[12px] font-medium text-good-ink hover:bg-good-soft">恢复</button>
                    ) : (
                      <button onClick={() => { setMerchantState(m.id, 'fused', '暂停交易'); toast({ tone: 'alert', text: `${m.id} 已熔断下线` }) }} className="rounded-md px-2 py-1 text-[12px] font-medium text-alert-ink hover:bg-alert-soft">熔断</button>
                    )}
                  </Td>
                </Row>
              )
            })}
        </TableShell>
      </Card>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface p-4 text-[12.5px] leading-relaxed text-ink-3">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-ink-3" />
        <span>
          <span className="font-medium text-ink-2">合规主体：</span>
          商户号原则上由品牌方提供并承担主体责任（直连模式天然如此）。平台不大量自持商户号「借通道」给品牌——既规避二清，也规避合规主体责任风险。每个品牌建议准备 ≥2 个商户号 / ≥2 条通道做容灾。
        </span>
      </div>

      <MerchantDrawer
        m={activeM}
        onClose={() => setOpenId(null)}
        onFuse={() => { if (activeM) { setMerchantState(activeM.id, 'fused', '暂停交易'); toast({ tone: 'alert', text: `${activeM.id} 已熔断下线` }) } }}
        onPause={() => { if (activeM) { setMerchantState(activeM.id, 'paused', '暂停新签·21天'); toast({ tone: 'warn', text: `${activeM.id} 已暂停新签` }) } }}
        onResume={() => { if (activeM) { setMerchantState(activeM.id, 'healthy', '健康'); toast({ tone: 'good', text: `${activeM.id} 已恢复进单` }) } }}
      />

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="新增商户号" footer={<><Button variant="ghost" onClick={() => setNewOpen(false)}>取消</Button><button onClick={() => { const id = addMerchant(nf); setNewOpen(false); toast({ tone: 'good', text: `${id} 已录入号池` }) }} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">录入</button></>}>
        <div className="space-y-3.5">
          <Field label="归属品牌" required><Select value={nf.brandId} onChange={(e) => setNf({ ...nf, brandId: e.target.value })}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="支付通道"><Select value={nf.channel} onChange={(e) => setNf({ ...nf, channel: e.target.value as typeof nf.channel })}><option value="wechat">微信支付</option><option value="alipay">支付宝</option><option value="bank">银行分账</option></Select></Field>
            <Field label="初始进单权重"><Input type="number" value={nf.weight} onChange={(e) => setNf({ ...nf, weight: +e.target.value })} /></Field>
          </div>
          <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">商户号由品牌方提供并承担主体责任。录入后默认「健康」，按健康度加权进单；逼近红线自动降权/熔断。</div>
        </div>
      </Modal>
    </>
  )
}

function MerchantDrawer({ m, onClose, onFuse, onPause, onResume }: { m: MerchantAccount | null; onClose: () => void; onFuse: () => void; onPause: () => void; onResume: () => void }) {
  if (!m) return null
  const b = brandById(m.brandId)!
  const st = MERCHANT_STATE[m.state]
  const metrics = [
    { k: '投诉率', v: pct(m.complaintRate), red: m.complaintRate >= 1, warn: m.complaintRate >= 0.6 },
    { k: '升级投诉率', v: pct(m.escalatedRate, 2), red: m.escalatedRate >= 0.1, warn: m.escalatedRate >= 0.05 },
    { k: '72h 完结率', v: pct(m.close72h, 0), red: m.close72h < 90, warn: m.close72h < 95 },
    { k: '拒付率', v: pct(m.chargebackRate, 2), red: false, warn: m.chargebackRate >= 0.5 },
  ]
  const history = [
    { title: '商户号录入', desc: `${b.name} · ${CHANNEL_LABEL[m.channel]}`, done: true },
    { title: '正常进单', desc: '健康度监控中', done: true },
    ...(st.step >= 1 ? [{ title: '整改警告', desc: '升级投诉或 72h 完结临期', tone: 'warn' as const, done: true }] : []),
    ...(st.step >= 2 ? [{ title: st.label, desc: '阈值触发 · 自动降权 + 收紧投放', tone: 'alert' as const, done: true }] : []),
  ]
  return (
    <Drawer
      open={!!m}
      onClose={onClose}
      title={<span className="tnum">{m.id}</span>}
      desc={<span>{b.name} · {CHANNEL_LABEL[m.channel]} · {m.mid}</span>}
      footer={
        m.state === 'healthy' ? (
          <>
            <Button variant="ghost" onClick={onPause}>暂停新签</Button>
            <button onClick={onFuse} className="rounded-lg bg-alert px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90">熔断下线</button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>关闭</Button>
            <button onClick={onResume} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">恢复进单</button>
          </>
        )
      }
    >
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted p-3.5">
        <div><div className="text-[11px] text-ink-4">当前状态 · 进单权重 {m.weight}</div><div className="tnum mt-0.5 text-[15px] font-semibold text-ink">{money(m.gmvMtd)} · {int(m.txCount)} 笔</div></div>
        <Badge tone={st.tone} dot>{st.label}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {metrics.map((x) => (
          <div key={x.k} className="rounded-lg border border-line p-2.5">
            <div className="text-[11px] text-ink-4">{x.k}</div>
            <div className={cx('tnum mt-0.5 text-[16px] font-semibold', x.red ? 'text-alert-ink' : x.warn ? 'text-warn-ink' : 'text-ink')}>{x.v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-surface-muted p-3">
        <div className="mb-1.5 flex justify-between text-[11.5px] text-ink-3"><span>限额占用</span><span className="tnum">{m.limitUsedPct}%</span></div>
        <Meter value={m.limitUsedPct} tone={m.limitUsedPct >= 70 ? 'warn' : 'good'} />
      </div>
      <div className="mt-5">
        <div className="mb-2.5 flex items-center gap-2"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[13px] font-semibold">状态变更历史</span></div>
        <Timeline items={history} />
      </div>
    </Drawer>
  )
}

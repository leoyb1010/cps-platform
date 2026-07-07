import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wallet,
  RotateCcw,
  Lock,
  GitCompareArrows,
  ArrowRight,
  CircleDollarSign,
} from 'lucide-react'
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
  TONE,
  toneVar,
} from '../components/ui/primitives'
import {
  brandById,
  SETTLE_STATUS,
  SETTLE_PATH_LABEL,
  AGENT_STATUS,
} from '../lib/data'
import { FundSankey } from '../components/ui/charts'
import { useStore, clearSettlement, reconcileSettlement, settleAgent } from '../lib/store'
import { useViewMode } from '../lib/prefs'
import { useToast } from '../components/ui/overlays'
import { DetailPopover, useAnchoredPopover, type AnchorRect } from '../components/ui/popover'
import { Term } from '../components/ui/Term'
import { type Settlement as SettlementT } from '../lib/data'
import { money, yuan, cx } from '../lib/format'

export default function Settlement() {
  const { settlements, agents } = useStore()
  const expert = useViewMode() === 'expert'
  const toast = useToast()
  const nav = useNavigate()
  const [tab, setTab] = useState<'brand' | 'agent'>('brand')
  const [openId, setOpenId] = useState<string | null>(null)
  const pop = useAnchoredPopover()
  const activeS = settlements.find((s) => s.id === openId) ?? null

  const totalPlatformFee = settlements.reduce((s, x) => s + x.platformFee, 0)
  const totalReversal = settlements.reduce((s, x) => s + x.reversal, 0)
  const totalFrozen = settlements.reduce((s, x) => s + x.frozen, 0)
  const pendingPayout = agents.filter((a) => a.payoutPending > 0).reduce((s, a) => s + a.payoutPending, 0)
  // 对账状态由明细派生：有未核销差异则提示，避免与表内挂起差异自相矛盾
  const diffCount = settlements.filter((s) => s.reconcileDiff > 0).length
  const totalDiff = settlements.reduce((s, x) => s + x.reconcileDiff, 0)

  return (
    <>
      <PageHeader
        title="清结算"
        desc="分润分层计算（品牌费率 → 平台费 → 代理分润）。退款拒付逆向冲账，账期冻结覆盖风险窗口，三方逐笔对账。"
        actions={
          <>
            <Button variant="ghost" onClick={() => { setTab('brand'); toast({ tone: 'info', text: '对账中心：三方逐笔对账，差异挂起在「核销差异」按钮处理' }) }}>对账中心</Button>
            {/* 结算工作台：把月结日四处横跳收成一屏 Checklist（小白友好的引导式动线） */}
            <Button variant="primary" onClick={() => nav('/settlement/run')}>
              开始本期结算 <ArrowRight size={14} />
            </Button>
          </>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <Stat
            label="平台净收入（累计）"
            value={money(totalPlatformFee)}
            hint="各结算单平台服务费合计（含跨周期）"
            sub={diffCount > 0
              ? <span className="flex items-center gap-1 text-warn-ink"><CircleDollarSign size={12} /> {diffCount} 单待核销 · {money(totalDiff)}</span>
              : <span className="flex items-center gap-1 text-good-ink"><CircleDollarSign size={12} /> 已对账无差异</span>}
          />
        </Card>
        <Card>
          <Stat
            label="代理待结算"
            value={money(pendingPayout)}
            sub={<span>{agents.filter((a) => a.payoutPending > 0).length} 个代理 · T+N 账期</span>}
          />
        </Card>
        <Card>
          <Stat
            label={<><Term k="reversal">逆向冲账</Term>（累计）</>}
            value={money(totalReversal)}
            deltaTone="alert"
            hint="退款/拒付反向扣减已结/未结分润"
            sub={<span className="text-alert-ink">退款拒付回收</span>}
          />
        </Card>
        <Card>
          <Stat
            label="账期冻结金额"
            value={money(totalFrozen)}
            hint="覆盖退款拒付窗口期（对齐渠道可退周期）"
            sub={<span className="text-violet-ink">风险准备金联动</span>}
          />
        </Card>
      </div>

      {/* 资金流向 Sankey —— 把对账恒等式画出来（两模式都展示：小白一眼看懂钱怎么分的） */}
      <FundFlowCard settlements={settlements} />

      {/* 分润瀑布 + 资金路径（口径说明，专家视图展开） */}
      {expert && (
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle title="一笔订单的分润流" desc="以网易有道 ¥39.9 续费单为例 · 品牌费率 42%" />
          <Waterfall />
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle title="双路径结算" desc="平台不碰资金本体，仅下发指令" />
          <div className="space-y-3">
            <PathCard
              tone="good"
              title="路径 A · 直连"
              points={['用户付款直达品牌商户号', '品牌按费率回结平台分润', '平台再结算给代理']}
              tag="合规最干净"
            />
            <PathCard
              tone="info"
              title="路径 B · 持牌分账"
              points={['资金进持牌机构分账系统', '平台仅下发分账指令', '品牌/平台/代理三方自动入账']}
              tag="规避二清"
            />
          </div>
        </Card>
      </div>
      )}

      {/* 品牌 / 代理结算切换 */}
      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle
            title={tab === 'brand' ? '品牌结算单' : '代理结算与提现'}
            desc={tab === 'brand' ? '按结算周期 · 含逆向冲账与冻结' : '按信用分联动结算优先级'}
          />
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'brand', label: '品牌结算' },
              { value: 'agent', label: '代理提现' },
            ]}
          />
        </div>

        {tab === 'brand' ? (
          <TableShell
            className="px-2 pb-2"
            minWidth={760}
            head={
              <>
                <Th className="pl-3">结算单 / 品牌</Th>
                <Th>周期 / 路径</Th>
                <Th right>流水 Gross</Th>
                <Th right>平台费</Th>
                <Th right>代理分润</Th>
                <Th right>逆向冲账</Th>
                <Th right>冻结</Th>
                <Th right>对账差异</Th>
                <Th right>状态</Th>
                <Th right>操作</Th>
              </>
            }
          >
            {settlements.map((s) => {
              const b = brandById(s.brandId)
              const st = SETTLE_STATUS[s.status]
              return (
                <Row key={s.id}>
                  <Td className="pl-3">
                    <button onClick={(e) => { setOpenId(s.id); pop.openAt(e) }} className="flex items-center gap-2.5 text-left">
                      <BrandMark brand={b.id} mark={b.mark} size={26} />
                      <div>
                        <div className="text-[12.5px] font-medium text-ink transition-colors hover:text-brand">{s.id}</div>
                        <div className="text-[11px] text-ink-4">{b.name}</div>
                      </div>
                    </button>
                  </Td>
                  <Td>
                    <div className="text-[12px]">{s.period}</div>
                    <div className="text-[11px] text-ink-4">{SETTLE_PATH_LABEL[b.path]} · T+{b.period}</div>
                  </Td>
                  <Td right mono className="font-medium text-ink">{money(s.gross)}</Td>
                  <Td right mono className="text-good-ink">{money(s.platformFee)}</Td>
                  <Td right mono>{money(s.agentPayout)}</Td>
                  <Td right mono>
                    <span className={s.reversal > 0 ? 'text-alert-ink' : 'text-ink-4'}>−{money(s.reversal)}</span>
                  </Td>
                  <Td right mono>
                    <span className={s.frozen > 0 ? 'text-violet-ink' : 'text-ink-4'}>{s.frozen > 0 ? money(s.frozen) : '—'}</span>
                  </Td>
                  <Td right mono>
                    <span className={s.reconcileDiff > 0 ? 'text-warn-ink' : 'text-ink-4'}>{s.reconcileDiff > 0 ? yuan(s.reconcileDiff, { decimals: 0 }) : '0'}</span>
                  </Td>
                  <Td right><Badge tone={st.tone} dot>{st.label}</Badge></Td>
                  <Td right>
                    {s.status === 'pending' ? (
                      <button onClick={() => { clearSettlement(s.id); toast({ tone: 'good', text: `${s.id} 已结算` }) }} className="rounded-md px-2 py-1 text-[12px] font-medium text-ink hover:bg-surface-sunken">发起结算</button>
                    ) : s.reconcileDiff > 0 ? (
                      <button onClick={() => { reconcileSettlement(s.id); toast({ tone: 'good', text: `${s.id} 差异已核销` }) }} className="rounded-md px-2 py-1 text-[12px] font-medium text-warn-ink hover:bg-warn-soft">核销差异</button>
                    ) : (
                      <span className="text-[11.5px] text-ink-4">—</span>
                    )}
                  </Td>
                </Row>
              )
            })}
          </TableShell>
        ) : (
          <TableShell
            className="px-2 pb-2"
            minWidth={720}
            head={
              <>
                <Th className="pl-3">代理</Th>
                <Th>开票方式</Th>
                <Th right>信用分</Th>
                <Th right>待结算</Th>
                <Th right>累计已结</Th>
                <Th right>保证金</Th>
                <Th right>状态</Th>
                <Th right>操作</Th>
              </>
            }
          >
            {agents
              .filter((a) => a.status !== 'blacklist')
              .sort((x, y) => y.payoutPending - x.payoutPending)
              .map((a) => {
                const st = AGENT_STATUS[a.status]
                const canPay = a.status === 'active' && a.payoutPending > 0
                return (
                  <Row key={a.id}>
                    <Td className="pl-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-sunken text-[11px] font-medium text-ink-2">{a.type === '企业' ? '企' : '个'}</span>
                        <div>
                          <div className="text-[12.5px] font-medium text-ink">{a.name}</div>
                          <div className="text-[11px] text-ink-4">{a.id}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={a.invoicing === '灵活用工' ? 'info' : a.invoicing === '企业开票' ? 'neutral' : 'violet'}>{a.invoicing}</Badge>
                    </Td>
                    <Td right mono>
                      <span className={cx('font-medium', a.creditScore >= 800 ? 'text-good-ink' : a.creditScore >= 700 ? 'text-warn-ink' : 'text-alert-ink')}>{a.creditScore}</span>
                    </Td>
                    <Td right mono className="font-medium text-ink">{a.payoutPending > 0 ? money(a.payoutPending) : '—'}</Td>
                    <Td right mono>{money(a.settledTotal)}</Td>
                    <Td right mono>{money(a.deposit)}</Td>
                    <Td right><Badge tone={st.tone} dot>{st.label}</Badge></Td>
                    <Td right>
                      <button
                        disabled={!canPay}
                        onClick={() => { if (canPay) { settleAgent(a.id); toast({ tone: 'good', text: `${a.name} 提现已打款` }) } }}
                        className={cx('rounded-md px-2 py-1 text-[12px] font-medium', canPay ? 'text-ink hover:bg-surface-sunken' : 'cursor-not-allowed text-ink-4')}
                      >
                        {a.status === 'frozen' ? '已冻结' : a.payoutPending > 0 ? '结算' : '已结清'}
                      </button>
                    </Td>
                  </Row>
                )
              })}
          </TableShell>
        )}
      </Card>

      {/* 对账与冲账说明 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InfoCard
          icon={<GitCompareArrows size={16} />}
          tone="info"
          title="三方对账"
          body="平台用自采的「签约/支付成功」事件，与品牌侧、支付/分账侧逐笔比对。差异自动挂起人工核查，防止品牌少报订单克扣平台与代理。"
        />
        <InfoCard
          icon={<RotateCcw size={16} />}
          tone="alert"
          title="逆向冲账"
          body="退款、拒付、跨月退订触发分润反向扣减。代理已结分润可回收，避免「代理拿钱、用户退款、平台垫损」。"
        />
        <InfoCard
          icon={<Lock size={16} />}
          tone="violet"
          title="账期冻结"
          body="按比例冻结分润覆盖退款拒付窗口（对齐渠道 30–180 天可退周期）。连续包月退款滞后，当月盈利 ≠ 真盈利。"
        />
      </div>

      <SettlementDrawer
        s={activeS}
        anchor={pop.anchorRect}
        onClose={() => { setOpenId(null); pop.close() }}
        onClear={() => { if (activeS) { clearSettlement(activeS.id); toast({ tone: 'good', text: `${activeS.id} 已结算` }); setOpenId(null) } }}
        onReconcile={() => { if (activeS) { reconcileSettlement(activeS.id); toast({ tone: 'good', text: `${activeS.id} 差异已核销` }); setOpenId(null) } }}
      />

    </>
  )
}

function SettlementDrawer({ s, anchor, onClose, onClear, onReconcile }: { s: SettlementT | null; anchor: AnchorRect | null; onClose: () => void; onClear: () => void; onReconcile: () => void }) {
  if (!s) return null
  const b = brandById(s.brandId)
  const st = SETTLE_STATUS[s.status]
  // 可分配池 = gross − 品牌留存 = 平台费 + 代理分润 + 准备金 + 逆向冲账（严格对平）
  const pool = s.gross - s.brandShare
  const rows: { k: string; v: number; tone?: 'good' | 'alert' | 'violet' | 'neutral'; sub?: boolean }[] = [
    { k: '订单流水 Gross', v: s.gross, sub: true },
    { k: `品牌留存（${100 - b.feeRate}%）`, v: -s.brandShare, tone: 'neutral' },
    { k: `可分配池（${b.feeRate}%）`, v: pool, sub: true },
    { k: '平台服务费', v: -s.platformFee, tone: 'good' },
    { k: '代理分润', v: -s.agentPayout, tone: 'violet' },
    { k: `风险准备金（${b.reservePct}%·预留）`, v: -s.reserve, tone: 'violet' },
    { k: '逆向冲账（退款拒付回收）', v: -s.reversal, tone: 'alert' },
    { k: '应结净额（代理实收）', v: s.agentPayout, sub: true },
  ]
  return (
    <DetailPopover
      anchor={anchor}
      onClose={onClose}
      width={420}
      title={<span className="tnum">{s.id}</span>}
      desc={<span>{b.name} · {s.period}</span>}
      footer={
        s.status === 'pending' ? (
          <>
            <Button variant="ghost" onClick={onClose}>关闭</Button>
            <button onClick={onClear} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">发起结算</button>
          </>
        ) : s.reconcileDiff > 0 ? (
          <>
            <Button variant="ghost" onClick={onClose}>关闭</Button>
            <button onClick={onReconcile} className="rounded-lg bg-warn px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90">核销差异</button>
          </>
        ) : <Button variant="ghost" onClick={onClose}>关闭</Button>
      }
    >
      <div className="flex items-center justify-between"><Badge tone={st.tone} dot>{st.label}</Badge>{s.reconcileDiff > 0 && <span className="tnum text-[12px] text-warn-ink">对账差异 {yuan(s.reconcileDiff, { decimals: 0 })}</span>}</div>
      <div className="mt-4 rounded-lg border border-line">
        {rows.map((r, i) => (
          <div key={r.k} className={cx('flex items-center justify-between px-3.5 py-2.5 text-[12.5px]', i > 0 && 'border-t border-line/70')}>
            <span className={cx(r.sub ? 'font-medium text-ink' : 'text-ink-2')}>{r.k}</span>
            <span className={cx('tnum font-medium', r.sub ? 'text-ink' : r.v < 0 ? (r.tone === 'alert' ? 'text-alert-ink' : 'text-ink-3') : r.tone === 'good' ? 'text-good-ink' : 'text-ink-2')}>{r.v < 0 ? '−' : ''}{money(Math.abs(r.v))}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">
        资金路径 {b.path === 'direct' ? '直连：钱由品牌商户号结算给平台，再结算给代理' : b.path === 'licensed' ? '持牌分账：持牌机构按分账指令清分给三方' : '混合：核心直连、长尾走持牌分账'} · 账期 T+{b.period}
      </div>
    </DetailPopover>
  )
}

/* 资金流向卡：把全平台结算恒等式聚合成一张 Sankey。差异股标红。
   简洁模式默认展示图（一眼看懂钱怎么分），专家模式图/表可切。 */
function FundFlowCard({ settlements }: { settlements: SettlementT[] }) {
  const expert = useViewMode() === 'expert'
  const [view, setView] = useState<'flow' | 'table'>('flow')
  const sum = (k: keyof SettlementT) => settlements.reduce((s, x) => s + (Number(x[k]) || 0), 0)
  const gross = sum('gross')
  const brandShare = sum('brandShare')
  const platformFee = sum('platformFee')
  const agentPayout = sum('agentPayout')
  const reserve = sum('reserve')
  const reversal = sum('reversal')
  const diff = sum('reconcileDiff')
  const flows = [
    { label: '品牌留存', value: brandShare, tone: 'good' as const },
    { label: '平台服务费', value: platformFee, tone: 'brand' as const },
    { label: '代理分润', value: agentPayout, tone: 'info' as const },
    { label: '风险准备金', value: reserve, tone: 'violet' as const },
    { label: '逆向冲账', value: reversal, tone: 'alert' as const, alert: diff > 0 },
  ]
  const showTable = expert && view === 'table'
  return (
    <Card className="mt-4" pad={false}>
      <div className="flex items-center justify-between p-5 pb-3">
        <CardTitle title="资金流向" desc="流水 = 品牌留存 + 平台费 + 代理分润 + 准备金 + 冲账 · 对账恒等式可视化" />
        {expert && (
          <Segmented value={view} onChange={setView} options={[{ value: 'flow', label: '流向图' }, { value: 'table', label: '明细' }]} />
        )}
      </div>
      {showTable ? (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {flows.map((f) => (
              <div key={f.label} className="rounded-lg border border-line px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3"><span className="h-2 w-2 rounded-full" style={{ background: f.alert ? 'var(--color-alert)' : toneVar[f.tone] }} />{f.label}</div>
                <div className="tnum mt-1 text-[15px] font-semibold text-ink">{money(f.value)}</div>
                <div className="tnum text-[10.5px] text-ink-4">{gross > 0 ? ((Math.abs(f.value) / gross) * 100).toFixed(1) : '0'}%</div>
              </div>
            ))}
            <div className="rounded-lg border border-line bg-surface-muted px-3 py-2.5">
              <div className="text-[11.5px] text-ink-3">流水 GROSS</div>
              <div className="tnum mt-1 text-[15px] font-semibold text-brand">{money(gross)}</div>
              <div className="text-[10.5px] text-ink-4">恒等式左端</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-3 pb-4">
          {gross > 0 ? <FundSankey gross={gross} flows={flows} /> : <div className="py-10 text-center text-[12.5px] text-ink-4">暂无结算数据</div>}
          {diff > 0 && <div className="mx-4 mt-1 rounded-lg bg-alert-soft/50 px-3 py-2 text-[12px] text-alert-ink">存在对账差异 {money(diff)}（已在「逆向冲账」股标红）· 到「核销差异」处理</div>}
        </div>
      )}
    </Card>
  )
}

/* 分润瀑布（口径与结算单一致：以有道 42% 费率、8% 准备金、平台占池 17% 为例） */
function Waterfall() {
  const gross = 39.9
  const fee = 0.42
  const reservePct = 0.08
  const pool = +(gross * fee).toFixed(2) // 可分配池
  const reserve = +(gross * reservePct).toFixed(2) // 准备金（从池预留）
  const platformFee = +(pool * 0.17).toFixed(2) // 平台占池 17%
  const agentPayout = +(pool - reserve - platformFee).toFixed(2) // 代理实收
  const rows = [
    { label: '订单流水', v: gross, tone: 'brand' as const, w: 100 },
    { label: '品牌留存 58%', v: -(gross - pool), tone: 'neutral' as const, w: 58 },
    { label: '可分配池 42%', v: pool, tone: 'info' as const, w: 42, sum: true },
    { label: '平台服务费', v: -platformFee, tone: 'good' as const, w: 7 },
    { label: '风险准备金 8%', v: -reserve, tone: 'violet' as const, w: 8 },
    { label: '代理实收', v: agentPayout, tone: 'violet' as const, w: 27, sum: true },
  ]
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[12px] text-ink-2">{r.label}</span>
          <div className="flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
              <div className="h-full rounded-full" style={{ width: `${r.w}%`, background: toneVar[r.tone] }} />
            </div>
          </div>
          <span className={cx('tnum w-20 shrink-0 text-right text-[12.5px] font-medium', r.sum ? 'text-ink' : r.v < 0 ? 'text-ink-3' : 'text-ink-2')}>
            {r.v < 0 ? '−' : ''}¥{Math.abs(r.v).toFixed(2)}
          </span>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-[11.5px] text-ink-3">
        <Wallet size={13} /> 代理 ROI 与续费决定净 LTV；平台净收入来自可分配池减代理分润。
      </div>
    </div>
  )
}

function PathCard({ tone, title, points, tag }: { tone: 'good' | 'info'; title: string; points: string[]; tag: string }) {
  return (
    <div className={cx('rounded-xl border p-3.5', tone === 'good' ? 'border-good/25' : 'border-info/25')}>
      <div className="mb-2 flex items-center justify-between">
        <span className={cx('text-[12.5px] font-semibold', TONE[tone].ink)}>{title}</span>
        <Badge tone={tone}>{tag}</Badge>
      </div>
      <ol className="space-y-1">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-[11.5px] text-ink-2">
            <span className={cx('mt-px grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[9px] font-semibold', TONE[tone].soft, TONE[tone].ink)}>{i + 1}</span>
            {p}
          </li>
        ))}
      </ol>
    </div>
  )
}

function InfoCard({ icon, tone, title, body }: { icon: React.ReactNode; tone: 'info' | 'alert' | 'violet'; title: string; body: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <span className={cx('grid h-8 w-8 place-items-center rounded-lg', TONE[tone].soft, TONE[tone].ink)}>{icon}</span>
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-3">{body}</p>
    </Card>
  )
}

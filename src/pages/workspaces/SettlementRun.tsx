import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, ArrowLeft, FileDown, CircleCheck, Landmark, GitCompareArrows, Wallet, ShieldCheck } from 'lucide-react'
import { PageHeader, Card, Badge, Button } from '../../components/ui/primitives'
import { useToast } from '../../components/ui/overlays'
import { useStore, reconcileSettlement, clearSettlement, settleAgent } from '../../lib/store'
import { money, cx, downloadText } from '../../lib/format'
import { brandById } from '../../lib/data'

/**
 * 结算工作台 —— 月结日一屏走完的 Checklist，本质是现有 store 动作的编排（零新后端）。
 * 五步：拉取对账 → 处理差异 → 发起结算 → 释放准备金 → 审批提现。
 * 步骤状态持久化(sessionStorage)可中断续跑；完成生成本期结算报告。
 * 这个工作台本身就是给小白的——把"先对账再结算再释放"的专家顺序固化成流程。
 */
type StepId = 'reconcile' | 'diff' | 'clear' | 'reserve' | 'payout'
const STEPS: { id: StepId; icon: typeof Check; title: string; hint: string }[] = [
  { id: 'reconcile', icon: GitCompareArrows, title: '拉取对账', hint: '核对退款流水 ↔ 结算冲账' },
  { id: 'diff', icon: GitCompareArrows, title: '处理差异', hint: '逐笔核销或挂起留言' },
  { id: 'clear', icon: Landmark, title: '发起结算', hint: '待结算单批量确认' },
  { id: 'reserve', icon: ShieldCheck, title: '释放准备金', hint: '到期准备金进可提现池' },
  { id: 'payout', icon: Wallet, title: '审批提现', hint: '代理提现逐单批/驳' },
]

const RUN_KEY = 'cps-settle-run-v1'
function loadDone(): StepId[] {
  try {
    const r = sessionStorage.getItem(RUN_KEY)
    if (r) return JSON.parse(r)
  } catch { /* */ }
  return []
}

export default function SettlementRun() {
  const nav = useNavigate()
  const toast = useToast()
  const { settlements, agents } = useStore()
  const [done, setDone] = useState<StepId[]>(loadDone)
  const [reportReady, setReportReady] = useState(false)

  const markDone = (id: StepId) => {
    const next = [...new Set([...done, id])]
    setDone(next)
    try { sessionStorage.setItem(RUN_KEY, JSON.stringify(next)) } catch { /* */ }
  }
  const isDone = (id: StepId) => done.includes(id)
  // 当前进行步 = 第一个未完成
  const activeIdx = STEPS.findIndex((s) => !isDone(s.id))
  const allDone = activeIdx === -1

  const pending = settlements.filter((s) => s.status === 'pending')
  const diffs = settlements.filter((s) => s.reconcileDiff > 0)
  const frozen = settlements.reduce((s, x) => s + x.frozen, 0)
  const payoutAgents = agents.filter((a) => a.payoutPending > 0)

  const genReport = () => {
    const rows = settlements.map((s) => [s.id, brandById(s.brandId)?.name ?? s.brandId, s.period, s.gross, s.platformFee, s.agentPayout, s.reversal, s.status].join(','))
    const csv = '﻿结算单,品牌,周期,流水,平台费,代理分润,冲账,状态\n' + rows.join('\n')
    downloadText('本期结算报告.csv', csv)
    setReportReady(true)
    toast({ tone: 'good', text: '本期结算报告已生成并导出' })
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => nav('/settlement')} className="grid h-8 w-8 place-items-center rounded-lg text-ink-4 hover:bg-surface-muted"><ArrowLeft size={16} /></button>
        <PageHeader title="结算工作台" desc="月结日一屏走完：对账 → 差异 → 结算 → 释放准备金 → 提现。中断可续跑，完成生成结算报告。" />
      </div>

      {/* 进度条 */}
      <Card className="mb-4">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const d = isDone(s.id)
            const active = i === activeIdx
            return (
              <div key={s.id} className="flex flex-1 items-center gap-1">
                <div className={cx('flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                  d ? 'text-good-ink' : active ? 'bg-brand-soft text-brand-ink' : 'text-ink-4')}>
                  <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                    d ? 'bg-good text-white' : active ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-4')}>
                    {d ? <Check size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.title}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight size={14} className="shrink-0 text-hairtick" />}
              </div>
            )
          })}
        </div>
      </Card>

      {/* 步骤卡 */}
      <div className="space-y-3">
        {/* ① 对账 */}
        <StepCard n={1} step={STEPS[0]} done={isDone('reconcile')} active={activeIdx === 0}>
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-ink-2">已平 <b className="tnum">{settlements.length - diffs.length}</b> · 差异 <b className="tnum text-warn-ink">{diffs.length}</b></div>
            {!isDone('reconcile') && <Button variant="primary" busyMs={500} onClick={() => { markDone('reconcile'); toast({ tone: 'good', text: '对账已拉取' }) }}>拉取对账</Button>}
          </div>
        </StepCard>

        {/* ② 差异 */}
        {isDone('reconcile') && (
          <StepCard n={2} step={STEPS[1]} done={isDone('diff')} active={activeIdx === 1}>
            {diffs.length === 0 ? (
              <div className="flex items-center justify-between">
                <div className="text-[13px] text-good-ink">无对账差异 · 可直接进入结算</div>
                {!isDone('diff') && <Button variant="ghost" onClick={() => markDone('diff')}>确认无差异，下一步</Button>}
              </div>
            ) : (
              <div className="space-y-2">
                {diffs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
                    <div>
                      <div className="text-[12.5px] font-medium text-ink">{brandById(d.brandId)?.name ?? d.brandId} · {d.id}</div>
                      {/* 对账解释器（确定性拆解，B2 接后端 explainDiff；此处按冲账构成给出示意） */}
                      <div className="mt-0.5 text-[11px] text-ink-4">差异 {money(d.reconcileDiff)} = 跨期退款冲账 {money(Math.round(d.reconcileDiff * 0.9))} + 通道费口径差 {money(d.reconcileDiff - Math.round(d.reconcileDiff * 0.9))}</div>
                    </div>
                    <Button variant="soft" onClick={() => { reconcileSettlement(d.id); toast({ tone: 'good', text: `${d.id} 差异已核销` }) }}>核销</Button>
                  </div>
                ))}
                {!isDone('diff') && <Button variant="ghost" className="w-full" onClick={() => markDone('diff')}>差异已处理，下一步</Button>}
              </div>
            )}
          </StepCard>
        )}

        {/* ③ 结算 */}
        {isDone('diff') && (
          <StepCard n={3} step={STEPS[2]} done={isDone('clear')} active={activeIdx === 2}>
            <div className="flex items-center justify-between">
              <div className="text-[13px] text-ink-2">待结算 <b className="tnum">{pending.length}</b> 笔 · 合计流水 <b className="tnum">{money(pending.reduce((s, x) => s + x.gross, 0))}</b></div>
              {!isDone('clear') && (
                <Button variant="primary" busyMs={600} onClick={() => {
                  pending.forEach((p) => clearSettlement(p.id))
                  markDone('clear')
                  toast({ tone: 'good', text: `已发起 ${pending.length} 笔结算` })
                }} disabled={pending.length === 0}>{pending.length === 0 ? '无待结算' : `批量发起结算（${pending.length}）`}</Button>
              )}
            </div>
          </StepCard>
        )}

        {/* ④ 准备金 */}
        {isDone('clear') && (
          <StepCard n={4} step={STEPS[3]} done={isDone('reserve')} active={activeIdx === 3}>
            <div className="flex items-center justify-between">
              <div className="text-[13px] text-ink-2">在账冻结 <b className="tnum">{money(frozen)}</b> · 到期部分释放进代理可提现池</div>
              {!isDone('reserve') && <Button variant="primary" busyMs={500} onClick={() => { markDone('reserve'); toast({ tone: 'good', text: '到期准备金已释放' }) }}>释放到期准备金</Button>}
            </div>
          </StepCard>
        )}

        {/* ⑤ 提现 */}
        {isDone('reserve') && (
          <StepCard n={5} step={STEPS[4]} done={isDone('payout')} active={activeIdx === 4}>
            {payoutAgents.length === 0 ? (
              <div className="flex items-center justify-between">
                <div className="text-[13px] text-ink-3">暂无待审批提现</div>
                {!isDone('payout') && <Button variant="ghost" onClick={() => markDone('payout')}>完成</Button>}
              </div>
            ) : (
              <div className="space-y-2">
                {payoutAgents.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
                    <div className="text-[12.5px]"><b className="text-ink">{a.name}</b> <span className="text-ink-4">· 信用分 {a.creditScore}</span></div>
                    <div className="flex items-center gap-2">
                      <span className="tnum text-[13px] font-semibold text-brand">{money(a.payoutPending)}</span>
                      <Button variant="soft" onClick={() => { settleAgent(a.id); toast({ tone: 'good', text: `${a.name} 提现已打款` }) }}>批准</Button>
                    </div>
                  </div>
                ))}
                {!isDone('payout') && <Button variant="ghost" className="w-full" onClick={() => markDone('payout')}>提现处理完毕，完成结算</Button>}
              </div>
            )}
          </StepCard>
        )}
      </div>

      {/* 完成 */}
      {allDone && (
        <Card className="mt-4 border-good/30 bg-good-soft/30">
          <div className="flex flex-col items-center py-4 text-center">
            <CircleCheck size={36} className="text-good-ink" />
            <div className="mt-2 text-[16px] font-semibold text-ink">本期结算完成 🎉</div>
            <p className="mt-1 text-[12.5px] text-ink-3">全部步骤已走完。生成结算报告存档，或返回清结算查看明细。</p>
            <div className="mt-4 flex items-center gap-2">
              <Button variant="primary" onClick={genReport}><FileDown size={14} /> {reportReady ? '重新导出报告' : '生成本期结算报告'}</Button>
              <Button variant="ghost" onClick={() => nav('/settlement')}>返回清结算</Button>
              <Button variant="ghost" onClick={() => { setDone([]); setReportReady(false); try { sessionStorage.removeItem(RUN_KEY) } catch { /* */ } }}>重新开始</Button>
            </div>
          </div>
        </Card>
      )}
    </>
  )
}

function StepCard({ n, step, done, active, children }: { n: number; step: { icon: typeof Check; title: string; hint: string }; done: boolean; active: boolean; children: React.ReactNode }) {
  return (
    <Card className={cx(active && 'ring-1 ring-brand/25', done && 'opacity-90')}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', done ? 'bg-good-soft text-good-ink' : active ? 'bg-brand-soft text-brand-ink' : 'bg-surface-sunken text-ink-4')}>
          {done ? <Check size={16} strokeWidth={3} /> : <step.icon size={16} />}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">{n}. {step.title}</span>
            {done && <Badge tone="good">已完成</Badge>}
          </div>
          <div className="text-[11.5px] text-ink-4">{step.hint}</div>
        </div>
      </div>
      {children}
    </Card>
  )
}

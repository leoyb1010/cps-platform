import { useState } from 'react'
import { UserPlus, ShieldX, ArrowUpDown, Ban } from 'lucide-react'
import {
  Card,
  CardTitle,
  Stat,
  PageHeader,
  Badge,
  Button,
  Segmented,
  TableShell,
  Th,
  Td,
  Row,
  TONE,
} from '../components/ui/primitives'
import { Meter } from '../components/ui/charts'
import { Drawer, Modal, useToast } from '../components/ui/overlays'
import { Steps } from '../components/ui/forms'
import { AGENT_STATUS, type Agent, type AgentStatus } from '../lib/data'
import { useStore, setAgentStatus } from '../lib/store'
import { money, int, pct, cx } from '../lib/format'

function scoreTone(s: number) {
  return s >= 850 ? 'good' : s >= 750 ? 'info' : s >= 650 ? 'warn' : 'alert'
}

export default function Agents() {
  const { agents } = useStore()
  const toast = useToast()
  const [f, setF] = useState<'all' | AgentStatus>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const activeAgent = agents.find((a) => a.id === openId) ?? null

  const active = agents.filter((a) => a.status === 'active')
  const totalSpend = agents.reduce((s, a) => s + a.spendMtd, 0)
  const totalPayout = agents.reduce((s, a) => s + a.payoutPending, 0)
  const avgScore = Math.round(agents.reduce((s, a) => s + a.creditScore, 0) / agents.length)
  const list = agents.filter((a) => (f === 'all' ? true : a.status === f))
  const blacklist = agents.filter((a) => a.status === 'blacklist')
  const [review, setReview] = useState(false)
  const [blOpen, setBlOpen] = useState(false)

  return (
    <>
      <PageHeader
        title="代理商"
        desc="开放自助入驻（KYC/KYB）· 信用分联动分润与结算优先级 · 分层准入：新代理小流量起步，跑出健康数据再放量 · 黑名单锁主体/设备/收款账户防换马甲。"
        actions={
          <>
            <Button variant="ghost" onClick={() => setBlOpen(true)}><ShieldX size={14} /> 黑名单库</Button>
            <Button variant="primary" onClick={() => setReview(true)}><UserPlus size={14} /> 审核入驻申请</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="活跃代理" value={String(active.length)} unit={`/ ${agents.length}`} sub={<span>本月消耗 {money(totalSpend)}</span>} /></Card>
        <Card><Stat label="待结算分润" value={money(totalPayout)} sub={<span>按信用分排序结算</span>} /></Card>
        <Card><Stat label="平均信用分" value={String(avgScore)} sub={<span>满分 1000</span>}><Meter value={avgScore / 10} tone="info" /></Stat></Card>
        <Card><Stat label="风险代理" value={String(agents.filter((a) => a.status !== 'active').length)} sub={<span className="text-alert-ink">限流/冻结/黑名单</span>} /></Card>
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle title="代理列表" desc="信用分 · 投诉率 · 退款率联动准入与结算" />
          <Segmented
            value={f}
            onChange={setF}
            options={[
              { value: 'all', label: '全部' },
              { value: 'active', label: '正常' },
              { value: 'throttled', label: '限流' },
              { value: 'frozen', label: '冻结' },
              { value: 'blacklist', label: '黑名单' },
            ]}
          />
        </div>
        <TableShell
          className="px-2 pb-2"
          head={
            <>
              <Th className="pl-3">代理 / 类型</Th>
              <Th>开票</Th>
              <Th className="w-32">信用分 <ArrowUpDown size={11} className="ml-0.5 inline text-ink-4" /></Th>
              <Th right>本月消耗</Th>
              <Th right>首单数</Th>
              <Th right>ROI</Th>
              <Th right>续费率</Th>
              <Th right>投诉率</Th>
              <Th right>待结算</Th>
              <Th right>状态</Th>
              <Th right>操作</Th>
            </>
          }
        >
          {list.map((a) => {
            const st = AGENT_STATUS[a.status]
            const stone = scoreTone(a.creditScore)
            const black = a.status === 'blacklist'
            return (
              <Row key={a.id} className={black ? 'opacity-70' : ''}>
                <Td className="pl-3">
                  <button onClick={() => setOpenId(a.id)} className="flex items-center gap-2.5 text-left">
                    <span className={cx('grid h-7 w-7 place-items-center rounded-full text-[11px] font-medium', black ? 'bg-surface-sunken text-ink-3' : 'bg-ink text-white')}>
                      {black ? <Ban size={13} /> : a.type === '企业' ? '企' : '个'}
                    </span>
                    <div>
                      <div className="text-[12.5px] font-medium text-ink transition-colors hover:text-brand">{a.name}</div>
                      <div className="text-[11px] text-ink-4">{a.id} · {a.type} · {a.brandsCount} 品牌</div>
                    </div>
                  </button>
                </Td>
                <Td><span className="text-[11.5px] text-ink-3">{a.invoicing}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className={cx('tnum text-[13px] font-semibold', TONE[stone].ink)}>{a.creditScore}</span>
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full rounded-full" style={{ width: `${a.creditScore / 10}%`, background: `var(--color-${stone})` }} />
                    </div>
                  </div>
                </Td>
                <Td right mono>{a.spendMtd > 0 ? money(a.spendMtd) : '—'}</Td>
                <Td right mono>{a.firstOrders > 0 ? int(a.firstOrders) : '—'}</Td>
                <Td right mono><span className={a.roi >= 1.5 ? 'text-good-ink' : a.roi >= 1.2 ? 'text-warn-ink' : 'text-ink-3'}>{a.roi > 0 ? a.roi.toFixed(2) : '—'}</span></Td>
                <Td right mono>{a.renewalRate > 0 ? pct(a.renewalRate) : '—'}</Td>
                <Td right mono><span className={a.complaintRate >= 1.0 ? 'text-alert-ink' : a.complaintRate >= 0.6 ? 'text-warn-ink' : 'text-ink-3'}>{pct(a.complaintRate)}</span></Td>
                <Td right mono className="font-medium text-ink">{a.payoutPending > 0 ? money(a.payoutPending) : '—'}</Td>
                <Td right><Badge tone={st.tone} dot={!black}>{st.label}</Badge></Td>
                <Td right>
                  {black ? (
                    <span className="text-[11.5px] text-ink-4">已清退</span>
                  ) : a.status === 'active' ? (
                    <button onClick={() => { setAgentStatus(a.id, 'throttled', '限流'); toast({ tone: 'warn', text: `${a.name} 已限流` }) }} className="rounded-md px-2 py-1 text-[12px] font-medium text-warn-ink hover:bg-warn-soft">限流</button>
                  ) : (
                    <button onClick={() => { setAgentStatus(a.id, 'active', '恢复正常'); toast({ tone: 'good', text: `${a.name} 已恢复` }) }} className="rounded-md px-2 py-1 text-[12px] font-medium text-good-ink hover:bg-good-soft">恢复</button>
                  )}
                </Td>
              </Row>
            )
          })}
        </TableShell>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle title="信用分维度" />
          <div className="space-y-2.5">
            {[
              { k: '投诉率', w: 28 },
              { k: '退款 / 拒付率', w: 24 },
              { k: '刷量嫌疑', w: 22 },
              { k: '合规违规次数', w: 16 },
              { k: '结算纠纷', w: 10 },
            ].map((x) => (
              <div key={x.k} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-[12px] text-ink-2">{x.k}</span>
                <div className="flex-1"><Meter value={x.w * 2.6} tone="info" /></div>
                <span className="tnum w-8 text-right text-[11.5px] text-ink-3">{x.w}%</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle title="分数联动" />
          <ul className="space-y-2 text-[12.5px] text-ink-2">
            <li className="flex gap-2"><span className="text-good-ink">高分</span> 更高分润 · 更多优质套餐 · 更快结算（T+ 更短）</li>
            <li className="flex gap-2"><span className="text-warn-ink">中分</span> 维持额度 · 加密监控 · 提示降客诉</li>
            <li className="flex gap-2"><span className="text-alert-ink">低分</span> 限流 · 提高保证金 · 暂停结算</li>
            <li className="flex gap-2"><span className="text-ink-3">清退</span> 主体/设备/收款账户入黑名单库</li>
          </ul>
        </Card>
        <Card>
          <CardTitle title="分层准入" />
          <div className="space-y-2.5">
            {[
              { t: 'L1 新代理', d: '低额度 · 高频审核 · 小流量', tone: 'neutral' as const },
              { t: 'L2 成长', d: '健康数据达标后放开额度', tone: 'info' as const },
              { t: 'L3 核心', d: '优质套餐 · 快速结算 · 专属支持', tone: 'good' as const },
            ].map((x) => (
              <div key={x.t} className={cx('rounded-lg p-2.5', TONE[x.tone].soft)}>
                <div className={cx('text-[12.5px] font-medium', TONE[x.tone].ink)}>{x.t}</div>
                <div className={cx('text-[11.5px]', TONE[x.tone].ink, 'opacity-80')}>{x.d}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <AgentDrawer
        agent={activeAgent}
        onClose={() => setOpenId(null)}
        onLimit={() => { if (activeAgent) { setAgentStatus(activeAgent.id, 'throttled', '限流'); toast({ tone: 'warn', text: `${activeAgent.name} 已限流` }) } }}
        onFreeze={() => { if (activeAgent) { setAgentStatus(activeAgent.id, 'frozen', '冻结结算'); toast({ tone: 'alert', text: `${activeAgent.name} 已冻结结算` }) } }}
        onResume={() => { if (activeAgent) { setAgentStatus(activeAgent.id, 'active', '恢复正常'); toast({ tone: 'good', text: `${activeAgent.name} 已恢复` }) } }}
      />

      <ReviewModal open={review} onClose={() => setReview(false)} onDecide={(ok) => { setReview(false); toast({ tone: ok ? 'good' : 'warn', text: ok ? '入驻通过 · 已置为 L1 分层（小流量起步）' : '入驻已驳回' }) }} />

      <Modal open={blOpen} onClose={() => setBlOpen(false)} title="黑名单库" width={480} footer={<Button variant="ghost" onClick={() => setBlOpen(false)}>关闭</Button>}>
        <div className="mb-3 text-[12px] text-ink-3">清退主体锁定 主体 / 设备 / 收款账户 三要素，防换马甲重入。</div>
        {blacklist.length === 0 ? <div className="py-4 text-center text-[12.5px] text-ink-4">暂无黑名单记录</div> : (
          <div className="space-y-2">
            {blacklist.map((a) => (
              <div key={a.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between"><span className="text-[12.5px] font-medium text-ink">{a.name}</span><Badge tone="neutral">已清退</Badge></div>
                <div className="tnum mt-1.5 grid grid-cols-3 gap-2 text-[11px] text-ink-4"><span>主体 {a.id}</span><span>设备 D-••{a.id.slice(-2)}</span><span>账户 ••{a.id.slice(-3)}</span></div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  )
}

function ReviewModal({ open, onClose, onDecide }: { open: boolean; onClose: () => void; onDecide: (ok: boolean) => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title="入驻审核 · KYC / KYB"
      footer={<><Button variant="ghost" onClick={() => onDecide(false)}>驳回</Button><button onClick={() => onDecide(true)} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">通过并准入 L1</button></>}
    >
      <div className="mb-4"><Steps steps={['资料核验', '风险初评', '准入分层']} current={2} /></div>
      <div className="rounded-lg border border-line bg-surface-muted p-3.5">
        <div className="flex items-center justify-between"><span className="text-[13px] font-semibold text-ink">极速增长 文化传媒</span><Badge tone="warn" dot>待审</Badge></div>
        <div className="mt-1 text-[11.5px] text-ink-4">企业 · 申请于 今天</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
        <KV k="营业执照" v="已上传 · 一致" ok />
        <KV k="法人实名" v="已核验" ok />
        <KV k="对公账户" v="已绑定" ok />
        <KV k="历史风险" v="无命中" ok />
        <KV k="经营范围" v="与所投会员匹配" ok />
        <KV k="初始信用分" v="700（L1）" />
      </div>
      <div className="mt-3 rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">分层准入：通过后置为 L1（低额度 · 高频审核 · 小流量起步），跑出健康数据再放量。</div>
    </Modal>
  )
}
function KV({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return <div className="rounded-lg border border-line p-2.5"><div className="text-[11px] text-ink-4">{k}</div><div className={cx('mt-0.5 font-medium', ok ? 'text-good-ink' : 'text-ink')}>{v}</div></div>
}

function AgentDrawer({ agent, onClose, onLimit, onFreeze, onResume }: { agent: Agent | null; onClose: () => void; onLimit: () => void; onFreeze: () => void; onResume: () => void }) {
  if (!agent) return null
  const st = AGENT_STATUS[agent.status]
  const stone = scoreTone(agent.creditScore)
  // 信用分构成（演示口径）
  const dims = [
    { k: '投诉率', s: Math.round(100 - agent.complaintRate * 30) },
    { k: '退款 / 拒付率', s: Math.round(100 - agent.refundRate * 6) },
    { k: '刷量嫌疑', s: agent.status === 'active' ? 92 : 58 },
    { k: '合规违规', s: agent.status === 'blacklist' ? 20 : 88 },
    { k: '结算纠纷', s: 90 },
  ]
  return (
    <Drawer
      open={!!agent}
      onClose={onClose}
      title={agent.name}
      desc={<span className="tnum">{agent.id} · {agent.type} · {agent.invoicing}</span>}
      footer={
        agent.status === 'blacklist' ? <Button variant="ghost" onClick={onClose}>关闭</Button> : (
          <>
            {agent.status === 'active' ? (
              <>
                <Button variant="ghost" onClick={onLimit}>限流</Button>
                <button onClick={onFreeze} className="rounded-lg bg-alert px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90">冻结结算</button>
              </>
            ) : (
              <button onClick={onResume} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">恢复正常</button>
            )}
          </>
        )
      }
    >
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted p-3.5">
        <div><div className="text-[11px] text-ink-4">信用分</div><div className={cx('tnum text-[24px] font-semibold', TONE[stone].ink)}>{agent.creditScore}</div></div>
        <Badge tone={st.tone} dot={agent.status !== 'blacklist'}>{st.label}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
        <Info k="本月消耗" v={money(agent.spendMtd)} />
        <Info k="首单数" v={int(agent.firstOrders)} />
        <Info k="首单 ROI" v={agent.roi.toFixed(2)} />
        <Info k="续费率" v={pct(agent.renewalRate)} />
        <Info k="投诉率" v={pct(agent.complaintRate)} />
        <Info k="待结算" v={money(agent.payoutPending)} />
      </div>
      <div className="mt-5">
        <div className="mb-2.5 flex items-center gap-2"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[13px] font-semibold">信用分构成</span></div>
        <div className="space-y-2.5">
          {dims.map((d) => (
            <div key={d.k} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[12px] text-ink-2">{d.k}</span>
              <div className="flex-1"><Meter value={d.s} tone={d.s >= 80 ? 'good' : d.s >= 60 ? 'warn' : 'alert'} /></div>
              <span className="tnum w-8 text-right text-[11.5px] text-ink-3">{d.s}</span>
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  )
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="rounded-lg border border-line p-2.5"><div className="text-[11px] text-ink-4">{k}</div><div className="mt-0.5 font-medium text-ink">{v}</div></div>
}

import { useState } from 'react'
import { Download, ArrowRight, RefreshCcw } from 'lucide-react'
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
} from '../components/ui/primitives'
import {
  brandById,
  agentById,
  ORDER_TYPE,
  CHANNEL_LABEL,
  type Order,
  type OrderType,
} from '../lib/data'
import { useStore, refundOrder } from '../lib/store'
import { Drawer, Confirm, useToast } from '../components/ui/overlays'
import { Timeline } from '../components/ui/forms'
import { int, cx } from '../lib/format'

const LIFECYCLE: { t: string; d: string; tone: 'info' | 'good' | 'warn' | 'alert' }[] = [
  { t: '签约', d: '支付宝/微信连续包月', tone: 'info' },
  { t: '扣费成功', d: '首单确认', tone: 'good' },
  { t: '续费中', d: '周期自动扣费', tone: 'good' },
  { t: '退订', d: '用户主动取消', tone: 'warn' },
  { t: '退款 / 拒付', d: '触发逆向冲账', tone: 'alert' },
]

const LC_BORDER: Record<'info' | 'good' | 'warn' | 'alert', string> = {
  info: 'border-info/25',
  good: 'border-good/25',
  warn: 'border-warn/25',
  alert: 'border-alert/25',
}

export default function Orders() {
  const { orders } = useStore()
  const toast = useToast()
  const [f, setF] = useState<'all' | OrderType>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const active = orders.find((o) => o.id === openId) ?? null
  const firsts = orders.filter((o) => o.type === 'first').length
  const renews = orders.filter((o) => o.type === 'renew').length
  const refunds = orders.filter((o) => o.type === 'refund').length
  const cbs = orders.filter((o) => o.type === 'chargeback').length
  const list = orders.filter((o) => (f === 'all' ? true : o.type === f))

  return (
    <>
      <PageHeader
        title="订单 · 订阅"
        desc="首单 / 续费 / 退款 / 拒付全生命周期状态机。连续包月真正看的是续费与净 LTV，不是首单。"
        actions={
          <>
            <Button variant="ghost" onClick={() => toast({ tone: 'good', text: '订单回传已同步' })}><RefreshCcw size={14} /> 同步回传</Button>
            <Button variant="primary" onClick={() => { const csv = '﻿订单号,品牌,套餐,代理,通道,类型,金额\n' + orders.map((o) => [o.id, brandById(o.brandId)?.name, o.plan, o.agentId, CHANNEL_LABEL[o.channel], ORDER_TYPE[o.type].label, o.amount].join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '订单对账.csv'; a.click(); URL.revokeObjectURL(a.href); toast({ tone: 'good', text: '对账明细已导出 CSV' }) }}><Download size={14} /> 导出对账</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="今日订单" value="3,184" delta="+8.2%" deltaTone="good" sub={<span>首单 {int(1820)} · 续费 {int(1364)}</span>} /></Card>
        <Card><Stat label="续费 / 首单" value="0.75" hint="续费笔数 ÷ 首单笔数" sub={<span>越高 LTV 越好</span>} /></Card>
        <Card><Stat label="退款率" value="3.1%" deltaTone="warn" sub={<span>触发分润冲账</span>} /></Card>
        <Card><Stat label="拒付率" value="0.31%" sub={<span className="text-good-ink">低于阈值</span>} /></Card>
      </div>

      {/* 状态机 */}
      <Card className="mt-4">
        <CardTitle title="订单 / 订阅状态机" desc="状态清晰、可追溯、可冲正" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {LIFECYCLE.map((s, i, arr) => (
            <div key={s.t} className="flex flex-1 items-center gap-2">
              <div className={cx('flex-1 rounded-xl border p-3', LC_BORDER[s.tone], TONE[s.tone].soft)}>
                <div className={cx('text-[12.5px] font-medium', TONE[s.tone].ink)}>{s.t}</div>
                <div className={cx('mt-0.5 text-[11px]', TONE[s.tone].ink, 'opacity-80')}>{s.d}</div>
              </div>
              {i < arr.length - 1 && <ArrowRight size={14} className="hidden shrink-0 text-ink-4 md:block" />}
            </div>
          ))}
        </div>
      </Card>

      {/* 订单流 */}
      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="flex items-center gap-2">
            <CardTitle title="订单明细" desc="实时签约 / 续费 / 退款 / 拒付" />
            <span className="mb-3.5 flex items-center gap-1 text-[11px] text-good-ink">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-good" /> 实时
            </span>
          </div>
          <Segmented
            value={f}
            onChange={setF}
            options={[
              { value: 'all', label: '全部' },
              { value: 'first', label: '首单' },
              { value: 'renew', label: '续费' },
              { value: 'refund', label: '退款' },
              { value: 'chargeback', label: '拒付' },
            ]}
          />
        </div>
        <TableShell
          className="px-2 pb-2"
          head={
            <>
              <Th className="pl-3">订单号 / 时间</Th>
              <Th>品牌 / 套餐</Th>
              <Th>代理</Th>
              <Th>通道 / 商户号</Th>
              <Th>类型</Th>
              <Th right>金额</Th>
            </>
          }
        >
          {list.map((o) => {
            const b = brandById(o.brandId)!
            const t = ORDER_TYPE[o.type]
            return (
              <Row key={o.id} onClick={() => setOpenId(o.id)}>
                <Td className="pl-3">
                  <div className="tnum text-[12.5px] font-medium text-ink">{o.id}</div>
                  <div className="tnum text-[11px] text-ink-4">今天 {o.time}</div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <BrandMark mark={b.mark} size={26} />
                    <div>
                      <div className="text-[12.5px] text-ink-2">{o.plan}</div>
                      <div className="text-[11px] text-ink-4">{b.name}</div>
                    </div>
                  </div>
                </Td>
                <Td><span className="tnum text-[12px]">{o.agentId}</span></Td>
                <Td>
                  <div className="text-[12px]">{CHANNEL_LABEL[o.channel]}</div>
                  <div className="text-[11px] text-ink-4">{o.mid}</div>
                </Td>
                <Td><Badge tone={t.tone} dot={o.type === 'refund' || o.type === 'chargeback'}>{t.label}</Badge></Td>
                <Td right mono className={cx('text-[13px] font-medium', o.amount < 0 ? 'text-alert-ink' : 'text-ink')}>
                  {o.amount < 0 ? '−' : ''}¥{Math.abs(o.amount)}
                </Td>
              </Row>
            )
          })}
        </TableShell>
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12px] text-ink-3">
          <span>本页 {list.length} 笔 · 首单 {firsts} · 续费 {renews} · 退款 {refunds} · 拒付 {cbs}</span>
          <span className="text-ink-4">每 5 分钟刷新 · 完整数据见对账中心</span>
        </div>
      </Card>

      <OrderDrawer order={active} onClose={() => setOpenId(null)} onRefund={() => active && setConfirm(active.id)} />
      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => { if (confirm) { refundOrder(confirm); toast({ tone: 'good', text: `订单 ${confirm} 已退款，联动冲账完成` }); setOpenId(null) } }}
        title="确认退款"
        confirmText="确认退款"
        tone="alert"
        body={<>将对订单 <span className="tnum font-medium text-ink">{confirm}</span> 发起退款，自动触发清结算逆向冲账并回收代理分润。</>}
      />
    </>
  )
}

function OrderDrawer({ order, onClose, onRefund }: { order: Order | null; onClose: () => void; onRefund: () => void }) {
  if (!order) return null
  const b = brandById(order.brandId)
  const a = agentById(order.agentId)
  const t = ORDER_TYPE[order.type]
  const refunded = order.type === 'refund' || order.type === 'chargeback'
  const isFirst = order.type === 'first'
  return (
    <Drawer
      open={!!order}
      onClose={onClose}
      title={<span className="tnum">{order.id}</span>}
      desc={<span>{b?.name} · 今天 {order.time}</span>}
      footer={
        refunded ? <Button variant="ghost" onClick={onClose}>关闭</Button> : (
          <>
            <Button variant="ghost" onClick={onClose}>关闭</Button>
            <button onClick={onRefund} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">退款并冲账</button>
          </>
        )
      }
    >
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted p-3.5">
        <div><div className="text-[12.5px] font-medium text-ink">{order.plan}</div><div className="mt-0.5 text-[11px] text-ink-4">{CHANNEL_LABEL[order.channel]} · {order.mid}</div></div>
        <span className={cx('tnum text-[18px] font-semibold', order.amount < 0 ? 'text-alert-ink' : 'text-ink')}>{order.amount < 0 ? '−' : ''}¥{Math.abs(order.amount)}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
        <Info k="类型" v={<Badge tone={t.tone}>{t.label}</Badge>} />
        <Info k="归属代理" v={a?.name ?? order.agentId} />
        <Info k="支付通道" v={CHANNEL_LABEL[order.channel]} />
        <Info k="商户号" v={<span className="tnum">{order.mid}</span>} />
      </div>
      <div className="mt-5">
        <div className="mb-2.5 flex items-center gap-2"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[13px] font-semibold">订单状态机</span></div>
        <Timeline
          items={[
            { title: '签约', time: `今天 ${order.time}`, desc: '支付宝/微信连续包月', done: true },
            { title: '扣费成功', desc: isFirst ? '首单确认' : '周期续费', done: true },
            refunded
              ? { title: order.type === 'chargeback' ? '拒付' : '退款', desc: '触发逆向冲账、回收代理分润', tone: 'alert', done: true }
              : { title: '续费中', desc: '下一周期自动扣费', tone: 'good', done: false },
          ]}
        />
      </div>
    </Drawer>
  )
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="rounded-lg border border-line p-2.5"><div className="text-[11px] text-ink-4">{k}</div><div className="mt-0.5 font-medium text-ink">{v}</div></div>
}

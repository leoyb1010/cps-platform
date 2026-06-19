import {
  ShieldAlert,
  Fingerprint,
  Bot,
  Repeat,
  Crosshair,
  Timer,
  Gauge,
} from 'lucide-react'
import {
  Card,
  CardTitle,
  Stat,
  PageHeader,
  Badge,
  Button,
  BrandMark,
  TableShell,
  Th,
  Td,
  Row,
  TONE,
} from '../components/ui/primitives'
import { useState } from 'react'
import { Meter } from '../components/ui/charts'
import { Modal, useToast } from '../components/ui/overlays'
import { Field, Select, Input } from '../components/ui/forms'
import { brandById, agentById } from '../lib/data'
import { cx } from '../lib/format'

const RULES = [
  { name: '同设备 / IP 批量', cond: '同设备 60 分钟内 ≥ 5 单', action: '降权 + 复核', on: true },
  { name: '空包单 / 秒退单', cond: '24h 内退款 ≤ 5 分钟占比 > 20%', action: '限流', on: true },
  { name: '模拟器农场', cond: '设备指纹命中模拟器特征', action: '拦截', on: true },
  { name: '异常退款集中', cond: '单代理日退款率 > 8%', action: '冻结结算', on: true },
  { name: '归因劫持', cond: '点击-转化时差 < 3 秒', action: '拦截 + 告警', on: true },
  { name: '异常转化时差', cond: '曝光-转化 < 2 秒', action: '限流', on: false },
]

const SIGNALS = [
  { icon: Fingerprint, name: '同设备 / IP 批量', hits: 142, tone: 'alert' as const },
  { icon: Timer, name: '异常转化时差', hits: 86, tone: 'warn' as const },
  { icon: Bot, name: '模拟器农场', hits: 53, tone: 'alert' as const },
  { icon: Repeat, name: '空包单 / 秒退单', hits: 119, tone: 'warn' as const },
  { icon: Gauge, name: '异常退款集中', hits: 34, tone: 'alert' as const },
  { icon: Crosshair, name: '归因劫持', hits: 27, tone: 'violet' as const },
]

const EVENTS = [
  { time: '14:31', agentId: 'A-4410', brandId: 'mango', sig: '空包单 / 秒退单', action: '降权 + 复核', tone: 'warn' as const },
  { time: '14:18', agentId: 'A-8420', brandId: 'ximalaya', sig: '同设备批量 + 异常退款', action: '已拉黑', tone: 'alert' as const },
  { time: '13:55', agentId: 'A-6093', brandId: 'zhihu', sig: '模拟器农场', action: '冻结结算', tone: 'alert' as const },
  { time: '13:40', agentId: 'A-4410', brandId: 'mango', sig: '归因劫持', action: '拦截 + 告警', tone: 'violet' as const },
  { time: '13:12', agentId: 'A-7180', brandId: 'bilibili', sig: '异常转化时差', action: '限流', tone: 'warn' as const },
]

const DEFENSE = [
  { phase: '事前', title: '准入与素材', items: ['落地页强制合规元素（扣费告知/退订入口）', '素材机审 + 人审双闸', '代理资质审核 + 信用初始分'] },
  { phase: '事中', title: '实时风控引擎', items: ['防作弊：刷量/空包/归因劫持识别', '高风险扣费拦截', '商户号健康联动降速/熔断'] },
  { phase: '事后', title: '售后与仲裁', items: ['统一投诉工单 + SLA', '秒级退订 + 规则退款', '退款逆向冲账 + 责任仲裁'] },
]

export default function Risk() {
  const toast = useToast()
  const [rules, setRules] = useState(RULES)
  const [cfg, setCfg] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  return (
    <>
      <PageHeader
        title="风控中心"
        desc="事前 / 事中 / 事后三道防线。投诉率是投放的第二目标函数 —— 风控不仅在支付侧，更要能踩投放的刹车。"
        actions={
          <>
            <Button variant="ghost" onClick={() => setCfg(true)}>规则配置</Button>
            <Button variant="primary" onClick={() => toast({ tone: 'info', text: '风控大盘已是当前页' })}><ShieldAlert size={14} /> 风控大盘</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="今日拦截作弊单" value="461" deltaTone="good" sub={<span>挽回预估 ¥18,400</span>} /></Card>
        <Card><Stat label="防作弊命中率" value="98.7%" sub={<span>误杀率 0.3%</span>}><Meter value={98.7} tone="good" /></Stat></Card>
        <Card><Stat label="高风险代理" value="3" sub={<span className="text-alert-ink">已降权/冻结/拉黑</span>} /></Card>
        <Card><Stat label="实时风控规则" value="64" unit="条" sub={<span>含 12 条新增策略</span>} /></Card>
      </div>

      {/* 三道防线 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {DEFENSE.map((d, i) => (
          <Card key={d.phase}>
            <div className="mb-3 flex items-center gap-2">
              <span className={cx('grid h-7 w-7 place-items-center rounded-lg text-[12px] font-semibold', i === 0 ? 'bg-info-soft text-info-ink' : i === 1 ? 'bg-warn-soft text-warn-ink' : 'bg-good-soft text-good-ink')}>{i + 1}</span>
              <div>
                <span className="text-[11px] text-ink-4">{d.phase}</span>
                <h3 className="text-[13.5px] font-semibold text-ink">{d.title}</h3>
              </div>
            </div>
            <ul className="space-y-1.5">
              {d.items.map((x) => (
                <li key={x} className="flex items-start gap-2 text-[12px] text-ink-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-4" /> {x}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {/* 防作弊信号 + 事件 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardTitle title="防作弊信号" desc="本月命中次数" />
          <div className="space-y-2.5">
            {SIGNALS.map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', TONE[s.tone].soft, TONE[s.tone].ink)}>
                  <s.icon size={15} />
                </span>
                <span className="flex-1 text-[12.5px] text-ink-2">{s.name}</span>
                <span className="tnum text-[13px] font-medium text-ink">{s.hits}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-3" pad={false}>
          <div className="flex items-center justify-between p-5 pb-3">
            <CardTitle title="实时风控事件" desc="自动处置 + 人工复核" />
            <Badge tone="alert" dot>实时</Badge>
          </div>
          <TableShell
            className="px-2 pb-2"
            head={<><Th className="pl-3">时间</Th><Th>代理</Th><Th>品牌</Th><Th>命中信号</Th><Th right>处置</Th></>}
          >
            {EVENTS.map((e, i) => {
              const a = agentById(e.agentId)
              const b = brandById(e.brandId)!
              return (
                <Row key={i}>
                  <Td className="pl-3 tnum text-[12px] text-ink-4">{e.time}</Td>
                  <Td><span className="text-[12.5px] font-medium text-ink">{a?.name ?? e.agentId}</span><div className="text-[11px] text-ink-4">{e.agentId}</div></Td>
                  <Td><div className="flex items-center gap-2"><BrandMark mark={b.mark} size={22} /><span className="text-[12px] text-ink-3">{b.name.slice(0, 5)}</span></div></Td>
                  <Td><span className="text-[12px] text-ink-2">{e.sig}</span></Td>
                  <Td right><Badge tone={e.tone}>{e.action}</Badge></Td>
                </Row>
              )
            })}
          </TableShell>
        </Card>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface p-4 text-[12.5px] leading-relaxed text-ink-3">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-ink-3" />
        <span><span className="font-medium text-ink-2">投放刹车联动：</span>当某品牌某商户号投诉率逼近阈值，风控自动收紧该品牌投放量、提示代理降速、暂停高客诉素材——避免代理为冲量牺牲号的健康。第一目标函数为 ROI/LTV，第二目标函数为投诉率。</span>
      </div>

      <Modal open={cfg} onClose={() => setCfg(false)} width={560} title="风控规则引擎" footer={<Button variant="ghost" onClick={() => setCfg(false)}>关闭</Button>}>
        <div className="mb-3 text-[12px] text-ink-3">条件 → 阈值 → 动作。点规则可编辑阈值与处置动作。</div>
        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={r.name} className="flex items-center gap-3 rounded-lg border border-line p-3">
              <button onClick={() => setEditIdx(i)} className="min-w-0 flex-1 text-left">
                <div className="text-[12.5px] font-medium text-ink transition-colors hover:text-brand">{r.name}</div>
                <div className="mt-0.5 text-[11px] text-ink-4">{r.cond} → <span className="text-ink-3">{r.action}</span></div>
              </button>
              <button
                onClick={() => { setRules((rs) => rs.map((x, k) => (k === i ? { ...x, on: !x.on } : x))); toast({ tone: r.on ? 'warn' : 'good', text: `${r.name} 已${r.on ? '停用' : '启用'}` }) }}
                className={cx('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors', r.on ? 'bg-ink' : 'bg-line-strong')}
              >
                <span className={cx('absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all', r.on ? 'left-[18px]' : 'left-[2px]')} />
              </button>
            </div>
          ))}
        </div>
        <Button variant="soft" className="mt-3 w-full justify-center" onClick={() => toast({ tone: 'info', text: '新规则草稿已创建（演示）' })}>+ 新增规则</Button>
      </Modal>

      <Modal
        open={editIdx !== null}
        onClose={() => setEditIdx(null)}
        title="编辑规则"
        footer={<><Button variant="ghost" onClick={() => setEditIdx(null)}>取消</Button><button onClick={() => { setEditIdx(null); toast({ tone: 'good', text: '规则已保存' }) }} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">保存</button></>}
      >
        {editIdx !== null && (
          <div className="space-y-3.5">
            <Field label="规则名称"><Input defaultValue={rules[editIdx].name} /></Field>
            <Field label="触发条件"><Input defaultValue={rules[editIdx].cond} /></Field>
            <Field label="处置动作"><Select defaultValue={rules[editIdx].action}><option>降权 + 复核</option><option>限流</option><option>拦截</option><option>拦截 + 告警</option><option>冻结结算</option></Select></Field>
          </div>
        )}
      </Modal>
    </>
  )
}

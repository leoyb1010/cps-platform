import { useState } from 'react'
import {
  Sliders,
  ShieldAlert,
  Landmark,
  Lock,
  Check,
} from 'lucide-react'
import {
  Card,
  CardTitle,
  PageHeader,
  Badge,
  Button,
} from '../components/ui/primitives'
import { useToast } from '../components/ui/overlays'
import { InviteMemberModal } from '../components/ui/MemberModals'
import { useStore, setPlatformConfig, setPlatformParams, setChannelState } from '../lib/store'
import { cx } from '../lib/format'

const CHANNEL_META: { name: string; note: string }[] = [
  { name: '连连支付 · 分账', note: '主通道 · 已签分账协议' },
  { name: '汇付天下 · 分账', note: '容灾通道' },
  { name: '微信支付 · 官方分账', note: '直连品牌使用' },
  { name: '支付宝 · 分账', note: '直连品牌使用' },
  { name: '银行二类户 · 存管', note: '接入评估中' },
]

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors', on ? 'bg-ink' : 'bg-line-strong')}
    >
      <span className={cx('absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-all', on ? 'left-[18px]' : 'left-[2px]')} />
    </button>
  )
}

// 可编辑数值字段：失焦/回车保存（持久化 + 回读）
function NumField({ label, note, value, suffix, onSave, step = 1, min = 0, max = 1000 }: { label: string; note?: string; value: number; suffix?: string; onSave: (v: number) => void; step?: number; min?: number; max?: number }) {
  const [v, setV] = useState(String(value))
  const commit = () => { const n = Math.min(max, Math.max(min, +v || 0)); onSave(n); setV(String(n)) }
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/70 py-3 last:border-0">
      <div>
        <div className="text-[12.5px] font-medium text-ink">{label}</div>
        {note && <div className="text-[11.5px] text-ink-4">{note}</div>}
      </div>
      <div className="flex items-center gap-1">
        <input type="number" step={step} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="tnum w-[68px] rounded-lg border border-line bg-surface px-2 py-1.5 text-right text-[12.5px] font-medium text-ink outline-none focus:border-brand" />
        {suffix && <span className="text-[12px] text-ink-4">{suffix}</span>}
      </div>
    </div>
  )
}

// 紧凑内联数字输入（费率区间用）
function NumFieldInline({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value))
  return (
    <input type="number" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { const n = Math.min(100, Math.max(0, +v || 0)); onSave(n); setV(String(n)) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="tnum w-[52px] rounded-lg border border-line bg-surface px-2 py-1.5 text-right text-[12.5px] font-medium text-ink outline-none focus:border-brand" />
  )
}

function SwitchRow({ label, note, on, set }: { label: string; note: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/70 py-3 last:border-0">
      <div>
        <div className="text-[12.5px] font-medium text-ink">{label}</div>
        <div className="text-[11.5px] text-ink-4">{note}</div>
      </div>
      <Toggle on={on} onClick={() => set(!on)} />
    </div>
  )
}

export default function Settings() {
  const { platformConfig: sw, platformParams: pp, channelStates, brands, agents } = useStore()
  const set = (k: keyof typeof sw) => (v: boolean) => setPlatformConfig({ [k]: v })
  const toast = useToast()
  const [invite, setInvite] = useState(false)
  // 供邀请弹窗选 scope（品牌/代理角色建号需绑定主体）
  const scopeOptions = { brands: brands.map((b) => ({ id: b.id, name: b.name })), agents: agents.map((a) => ({ id: a.id, name: a.name })) }

  return (
    <>
      <PageHeader
        title="配置中心"
        desc="平台参数、风控阈值默认值、持牌分账通道、数据隔离与权限审计。业务规则全部参数化，新品牌接入即配即生效。"
        actions={<Button variant="primary" busyMs={420} onClick={() => { setPlatformConfig(sw); toast({ tone: 'good', text: '配置已保存' }) }}><Check size={14} /> 保存配置</Button>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="平台参数" desc="默认结算与费率口径 · 可编辑即存" right={<Sliders size={15} className="text-ink-3" />} />
          <NumField label="平台默认服务费" note="占可分配池" value={pp.serviceFeePct} suffix="%" onSave={(v) => setPlatformParams({ serviceFeePct: v })} max={100} />
          <div className="flex items-center justify-between gap-4 border-b border-line/70 py-3">
            <div><div className="text-[12.5px] font-medium text-ink">品牌费率区间</div><div className="text-[11.5px] text-ink-4">给「平台+代理」总分润</div></div>
            <div className="flex items-center gap-1.5">
              <NumFieldInline value={pp.feeRangeLow} onSave={(v) => setPlatformParams({ feeRangeLow: v })} />
              <span className="text-ink-4">–</span>
              <NumFieldInline value={pp.feeRangeHigh} onSave={(v) => setPlatformParams({ feeRangeHigh: v })} />
              <span className="text-[12px] text-ink-4">%</span>
            </div>
          </div>
          <NumField label="默认结算账期" note="按品牌可调 T+7 / T+15 / T+30" value={pp.defaultPeriod} suffix="天" onSave={(v) => setPlatformParams({ defaultPeriod: v })} max={365} />
          <NumField label="代理分润占比" note="占可分配池，平台留存其余" value={pp.agentSharePct} suffix="%" onSave={(v) => setPlatformParams({ agentSharePct: v })} max={100} />
        </Card>

        <Card>
          <CardTitle title="风控阈值默认值" desc="商户号红线与联动 · 可编辑即存" right={<ShieldAlert size={15} className="text-ink-3" />} />
          <NumField label="投诉率红线 %" note="近 7 天累计；逼近 0.6 平台内部降权" value={pp.complaintRedline} suffix="%" step={0.1} onSave={(v) => setPlatformParams({ complaintRedline: v })} max={100} />
          <NumField label="升级投诉率红线 %" note="0.05–0.1 整改警告" value={pp.escalatedRedline} suffix="%" step={0.01} onSave={(v) => setPlatformParams({ escalatedRedline: v })} max={100} />
          <NumField label="72h 投诉完结率 %" note="90–95 整改警告" value={pp.close72hTarget} suffix="%" onSave={(v) => setPlatformParams({ close72hTarget: v })} max={100} />
          <SwitchRow label="阈值自动熔断" note="逼近红线自动停止进单" on={sw.autoFuse} set={set('autoFuse')} />
          <SwitchRow label="投诉率反向控投放" note="风控可踩投放刹车" on={sw.throttleAds} set={set('throttleAds')} />
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle title="持牌分账通道" desc="过路资金只走持牌机构 · 平台仅下发指令（规避二清）" right={<Landmark size={15} className="text-ink-3" />} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CHANNEL_META.map((c) => {
            const st = channelStates[c.name] ?? 'review'
            return (
              <div key={c.name} className="flex items-center justify-between rounded-xl border border-line p-3">
                <div>
                  <div className="text-[12.5px] font-medium text-ink">{c.name}</div>
                  <div className="text-[11.5px] text-ink-4">{c.note}</div>
                </div>
                <button onClick={() => setChannelState(c.name, st === 'live' ? 'review' : 'live')} title="点击启用/置为评估中">
                  <Badge tone={st === 'live' ? 'good' : 'warn'} dot>{st === 'live' ? '已启用' : '评估中'}</Badge>
                </button>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="数据隔离与税务" desc="多租户最小授权" right={<Lock size={15} className="text-ink-3" />} />
          <SwitchRow label="品牌数据隔离" note="品牌只能看自己的数据" on={sw.isolateBrand} set={set('isolateBrand')} />
          <SwitchRow label="代理数据隔离" note="代理只能看自己的数据" on={sw.isolateAgent} set={set('isolateAgent')} />
          <SwitchRow label="风险准备金自动冻结" note="按品牌比例账期冻结" on={sw.reserveAuto} set={set('reserveAuto')} />
          <SwitchRow label="个人佣金灵活用工开票" note="规避无票打款税务风险" on={sw.flexTax} set={set('flexTax')} />
        </Card>

        <Card>
          <CardTitle title="权限与审计" desc="操作留痕 · 满足合规取证" right={<button onClick={() => setInvite(true)} className="text-[12px] font-medium text-brand hover:text-brand-hover">+ 邀请成员</button>} />
          <div className="space-y-2">
            {[
              { r: '平台管理员', s: '全部权限', tone: 'brand' as const },
              { r: '财务 / 清结算', s: '资金、对账、提现', tone: 'info' as const },
              { r: '风控 / 售后', s: '风控、工单、退款', tone: 'warn' as const },
              { r: '运营', s: '品牌、代理、选品', tone: 'good' as const },
              { r: '只读审计', s: '查看 + 导出', tone: 'neutral' as const },
            ].map((x) => (
              <div key={x.r} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2">
                <span className="text-[12.5px] font-medium text-ink">{x.r}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] text-ink-4">{x.s}</span>
                  <Badge tone={x.tone}>角色权限</Badge>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <SwitchRow label="全量操作审计" note="资金/权限/配置变更全留痕" on={sw.audit} set={set('audit')} />
          </div>
        </Card>
      </div>

      {invite && <InviteMemberModal scopeOptions={scopeOptions} onClose={() => setInvite(false)} />}
    </>
  )
}

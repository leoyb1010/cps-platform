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
import { Modal, useToast } from '../components/ui/overlays'
import { Field as FormField, Input, Select } from '../components/ui/forms'
import { cx } from '../lib/format'

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

function Field({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/70 py-3 last:border-0">
      <div>
        <div className="text-[12.5px] font-medium text-ink">{label}</div>
        {note && <div className="text-[11.5px] text-ink-4">{note}</div>}
      </div>
      <div className="flex items-center gap-2">
        <span className="tnum rounded-lg bg-surface-muted px-3 py-1.5 text-[12.5px] font-medium text-ink">{value}</span>
      </div>
    </div>
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

const CHANNELS = [
  { name: '连连支付 · 分账', status: 'live', note: '主通道 · 已签分账协议' },
  { name: '汇付天下 · 分账', status: 'live', note: '容灾通道' },
  { name: '微信支付 · 官方分账', status: 'live', note: '直连品牌使用' },
  { name: '支付宝 · 分账', status: 'live', note: '直连品牌使用' },
  { name: '银行二类户 · 存管', status: 'review', note: '接入评估中' },
]

export default function Settings() {
  const [sw, setSw] = useState({
    autoFuse: true,
    throttleAds: true,
    reserveAuto: true,
    isolateBrand: true,
    isolateAgent: true,
    flexTax: true,
    audit: true,
  })
  const set = (k: keyof typeof sw) => (v: boolean) => setSw((s) => ({ ...s, [k]: v }))
  const toast = useToast()
  const [invite, setInvite] = useState(false)

  return (
    <>
      <PageHeader
        title="配置中心"
        desc="平台参数、风控阈值默认值、持牌分账通道、数据隔离与权限审计。业务规则全部参数化，新品牌接入即配即生效。"
        actions={<Button variant="primary" busyMs={420} onClick={() => toast({ tone: 'good', text: '配置已保存' })}><Check size={14} /> 保存配置</Button>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="平台参数" desc="默认结算与费率口径" right={<Sliders size={15} className="text-ink-3" />} />
          <Field label="平台默认服务费" value="占可分配池 21%" note="品牌可单独协商" />
          <Field label="品牌费率区间" value="40% – 52%" note="给「平台+代理」总分润" />
          <Field label="默认结算账期" value="T+7" note="按品牌可调 T+7 / T+15 / T+30" />
          <Field label="代理分润占比" value="可分配池 72%" note="平台留存其余" />
        </Card>

        <Card>
          <CardTitle title="风控阈值默认值" desc="商户号红线与联动" right={<ShieldAlert size={15} className="text-ink-3" />} />
          <Field label="投诉率红线" value="< 1%（近7天累计）" note="逼近 0.6% 平台内部降权" />
          <Field label="升级投诉率红线" value="< 0.1%" note="0.05–0.1% 整改警告" />
          <Field label="72h 投诉完结率" value="≥ 95%" note="90–95% 整改警告" />
          <SwitchRow label="阈值自动熔断" note="逼近红线自动停止进单" on={sw.autoFuse} set={set('autoFuse')} />
          <SwitchRow label="投诉率反向控投放" note="风控可踩投放刹车" on={sw.throttleAds} set={set('throttleAds')} />
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle title="持牌分账通道" desc="过路资金只走持牌机构 · 平台仅下发指令（规避二清）" right={<Landmark size={15} className="text-ink-3" />} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <div key={c.name} className="flex items-center justify-between rounded-xl border border-line p-3">
              <div>
                <div className="text-[12.5px] font-medium text-ink">{c.name}</div>
                <div className="text-[11.5px] text-ink-4">{c.note}</div>
              </div>
              <Badge tone={c.status === 'live' ? 'good' : 'warn'} dot>{c.status === 'live' ? '已启用' : '评估中'}</Badge>
            </div>
          ))}
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

      <Modal open={invite} onClose={() => setInvite(false)} title="邀请成员" footer={<><Button variant="ghost" onClick={() => setInvite(false)}>取消</Button><button onClick={() => { setInvite(false); toast({ tone: 'good', text: '邀请已发送' }) }} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">发送邀请</button></>}>
        <div className="space-y-3.5">
          <FormField label="成员邮箱 / 手机" required><Input placeholder="name@company.com" /></FormField>
          <FormField label="分配角色"><Select defaultValue="运营"><option>平台管理员</option><option>财务 / 清结算</option><option>风控 / 售后</option><option>运营</option><option>只读审计</option></Select></FormField>
          <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">RBAC 三级权限：路由级 + 操作级 + 数据级（品牌只见自身、代理只见自身）。所有写操作进审计日志。</div>
        </div>
      </Modal>
    </>
  )
}

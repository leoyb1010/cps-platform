import { useState } from 'react'
import { Download, ScrollText, ShieldCheck } from 'lucide-react'
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
} from '../components/ui/primitives'
import { EmptyState } from '../components/ui/forms'
import { useToast } from '../components/ui/overlays'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { isRealApi } from '../lib/http'
import { adminApi, useApi } from '../lib/adminApi'
import type { Tone } from '../lib/data'

type Cat = 'all' | 'fund' | 'risk' | 'config'
interface AuditRow {
  id: string
  t: string
  actor: string
  text: string
  tone: Tone
  cat: Exclude<Cat, 'all'> | 'other'
}
const CAT_OF = (text: string): Exclude<Cat, 'all'> | 'other' => {
  if (/退款|冲账|结算|提现|对账|分润/.test(text)) return 'fund'
  if (/限流|冻结|熔断|拉黑|风控|暂停|号池/.test(text)) return 'risk'
  if (/配置|阈值|通道|品牌.*更新|角色|权限/.test(text)) return 'config'
  return 'other'
}
const CAT_LABEL: Record<Exclude<Cat, 'all'> | 'other', { label: string; tone: Tone }> = {
  fund: { label: '资金', tone: 'good' },
  risk: { label: '风控', tone: 'alert' },
  config: { label: '配置', tone: 'info' },
  other: { label: '其它', tone: 'neutral' },
}

export default function Audit() {
  const s = useStore()
  const user = useAuth()
  const toast = useToast()
  const [cat, setCat] = useState<Cat>('all')

  // 真实模式：从服务端审计日志取数（落库、append-only）；mock 模式：本会话联动事件流
  const remote = useApi(() => adminApi.audit(), [])
  const rows: AuditRow[] = isRealApi
    ? (remote.data ?? []).map((a) => ({
        id: a.id,
        t: new Date(a.at).toLocaleString('zh-CN', { hour12: false }),
        actor: a.actorName,
        text: a.detail || `${a.action}`,
        tone: a.category === 'fund' ? 'good' : a.category === 'risk' ? 'alert' : 'neutral',
        cat: (['fund', 'risk', 'config'].includes(a.category) ? a.category : 'other') as AuditRow['cat'],
      }))
    : // mock 活动流不携带操作者：标注为「当前会话」而非冒用当前用户名——
      // 否则切换角色后，别人触发的历史事件也全被记到新用户名下（审计语义失真）
      s.activity.map((a) => ({ id: String(a.id), t: a.t, actor: `本会话（${user?.name ?? '演示'}）`, text: a.text, tone: a.tone, cat: CAT_OF(a.text) }))

  const list = rows.filter((r) => (cat === 'all' ? true : r.cat === cat))
  const fundCount = rows.filter((r) => r.cat === 'fund').length
  const riskCount = rows.filter((r) => r.cat === 'risk').length

  const exportCsv = () => {
    const head = ['时间', '操作人', '类别', '内容']
    const body = list.map((r) => [r.t, r.actor, CAT_LABEL[r.cat].label, r.text.replace(/,/g, '，')])
    const csv = '﻿' + [head, ...body].map((x) => x.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = '操作审计日志.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    toast({ tone: 'good', text: '审计日志已导出 CSV' })
  }

  return (
    <>
      <PageHeader
        title="操作审计 / 系统日志"
        desc="资金 / 风控 / 配置 等关键操作全留痕，append-only 不可篡改，可检索可导出，满足合规取证。"
        actions={<Button variant="ghost" busyMs={400} onClick={exportCsv}><Download size={14} /> 导出日志</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card mark><Stat label="日志条数" value={String(rows.length)} sub={<span>{isRealApi ? '服务端落库累计' : '本会话累计'}</span>} /></Card>
        <Card mark><Stat label="资金类操作" value={String(fundCount)} hint="结算/冲账/提现/退款" sub={<span className="text-good-ink">重点留痕</span>} /></Card>
        <Card mark><Stat label="风控处置" value={String(riskCount)} sub={<span>限流/冻结/熔断/拉黑</span>} /></Card>
        <Card mark><Stat label="留痕完整度" value="100%" deltaTone="good" sub={<span className="flex items-center gap-1"><ShieldCheck size={12} /> 写操作全捕获</span>} /></Card>
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle title="审计明细" desc="按类别筛选 · 处理待办与配置变更会实时记入" />
          <Segmented value={cat} onChange={setCat} options={[{ value: 'all', label: '全部' }, { value: 'fund', label: '资金' }, { value: 'risk', label: '风控' }, { value: 'config', label: '配置' }]} />
        </div>
        {isRealApi && remote.loading ? (
          <div className="px-5 pb-8 pt-2 text-[12.5px] text-ink-4">正在从服务端加载审计日志…</div>
        ) : isRealApi && remote.error ? (
          <EmptyState icon={<ScrollText size={20} />} title="审计日志加载失败" desc={remote.error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<ScrollText size={20} />} title="暂无审计记录" desc="在投诉工单退款、号池干预、结算、配置等操作后，这里会实时记录操作链路" />
        ) : (
          <TableShell className="px-2 pb-2" empty="该类别下暂无记录" head={<><Th className="pl-3">时间</Th><Th>操作人</Th><Th>类别</Th><Th>内容</Th></>}>
            {list.map((r) => (
              <Row key={r.id}>
                <Td className="pl-3" mono><span className="text-ink-3">{r.t}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand-ink ring-1 ring-brand/15">{(r.actor ?? '系').slice(0, 1)}</span>
                    <span className="text-[12px] text-ink-2">{r.actor}</span>
                  </div>
                </Td>
                <Td><Badge tone={CAT_LABEL[r.cat].tone}>{CAT_LABEL[r.cat].label}</Badge></Td>
                <Td><span className={r.tone === 'alert' ? 'text-alert-ink' : 'text-ink-2'}>{r.text}</span></Td>
              </Row>
            ))}
          </TableShell>
        )}
      </Card>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface p-4 text-[12.5px] leading-relaxed text-ink-3">
        <ScrollText size={16} className="mt-0.5 shrink-0 text-ink-3" />
        <span>
          <span className="font-medium text-ink-2">说明：</span>演示态下审计来自本会话的跨模块联动事件流；接入 v4 后端后，所有写操作经统一拦截器落库（含 before→after diff、操作人、IP/UA），append-only 防篡改，长期留存。
        </span>
      </div>
    </>
  )
}

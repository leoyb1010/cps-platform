import { useLocation, useNavigate } from 'react-router-dom'
import { Segmented } from '../../components/ui/primitives'
import { useCan } from '../../lib/auth'
import Risk from '../Risk'
import Complaints from '../Complaints'
import Compliance from '../Compliance'

type Tab = 'risk' | 'complaints' | 'compliance'

const ROUTE: Record<Tab, string> = {
  risk: '/risk',
  complaints: '/complaints',
  compliance: '/compliance',
}

// 风控合规工作台：把风控中心 / 投诉工单 / 资金合规三页合并为一个 Tab 工作台。
// 三个子页组件 body 零改、各自渲染自己的 PageHeader（当前 Tab 上下文）。
// 保留三条独立路由（/risk · /complaints · /compliance），切 Tab 即切 URL —— 这样
// guides 按 base 路由查指引、面包屑、深链全部继续工作，无需改 guides.ts/TITLES。
export default function RiskWorkspace() {
  const can = useCan()
  const loc = useLocation()
  const nav = useNavigate()

  // 按权限决定哪些 Tab 可见（与角色矩阵对齐：risk.read / ticket.read / compliance.view）
  const tabs = (
    [
      can('risk.read') && { value: 'risk' as const, label: '风控中心' },
      can('ticket.read') && { value: 'complaints' as const, label: '投诉工单' },
      can('compliance.view') && { value: 'compliance' as const, label: '资金合规' },
    ] as ({ value: Tab; label: string } | false)[]
  ).filter(Boolean) as { value: Tab; label: string }[]

  // 当前 Tab 由路径决定（深链 /complaints 直接落到投诉工单）；越权回落到首个可见 Tab。
  // 三个权限一个都没有 → 明确拒绝（此前 ?? 'risk' 会给无权限用户渲染整个风控中心）。
  const fromPath = (Object.keys(ROUTE) as Tab[]).find((t) => ROUTE[t] === loc.pathname)
  const active: Tab | null = (fromPath && tabs.some((t) => t.value === fromPath) ? fromPath : tabs[0]?.value) ?? null

  const setTab = (t: Tab) => nav(ROUTE[t])

  if (!active) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface-muted p-12 text-center text-[13px] text-ink-3">
        当前角色没有风控/工单/合规查看权限。如需访问请联系管理员在「成员与角色」调整。
      </div>
    )
  }

  return (
    <>
      {/* 工作台 Tab 条：切换三切面。子页各自渲染自己的 PageHeader（承载 h1 与上下文）。 */}
      {tabs.length > 1 && (
        <div className="mb-4 flex items-center gap-2.5">
          <span className="text-[11px] font-semibold tracking-[0.1em] text-ink-5">风控合规</span>
          <Segmented value={active} options={tabs} onChange={setTab} />
        </div>
      )}
      {active === 'risk' && <Risk />}
      {active === 'complaints' && <Complaints />}
      {active === 'compliance' && <Compliance />}
    </>
  )
}

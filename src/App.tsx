import { useEffect, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth, useCan, bootstrapAuth } from './lib/auth'
import { isRealApi } from './lib/http'
import { hydrateFromServer } from './lib/store'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ClientLayout from './components/layout/ClientLayout'
import { BRAND_NAV_GROUPS, AGENT_NAV_GROUPS } from './components/layout/portalNav'
import PortalLogin, { homeForScope } from './pages/PortalLogin'

// 路由级代码分割：控制台高频页(总览/登录/门户壳)首屏直载；其余按需 lazy 拆包，
// 缩小首包。Suspense 兜底一个轻量加载态。（v9 §5.2 性能预算）
const Brands = lazy(() => import('./pages/Brands'))
const BrandDetail = lazy(() => import('./pages/BrandDetail'))
const Marketplace = lazy(() => import('./pages/Marketplace'))
const Agents = lazy(() => import('./pages/Agents'))
const Orders = lazy(() => import('./pages/Orders'))
const Contracts = lazy(() => import('./pages/Contracts'))
const Barter = lazy(() => import('./pages/Barter'))
const Aigc = lazy(() => import('./pages/Aigc'))
const Products = lazy(() => import('./pages/Products'))
const Settlement = lazy(() => import('./pages/Settlement'))
const Merchants = lazy(() => import('./pages/Merchants'))
const Analytics = lazy(() => import('./pages/Analytics'))
const RiskWorkspace = lazy(() => import('./pages/workspaces/RiskWorkspace'))
const SettlementRun = lazy(() => import('./pages/workspaces/SettlementRun'))
const IncidentRoom = lazy(() => import('./pages/workspaces/IncidentRoom'))
const Settings = lazy(() => import('./pages/Settings'))
const Members = lazy(() => import('./pages/Members'))
const Audit = lazy(() => import('./pages/Audit'))
const Profile = lazy(() => import('./pages/Profile'))
const Supermarket = lazy(() => import('./pages/market/Supermarket'))
const LandingPage = lazy(() => import('./pages/market/LandingPage'))
const MySubscriptions = lazy(() => import('./pages/market/MySubscriptions'))
// 门户页：命名导出，lazy 需包成 default
const BrandHome = lazy(() => import('./pages/portal/BrandPortal').then((m) => ({ default: m.BrandHome })))
const BrandOrders = lazy(() => import('./pages/portal/BrandPortal').then((m) => ({ default: m.BrandOrders })))
const BrandSettlement = lazy(() => import('./pages/portal/BrandPortal').then((m) => ({ default: m.BrandSettlement })))
const BrandOnboarding = lazy(() => import('./pages/portal/BrandPortal').then((m) => ({ default: m.BrandOnboarding })))
const BrandTickets = lazy(() => import('./pages/portal/BrandPortal').then((m) => ({ default: m.BrandTickets })))
const BrandContracts = lazy(() => import('./pages/portal/BrandPortal').then((m) => ({ default: m.BrandContracts })))
const BrandBarter = lazy(() => import('./pages/portal/BrandPortal').then((m) => ({ default: m.BrandBarter })))
const BrandProducts = lazy(() => import('./pages/portal/BrandProducts').then((m) => ({ default: m.BrandProducts })))
const BrandDeveloper = lazy(() => import('./pages/portal/BrandDeveloper').then((m) => ({ default: m.BrandDeveloper })))
const BrandLanding = lazy(() => import('./pages/portal/BrandLanding').then((m) => ({ default: m.BrandLanding })))
const AgentHome = lazy(() => import('./pages/portal/AgentPortal').then((m) => ({ default: m.AgentHome })))
const AgentMarket = lazy(() => import('./pages/portal/AgentPortal').then((m) => ({ default: m.AgentMarket })))
const AgentPlans = lazy(() => import('./pages/portal/AgentPortal').then((m) => ({ default: m.AgentPlans })))
const AgentPayouts = lazy(() => import('./pages/portal/AgentPortal').then((m) => ({ default: m.AgentPayouts })))
const AgentCredit = lazy(() => import('./pages/portal/AgentPortal').then((m) => ({ default: m.AgentCredit })))
const AgentContracts = lazy(() => import('./pages/portal/AgentPortal').then((m) => ({ default: m.AgentContracts })))
const AgentTickets = lazy(() => import('./pages/portal/AgentPortal').then((m) => ({ default: m.AgentTickets })))
const PortalAigc = lazy(() => import('./pages/portal/PortalAigc').then((m) => ({ default: m.PortalAigc })))
const AgentLanding = lazy(() => import('./pages/portal/AgentLanding').then((m) => ({ default: m.AgentLanding })))
const BrandPlaza = lazy(() => import('./pages/portal/BrandPlaza').then((m) => ({ default: m.BrandPlaza })))
const BrandInsights = lazy(() => import('./pages/portal/BrandInsights').then((m) => ({ default: m.BrandInsights })))

// 按 scopeType 分流：未登录按区送对应登录页；越区访问弹回自己的家区。
// 未知 scopeType（新增租户类型/脏数据）不得落到 platform 默认——那等于放进内部控制台外壳，
// 且 homeForScope 对未知值返回 '/' 会与本守卫互相弹跳成死循环。一律视为未授权送回登录页。
const KNOWN_SCOPES = ['platform', 'brand', 'agent'] as const
function RequireScope({ allow, children }: { allow: 'platform' | 'brand' | 'agent'; children: React.ReactNode }) {
  const user = useAuth()
  const loc = useLocation()
  const loginPath = loc.pathname.startsWith('/portal') ? '/portal/login' : '/login'
  if (!user) return <Navigate to={loginPath} replace state={{ from: loc.pathname }} />
  const t = (user.scopeType ?? 'platform') as string
  if (!KNOWN_SCOPES.includes(t as (typeof KNOWN_SCOPES)[number])) return <Navigate to={loginPath} replace />
  if (t !== allow) return <Navigate to={homeForScope(user)} replace />
  return <>{children}</>
}

// 操作级权限守卫：路由不只靠导航隐藏——直接输 URL 也要按权限拦。
// 无权限 → 回总览（audit 等只读角色不该打开配置中心并成功改配置）。
function RequirePerm({ perm, anyPerm, children }: { perm?: string; anyPerm?: string[]; children: React.ReactNode }) {
  const can = useCan()
  const ok = anyPerm ? anyPerm.some((p) => can(p)) : can(perm)
  if (!ok) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  // 真实模式：启动时用 refresh cookie 静默恢复登录态，避免已登录用户被闪到登录页
  const [ready, setReady] = useState(!isRealApi)
  useEffect(() => {
    if (isRealApi)
      bootstrapAuth()
        .then((ok) => (ok ? hydrateFromServer() : undefined))
        .finally(() => setReady(true))
  }, [])
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <div className="flex items-center gap-2 text-[13px] text-ink-4">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-brand" />
          正在恢复会话…
        </div>
      </div>
    )
  }
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-canvas"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" /></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/portal/login" element={<PortalLogin />} />
      <Route path="/market" element={<Supermarket />} />
      <Route path="/market/me" element={<MySubscriptions />} />
      <Route path="/land/:id" element={<LandingPage />} />

      {/* 品牌方门户 */}
      <Route
        element={
          <RequireScope allow="brand">
            <ClientLayout nav={BRAND_NAV_GROUPS} branding={{ name: '品牌方门户', sub: '订阅增长 · 客户端' }} />
          </RequireScope>
        }
      >
        <Route path="/portal/brand" element={<BrandHome />} />
        <Route path="/portal/brand/orders" element={<BrandOrders />} />
        <Route path="/portal/brand/settlement" element={<BrandSettlement />} />
        <Route path="/portal/brand/onboarding" element={<BrandOnboarding />} />
        <Route path="/portal/brand/tickets" element={<BrandTickets />} />
        <Route path="/portal/brand/contracts" element={<BrandContracts />} />
        <Route path="/portal/brand/products" element={<BrandProducts />} />
        <Route path="/portal/brand/developer" element={<BrandDeveloper />} />
        <Route path="/portal/brand/landing" element={<BrandLanding />} />
        <Route path="/portal/brand/barter" element={<BrandBarter />} />
        <Route path="/portal/brand/aigc" element={<PortalAigc />} />
        <Route path="/portal/brand/insights" element={<BrandInsights />} />
        <Route path="/portal/brand/plaza" element={<BrandPlaza />} />
        {/* 未知子路径回品牌门户首页，避免落在空 Outlet 上（与平台console的 * 兜底一致） */}
        <Route path="/portal/brand/*" element={<Navigate to="/portal/brand" replace />} />
      </Route>

      {/* 代理商门户 */}
      <Route
        element={
          <RequireScope allow="agent">
            <ClientLayout nav={AGENT_NAV_GROUPS} branding={{ name: '代理商门户', sub: '订阅增长 · 客户端' }} />
          </RequireScope>
        }
      >
        <Route path="/portal/agent" element={<AgentHome />} />
        <Route path="/portal/agent/market" element={<AgentMarket />} />
        <Route path="/portal/agent/plans" element={<AgentPlans />} />
        <Route path="/portal/agent/payouts" element={<AgentPayouts />} />
        <Route path="/portal/agent/credit" element={<AgentCredit />} />
        <Route path="/portal/agent/contracts" element={<AgentContracts />} />
        <Route path="/portal/agent/tickets" element={<AgentTickets />} />
        <Route path="/portal/agent/aigc" element={<PortalAigc />} />
        <Route path="/portal/agent/landing" element={<AgentLanding />} />
        <Route path="/portal/agent/*" element={<Navigate to="/portal/agent" replace />} />
      </Route>

      {/* 内部控制台（仅平台账户）*/}
      <Route
        element={
          <RequireScope allow="platform">
            <AppLayout />
          </RequireScope>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/brands" element={<RequirePerm perm="brand.read"><Brands /></RequirePerm>} />
        <Route path="/brands/:id" element={<RequirePerm perm="brand.read"><BrandDetail /></RequirePerm>} />
        <Route path="/marketplace" element={<RequirePerm perm="market.view"><Marketplace /></RequirePerm>} />
        <Route path="/agents" element={<RequirePerm perm="agent.read"><Agents /></RequirePerm>} />
        <Route path="/orders" element={<RequirePerm perm="order.read"><Orders /></RequirePerm>} />
        <Route path="/contracts" element={<RequirePerm perm="contract.read"><Contracts /></RequirePerm>} />
        <Route path="/barter" element={<RequirePerm perm="barter.view"><Barter /></RequirePerm>} />
        <Route path="/aigc" element={<RequirePerm perm="aigc.view"><Aigc /></RequirePerm>} />
        <Route path="/products" element={<RequirePerm perm="product.read"><Products /></RequirePerm>} />
        {/* 订阅超市已并入「订阅商品」页；旧直链重定向，避免书签失效 */}
        <Route path="/supermarket" element={<Navigate to="/products" replace />} />
        <Route path="/settlement" element={<RequirePerm perm="settlement.read"><Settlement /></RequirePerm>} />
        <Route path="/settlement/run" element={<RequirePerm perm="settlement.clear"><SettlementRun /></RequirePerm>} />
        <Route path="/merchants" element={<RequirePerm perm="merchant.read"><Merchants /></RequirePerm>} />
        <Route path="/risk/incident/:mid" element={<RequirePerm perm="merchant.write"><IncidentRoom /></RequirePerm>} />
        <Route path="/risk" element={<RequirePerm anyPerm={['risk.read', 'ticket.read', 'compliance.view']}><RiskWorkspace /></RequirePerm>} />
        <Route path="/complaints" element={<RequirePerm anyPerm={['risk.read', 'ticket.read', 'compliance.view']}><RiskWorkspace /></RequirePerm>} />
        <Route path="/compliance" element={<RequirePerm anyPerm={['risk.read', 'ticket.read', 'compliance.view']}><RiskWorkspace /></RequirePerm>} />
        <Route path="/analytics" element={<RequirePerm perm="analytics.view"><Analytics /></RequirePerm>} />
        <Route path="/members" element={<RequirePerm perm="member.manage"><Members /></RequirePerm>} />
        <Route path="/audit" element={<RequirePerm perm="audit.read"><Audit /></RequirePerm>} />
        <Route path="/settings" element={<RequirePerm perm="config.write"><Settings /></RequirePerm>} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  )
}

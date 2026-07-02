import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth, useCan, bootstrapAuth } from './lib/auth'
import { isRealApi } from './lib/http'
import { hydrateFromServer } from './lib/store'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Brands from './pages/Brands'
import BrandDetail from './pages/BrandDetail'
import Marketplace from './pages/Marketplace'
import Agents from './pages/Agents'
import Orders from './pages/Orders'
import Contracts from './pages/Contracts'
import Barter from './pages/Barter'
import Aigc from './pages/Aigc'
import Products from './pages/Products'
import Settlement from './pages/Settlement'
import Merchants from './pages/Merchants'
import Analytics from './pages/Analytics'
import RiskWorkspace from './pages/workspaces/RiskWorkspace'
import SettlementRun from './pages/workspaces/SettlementRun'
import Settings from './pages/Settings'
import Members from './pages/Members'
import Audit from './pages/Audit'
import Profile from './pages/Profile'
import ClientLayout from './components/layout/ClientLayout'
import { BRAND_NAV_GROUPS, AGENT_NAV_GROUPS } from './components/layout/portalNav'
import PortalLogin, { homeForScope } from './pages/PortalLogin'
import Supermarket from './pages/market/Supermarket'
import LandingPage from './pages/market/LandingPage'
import MySubscriptions from './pages/market/MySubscriptions'
import { BrandHome, BrandOrders, BrandSettlement, BrandOnboarding, BrandTickets, BrandContracts, BrandBarter } from './pages/portal/BrandPortal'
import { BrandProducts } from './pages/portal/BrandProducts'
import { BrandDeveloper } from './pages/portal/BrandDeveloper'
import { BrandLanding } from './pages/portal/BrandLanding'
import { AgentHome, AgentMarket, AgentPlans, AgentPayouts, AgentCredit, AgentContracts, AgentTickets } from './pages/portal/AgentPortal'
import { PortalAigc } from './pages/portal/PortalAigc'
import { ComingSoon } from './pages/portal/ComingSoon'
import { AgentLanding } from './pages/portal/AgentLanding'

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
        <Route path="/portal/brand/insights" element={<ComingSoon title="投放透视" desc="按商品聚合代理投放数据：谁在投、投得怎样、转化与退款——看清自己的商品在平台上的表现。（B2 上线）" />} />
        <Route path="/portal/brand/plaza" element={<ComingSoon title="资源广场" desc="平台开放业务橱窗：可接的增长合约挂单 + 可置换的品牌资源。在这里参与平台化联运。（B2 上线）" />} />
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
        <Route path="/supermarket" element={<RequirePerm perm="product.read"><Supermarket embedded /></RequirePerm>} />
        <Route path="/settlement" element={<RequirePerm perm="settlement.read"><Settlement /></RequirePerm>} />
        <Route path="/settlement/run" element={<RequirePerm perm="settlement.clear"><SettlementRun /></RequirePerm>} />
        <Route path="/merchants" element={<RequirePerm perm="merchant.read"><Merchants /></RequirePerm>} />
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
  )
}

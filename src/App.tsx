import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth, bootstrapAuth } from './lib/auth'
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
import Settings from './pages/Settings'
import Members from './pages/Members'
import Audit from './pages/Audit'
import Profile from './pages/Profile'
import ClientLayout from './components/layout/ClientLayout'
import { BRAND_NAV, AGENT_NAV } from './components/layout/portalNav'
import PortalLogin, { homeForScope } from './pages/PortalLogin'
import Supermarket from './pages/market/Supermarket'
import { BrandHome, BrandOrders, BrandSettlement, BrandOnboarding, BrandTickets, BrandContracts, BrandBarter } from './pages/portal/BrandPortal'
import { BrandProducts } from './pages/portal/BrandProducts'
import { BrandLanding } from './pages/portal/BrandLanding'
import { AgentHome, AgentMarket, AgentPlans, AgentPayouts, AgentCredit, AgentContracts, AgentTickets } from './pages/portal/AgentPortal'
import { PortalAigc } from './pages/portal/PortalAigc'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuth()
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

// 按 scopeType 分流：未登录按区送对应登录页；越区访问弹回自己的家区。
function RequireScope({ allow, children }: { allow: 'platform' | 'brand' | 'agent'; children: React.ReactNode }) {
  const user = useAuth()
  const loc = useLocation()
  if (!user) {
    const loginPath = loc.pathname.startsWith('/portal') ? '/portal/login' : '/login'
    return <Navigate to={loginPath} replace state={{ from: loc.pathname }} />
  }
  const t = (user.scopeType ?? 'platform') as 'platform' | 'brand' | 'agent'
  if (t !== allow) return <Navigate to={homeForScope(user)} replace />
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

      {/* 品牌方门户 */}
      <Route
        element={
          <RequireScope allow="brand">
            <ClientLayout nav={BRAND_NAV} branding={{ name: '品牌方门户', sub: '订阅增长 · 客户端' }} />
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
        <Route path="/portal/brand/landing" element={<BrandLanding />} />
        <Route path="/portal/brand/barter" element={<BrandBarter />} />
        <Route path="/portal/brand/aigc" element={<PortalAigc />} />
      </Route>

      {/* 代理商门户 */}
      <Route
        element={
          <RequireScope allow="agent">
            <ClientLayout nav={AGENT_NAV} branding={{ name: '代理商门户', sub: '订阅增长 · 客户端' }} />
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
        <Route path="/brands" element={<Brands />} />
        <Route path="/brands/:id" element={<BrandDetail />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/barter" element={<Barter />} />
        <Route path="/aigc" element={<Aigc />} />
        <Route path="/products" element={<Products />} />
        <Route path="/supermarket" element={<Supermarket embedded />} />
        <Route path="/settlement" element={<Settlement />} />
        <Route path="/merchants" element={<Merchants />} />
        <Route path="/risk" element={<RiskWorkspace />} />
        <Route path="/complaints" element={<RiskWorkspace />} />
        <Route path="/compliance" element={<RiskWorkspace />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/members" element={<Members />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

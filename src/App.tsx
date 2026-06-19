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
import Settlement from './pages/Settlement'
import Merchants from './pages/Merchants'
import Risk from './pages/Risk'
import Complaints from './pages/Complaints'
import Compliance from './pages/Compliance'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Members from './pages/Members'
import Audit from './pages/Audit'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuth()
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
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
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/brands" element={<Brands />} />
        <Route path="/brands/:id" element={<BrandDetail />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/settlement" element={<Settlement />} />
        <Route path="/merchants" element={<Merchants />} />
        <Route path="/risk" element={<Risk />} />
        <Route path="/complaints" element={<Complaints />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/members" element={<Members />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
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

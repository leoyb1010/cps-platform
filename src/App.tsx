import { Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
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

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
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
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

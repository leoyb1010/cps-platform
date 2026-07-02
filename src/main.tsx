import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/ui/overlays.tsx'
import { initTheme, initDensity } from './lib/prefs.ts'

initTheme() // 渲染前套用持久化主题，避免暗色用户首帧闪白
initDensity() // 套用持久化表格密度（--row-h）

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
)

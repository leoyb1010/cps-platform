import { useEffect, useState, Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, LogOut, Bell } from 'lucide-react'
import type { PortalNavGroup } from './portalNav'
import { cx } from '../../lib/format'
import { useAuth, useCan, logout } from '../../lib/auth'
import { portalApi } from '../../lib/portalApi'
import { ReplayContext } from '../ui/primitives'
import { ThemeToggle } from './AppLayout'
import { OfflineBanner } from './OfflineBanner'
import { PageSkeleton } from './PageSkeleton'
import { ErrorBoundary } from './ErrorBoundary'
import { brandTheme } from '../../lib/whitelabel'
import { useTheme, resolvedTheme } from '../../lib/prefs'

// 客户门户外壳：刻意比内部 AppLayout 精简——无命令面板 / 无演示角色切换 /
// 无简洁专家视图 / 无内部导航。仅品牌头部 + 按权限过滤的客户导航 + 退出。
export interface ClientBranding {
  name: string
  sub: string
}

function PortalLogo({ branding }: { branding: ClientBranding }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="./youdao-logo.png" alt="网易有道" className="logo-mark h-[22px] w-auto" />
      <span className="h-[18px] w-px shrink-0 bg-line" />
      <div className="leading-[1.12] whitespace-nowrap">
        <div className="text-[11.5px] font-semibold text-ink">{branding.name}</div>
        <div className="text-[9px] tracking-[0.12em] text-ink-4">{branding.sub}</div>
      </div>
    </div>
  )
}

function ClientSidebar({ groups, branding, open, onClose }: { groups: PortalNavGroup[]; branding: ClientBranding; open: boolean; onClose: () => void }) {
  const can = useCan()
  const user = useAuth()
  // 按权限过滤，空组剔除。分组是心智地图，不折叠（门户导航项少，全展开最清晰）。
  const visibleGroups = groups.map((g) => ({ ...g, items: g.items.filter((it) => can(it.perm)) })).filter((g) => g.items.length > 0)
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink/40 md:hidden" onClick={onClose} />}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col border-r border-line bg-rail transition-transform duration-300 md:z-20 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-[58px] items-center justify-between border-b border-line px-5">
          <PortalLogo branding={branding} />
          <button aria-label="关闭菜单" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-4 hover:bg-surface-muted md:hidden"><X size={16} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-5 pt-2">
          {visibleGroups.map((group, gi) => (
            <div key={group.title} className="mb-0.5">
              {gi > 0 && <div className="mx-2 mb-1 mt-2.5 border-t border-line" />}
              <div className="px-2 pt-2.5 pb-1.5 text-[10.5px] font-semibold tracking-[0.1em] text-ink-5">{group.title}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/portal/brand' || item.to === '/portal/agent'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cx(
                        'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
                        isActive
                          ? 'bg-surface font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(245,51,59,0.22)]'
                          : 'text-ink-2 hover:bg-surface-muted hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute top-1/2 left-0 h-[15px] w-[3px] -translate-y-1/2 rounded-r-[2px] bg-brand" />}
                        <item.icon size={17} strokeWidth={isActive ? 1.8 : 1.6} className={isActive ? 'text-brand' : 'text-ink-3 group-hover:text-ink-2'} />
                        <span className="flex-1 truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-semibold text-white">{user?.name?.[0] ?? '客'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium text-ink">{user?.name}</div>
              <div className="truncate text-[11px] text-ink-4">{branding.name}</div>
            </div>
            <button onClick={() => logout()} aria-label="退出登录" className="grid h-7 w-7 place-items-center rounded-md text-ink-4 hover:bg-surface-muted hover:text-ink"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>
    </>
  )
}

interface Notif { id: string; category: string; title: string; body: string; link: string; read: boolean; createdAt: string }
function PortalBell() {
  const [items, setItems] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  // 演示/真实模式都取数：portalApi 在演示态落到 portalDemo 的 scoped 通知
  const load = () => { portalApi.notifications<Notif[]>().then(setItems).catch(() => {}) }
  useEffect(load, [])
  const unread = items.filter((n) => !n.read).length
  const markRead = async (n: Notif) => { if (!n.read) { await portalApi.readNotif(n.id); load() }; if (n.link) location.hash = n.link; setOpen(false) }
  return (
    <div className="relative">
      <button aria-label="通知" onClick={() => { setOpen((o) => !o); load() }} className="relative grid h-8 w-8 place-items-center rounded-md text-ink-3 hover:bg-surface-muted">
        <Bell size={17} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-brand px-1 text-[9px] font-semibold text-white">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 w-[320px] rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5"><span className="text-[12.5px] font-semibold text-ink">通知</span>{unread > 0 && <span className="text-[11px] text-ink-4">{unread} 条未读</span>}</div>
            <div className="max-h-[360px] overflow-y-auto">
              {items.length === 0 ? <div className="px-3.5 py-6 text-center"><img src="./img/empty-bell.webp" alt="" className="mx-auto mb-1 h-16 w-16 object-contain opacity-90" /><div className="text-[12px] text-ink-4">暂无通知</div></div> : items.map((n) => (
                <button key={n.id} onClick={() => markRead(n)} className={cx('block w-full border-b border-line/60 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-muted', !n.read && 'bg-brand-soft/30')}>
                  <div className="flex items-center gap-1.5"><span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand')} /><span className="text-[12.5px] font-medium text-ink">{n.title}</span></div>
                  <div className="ml-3 mt-0.5 text-[11.5px] leading-snug text-ink-4">{n.body}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function ClientLayout({ nav, branding }: { nav: PortalNavGroup[]; branding: ClientBranding }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const user = useAuth()
  // 品牌白标：品牌门户按该品牌主色换肤（令牌第三层覆盖，组件零改动）。代理门户保持平台色。
  // 订阅主题（useTheme）保证明暗切换时白标重算——暗底下 ink/hover 要提亮而非加深。
  useTheme()
  const wl = user?.scopeType === 'brand' ? brandTheme(user.scopeId, resolvedTheme() === 'dark') : {}
  // 用路由路径作为 replay epoch 的种子：进入/切换页面时让 CountUp 等编排动效从 0 起跳。
  const epoch = loc.pathname.length
  return (
    <ReplayContext.Provider value={{ epoch, replay: () => {} }}>
      <div className="min-h-screen bg-canvas" style={wl}>
        <ClientSidebar groups={nav} branding={branding} open={open} onClose={() => setOpen(false)} />
        <div className="md:pl-[236px]">
          <header className="sticky top-0 z-10 flex h-[58px] items-center gap-3 border-b border-line bg-canvas/85 px-5 backdrop-blur-md">
            <button aria-label="打开菜单" onClick={() => setOpen(true)} className="grid h-8 w-8 place-items-center rounded-md text-ink-3 hover:bg-surface-muted md:hidden"><Menu size={18} /></button>
            <div className="flex items-center gap-2 text-[12.5px] text-ink-4">
              <span>{branding.name}</span>
              <span className="rounded-md bg-good-soft px-1.5 py-0.5 text-[11px] font-medium text-good-ink">客户门户</span>
            </div>
            <div className="ml-auto flex items-center gap-2"><ThemeToggle /><PortalBell /></div>
          </header>
          <main key={loc.pathname} className="mx-auto max-w-[1180px] px-5 py-6">
            <OfflineBanner />
            {/* 壳内错误边界：门户单页异常只塌在内容区，导航保留（main 的 key 含 pathname，换页自动重置错误态） */}
            <Suspense fallback={<PageSkeleton />}>
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </Suspense>
          </main>
        </div>
      </div>
    </ReplayContext.Provider>
  )
}

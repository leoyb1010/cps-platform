import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Search, Bell, ChevronUp, RotateCcw, Menu, X, LogOut, UserCog, Repeat } from 'lucide-react'
import { NAV } from './nav'
import { cx } from '../../lib/format'
import { ReplayContext } from '../ui/primitives'
import { useStore, markAllRead } from '../../lib/store'
import { useAuth, useCan, logout, switchRole, ROLES, type RoleId } from '../../lib/auth'
import { CommandPalette } from './CommandPalette'

function openPalette() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
}

function LogoMark() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="./youdao-logo.png" alt="网易有道" className="h-[22px] w-auto" />
      <span className="h-[18px] w-px shrink-0 bg-line" />
      <div className="leading-[1.12] whitespace-nowrap">
        <div className="text-[11.5px] font-semibold text-ink">CPS 联运</div>
        <div className="text-[9px] tracking-[0.12em] text-ink-4">会员清结算</div>
      </div>
    </div>
  )
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const can = useCan()
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((it) => can(it.perm)) })).filter((g) => g.items.length > 0)
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink/40 md:hidden" onClick={onClose} />}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col border-r border-line bg-[#fbfcfd] transition-transform duration-300 md:z-20 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-[58px] items-center justify-between border-b border-line px-[18px]">
          <LogoMark />
          <button aria-label="关闭菜单" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-4 hover:bg-surface-muted md:hidden"><X size={16} /></button>
        </div>
      <nav className="flex-1 overflow-y-auto px-3 pt-3.5 pb-5">
        {groups.map((group) => (
          <div key={group.title} className="mb-1">
            <div className="px-2 pt-3.5 pb-[5px] text-[10.5px] font-semibold tracking-[0.14em] text-ink-5">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cx(
                      'group relative flex items-center gap-[11px] rounded-[7px] px-2.5 py-2 text-[13.5px] transition-colors',
                      isActive
                        ? 'bg-surface font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(245,51,59,0.22)]'
                        : 'text-ink-2 hover:bg-surface-muted hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute top-1/2 left-0 h-[15px] w-[3px] -translate-y-1/2 rounded-r-[2px] bg-brand" />
                      )}
                      <item.icon
                        size={17}
                        strokeWidth={isActive ? 1.8 : 1.6}
                        className={isActive ? 'text-brand' : 'text-ink-3 group-hover:text-ink-2'}
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="tnum grid h-[17px] min-w-[17px] place-items-center rounded-full bg-brand px-[5px] text-[10.5px] font-semibold text-white">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <AccountMenu />
      </aside>
    </>
  )
}

function Topbar({ title, onReplay, onMenu }: { title: string; onReplay: () => void; onMenu: () => void }) {
  const { activity } = useStore()
  const [bellOpen, setBellOpen] = useState(false)
  const unread = activity.filter((a) => !a.read).length
  return (
    <header className="sticky top-0 z-10 flex h-[58px] items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md md:gap-3.5 md:px-[26px]">
      <button aria-label="打开菜单" onClick={onMenu} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-surface-muted md:hidden"><Menu size={18} /></button>
      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-ink-4">网易有道</span>
        <span className="text-hairtick">/</span>
        <span className="font-semibold text-ink">{title}</span>
      </div>
      <span className="hidden items-center gap-1.5 rounded-[4px] border border-good/30 bg-good/[0.06] px-[9px] py-[3px] text-[11px] text-good-ink md:inline-flex">
        <span className="h-1.5 w-1.5 rounded-full bg-good" />
        生产环境
      </span>
      <div className="ml-auto flex items-center gap-2.5">
        <button onClick={openPalette} className="hidden items-center gap-2.5 rounded-[7px] border border-line bg-surface px-[11px] py-1.5 text-[12.5px] text-ink-3 transition-colors hover:border-line-strong lg:flex">
          <Search size={15} strokeWidth={1.8} />
          <span>搜索品牌 / 代理 / 订单</span>
          <kbd className="tnum rounded-[3px] border border-line px-1.5 text-[10px] text-ink-5">⌘K</kbd>
        </button>
        <button aria-label="搜索" onClick={openPalette} className="grid h-[34px] w-[34px] place-items-center rounded-[7px] border border-line bg-surface text-ink-2 hover:border-brand hover:text-brand lg:hidden"><Search size={15} /></button>
        <button aria-label="重播动效" onClick={onReplay} title="重播动效" className="grid h-[34px] w-[34px] place-items-center rounded-[7px] border border-line bg-surface text-ink-2 transition-colors hover:border-brand hover:text-brand">
          <RotateCcw size={15} strokeWidth={2} />
        </button>
        <div className="relative">
          <button aria-label="通知" onClick={() => { setBellOpen((v) => !v); if (!bellOpen) markAllRead() }} className="relative grid h-[34px] w-[34px] place-items-center rounded-[7px] border border-line bg-surface text-ink-2 hover:border-brand hover:text-brand">
            <Bell size={15} strokeWidth={1.8} />
            {unread > 0 && <span className="absolute top-1.5 right-1.5 h-[7px] w-[7px] rounded-full border-[1.5px] border-surface bg-brand" />}
          </button>
          {bellOpen && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setBellOpen(false)} />
              <div className="absolute right-0 z-[61] mt-2 w-[320px] rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]" style={{ animation: 'revUpSm .2s both' }}>
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5"><span className="text-[13px] font-semibold text-ink">通知 · 联动事件</span><span className="text-[11px] text-ink-4">{activity.length} 条</span></div>
                <div className="max-h-[300px] overflow-y-auto py-1.5">
                  {activity.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[12px] text-ink-4">暂无通知 · 处理待办后这里会记录</div>
                  ) : (
                    activity.map((a) => (
                      <div key={a.id} className="flex items-start gap-2.5 px-4 py-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(--color-${a.tone === 'neutral' ? 'ink-4' : a.tone})` }} />
                        <div className="min-w-0 flex-1"><div className="text-[12px] leading-snug text-ink-2">{a.text}</div><div className="tnum text-[10.5px] text-ink-5">{a.t}</div></div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function AccountMenu() {
  const user = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [roles, setRoles] = useState(false)
  if (!user) return null
  const role = ROLES[user.roleId]
  return (
    <div className="relative border-t border-line p-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-muted"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-ink ring-1 ring-brand/15">
          {user.name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1 leading-[1.25]">
          <span className="block truncate text-[12.5px] font-semibold text-ink">{user.name}</span>
          <span className="block truncate text-[10.5px] text-ink-4">{role.name}</span>
        </span>
        <ChevronUp size={14} className={cx('text-ink-4 transition-transform', !open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => { setOpen(false); setRoles(false) }} />
          <div className="absolute right-2.5 bottom-[58px] left-2.5 z-[56] rounded-xl border border-line bg-surface py-1.5 shadow-[var(--shadow-pop)]" style={{ animation: 'revUpSm .18s both' }}>
            {!roles ? (
              <>
                <MenuRow icon={<UserCog size={14} />} label="个人资料" onClick={() => setOpen(false)} hint={user.account} />
                <MenuRow icon={<Repeat size={14} />} label="切换角色（演示）" onClick={() => setRoles(true)} chevron />
                <div className="my-1 border-t border-line" />
                <MenuRow icon={<LogOut size={14} />} label="退出登录" tone="alert" onClick={() => { logout(); nav('/login', { replace: true }) }} />
              </>
            ) : (
              <>
                <div className="px-3 py-1.5 text-[10.5px] font-medium tracking-wide text-ink-4 uppercase">切换角色</div>
                {(Object.keys(ROLES) as RoleId[]).map((rid) => (
                  <button
                    key={rid}
                    onClick={() => { switchRole(rid); setOpen(false); setRoles(false) }}
                    className={cx('flex w-full items-center justify-between px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-surface-muted', rid === user.roleId ? 'text-brand' : 'text-ink-2')}
                  >
                    <span>{ROLES[rid].name}</span>
                    {rid === user.roleId && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MenuRow({ icon, label, onClick, hint, chevron, tone }: { icon: React.ReactNode; label: string; onClick: () => void; hint?: string; chevron?: boolean; tone?: 'alert' }) {
  return (
    <button onClick={onClick} className={cx('flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-surface-muted', tone === 'alert' ? 'text-alert-ink' : 'text-ink-2')}>
      <span className={tone === 'alert' ? 'text-alert-ink' : 'text-ink-4'}>{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10.5px] text-ink-4">{hint}</span>}
      {chevron && <ChevronUp size={12} className="rotate-90 text-ink-4" />}
    </button>
  )
}

const TITLES: Record<string, string> = {
  '/': '经营总览',
  '/brands': '品牌管理',
  '/marketplace': '选品市场',
  '/agents': '代理商',
  '/orders': '订单 · 订阅',
  '/settlement': '清结算',
  '/merchants': '商户号 · 号池',
  '/risk': '风控中心',
  '/complaints': '投诉工单',
  '/compliance': '资金合规',
  '/analytics': '数据 · 归因',
  '/members': '成员与角色',
  '/audit': '操作审计',
  '/settings': '配置中心',
}

export default function AppLayout() {
  const loc = useLocation()
  const [epoch, setEpoch] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    setNavOpen(false)
  }, [loc.pathname])
  const base = '/' + (loc.pathname.split('/')[1] || '')
  const title = TITLES[base] ?? '经营总览'
  const replay = () => setEpoch((e) => e + 1)

  return (
    <ReplayContext.Provider value={{ epoch, replay }}>
      <div className="min-h-screen">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="grid-bg flex min-h-screen flex-col md:pl-[236px]">
          <Topbar title={title} onReplay={replay} onMenu={() => setNavOpen(true)} />
          <main key={`${loc.pathname}-${epoch}`} className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-10 md:px-[26px]">
            <Outlet />
          </main>
        </div>
        <CommandPalette />
      </div>
    </ReplayContext.Provider>
  )
}

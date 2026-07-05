import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Search, Bell, ChevronUp, RotateCcw, Menu, X, LogOut, UserCog, Repeat, HelpCircle, Sun, Moon, MonitorSmartphone, ChevronDown, Pin, Star, Rows3 } from 'lucide-react'
import { NAV, BOARD_ICON, NAV_BY_TO } from './nav'
import { GuideDrawer } from './GuideDrawer'
import { OfflineBanner } from './OfflineBanner'
import { GUIDES } from '../../lib/guides'
import { useViewMode, setViewMode, useTheme, setTheme, type Theme, useCollapsedGroups, toggleNavGroup, usePinned, togglePinned, useDensity, setDensity } from '../../lib/prefs'
import { Segmented } from '../ui/primitives'
import { cx } from '../../lib/format'
import { ReplayContext } from '../ui/primitives'
import { useStore, markAllRead, on, startLiveFeed, stopLiveFeed } from '../../lib/store'
import { useAuth, useCan, logout, switchRole, ROLES, type RoleId } from '../../lib/auth'
import { isRealApi } from '../../lib/http'
import { useToast } from '../ui/overlays'
import { CommandPalette } from './CommandPalette'
import { CoachMarks } from './CoachMarks'

function openPalette() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
}

/* 主题切换：亮 → 暗 → 跟随系统 三态循环（图标即状态） */
const THEME_ORDER: Theme[] = ['light', 'dark', 'system']
const THEME_META: Record<Theme, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: '明亮' },
  dark: { icon: Moon, label: '暗色' },
  system: { icon: MonitorSmartphone, label: '跟随系统' },
}
export function ThemeToggle() {
  const theme = useTheme()
  const meta = THEME_META[theme]
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]
  return (
    <button
      aria-label={`主题：${meta.label}，点击切换`}
      title={`主题：${meta.label}`}
      onClick={() => setTheme(next)}
      className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-line bg-surface text-ink-2 transition-colors hover:border-brand hover:text-brand"
    >
      <meta.icon size={15} strokeWidth={1.8} />
    </button>
  )
}

function LogoMark() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="./youdao-logo.png" alt="网易有道" className="logo-mark h-[22px] w-auto" />
      <span className="h-[18px] w-px shrink-0 bg-line" />
      <div className="leading-[1.12] whitespace-nowrap">
        <div className="text-[11.5px] font-semibold text-ink">订阅增长交易</div>
        <div className="text-[9px] tracking-[0.12em] text-ink-4">风险清结算平台</div>
      </div>
    </div>
  )
}

// 单条导航项：hover 显出「置顶」图钉；已置顶项渲染实心 Star 可取消。
function NavRow({ item, onClose, pinnable = true }: { item: (typeof NAV)[number]['items'][number]; onClose: () => void; pinnable?: boolean }) {
  const loc = useLocation()
  const pinned = usePinned()
  const isPinned = pinned.includes(item.to)
  const matched = item.activeMatch?.includes(loc.pathname) ?? false
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onClose}
      className={({ isActive }) =>
        cx(
          'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
          isActive || matched ? 'bg-surface font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(245,51,59,0.22)]' : 'text-ink-2 hover:bg-surface-muted hover:text-ink',
        )
      }
    >
      {({ isActive }) => {
        const on = isActive || matched
        return (
          <>
            {on && <span className="absolute top-1/2 left-0 h-[15px] w-[3px] -translate-y-1/2 rounded-r-[2px] bg-brand" />}
            <item.icon size={17} strokeWidth={on ? 1.8 : 1.6} className={on ? 'text-brand' : 'text-ink-3 group-hover:text-ink-2'} />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && !isPinned && (
              <span className="tnum grid h-[17px] min-w-[17px] place-items-center rounded-full bg-brand px-1.5 text-[10.5px] font-semibold text-white group-hover:hidden">{item.badge}</span>
            )}
            {pinnable && (
              <button
                aria-label={isPinned ? '取消置顶' : '置顶到常用'}
                title={isPinned ? '取消置顶' : '置顶到常用'}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePinned(item.to) }}
                className={cx('shrink-0 rounded p-0.5 text-ink-4 transition-opacity hover:text-brand', isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
              >
                {isPinned ? <Star size={13} className="fill-brand text-brand" /> : <Pin size={13} />}
              </button>
            )}
          </>
        )
      }}
    </NavLink>
  )
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const can = useCan()
  const loc = useLocation()
  const collapsed = useCollapsedGroups()
  const pinned = usePinned()
  // 按权限过滤，空组剔除。anyPerm: 任一命中即显示（合并工作台用）。
  const visible = (it: (typeof NAV)[number]['items'][number]) => (it.anyPerm ? it.anyPerm.some((p) => can(p)) : can(it.perm))
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length > 0)
  const firstPlatformIdx = groups.findIndex((g, i) => i > 0 && g.kind === 'platform')
  // 常用置顶：按 pin 顺序取有权限的项（最多 5 条，越权/失效项自动跳过）
  const pinnedItems = pinned.map((to) => NAV_BY_TO[to]).filter((it) => it && visible(it)).slice(0, 5)
  // 当前路由所在分组：强制展开（防"我在哪"迷失）；折叠态聚合徽标（badge 求和 + activeMatch 命中）
  const inGroup = (g: (typeof groups)[number]) => g.items.some((it) => it.to === loc.pathname || (it.activeMatch?.includes(loc.pathname) ?? false))
  const groupBadge = (g: (typeof groups)[number]) => g.items.reduce((s, it) => s + (it.badge ? Number(it.badge) || 0 : 0), 0)
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
          <LogoMark />
          <button aria-label="关闭菜单" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-4 hover:bg-surface-muted md:hidden"><X size={16} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-5 pt-1.5">
          {/* 常用置顶区（用户自定义，可空）——用户自己做的减法，产品不替删 */}
          {pinnedItems.length > 0 && (
            <div className="mb-1.5">
              <div className="flex items-center gap-1.5 px-2 pt-2 pb-1.5 text-[10.5px] font-semibold tracking-[0.1em] text-ink-5">
                <Star size={11} className="fill-brand/70 text-brand" /> 常用
              </div>
              <div className="space-y-0.5">
                {pinnedItems.map((item) => <NavRow key={'pin-' + item.to} item={item} onClose={onClose} />)}
              </div>
              <div className="mx-2 mt-2 border-t border-line" />
            </div>
          )}
          {groups.map((group, gi) => {
            const BIcon = group.kind === 'board' ? BOARD_ICON[group.title] : undefined
            const showBoardDivider = gi === firstPlatformIdx
            const forced = gi === 0 || inGroup(group) // 概览组与当前组永远展开
            const isCollapsed = !forced && collapsed.includes(group.title)
            const badge = groupBadge(group)
            const collapsible = gi > 0 && !forced
            return (
              <div key={group.title} className="mb-0.5">
                {showBoardDivider && <div className="mx-2 mb-1 mt-2.5 border-t border-line" />}
                {gi > 0 && (
                  <button
                    onClick={() => collapsible && toggleNavGroup(group.title)}
                    className={cx(
                      'flex w-full items-center gap-1.5 px-2 pt-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.1em] transition-colors',
                      group.kind === 'board' ? 'text-ink-3' : 'text-ink-5',
                      collapsible && 'cursor-pointer hover:text-ink-2',
                    )}
                    aria-expanded={!isCollapsed}
                  >
                    {BIcon && <BIcon size={12} className="text-brand" />}
                    <span className="flex-1 text-left">{group.title}</span>
                    {/* 折叠态仍显示聚合徽标——折叠不等于失去感知 */}
                    {isCollapsed && badge > 0 && (
                      <span className="tnum grid h-[15px] min-w-[15px] place-items-center rounded-full bg-brand px-1 text-[9.5px] font-semibold text-white">{badge}</span>
                    )}
                    {collapsible && <ChevronDown size={13} className={cx('text-ink-4 transition-transform', isCollapsed && '-rotate-90')} />}
                  </button>
                )}
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => <NavRow key={item.to + item.label} item={item} onClose={onClose} pinnable={gi > 0} />)}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <AccountMenu />
      </aside>
    </>
  )
}

function Topbar({ title, base, onReplay, onMenu, onOpenGuide }: { title: string; base: string; onReplay: () => void; onMenu: () => void; onOpenGuide: () => void }) {
  const { activity } = useStore()
  const [bellOpen, setBellOpen] = useState(false)
  const mode = useViewMode()
  const hasGuide = !!GUIDES[base]
  const unread = activity.filter((a) => !a.read).length
  return (
    <header className="sticky top-0 z-10 flex h-[58px] items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md md:gap-3.5 md:px-6">
      <button aria-label="打开菜单" onClick={onMenu} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-surface-muted md:hidden"><Menu size={18} /></button>
      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-ink-4">网易有道</span>
        <span className="text-hairtick">/</span>
        <span className="font-semibold text-ink">{title}</span>
      </div>
      <span className="hidden items-center gap-1.5 rounded-md border border-good/30 bg-good/[0.06] px-2 py-1 text-[11px] text-good-ink md:inline-flex">
        <span className="h-1.5 w-1.5 rounded-full bg-good" />
        生产环境
      </span>
      <div className="ml-auto flex items-center gap-2.5">
        <div className="hidden md:block" data-coach="viewmode"><Segmented value={mode} onChange={setViewMode} options={[{ value: 'simple', label: '简洁' }, { value: 'expert', label: '专家' }]} /></div>
        {hasGuide && (
          <button aria-label="使用指引" onClick={onOpenGuide} title="使用指引" className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-line bg-surface text-ink-2 transition-colors hover:border-brand hover:text-brand">
            <HelpCircle size={16} strokeWidth={1.8} />
          </button>
        )}
        <button data-coach="search" onClick={openPalette} className="hidden items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:border-line-strong lg:flex">
          <Search size={15} strokeWidth={1.8} />
          <span>搜索品牌 / 代理 / 订单</span>
          <kbd className="tnum rounded-[3px] border border-line px-1.5 text-[10px] text-ink-5">⌘K</kbd>
        </button>
        <button aria-label="搜索" onClick={openPalette} className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:border-brand hover:text-brand lg:hidden"><Search size={15} /></button>
        <ThemeToggle />
        <button aria-label="重播动效" onClick={onReplay} title="重播动效" className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-line bg-surface text-ink-2 transition-colors hover:border-brand hover:text-brand">
          <RotateCcw size={15} strokeWidth={2} />
        </button>
        <div className="relative">
          <button aria-label="通知" onClick={() => { setBellOpen((v) => !v); if (!bellOpen) markAllRead() }} className="relative grid h-[34px] w-[34px] place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:border-brand hover:text-brand">
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
                    <div className="px-4 py-5 text-center"><img src="./img/empty-bell.webp" alt="" className="mx-auto mb-1 h-16 w-16 object-contain opacity-90" /><div className="text-[12px] text-ink-4">暂无通知 · 处理待办后这里会记录</div></div>
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
  const density = useDensity()
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
                <MenuRow icon={<UserCog size={14} />} label="个人资料" onClick={() => { setOpen(false); nav('/profile') }} hint={user.account} />
                {/* 表格密度：舒适/紧凑（仅摆放，不改功能）。财务对账场景常切紧凑一屏多看几行。 */}
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="flex items-center gap-2.5 text-[12.5px] text-ink-2"><Rows3 size={14} className="text-ink-4" /> 表格密度</span>
                  <Segmented value={density} onChange={setDensity} options={[{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }]} />
                </div>
                {/* 角色切换仅演示态可用；真实模式角色只能由后端变更，避免前端伪造权限 */}
                {!isRealApi && <MenuRow icon={<Repeat size={14} />} label="切换角色（演示）" onClick={() => setRoles(true)} chevron />}
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
  '/brands': '品牌 · 入驻',
  '/marketplace': '选品市场',
  '/agents': '代理商',
  '/orders': '订单 · 订阅',
  '/contracts': '增长合约',
  '/barter': '资源置换 · 白名单台账',
  '/aigc': 'AIGC · 素材实验',
  '/products': '订阅商品',
  '/settlement': '清结算',
  '/merchants': '商户号 · 号池',
  '/risk': '风控中心',
  '/complaints': '投诉工单',
  '/compliance': '资金合规',
  '/analytics': '数据 · 归因',
  '/members': '成员与角色',
  '/audit': '操作审计',
  '/settings': '配置中心',
  '/profile': '个人资料',
}

export default function AppLayout() {
  const loc = useLocation()
  const toast = useToast()
  const [epoch, setEpoch] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    setNavOpen(false)
    setGuideOpen(false)
  }, [loc.pathname])
  // 实时事件流：进控制台开启本地 ticker（模拟 SSE），离开清理
  useEffect(() => { startLiveFeed(); return () => stopLiveFeed() }, [])
  // 真实模式：镜像写被服务端拒绝时提示用户（已自动回收服务端真值）
  useEffect(
    () =>
      on('mirror:failed', (p) => {
        const { label, message } = (p as { label?: string; message?: string }) || {}
        toast({ tone: 'alert', text: `${label ?? '操作'}未成功：${message ?? '服务端已拒绝，已同步最新状态'}` })
      }),
    [toast],
  )
  const base = '/' + (loc.pathname.split('/')[1] || '')
  const title = TITLES[base] ?? '经营总览'
  const replay = () => setEpoch((e) => e + 1)

  return (
    <ReplayContext.Provider value={{ epoch, replay }}>
      <div className="min-h-screen">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="grid-bg flex min-h-screen flex-col md:pl-[236px]">
          <Topbar title={title} base={base} onReplay={replay} onMenu={() => setNavOpen(true)} onOpenGuide={() => setGuideOpen(true)} />
          <main key={`${loc.pathname}-${epoch}`} className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-10 md:px-6">
            <OfflineBanner />
            <Outlet />
          </main>
        </div>
        <CommandPalette />
        {/* 指引抽屉渲染在根级（顶栏有 backdrop-blur 会成为 fixed 的包含块，故必须放外面，否则被裁成 58px） */}
        {guideOpen && <GuideDrawer routeKey={base} onClose={() => setGuideOpen(false)} />}
        {/* 首次进入 3 步引导：仅在总览页触发（新人第一站），严格 3 步 */}
        {base === '/' && (
          <CoachMarks
            id="console"
            steps={[
              { anchor: '[data-coach="todo"]', title: '先看今天要做什么', body: '这里汇总所有需要你处理的事——升级投诉、号池熔断、对账差异，点右侧按钮直达处理。' },
              { anchor: '[data-coach="search"]', title: '搜索 · 快捷操作', body: <>按 <kbd className="tnum rounded border border-line px-1 text-[10px]">⌘K</kbd> 随时搜品牌 / 代理 / 订单，后续还能直接键入动作（如「退款 订单号」）。</> },
              { anchor: '[data-coach="viewmode"]', title: '简洁 ↔ 专家', body: '简洁模式只看核心；需要全量图表、明细与批量操作时切「专家」。功能都在，只是换个密度。' },
            ]}
          />
        )}
      </div>
    </ReplayContext.Provider>
  )
}

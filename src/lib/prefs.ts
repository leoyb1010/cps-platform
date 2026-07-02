import { useSyncExternalStore } from 'react'

// 视图偏好（简洁/专家）。external store + localStorage，仿 auth.ts 骨架。
export type ViewMode = 'simple' | 'expert'

const KEY = 'cps-prefs-v1'
function load(): ViewMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'simple' || v === 'expert') return v
  } catch {
    /* ignore */
  }
  return 'simple'
}
let mode: ViewMode = typeof localStorage !== 'undefined' ? load() : 'simple'
const listeners = new Set<() => void>()

export function setViewMode(m: ViewMode) {
  mode = m
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}
export function useViewMode(): ViewMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => mode,
    () => mode,
  )
}

/* ── 主题（明亮 / 暗色 / 跟随系统）────────────────────────────
   令牌级切换：index.css 在 [data-theme='dark'] 下覆盖全部颜色令牌，
   组件零改动即全量换肤。system 档监听 prefers-color-scheme 实时跟随。 */
export type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'cps-theme-v1'
function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}
let theme: Theme = typeof localStorage !== 'undefined' ? loadTheme() : 'system'
const themeListeners = new Set<() => void>()
const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

/** 解析后的实际外观（system → 按系统偏好落地） */
export function resolvedTheme(): 'light' | 'dark' {
  if (theme === 'system') return mql?.matches ? 'dark' : 'light'
  return theme
}

function applyTheme() {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolvedTheme()
}
// 跟随系统：系统外观变化时（theme=system）实时切换
mql?.addEventListener?.('change', () => {
  if (theme === 'system') {
    applyTheme()
    themeListeners.forEach((l) => l())
  }
})

export function setTheme(t: Theme) {
  theme = t
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* ignore */
  }
  applyTheme()
  themeListeners.forEach((l) => l())
}
export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      themeListeners.add(l)
      return () => themeListeners.delete(l)
    },
    () => theme,
    () => theme,
  )
}
/** 应用启动时套用持久化主题（main.tsx 调一次，避免首帧闪白） */
export function initTheme() {
  applyTheme()
}

/* ── 密度（舒适 / 紧凑）────────────────────────────────────
   仅控制表格行高（--row-h 令牌），财务对账场景可切紧凑一屏多看几行。
   不影响任何功能可见性——密度只是摆放方式。 */
export type Density = 'comfortable' | 'compact'
const DENSITY_KEY = 'cps-density-v1'
function loadDensity(): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY)
    if (v === 'comfortable' || v === 'compact') return v
  } catch {
    /* ignore */
  }
  return 'comfortable'
}
let density: Density = typeof localStorage !== 'undefined' ? loadDensity() : 'comfortable'
const densityListeners = new Set<() => void>()
function applyDensity() {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--row-h', density === 'compact' ? '36px' : '44px')
}
export function setDensity(d: Density) {
  density = d
  try {
    localStorage.setItem(DENSITY_KEY, d)
  } catch {
    /* ignore */
  }
  applyDensity()
  densityListeners.forEach((l) => l())
}
export function useDensity(): Density {
  return useSyncExternalStore(
    (l) => {
      densityListeners.add(l)
      return () => densityListeners.delete(l)
    },
    () => density,
    () => density,
  )
}
export function initDensity() {
  applyDensity()
}

/* ── 导航偏好（分组折叠 / 常用置顶）────────────────────────
   规整而非删减的技术底座：一项不减、一项不藏，只让用户管理视觉密度。
   collapsed：折叠的分组标题集合；pinned：置顶"常用"区的导航路径集合。
   两者都是「用户主动做的减法」，产品永不替用户删。 */
const NAV_COLLAPSED_KEY = 'cps-nav-collapsed-v1'
const NAV_PINNED_KEY = 'cps-nav-pinned-v1'

function loadStrArr(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v.filter((x) => typeof x === 'string')
    }
  } catch {
    /* ignore */
  }
  return []
}
function makeSetStore(key: string) {
  let set = new Set<string>(typeof localStorage !== 'undefined' ? loadStrArr(key) : [])
  const ls = new Set<() => void>()
  let snapshot = [...set]
  const persist = () => {
    try {
      localStorage.setItem(key, JSON.stringify([...set]))
    } catch {
      /* ignore */
    }
    snapshot = [...set]
    ls.forEach((l) => l())
  }
  return {
    toggle(id: string) {
      if (set.has(id)) set.delete(id)
      else set.add(id)
      persist()
    },
    has: (id: string) => set.has(id),
    use(): string[] {
      return useSyncExternalStore(
        (l) => {
          ls.add(l)
          return () => ls.delete(l)
        },
        () => snapshot,
        () => snapshot,
      )
    },
  }
}
const collapsedStore = makeSetStore(NAV_COLLAPSED_KEY)
const pinnedStore = makeSetStore(NAV_PINNED_KEY)

export const toggleNavGroup = (title: string) => collapsedStore.toggle(title)
export const useCollapsedGroups = () => collapsedStore.use()
export const togglePinned = (to: string) => pinnedStore.toggle(to)
export const usePinned = () => pinnedStore.use()

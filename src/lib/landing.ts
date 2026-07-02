import { useSyncExternalStore } from 'react'
import { resolveBrandLogo } from './brandLogos'
import { brands } from './data'

// ════════════════════════════════════════════════════════════════
//  落地页数据层 —— 可配置、可归因、可嵌入的转化单元。
//  一套渲染器三种用法：品牌官方页 / 代理归因推广页 / 广告位 iframe。
//  演示模式 localStorage 持久化；shape 对齐未来后端（LandingPage 表 + refPageId）。
// ════════════════════════════════════════════════════════════════

export interface LandingPage {
  id: string
  brandId: string
  agentId: string | null // 代理归因推广页绑定；品牌官方页为 null
  productIds: string[]
  title: string
  subtitle: string
  points: string[] // 卖点三条
  theme: string // 主题色（hex），默认取品牌主色
  channel: string // 渠道标记（信息流/公众号/私域…），归因辅助
  createdAt: string
  // 台账统计（演示：本地累加；真实：服务端聚合）
  views: number
  orders: number
  revenue: number
}

const KEY = 'cps-landing-v1'

function load(): LandingPage[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v
    }
  } catch {
    /* ignore */
  }
  return []
}

let pages: LandingPage[] = typeof localStorage !== 'undefined' ? load() : []
const listeners = new Set<() => void>()
function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(pages))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}
// 变更前先回读 localStorage：落地页在新标签页消费（_blank / iframe），
// 各标签页各持一份内存副本，直接覆盖写会把别处的累加冲掉（last-write-wins 丢数）。
function refresh() {
  pages = load()
}
// 跨标签页同步：别的标签页写入后，storage 事件回灌本页内存副本并通知订阅者
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      pages = load()
      listeners.forEach((l) => l())
    }
  })
}

const shortId = () => Math.random().toString(36).slice(2, 8).toUpperCase()

export function brandColorOf(brandId: string): string {
  return resolveBrandLogo(brandId)?.color ?? '#f5333b'
}

export function createLandingPage(input: {
  brandId: string
  agentId?: string | null
  productIds: string[]
  title: string
  subtitle?: string
  points?: string[]
  theme?: string
  channel?: string
}): LandingPage {
  const page: LandingPage = {
    id: 'LP-' + shortId(),
    brandId: input.brandId,
    agentId: input.agentId ?? null,
    productIds: input.productIds,
    title: input.title,
    subtitle: input.subtitle ?? '',
    points: (input.points ?? []).filter(Boolean).slice(0, 3),
    theme: input.theme ?? brandColorOf(input.brandId),
    channel: input.channel ?? '',
    createdAt: new Date().toISOString(),
    views: 0,
    orders: 0,
    revenue: 0,
  }
  refresh()
  pages = [page, ...pages]
  emit()
  return page
}

export function deleteLandingPage(id: string) {
  refresh()
  pages = pages.filter((p) => p.id !== id)
  emit()
}

export function getLandingPage(id: string): LandingPage | null {
  return pages.find((p) => p.id === id) ?? null
}

// 归因闭环：落地页产生一次下单 → 台账累加（演示态）。真实态由后端在 Bundle 落库时按 refPageId 聚合。
export function recordLandingOrder(id: string, amount: number) {
  refresh()
  pages = pages.map((p) => (p.id === id ? { ...p, orders: p.orders + 1, revenue: +(p.revenue + amount).toFixed(2) } : p))
  emit()
}
// 会话内曝光去重：StrictMode 双执行 / 组件重挂载不重复计数（否则转化率直接腰斩）
const viewedThisSession = new Set<string>()
export function recordLandingView(id: string) {
  if (viewedThisSession.has(id)) return
  viewedThisSession.add(id)
  refresh()
  pages = pages.map((p) => (p.id === id ? { ...p, views: p.views + 1 } : p))
  emit()
}

// filter.agentId：显式传 null 表示「必须为 null（品牌官方页）」，undefined 表示不限——
// 品牌台账借此排除代理归因页（它们也带 brandId，否则会串进品牌工坊并可被误删）。
export function useLandingPages(filter?: { brandId?: string; agentId?: string | null }): LandingPage[] {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pages,
    () => pages,
  )
  if (!filter) return snap
  return snap.filter(
    (p) => (filter.brandId !== undefined ? p.brandId === filter.brandId : true) && (filter.agentId !== undefined ? p.agentId === filter.agentId : true),
  )
}

// 落地页深链（含归因参数）：#/land/:id
export function landingUrl(id: string): string {
  return `${location.origin}${location.pathname}#/land/${id}`
}
// 广告位嵌入（去页眉页脚）
export function landingEmbedUrl(id: string): string {
  return `${landingUrl(id)}?embed=1`
}
export function landingIframeSnippet(id: string): string {
  return `<iframe src="${landingEmbedUrl(id)}" width="375" height="640" frameborder="0" style="border:0;border-radius:16px;max-width:100%"></iframe>`
}

// 是否连续包月（强制合规模块判定）
export function isContinuous(cycle: string): boolean {
  return cycle === 'continuous'
}

// 品牌名（落地页页眉用）
export function brandName(brandId: string): string {
  return brands.find((b) => b.id === brandId)?.name ?? brandId
}

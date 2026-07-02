import { resolveBrandLogo } from './brandLogos'

// ════════════════════════════════════════════════════════════════
//  品牌白标 —— 门户/落地页按品牌主色生成第三层令牌覆盖。
//  设计系统已是令牌单一来源，白标只是再覆盖一层 --color-brand*，
//  组件零改动即换肤。对比度自动兜底：主色过浅则文字色加深。
// ════════════════════════════════════════════════════════════════

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}
// 相对亮度（WCAG）——判断主色深浅，决定 soft 底与 ink 文字色
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function darken(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amt)))
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
function lighten(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * amt))
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * 计算品牌白标令牌集（覆盖 --color-brand 系列）。返回可 spread 到 style 的对象。
 * isDark：暗色主题下 ink/hover 必须**提亮**而非加深——inline 覆盖优先级高于
 * [data-theme='dark'] 的令牌重定义，此前一律 darken 会让暗底上的品牌文字近乎不可见。
 * 主色过浅（如美团黄）时把 --color-brand 本体压深一档，保住组件里硬编码的 text-white 对比度。
 */
export function brandTheme(brandId?: string | null, isDark = false): React.CSSProperties {
  const logo = brandId ? resolveBrandLogo(brandId) : null
  if (!logo) return {} // 无品牌 logo → 用默认品牌红
  const raw = logo.color
  const lum = luminance(raw)
  // 白字按钮兜底：主色太亮则整体压深（品牌色仍可辨识，但 bg-brand + text-white 不再糊成一片）
  const color = lum > 0.62 ? darken(raw, 0.35) : raw
  const [r, g, b] = hexToRgb(color)
  const ink = isDark
    ? lighten(color, 0.42) // 暗底：提亮做文字色
    : lum > 0.5
      ? darken(color, 0.55) // 亮底 + 浅主色：加深保对比
      : darken(color, 0.25)
  return {
    ['--color-brand' as string]: color,
    ['--color-brand-hover' as string]: isDark ? lighten(color, 0.15) : darken(color, 0.12),
    ['--color-brand-soft' as string]: `rgba(${r}, ${g}, ${b}, ${isDark ? 0.16 : 0.12})`,
    ['--color-brand-ink' as string]: ink,
    ['--shadow-brand' as string]: `0 6px 16px -8px rgba(${r}, ${g}, ${b}, ${isDark ? 0.45 : 0.6})`,
  }
}

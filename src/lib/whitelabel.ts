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

/** 计算品牌白标令牌集（覆盖 --color-brand 系列）。返回可 spread 到 style 的对象。 */
export function brandTheme(brandId?: string | null): React.CSSProperties {
  const logo = brandId ? resolveBrandLogo(brandId) : null
  if (!logo) return {} // 无品牌 logo → 用默认品牌红
  const color = logo.color
  const [r, g, b] = hexToRgb(color)
  const lum = luminance(color)
  // 主色偏浅（黄/亮色）→ ink 文字色加深，保对比度
  const ink = lum > 0.5 ? darken(color, 0.55) : darken(color, 0.25)
  return {
    ['--color-brand' as string]: color,
    ['--color-brand-hover' as string]: darken(color, 0.12),
    ['--color-brand-soft' as string]: `rgba(${r}, ${g}, ${b}, 0.12)`,
    ['--color-brand-ink' as string]: ink,
    ['--shadow-brand' as string]: `0 6px 16px -8px rgba(${r}, ${g}, ${b}, 0.6)`,
  }
}

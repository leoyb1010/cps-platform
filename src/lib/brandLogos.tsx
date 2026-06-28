/* ──────────────────────────────────────────────────────────────
 * 品牌 Logo 注册表
 *
 * 为平台上的真实订阅品牌提供「应用图标」式的 logo mark：
 * 品牌官方主色 + 签名字形（圆角方块，App 图标风格）。
 * 颜色取自各品牌 2025/2026 现行官方 App 图标像素采样。
 *
 * 不依赖任何外部网络 / CDN：纯本地 SVG，离线可用、不会被防盗链拦截、
 * 任意尺寸清晰。未登记的品牌回退为字母 chip（见 BrandMark）。
 * ────────────────────────────────────────────────────────────── */

export interface BrandLogo {
  /** 主色（圆角方块底色，或浅底时的字形色） */
  color: string
  /** 渐变次色，可选（自上而下） */
  color2?: string
  /** 字形颜色，默认白 */
  fg?: string
  /** 字形（1–4 个中文/拉丁字符），按官方 wordmark 取 */
  glyph: string
  /** 字形相对字号系数（默认 0.42），中文宽字降一点 */
  scale?: number
  /** 字重 */
  weight?: number
  /** 浅底品牌（字形用主色，底用白）——如 WPS/芒果在图标上是彩字白底变体 */
  light?: boolean
}

/* key 同时覆盖 brand.id 与常见中文名前缀，匹配更稳。 */
export const BRAND_LOGOS: Record<string, BrandLogo> = {
  youdao:   { color: '#FC011A', color2: '#FE460F', glyph: '有道', scale: 0.34, weight: 700 },
  ximalaya: { color: '#FA2800', glyph: '喜', scale: 0.5, weight: 800 },
  mango:    { color: '#FF5202', color2: '#FF7A00', glyph: '芒', scale: 0.46, weight: 800 },
  wps:      { color: '#F5411E', glyph: 'W', scale: 0.56, weight: 800 },
  zhihu:    { color: '#0066FF', glyph: '知', scale: 0.5, weight: 800 },
  meituan:  { color: '#FFE140', fg: '#111111', glyph: '美团', scale: 0.34, weight: 800 },
  keep:     { color: '#3E3548', color2: '#504169', glyph: 'K', scale: 0.54, weight: 800 },
  bilibili: { color: '#FB7299', glyph: 'bili', scale: 0.3, weight: 800 },
}

/* 中文名 → key 的别名，供按 name/plan 匹配 logo 用 */
const NAME_ALIASES: [RegExp, string][] = [
  [/有道|youdao/i, 'youdao'],
  [/喜马拉雅|ximalaya/i, 'ximalaya'],
  [/芒果|mango/i, 'mango'],
  [/wps/i, 'wps'],
  [/知乎|zhihu/i, 'zhihu'],
  [/美团|meituan/i, 'meituan'],
  [/keep/i, 'keep'],
  [/哔哩|bilibili|b站/i, 'bilibili'],
]

/** 由 brandId 或品牌名解析出 logo 定义；无则返回 null（回退字母）。 */
export function resolveBrandLogo(idOrName?: string | null): BrandLogo | null {
  if (!idOrName) return null
  const key = idOrName.toLowerCase().trim()
  if (BRAND_LOGOS[key]) return BRAND_LOGOS[key]
  for (const [re, k] of NAME_ALIASES) if (re.test(idOrName)) return BRAND_LOGOS[k]
  return null
}

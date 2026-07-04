// README 产品截图批量生成：对着本地 dev server（演示模式）逐页截图到 docs/screenshots/。
// 用法：npm run dev（另一终端，端口 5273）→ node scripts/screenshots.mjs
// reducedMotion: 入场动效/数字滚动直接落到终值，截图无需等动画。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:5273/'
const OUT = 'docs/screenshots'
const ADMIN = { id: 'U-001', name: '李运营', account: 'admin', roleId: 'super' }
const BRAND = { id: 'U-101', name: '有道品牌运营', account: 'brand', roleId: 'brand', scopeType: 'brand', scopeId: 'youdao' }
const AGENT = { id: 'U-201', name: '量子增长工作室', account: 'agent', roleId: 'agent', scopeType: 'agent', scopeId: 'A-2041' }

/** @type {{name:string; hash:string; height:number; theme?:'light'|'dark'; auth?:object|null; expert?:boolean; coachDone?:boolean}[]} */
const SHOTS = [
  { name: 'dashboard', hash: '#/', height: 1720, expert: true },
  { name: 'dashboard-dark', hash: '#/', height: 1720, theme: 'dark', expert: true },
  { name: 'login', hash: '#/login', height: 900, auth: null },
  { name: 'settlement', hash: '#/settlement', height: 1150 },
  { name: 'settlement-run', hash: '#/settlement/run', height: 760 },
  { name: 'incident-room', hash: '#/risk/incident/M-BL-01', height: 900 },
  { name: 'market', hash: '#/market', height: 1330, auth: null },
  { name: 'analytics', hash: '#/analytics', height: 1100 },
  { name: 'merchants', hash: '#/merchants', height: 1050 },
  { name: 'portal-brand', hash: '#/portal/brand', height: 900, auth: BRAND },
  { name: 'portal-plaza', hash: '#/portal/brand/plaza', height: 760, auth: BRAND },
  { name: 'portal-insights', hash: '#/portal/brand/insights', height: 1080, auth: BRAND },
  { name: 'portal-agent', hash: '#/portal/agent', height: 1160, auth: AGENT },
  { name: 'agent-landing', hash: '#/portal/agent/landing', height: 1080, auth: AGENT },
  { name: 'members', hash: '#/members', height: 950 },
  { name: 'products', hash: '#/products', height: 1000, expert: true },
  { name: 'aigc', hash: '#/aigc', height: 1000, expert: true },
]

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
for (const s of SHOTS) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: s.height },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
    colorScheme: s.theme === 'dark' ? 'dark' : 'light',
  })
  const page = await ctx.newPage()
  const auth = s.auth === undefined ? ADMIN : s.auth
  await page.addInitScript(
    ({ auth, theme, expert }) => {
      localStorage.clear()
      if (auth) localStorage.setItem('cps-auth-v1', JSON.stringify(auth))
      localStorage.setItem('cps-theme-v1', theme ?? 'light')
      if (expert) localStorage.setItem('cps-prefs-v1', 'expert')
      localStorage.setItem('cps-coach-done-console', '1') // 截图不弹引导遮罩
    },
    { auth, theme: s.theme, expert: s.expert },
  )
  await page.goto(BASE + s.hash, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900) // 数据水合 + 字体
  await page.screenshot({ path: `${OUT}/${s.name}.png` })
  console.log(`✓ ${s.name}.png (1440×${s.height})`)
  await ctx.close()
}
await browser.close()

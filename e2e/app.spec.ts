import { mkdirSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, account = 'admin') {
  await page.goto('/#/login')
  await page.getByPlaceholder('admin').fill(account)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/#\/$/)
}

async function portalLogin(page: Page, account: 'brand' | 'agent') {
  await page.goto('/#/portal/login')
  await page.getByRole('button', { name: account === 'brand' ? /有道品牌运营/ : /量子增长工作室/ }).click()
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(new RegExp(`#\\/portal\\/${account}`), { timeout: 5000 })
}

function watchRuntimeErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  page.on('response', (response) => { if (response.status() >= 500) errors.push(`http ${response.status()}: ${response.url()}`) })
  return errors
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

test('未登录访问受保护页 → 重定向到登录页', async ({ page }) => {
  await page.goto('/#/settlement')
  await expect(page).toHaveURL(/#\/login/)
  await expect(page.getByText('订阅增长交易与风险清结算平台')).toBeVisible()
})

test('登录 → 进入今日工作，导航按任务单组展开', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { name: /今天先做什么/ })).toBeVisible()
  const nav = page.locator('nav').first()
  await expect(nav.getByRole('link', { name: '今日工作' })).toBeVisible()
  await nav.getByRole('button', { name: '业务增长' }).click()
  await expect(nav.getByRole('link', { name: '品牌管理' })).toBeVisible()
  await nav.getByRole('button', { name: '资金与风险' }).click()
  await expect(nav.getByRole('link', { name: '清结算' })).toBeVisible()
  await expect(nav.getByRole('link', { name: '品牌管理' })).toBeHidden()
})

test('演示账户 chip 一键填入账号', async ({ page }) => {
  await page.goto('/#/login')
  await page.getByRole('button', { name: /周财务/ }).click()
  await expect(page.getByPlaceholder('admin')).toHaveValue('finance')
})

test('财务角色登录 → 导航收窄', async ({ page }) => {
  await login(page, 'finance')
  const nav = page.locator('nav').first()
  await nav.getByRole('button', { name: '资金与风险' }).click()
  await expect(nav.getByRole('link', { name: '清结算' })).toBeVisible()
  await expect(nav.getByRole('link', { name: '风险与工单' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: '成员与权限' })).toHaveCount(0)
})

test('账户菜单可切换核心 / 完整信息', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: /李运营/ }).first().click()
  await expect(page.getByText('页面信息')).toBeVisible()
  await page.getByRole('button', { name: '完整', exact: true }).click()
  await expect(page.getByRole('heading', { name: '经营总览' })).toBeVisible()
  await page.getByRole('button', { name: '核心' }).click()
  await expect(page.getByRole('heading', { name: /今天先做什么/ })).toBeVisible()
})

test('运营角色的主任务与权限入口正确', async ({ page }) => {
  await login(page, 'ops')
  await expect(page.getByRole('button', { name: /进入代理运营/ })).toBeVisible()
  const nav = page.locator('nav').first()
  await nav.getByRole('button', { name: '业务增长' }).click()
  await expect(nav.getByRole('link', { name: '品牌管理' })).toBeVisible()
  await expect(nav.getByRole('link', { name: '代理商' })).toBeVisible()
})

test('退款联动：投诉工单退款后工单流转、活动流记录', async ({ page }) => {
  await login(page, 'risk')
  await page.goto('/#/complaints')
  await expect(page.getByRole('heading', { name: '投诉工单' })).toBeVisible()
  await page.locator('table tbody tr').first().click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: /退款并冲账/ }).click()
  await page.getByRole('button', { name: '确认退款' }).click()
  await expect(page.getByText('已退款，联动冲账完成').first()).toBeVisible({ timeout: 5000 })
})

test('退出登录 → 回到登录页', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: /李运营/ }).first().click()
  await page.getByText('退出登录').click()
  await expect(page).toHaveURL(/#\/login/)
})

test('权限路由守卫：审计角色直链配置中心 → 弹回总览', async ({ page }) => {
  await login(page, 'audit')
  await page.goto('/#/settings')
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { name: /今天先做什么/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /查看操作审计/ })).toBeVisible()
})

test('订单默认分页且可翻页', async ({ page }) => {
  await login(page)
  await page.goto('/#/orders')
  await expect(page.getByText(/当前显示 12 笔/)).toBeVisible()
  await expect(page.getByText('1 / 3')).toBeVisible()
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByText('2 / 3')).toBeVisible()
})

test('移动端菜单可打开、跳转并自动收起', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // 首登 550ms 后会弹 3 步引导遮罩（z-200）；抽屉滑入动画让点击晚于它出现时会被遮罩拦截 → 机器快慢不同时结果不同。
  // 本用例只测抽屉导航，先标记引导已完成，消除这个竞态。
  await page.evaluate(() => localStorage.setItem('cps-coach-done-console', '1'))
  await login(page)
  await page.getByRole('button', { name: '打开菜单' }).click()
  const nav = page.locator('nav').first()
  await expect(nav).toBeVisible()
  await nav.getByRole('button', { name: '业务增长' }).click()
  await nav.getByRole('link', { name: '订单与订阅' }).click()
  await expect(page).toHaveURL(/#\/orders/)
  await expect(page.getByRole('heading', { name: '订单与订阅' })).toBeVisible()
})

test('订阅超市（免登录 C 端）可选购、组合算价出折扣', async ({ page }) => {
  await page.goto('/#/market')
  const cards = page.locator('[role="button"][aria-pressed]')
  await expect(cards.first()).toBeVisible({ timeout: 5000 })
  expect(await cards.count()).toBeGreaterThanOrEqual(4)
  await cards.nth(0).click()
  await cards.nth(2).click()
  await expect(page.getByText('套餐首单价')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/组合优惠/).first()).toBeVisible()
  await page.getByRole('button', { name: /生成我的订阅套餐/ }).click()
  await expect(page.getByText('套餐已生成 · 待支付')).toBeVisible({ timeout: 5000 })
})

test('品牌门户登录后可按任务找到商品', async ({ page }) => {
  await portalLogin(page, 'brand')
  await expect(page.getByRole('heading', { name: '我的经营' })).toBeVisible()
  await expect(page.getByText('下一步')).toBeVisible()
  const nav = page.locator('nav').first()
  await nav.getByRole('button', { name: '商品与增长' }).click()
  await expect(nav.getByRole('link', { name: '商品管理' })).toBeVisible()
})

test('代理商门户登录后可从下一步进入分润', async ({ page }) => {
  await portalLogin(page, 'agent')
  await expect(page.getByRole('heading', { name: '我的投放' })).toBeVisible()
  await page.getByRole('link', { name: /待结分润/ }).click()
  await expect(page).toHaveURL(/#\/portal\/agent\/payouts/)
  await expect(page.getByRole('heading', { name: '我的分润' })).toBeVisible()
})

test('多视口真实浏览器验证与截图', async ({ page }) => {
  mkdirSync('/tmp/cps-ui-audit', { recursive: true })
  await login(page)
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.reload()
    await expect(page.getByRole('heading', { name: /今天先做什么/ })).toBeVisible()
    await page.screenshot({ path: `/tmp/cps-ui-audit/final-dashboard-${width}.png`, fullPage: true })
  }
  await page.evaluate(() => localStorage.clear())
  await portalLogin(page, 'brand')
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.reload()
    await expect(page.getByText('下一步')).toBeVisible()
    await page.screenshot({ path: `/tmp/cps-ui-audit/final-brand-${width}.png`, fullPage: true })
  }
  await page.evaluate(() => localStorage.clear())
  await portalLogin(page, 'agent')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.reload()
    await expect(page.getByText('下一步')).toBeVisible()
    await page.screenshot({ path: `/tmp/cps-ui-audit/final-agent-${width}.png`, fullPage: true })
  }
})

test('减少动效偏好下入场与实时脉冲停止', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page)
  // <main> 随路由 key 重挂载：先等首屏内容稳定，再取样式——否则可能读到已脱离文档的旧节点（animationName 为 ""）。
  await expect(page.getByRole('heading', { name: /今天先做什么/ })).toBeVisible()
  const pageAnimation = await page.locator('main.page-in').evaluate((node) => getComputedStyle(node).animationName)
  expect(pageAnimation).toBe('none')
  await page.goto('/#/orders')
  const pulseAnimation = await page.locator('.pulse-dot').first().evaluate((node) => getComputedStyle(node).animationName)
  expect(pulseAnimation).toBe('none')
})

test('关键路由无 console、页面异常或 5xx', async ({ page }) => {
  const errors = watchRuntimeErrors(page)
  await login(page)
  for (const route of ['/#/', '/#/brands', '/#/orders', '/#/settlement', '/#/merchants']) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
  }
  expect(errors).toEqual([])
})

import { test, expect, type Page } from '@playwright/test'

// 用演示账户登录（mock 模式，密码 demo）
async function login(page: Page, account = 'admin') {
  await page.goto('/#/login')
  await page.getByPlaceholder('admin').fill(account)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/#\/$/)
}

test.beforeEach(async ({ page }) => {
  // 每个用例从干净存储开始
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

test('未登录访问受保护页 → 重定向到登录页', async ({ page }) => {
  await page.goto('/#/settlement')
  await expect(page).toHaveURL(/#\/login/)
  await expect(page.getByText('订阅增长交易与风险清结算平台')).toBeVisible()
})

test('登录 → 进入经营总览，侧边栏可见', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { name: '经营总览' })).toBeVisible()
  const nav = page.locator('nav').first()
  // 信息架构重构后：品牌入驻与清结算归入"共享中台"层
  await expect(nav.getByRole('link', { name: '品牌 · 入驻' })).toBeVisible()
  await expect(nav.getByRole('link', { name: '清结算' })).toBeVisible()
})

test('演示账户 chip 一键填入账号', async ({ page }) => {
  await page.goto('/#/login')
  await page.getByRole('button', { name: /周财务/ }).click()
  await expect(page.getByPlaceholder('admin')).toHaveValue('finance')
})

test('财务角色登录 → 导航收窄（见清结算、不见风控/成员）', async ({ page }) => {
  await login(page, 'finance')
  const nav = page.locator('nav').first()
  // 财务：dashboard/订单/清结算/数据/审计
  await expect(nav.getByRole('link', { name: '清结算' })).toBeVisible()
  await expect(nav.getByRole('link', { name: '风控中心' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: '成员与角色' })).toHaveCount(0)
})

test('退款联动：投诉工单退款后工单流转、活动流记录', async ({ page }) => {
  await login(page, 'risk') // 风控/售后有 ticket.handle
  await page.goto('/#/complaints')
  await expect(page.getByRole('heading', { name: '投诉工单' })).toBeVisible()
  // 首行 T-5521 在 mock 数据中固定为待处理 → 退款入口必然存在。
  // 断言写死不做 if 条件（条件断言会在 UI 改坏时静默空测）。
  await page.locator('table tbody tr').first().click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: /退款并冲账/ }).click()
  await page.getByRole('button', { name: '确认退款' }).click()
  await expect(page.getByText('已退款，联动冲账完成').first()).toBeVisible({ timeout: 5000 })
})

test('退出登录 → 回到登录页', async ({ page }) => {
  await login(page)
  // 账户菜单按钮以用户名（admin=李运营）为可访问名，确定性存在；不做条件断言
  await page.getByRole('button', { name: /李运营/ }).first().click()
  await page.getByText('退出登录').click()
  await expect(page).toHaveURL(/#\/login/)
})

test('权限路由守卫：审计角色直链配置中心 → 弹回总览', async ({ page }) => {
  await login(page, 'audit')
  await page.goto('/#/settings')
  await expect(page).toHaveURL(/#\/$/) // RequirePerm：audit 无 config.write → 回总览
  await expect(page.getByRole('heading', { name: '审计工作台' })).toBeVisible()
})

test('订阅超市（免登录 C 端）：演示模式货架可选购、组合算价出折扣', async ({ page }) => {
  await page.goto('/#/market')
  // 演示模式本地货架：商品卡渲染
  const cards = page.locator('[role="button"][aria-pressed]')
  await expect(cards.first()).toBeVisible({ timeout: 5000 })
  expect(await cards.count()).toBeGreaterThanOrEqual(4)
  // 选 2 件（跳开互斥组：第 1 与第 3）
  await cards.nth(0).click()
  await cards.nth(2).click()
  // 侧栏出现套餐价与组合优惠（满 2 件 9 折）。"组合优惠"页脚说明也含该词 → 取首个（优惠行）
  await expect(page.getByText('套餐首单价')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/组合优惠/).first()).toBeVisible()
  // 生成套餐 → 待支付
  await page.getByRole('button', { name: /生成我的订阅套餐/ }).click()
  await expect(page.getByText('套餐已生成 · 待支付')).toBeVisible({ timeout: 5000 })
})

test('门户演示账户：品牌方登录进入品牌门户', async ({ page }) => {
  await page.goto('/#/portal/login')
  // 一键填入品牌演示账户
  await page.getByRole('button', { name: /有道品牌运营/ }).click()
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/#\/portal\/brand/, { timeout: 5000 })
})

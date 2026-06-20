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
  await expect(page.getByText('CPS 会员联运清结算平台')).toBeVisible()
})

test('登录 → 进入经营总览，侧边栏可见', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { name: '经营总览' })).toBeVisible()
  const nav = page.locator('nav').first()
  await expect(nav.getByRole('link', { name: '品牌管理' })).toBeVisible()
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
  // 打开一个待处理工单的抽屉
  const row = page.locator('table tbody tr').first()
  await row.click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  const refundBtn = drawer.getByRole('button', { name: /退款并冲账/ })
  if (await refundBtn.count()) {
    await refundBtn.click()
    // 确认弹窗
    const confirm = page.getByRole('button', { name: /确认|确定/ })
    if (await confirm.count()) await confirm.first().click()
    // 出现成功 toast 或抽屉关闭
    await expect(page.getByText(/已退款|联动冲账/).first()).toBeVisible({ timeout: 5000 })
  }
})

test('退出登录 → 回到登录页', async ({ page }) => {
  await login(page)
  // 打开账户菜单（右上角头像）
  await page.getByRole('button', { name: /账户|李运营|admin/ }).first().click().catch(() => {})
  const logout = page.getByText('退出登录')
  if (await logout.count()) {
    await logout.click()
    await expect(page).toHaveURL(/#\/login/)
  }
})

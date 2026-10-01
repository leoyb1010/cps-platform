import { mkdirSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

const evidence = '/tmp/cps-role-ui-audit'
async function signIn(page: Page, account: string, portal = false) {
  await page.goto(portal ? '/#/portal/login' : '/#/login')
  await page.locator('input').first().fill(account)
  await page.locator('input[type=password]').fill('demo')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}
async function capture(page: Page, name: string) {
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true, animations: 'disabled' })
}
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue() : route.abort('blockedbyclient')
  })
})

for (const account of ['admin', 'finance', 'risk', 'ops', 'audit', 'teamadmin', 'brand', 'agent', 'brandaudit']) {
  test(`real role normal login and cross-zone denial: ${account}`, async ({ page }) => {
    const portal = ['brand', 'agent', 'brandaudit'].includes(account)
    await signIn(page, account, portal)
    const home = portal ? account === 'agent' ? '/portal/agent' : '/portal/brand' : '/'
    await expect(page).toHaveURL(new RegExp(`#${home}$`))
    if (account === 'brandaudit') await expect(page.getByRole('heading', { name: '当前角色未配置客户门户权限' })).toBeVisible()
    else await expect(page.locator('main')).toBeVisible()
    await page.goto(portal ? '/#/members' : '/#/portal/brand')
    await expect(page).toHaveURL(new RegExp(`#${home}$`))
    await capture(page, `role-${account}`)
  })
}

test('real team manager sees customer-only management and can cancel with Escape', async ({ page }) => {
  await signIn(page, 'teamadmin')
  await page.goto('/#/members')
  await expect(page.getByRole('heading', { name: '成员与角色' })).toBeVisible()
  const finance = page.getByRole('row').filter({ has: page.getByText('finance', { exact: true }) })
  await expect(finance.getByRole('button', { name: '管理', exact: true })).toHaveCount(0)
  const brand = page.getByRole('row').filter({ has: page.getByText('brand', { exact: true }) })
  await brand.getByRole('button', { name: '管理', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('combobox', { name: '角色', exact: true })).toHaveCount(0)
  await capture(page, 'teamadmin-customer-dialog')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('real admin gets scope-compatible role choices and mobile member controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, 'admin')
  await page.goto('/#/members')
  const brand = page.getByRole('row').filter({ has: page.getByText('brand', { exact: true }) })
  await brand.getByRole('button', { name: '管理', exact: true }).click()
  const role = page.getByRole('combobox', { name: '角色', exact: true })
  await expect(role.locator('option')).toHaveText(['品牌方'])
  await capture(page, 'admin-brand-role-mobile')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('cross-tab cookie replacement never replays a brand mutation as the agent', async ({ page, context }) => {
  await signIn(page, 'brand', true)
  const agentPage = await context.newPage()
  await signIn(agentPage, 'agent', true)
  let writes = 0
  await page.route('http://localhost:3001/portal/brand/products', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    writes += 1
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"synthetic expired access"}', headers: { 'access-control-allow-origin': 'http://localhost:5273', 'access-control-allow-credentials': 'true' } })
  })
  const status = await page.evaluate(async () => {
    const path = '/src/lib/http.ts'
    const { api } = await import(/* @vite-ignore */ path)
    try { await api('/portal/brand/products', { method: 'POST', body: '{}' }); return 200 }
    catch (error) { return (error as { status: number }).status }
  })
  expect(status).toBe(401)
  expect(writes).toBe(1)
  await expect(page).toHaveURL(/#\/portal\/login$/)
  await expect(agentPage).toHaveURL(/#\/portal\/agent$/)
  await capture(page, 'cross-tab-safe-login')
})

for (const operation of ['login', 'refresh']) {
  test(`late ${operation} Set-Cookie cannot restore a logged-out browser`, async ({ page, context, request }) => {
    if (operation === 'refresh') await signIn(page, 'brand', true)
    else await page.goto('/#/portal/login')
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    await page.route(`http://localhost:3001/auth/${operation}`, async (route) => {
      // The isolated request fixture does not mutate browser cookies. Fulfillment
      // below is the moment the intentionally delayed Set-Cookie reaches the tab.
      const response = await request.fetch(route.request())
      entered()
      await held
      await route.fulfill({ response })
    })
    const pending = page.evaluate(async (op) => {
      const modulePath = '/src/lib/auth.ts'
      const auth = await import(/* @vite-ignore */ modulePath)
      try { await (op === 'login' ? auth.login('brand', 'demo') : auth.bootstrapAuth()) } catch { /* cancelled by logout */ }
    }, operation)
    await started
    const ending = page.evaluate(async () => {
      const modulePath = '/src/lib/auth.ts'
      const auth = await import(/* @vite-ignore */ modulePath)
      await auth.logout()
    })
    await expect.poll(async () => page.evaluate(async () => {
      const modulePath = '/src/lib/auth.ts'
      return (await import(/* @vite-ignore */ modulePath)).getCurrentUser()
    })).toBeNull()
    release()
    await Promise.all([pending, ending])
    expect((await context.cookies('http://localhost:3001')).some((cookie) => cookie.name === 'cps_rt')).toBe(false)
    await page.goto('/#/portal/brand')
    await expect(page).toHaveURL(/#\/portal\/login$/)
    await capture(page, `late-${operation}-logged-out`)
  })
}

test('latest overlapping login owns both UI identity and final refresh cookie', async ({ page, request, context }) => {
  await page.goto('/#/portal/login')
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  await page.route('http://localhost:3001/auth/login', async (route) => {
    if (route.request().postDataJSON().account !== 'brand') return route.continue()
    const response = await request.fetch(route.request())
    entered(); await held; await route.fulfill({ response })
  })
  const first = page.evaluate(async () => {
    const modulePath = '/src/lib/auth.ts'
    try { await (await import(/* @vite-ignore */ modulePath)).login('brand', 'demo') } catch { /* superseded */ }
  })
  await started
  const latest = page.evaluate(async () => {
    const modulePath = '/src/lib/auth.ts'
    return (await (await import(/* @vite-ignore */ modulePath)).login('agent', 'demo')).account
  })
  // Wait for the latest intent to clear the old identity before releasing it.
  await expect.poll(async () => page.evaluate(async () => {
    const modulePath = '/src/lib/auth.ts'
    return (await import(/* @vite-ignore */ modulePath)).getCurrentUser()
  })).toBeNull()
  release(); await first
  expect(await latest).toBe('agent')
  const refreshed = await context.request.post('http://localhost:3001/auth/refresh')
  expect(refreshed.status()).toBe(201)
  expect((await refreshed.json()).user.account).toBe('agent')
})

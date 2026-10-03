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
  // Capture settled UI, not a transient entrance fade or unfinished font load.
  await page.evaluate(async () => {
    await document.fonts.ready
    const finite = document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    await Promise.all(finite.map((animation) => animation.finished.catch(() => {})))
  })
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

// Real CPS authentication/navigation; the engine boundary is explicitly mocked
// to exercise delayed, unavailable and confirmed-charge UI without any provider.
for (const portal of [false, true]) {
  test(`AIGC estimate revision and truthful credit UI (${portal ? 'portal' : 'platform'})`, async ({ page }) => {
    await signIn(page, portal ? 'brand' : 'admin', portal)
    const headers = { 'access-control-allow-origin': 'http://localhost:5273', 'access-control-allow-credentials': 'true' }
    const fixture = { ok: true, assetTypes: [{ id: 'copy', label: '投放文案', modality: 'text', defaultPlatform: 'xhs' }] }
    let releaseConfig!: () => void
    const configGate = new Promise<void>(resolve => { releaseConfig = resolve })
    await page.route('**/aigc/factory/config', async route => {
      await configGate
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(fixture) })
    })
    await page.route('**/aigc/billing/credits', route => route.fulfill({ status: 503, contentType: 'application/json', headers, body: '{"message":"Synthetic credits outage"}' }))
    await page.goto(portal ? '/#/portal/brand/aigc' : '/#/aigc')
    if (!portal) {
      await expect(page.getByText('余额暂不可用', { exact: true })).toBeVisible()
      await expect(page.locator('main')).not.toContainText('84,200')
      await capture(page, 'aigc-real-balance-unknown')
      await page.getByRole('button', { name: '生成素材', exact: true }).click()
    }
    const form = portal ? page.locator('main') : page.getByRole('dialog')
    await expect(form.getByRole('button', { name: '生成', exact: true })).toBeDisabled()
    releaseConfig()
    await expect(form.getByRole('button', { name: '生成', exact: true })).toBeEnabled()
    await form.locator('textarea').fill('Synthetic copy for a fictional notebook')
    let releaseEstimate!: () => void, entered!: () => void, delivered!: () => void
    const estimateGate = new Promise<void>(resolve => { releaseEstimate = resolve })
    const started = new Promise<void>(resolve => { entered = resolve })
    const finished = new Promise<void>(resolve => { delivered = resolve })
    await page.route('**/aigc/factory/estimate', async route => {
      entered(); await estimateGate
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{"ok":true,"creditsEstimated":17}' })
      delivered()
    })
    await form.getByRole('button', { name: '先估算积分 →', exact: true }).click()
    await started
    await form.locator('textarea').fill('Changed synthetic copy')
    releaseEstimate(); await finished
    await page.waitForLoadState('networkidle')
    await expect(form.getByRole('button', { name: '生成', exact: true })).toBeVisible()
    await form.getByRole('button', { name: '先估算积分 →', exact: true }).click()
    await expect(form.getByRole('button', { name: '生成 · 17 积分', exact: true })).toBeVisible()
    await form.locator('select').nth(1).selectOption('convert')
    await expect(form.getByRole('button', { name: '生成', exact: true })).toBeVisible()
    await capture(page, `aigc-${portal ? 'portal' : 'platform'}-estimate-revision`)
    if (!portal) {
      await page.route('**/aigc/factory/generate', route => route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ ok: true, job: { id: 'synthetic-confirmed-charge', status: 'completed', credits_charged: 37 }, credits: { availableCredits: 63 } }) }))
      await form.getByRole('button', { name: '生成', exact: true }).click()
      await expect(page.getByText(/synthetic-confirmed-charge · 消耗 37 积分/)).toBeVisible()
      await page.setViewportSize({ width: 390, height: 844 })
      await capture(page, 'aigc-confirmed-charge-mobile')
      await expect(page.locator('main')).not.toContainText('消耗 0 积分')
    }
  })
}

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
    // Redirect completion only proves routing; the portal resource can still be
    // loading. Assert loaded business content before saving visual evidence.
    if (account === 'brand') await expect(page.getByText('我的回款', { exact: true })).toBeVisible()
    if (account === 'agent') await expect(page.getByText('继续选品投放', { exact: true })).toBeVisible()
    if (account === 'teamadmin') await expect(page.getByText('成员状态管理', { exact: true })).toBeVisible()
    await expect(page.locator('main .skeleton')).toHaveCount(0)
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

test('mobile member dialog stays above navigation after scrolling with normal motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await signIn(page, 'admin')
  await page.goto('/#/members')
  const brand = page.getByRole('row').filter({ has: page.getByText('brand', { exact: true }) })
  await brand.getByRole('button', { name: '管理', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {})))
  })
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const visibleTitle = await dialog.getByRole('heading').evaluate((heading) => {
    const bounds = heading.getBoundingClientRect()
    const topElement = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    return heading.closest('[role="dialog"]') === topElement?.closest('[role="dialog"]')
  })
  expect(visibleTitle, 'dialog title must not be covered by the sticky navigation').toBe(true)
  const overlay = await dialog.locator('..').boundingBox()
  expect(overlay?.y).toBe(0)
  expect(overlay?.height).toBe(844)
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: `${evidence}/mobile-dialog-normal-motion.png` })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toHaveCount(0)
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

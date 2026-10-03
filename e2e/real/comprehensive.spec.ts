import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

const evidence = '/tmp/cps-role-ui-audit/comprehensive'
const round = process.env.AUDIT_ROUND || '1'
const surfaces = {
  admin: ['/', '/brands', '/marketplace', '/agents', '/orders', '/contracts', '/barter', '/aigc', '/products', '/settlement', '/settlement/run', '/merchants', '/risk', '/analytics', '/members', '/audit', '/settings', '/profile'],
  brand: ['', '/orders', '/settlement', '/onboarding', '/tickets', '/contracts', '/products', '/developer', '/landing', '/barter', '/aigc', '/insights', '/plaza'].map(p => '/portal/brand' + p),
  agent: ['', '/market', '/plans', '/payouts', '/credit', '/contracts', '/tickets', '/aigc', '/landing'].map(p => '/portal/agent' + p),
}
const profiles = [
  { name: 'desktop-light-normal', width: 1440, height: 900, theme: 'light', motion: 'no-preference' },
  { name: 'desktop-dark-reduced', width: 1440, height: 900, theme: 'dark', motion: 'reduce' },
  { name: 'tablet-light-reduced', width: 820, height: 1180, theme: 'light', motion: 'reduce' },
  { name: 'tablet-dark-normal', width: 820, height: 1180, theme: 'dark', motion: 'no-preference' },
  { name: 'mobile-light-normal', width: 390, height: 844, theme: 'light', motion: 'no-preference' },
  { name: 'mobile-dark-reduced', width: 390, height: 844, theme: 'dark', motion: 'reduce' },
] as const
async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))
  })
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: `${evidence}/round-${round}-${name}.png`, fullPage: true })
}
async function signIn(page: Page, account: string) {
  await page.goto(account === 'admin' ? '/#/login' : '/#/portal/login')
  await page.locator('input').first().fill(account)
  await page.locator('input[type=password]').fill('demo')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}
test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort()
  })
})
for (const profile of profiles) for (const account of ['admin', 'brand', 'agent'] as const) {
  test(`R${round} loaded route layout matrix ${account} ${profile.name}`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(profile)
    await page.emulateMedia({ reducedMotion: profile.motion, colorScheme: profile.theme })
    await page.addInitScript(theme => localStorage.setItem('cps-theme-v1', theme), profile.theme)
    await signIn(page, account)
    const rows = [], errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    for (const path of surfaces[account]) {
      await page.goto('/#' + path)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('main')).toBeVisible()
      await expect(page.locator('main .skeleton')).toHaveCount(0)
      const metrics = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, text: document.querySelector('main')?.textContent?.trim().length || 0, theme: document.documentElement.dataset.theme, motion: matchMedia('(prefers-reduced-motion: reduce)').matches }))
      const name = `${account}-${profile.name}-${path.replaceAll('/', '_') || 'home'}`
      await capture(page, name)
      rows.push({ path, profile: profile.name, metrics, evidence: `round-${round}-${name}.png`, level: 'actual browser with real API, route-level visual only' })
      expect(metrics.text, 'loaded business content').toBeGreaterThan(10)
      expect.soft(metrics.width, `${path} must not overflow the page`).toBeLessThanOrEqual(metrics.viewport + 1)
      expect.soft(page.url()).toContain('#' + path)
    }
    writeFileSync(`${evidence}/round-${round}-${account}-${profile.name}.json`, JSON.stringify({ rows, errors }, null, 2))
    expect(errors).toEqual([])
  })
}

test('brand draft repeated submit commits once with actual API readback', async ({ page }) => {
  await signIn(page, 'brand'); await page.goto('/#/portal/brand/products')
  await page.getByRole('button', { name: '上架商品', exact: true }).click()
  const name = `Audit R${round} once ${Date.now()}`
  await page.getByPlaceholder('如：会员 VIP 连续包月').fill(name)
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  let writes = 0
  await page.route('**/portal/brand/products', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch(); writes++
    await gate; await route.fulfill({ response })
  })
  await page.getByRole('button', { name: '创建草稿', exact: true }).dblclick()
  await expect.poll(() => writes).toBeGreaterThan(0)
  await capture(page, 'brand-create-pending')
  release(); await page.waitForLoadState('networkidle')
  const saved = await page.evaluate(async name => {
    const path = '/src/lib/portalApi.ts'
    const { portalApi } = await import(/* @vite-ignore */ path)
    return (await portalApi.brandProducts()).filter((p: { name: string }) => p.name === name)
  }, name)
  await capture(page, 'brand-created-readback')
  expect(writes).toBe(1); expect(saved).toHaveLength(1)
  await page.reload(); await expect(page.getByText(name, { exact: true })).toBeVisible()
})

test('closing a pending brand draft does not close the next draft', async ({ page }) => {
  await signIn(page, 'brand'); await page.goto('/#/portal/brand/products')
  await page.getByRole('button', { name: '上架商品', exact: true }).click()
  await page.getByPlaceholder('如：会员 VIP 连续包月').fill(`Earlier R${round} ${Date.now()}`)
  let release!: () => void; let ready = false
  const gate = new Promise<void>(r => { release = r })
  await page.route('**/portal/brand/products', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch(); ready = true
    await gate; await route.fulfill({ response })
  })
  await page.getByRole('button', { name: '创建草稿', exact: true }).click()
  await expect.poll(() => ready).toBe(true)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '上架商品', exact: true }).click()
  await page.getByPlaceholder('如：会员 VIP 连续包月').fill('Keep this newer draft')
  await capture(page, 'brand-newer-draft-before-release')
  release(); await page.waitForLoadState('networkidle')
  await capture(page, 'brand-newer-draft-after-release')
  await expect(page.getByPlaceholder('如：会员 VIP 连续包月')).toHaveValue('Keep this newer draft')
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const account of ['admin', 'brand'] as const) {
  test(`mobile ${account} business tables keep readable names and keyboard access to rightmost actions`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await signIn(page, account)
    await page.goto(account === 'admin' ? '/#/brands' : '/#/portal/brand/products')
    await page.waitForLoadState('networkidle')
    const table = page.locator('main table').first()
    await expect(table.locator('tbody tr')).not.toHaveCount(0)
    const width = await table.evaluate(t => t.getBoundingClientRect().width)
    expect(width).toBeGreaterThanOrEqual(account === 'admin' ? 1080 : 760)
    const scroll = table.locator('..')
    await expect(scroll).toHaveAttribute('tabindex', '0')
    await capture(page, `mobile-${account}-readable-table-left`)
    await scroll.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => scroll.evaluate(e => e.scrollLeft)).toBeGreaterThan(0)
    await scroll.evaluate(e => { e.scrollLeft = e.scrollWidth })
    await capture(page, `mobile-${account}-readable-table-right`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  })
}

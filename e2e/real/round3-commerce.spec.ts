import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect, type Page, type Browser } from '@playwright/test'

const out = '/tmp/cps-role-ui-audit/round3'
const profiles = [
  { name: 'desktop-light-normal', width: 1440, height: 900, theme: 'light', motion: 'no-preference' },
  { name: 'desktop-dark-reduced', width: 1440, height: 900, theme: 'dark', motion: 'reduce' },
  { name: 'tablet-light-reduced', width: 820, height: 1180, theme: 'light', motion: 'reduce' },
  { name: 'tablet-dark-normal', width: 820, height: 1180, theme: 'dark', motion: 'no-preference' },
  { name: 'mobile-light-normal', width: 390, height: 844, theme: 'light', motion: 'no-preference' },
  { name: 'mobile-dark-reduced', width: 390, height: 844, theme: 'dark', motion: 'reduce' },
] as const
async function actor(browser: Browser, profile: typeof profiles[number], account?: 'brand' | 'admin' | 'agent') {
  const context = await browser.newContext({ baseURL: 'http://localhost:5273', viewport: profile, colorScheme: profile.theme, reducedMotion: profile.motion, serviceWorkers: 'block' })
  await context.addInitScript(theme => localStorage.setItem('cps-theme-v1', theme), profile.theme)
  await context.route('**/*', route => { const u = new URL(route.request().url()); return ['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort() })
  const page = await context.newPage()
  if (account) {
    await page.goto(account === 'admin' ? '/#/login' : '/#/portal/login')
    await page.locator('input').first().fill(account); await page.locator('input[type=password]').fill('demo')
    await page.getByRole('button', { name: '登录', exact: true }).click(); await expect(page).not.toHaveURL(/\/login$/)
  }
  return { context, page }
}
async function read<T>(page: Page, path: string): Promise<T> { return page.evaluate(async p => { const modulePath = '/src/lib/http.ts'; const { http } = await import(/* @vite-ignore */modulePath); return http.get(p) }, path) }
async function capture(page: Page, name: string) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))) })
  mkdirSync(out, { recursive: true }); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
}
const amount = (n: number) => '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
for (const [index, profile] of profiles.entries()) test(`R3 exact product → review → public quote → saved bundle ${profile.name}`, async ({ browser }) => {
  test.setTimeout(100_000)
  const brand = await actor(browser, profile, 'brand'), admin = await actor(browser, profile, 'admin'), visitor = await actor(browser, profile)
  try {
    const name = `虚构精确到分订阅 ${profile.name} ${Date.now()}`
    const firstPrice = [19.91, 0.01, 10000.01][index % 3], renewPrice = firstPrice + 10.01
    await brand.page.goto('/#/portal/brand/products'); await brand.page.getByRole('button', { name: '上架商品', exact: true }).click()
    await brand.page.getByPlaceholder('如：会员 VIP 连续包月').fill(name)
    await brand.page.getByLabel('首单价 ¥', { exact: true }).fill(String(firstPrice)); await brand.page.getByLabel('续费价 ¥', { exact: true }).fill(renewPrice.toFixed(2))
    await brand.page.getByRole('button', { name: '创建草稿', exact: true }).click(); await expect(brand.page.getByRole('dialog')).toHaveCount(0)
    const row = brand.page.getByRole('row').filter({ has: brand.page.getByText(name, { exact: true }) })
    await expect(row).toContainText(amount(firstPrice)); await expect(row).toContainText(amount(renewPrice))
    const saved = (await read<Array<{ id: string; name: string; firstPrice: number; renewPrice: number }>>(brand.page, '/portal/brand/products')).find(p => p.name === name)!
    expect(saved.firstPrice).toBe(firstPrice); expect(saved.renewPrice).toBeCloseTo(renewPrice, 2)
    await row.getByText(amount(firstPrice), { exact: true }).scrollIntoViewIfNeeded(); await capture(brand.page, `${profile.name}-brand-cents`)
    await row.getByRole('button', { name: '提交审核', exact: true }).click()
    await expect.poll(async () => (await read<Array<{ id: string; status: string }>>(brand.page, '/portal/brand/products')).find(p => p.id === saved.id)?.status).toBe('pending')
    await admin.page.goto('/#/products'); const review = admin.page.getByRole('row').filter({ has: admin.page.getByText(name, { exact: true }) })
    await expect(review).toContainText(amount(firstPrice)); await expect(review).toContainText(amount(renewPrice))
    await review.getByText(amount(firstPrice), { exact: true }).scrollIntoViewIfNeeded(); await capture(admin.page, `${profile.name}-admin-cents`)
    await review.getByRole('button', { name: '通过', exact: true }).click()
    await expect.poll(async () => (await read<Array<{ id: string; status: string }>>(admin.page, '/products')).find(p => p.id === saved.id)?.status).toBe('live')
    await visitor.page.goto('/#/market'); const card = visitor.page.locator('[role=button][aria-pressed]').filter({ has: visitor.page.getByText(name, { exact: true }) })
    await expect(card).toContainText(amount(firstPrice)); await expect(card).toContainText(amount(renewPrice)); await card.scrollIntoViewIfNeeded()
    await card.getByRole('button', { name: '详情', exact: true }).click(); await expect(visitor.page.getByRole('dialog')).toContainText(amount(renewPrice))
    await capture(visitor.page, `${profile.name}-public-detail`); await visitor.page.keyboard.press('Escape'); await expect(visitor.page.getByRole('dialog')).toHaveCount(0)
    await card.focus(); await visitor.page.keyboard.press('Space'); await expect(card).toHaveAttribute('aria-pressed', 'true')
    const create = visitor.page.getByRole('button', { name: '生成我的订阅套餐', exact: true }); await expect(create).toBeEnabled()
    await create.scrollIntoViewIfNeeded(); await capture(visitor.page, `${profile.name}-quote`)
    const request = visitor.page.waitForResponse(r => r.url().endsWith('/market/bundle') && r.request().method() === 'POST')
    await create.click(); const response = await request; expect(response.ok()).toBe(true); const bundle = await response.json()
    expect(bundle.finalPrice).toBe(firstPrice); expect(bundle.bundleId).toBeTruthy()
    await expect(visitor.page.getByText(bundle.bundleId, { exact: true })).toBeVisible(); await expect(visitor.page.getByRole('button', { name: '在线支付即将开放' })).toBeDisabled()
    await capture(visitor.page, `${profile.name}-bundle`)
    expect(await visitor.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    mkdirSync(out, { recursive: true }); writeFileSync(`${out}/${profile.name}-readback.json`, JSON.stringify({ profile, product: saved, bundle: { id: bundle.bundleId, finalPrice: bundle.finalPrice, validIds: bundle.validIds }, actual: await visitor.page.evaluate(() => ({ theme: document.documentElement.dataset.theme, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches })) }, null, 2))
  } finally { await Promise.all([brand.context.close(), admin.context.close(), visitor.context.close()]) }
})

test('R3 public quote unavailable → explicit retry; stale quote cannot re-enable another selection', async ({ browser }) => {
  const { context, page } = await actor(browser, profiles[5])
  try {
    await page.goto('/#/market')
    const cards = page.locator('[role=button][aria-pressed]'); await expect(cards.first()).toBeVisible()
    let fail = true
    await page.route('**/market/quote', route => fail ? (fail = false, route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic quote unavailable' }) })) : route.continue())
    await cards.first().click(); await expect(page.getByText('报价暂时无法读取，请重新计算；尚未生成套餐。')).toBeVisible()
    await expect(page.getByRole('button', { name: '生成我的订阅套餐', exact: true })).toBeDisabled(); await capture(page, 'mobile-quote-unavailable')
    await page.getByRole('button', { name: '重新计算', exact: true }).click(); await expect(page.getByRole('button', { name: '生成我的订阅套餐', exact: true })).toBeEnabled()
    await capture(page, 'mobile-quote-restored'); await cards.first().click(); await expect(page.getByText('勾选左侧商品开始组合')).toBeVisible()
    await page.unroute('**/market/quote')
    let firstRelease!: () => void, secondRelease!: () => void, count = 0
    const firstGate = new Promise<void>(r => { firstRelease = r }), secondGate = new Promise<void>(r => { secondRelease = r })
    const bounded = async (promise: Promise<void>) => { let timer: ReturnType<typeof setTimeout> | undefined; try { await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Synthetic quote gate exceeded 8 seconds')), 8000) })]) } finally { clearTimeout(timer) } }
    await page.route('**/market/quote', async route => { const number = ++count; const response = await route.fetch(); await bounded(number === 1 ? firstGate : secondGate); await route.fulfill({ response }) })
    try {
      await cards.first().click(); await expect.poll(() => count).toBe(1)
      const another = page.locator('[role=button][aria-pressed=false][aria-disabled=false]').first(); await another.click(); await expect.poll(() => count).toBe(2)
      firstRelease(); await expect(page.getByRole('button', { name: '生成我的订阅套餐', exact: true })).toBeDisabled()
      secondRelease(); await expect(page.getByRole('button', { name: '生成我的订阅套餐', exact: true })).toBeEnabled(); await capture(page, 'mobile-current-selection-quote')
    } finally { firstRelease(); secondRelease(); await page.unroute('**/market/quote') }
  } finally { await context.close() }
})

for (const profile of [profiles[4], profiles[5]]) test(`R3 agent cents, pending balance and interrupted application ${profile.name}`, async ({ browser }) => {
  const { context, page } = await actor(browser, profile, 'agent')
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await page.goto('/#/portal/agent/payouts')
    const data = await read<{ payoutPending: number }>(page, '/portal/agent/payouts')
    const before = await read<Array<{ id: string; amount: number; status: string }>>(page, '/portal/agent/payout-requests')
    const held = before.filter(r => ['pending', 'approved'].includes(r.status)).reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
    const available = (Math.round(data.payoutPending * 100) - held) / 100
    await page.getByRole('button', { name: '申请提现', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('spinbutton')).toHaveValue(String(available))
    await page.getByRole('spinbutton').fill('100.01')
    let writes = 0
    await page.route('**/portal/agent/payout-requests', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const response = await route.fetch(); writes++; await Promise.race([gate, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Synthetic payout gate exceeded 15 seconds')), 15000) })]); clearTimeout(timer); await route.fulfill({ response })
    })
    await page.getByRole('button', { name: '提交申请', exact: true }).dblclick(); await expect.poll(() => writes).toBe(1)
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '申请提现', exact: true }).click(); await page.getByRole('spinbutton').fill('12.34')
    release(); clearTimeout(timer)
    await expect.poll(async () => (await read<unknown[]>(page, '/portal/agent/payout-requests')).length).toBe(before.length + 1)
    await expect(page.getByRole('dialog').getByRole('spinbutton')).toHaveValue('12.34'); await capture(page, `${profile.name}-payout-new-draft-retained`)
    await page.getByRole('button', { name: '取消', exact: true }).click(); await page.reload()
    await expect(page.getByRole('cell', { name: '¥100.01', exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: '申请提现', exact: true }).click()
    await expect(page.getByRole('spinbutton')).toHaveValue(((Math.round(available * 100) - 10001) / 100).toString())
    await capture(page, `${profile.name}-payout-remaining-cents`)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.unroute('**/portal/agent/payout-requests')
    await page.route('**/portal/agent/payout-requests', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Synthetic unavailable request history"}' }))
    await page.reload(); await expect(page.getByText('提现申请记录暂时无法读取，可申请余额尚未确认。')).toBeVisible()
    await expect(page.getByRole('button', { name: '申请提现', exact: true })).toBeDisabled(); await capture(page, `${profile.name}-payout-history-unavailable`)
    await page.unroute('**/portal/agent/payout-requests'); await page.getByRole('button', { name: '重试申请记录', exact: true }).click()
    await expect(page.getByRole('button', { name: '申请提现', exact: true })).toBeEnabled()
    const after = await read<Array<{ id: string; amount: number; status: string }>>(page, '/portal/agent/payout-requests')
    const added = after.filter(r => !before.some(old => old.id === r.id)); expect(added).toHaveLength(1); expect(added[0]).toMatchObject({ amount: 100.01, status: 'pending' })
    writeFileSync(`${out}/${profile.name}-payout-readback.json`, JSON.stringify({ beforeCount: before.length, afterCount: after.length, writes, added, requestableBefore: available }, null, 2))
  } finally { release(); clearTimeout(timer); await context.close() }
})

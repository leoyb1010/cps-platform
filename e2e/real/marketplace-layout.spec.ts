import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'

for (const width of [820, 390]) for (const motion of ['no-preference', 'reduce'] as const) {
test(`marketplace actions stay in-card and operable: ${width} ${motion}`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 1180 })
  await page.emulateMedia({ reducedMotion: motion })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort()
  })
  await page.goto('/#/login')
  await page.locator('input').first().fill('admin')
  await page.locator('input[type=password]').fill('demo')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login$/)
  await page.goto('/#/marketplace'); await page.waitForLoadState('networkidle')
  const actions = page.locator('.marketplace-actions')
  await expect(actions).not.toHaveCount(0)
  const sizes = await actions.locator('button').evaluateAll(buttons => buttons.map(b => {
    const box=b.getBoundingClientRect(), card=b.closest('.marketplace-card')!.getBoundingClientRect()
    const range=document.createRange();range.selectNodeContents(b);const text=range.getBoundingClientRect()
    return { width:box.width, height:box.height, text:b.textContent, scroll:b.scrollWidth, client:b.clientWidth,
      insideCard:box.left>=card.left && box.right<=card.right+1,
      textInside:text.left>=box.left-1 && text.right<=box.right+1 && text.bottom<=box.bottom+1 }
  }))
  for (const size of sizes) {
    expect(size.height, `horizontal action: ${size.text}`).toBeLessThanOrEqual(48)
    expect(size.scroll).toBeLessThanOrEqual(size.client+1)
    expect(size.insideCard).toBe(true)
    expect(size.textInside).toBe(true)
  }
  await page.getByRole('button', { name: '规范', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0)
  mkdirSync('/tmp/cps-role-ui-audit/comprehensive', { recursive: true })
  await page.screenshot({ path: `/tmp/cps-role-ui-audit/comprehensive/round-1-marketplace-${width}-${motion}-actions.png`, fullPage: true })
})

}

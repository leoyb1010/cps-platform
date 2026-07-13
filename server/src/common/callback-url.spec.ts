import { describe, expect, it } from 'vitest'
import { validatePublicCallbackUrl } from './callback-url'

describe('callback URL SSRF guard', () => {
  it.each([
    'https://[::ffff:127.0.0.1]/x',
    'https://[::ffff:7f00:1]/x',
    'https://[fe90::1]/x',
    'https://[ff02::1]/x',
    'https://[2001:db8::1]/x',
  ])('拒绝非公网 IPv6: %s', async (url) => {
    await expect(validatePublicCallbackUrl(url)).resolves.toMatchObject({ ok: false })
  })

  it('直接公网 IP 返回可固定连接的已验证地址', async () => {
    await expect(validatePublicCallbackUrl('https://8.8.8.8/hook')).resolves.toMatchObject({
      ok: true,
      addresses: [{ address: '8.8.8.8', family: 4 }],
    })
  })
})

import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'

type ResolvedAddress = { address: string; family: 4 | 6 }
type CallbackUrlCheck = { ok: true; url: string; addresses: ResolvedAddress[] } | { ok: false; detail: string }

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
])

function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

function inRange(ip: string, cidrBase: string, mask: number): boolean {
  const value = ipv4ToNumber(ip)
  const base = ipv4ToNumber(cidrBase)
  const bits = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0
  return (value & bits) === (base & bits)
}

function blockedIpv4(host: string): boolean {
  return (
    inRange(host, '0.0.0.0', 8) ||
    inRange(host, '10.0.0.0', 8) ||
    inRange(host, '100.64.0.0', 10) ||
    inRange(host, '127.0.0.0', 8) ||
    inRange(host, '169.254.0.0', 16) ||
    inRange(host, '172.16.0.0', 12) ||
    inRange(host, '192.0.0.0', 24) ||
    inRange(host, '192.168.0.0', 16) ||
    inRange(host, '198.18.0.0', 15) ||
    inRange(host, '198.51.100.0', 24) ||
    inRange(host, '203.0.113.0', 24) ||
    inRange(host, '224.0.0.0', 4)
  )
}

function benchmarkIpv4(host: string): boolean {
  return inRange(host, '198.18.0.0', 15)
}

function blockedIpv6(host: string): boolean {
  const value = ipv6ToBigInt(host)
  if (value === null) return true
  // 出站 webhook 只允许公网 global-unicast IPv6（2000::/3），并排除其中的文档/基准保留段。
  if (!inIpv6Range(value, ipv6ToBigInt('2000::')!, 3)) return true
  return (
    inIpv6Range(value, ipv6ToBigInt('2001:2::')!, 48) ||
    inIpv6Range(value, ipv6ToBigInt('2001:db8::')!, 32)
  )
}

function ipv6ToBigInt(host: string): bigint | null {
  const input = host.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  const halves = input.split('::')
  if (halves.length > 2) return null
  const parse = (part: string): number[] | null => {
    if (!part) return []
    const out: number[] = []
    for (const token of part.split(':')) {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(token)) {
        if (isIP(token) !== 4) return null
        const n = ipv4ToNumber(token)
        out.push((n >>> 16) & 0xffff, n & 0xffff)
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(token)) return null
        out.push(Number.parseInt(token, 16))
      }
    }
    return out
  }
  const left = parse(halves[0]); const right = parse(halves[1] ?? '')
  if (!left || !right) return null
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0
  if (missing < 0 || (halves.length === 1 && left.length !== 8)) return null
  const words = [...left, ...Array(missing).fill(0), ...right]
  if (words.length !== 8) return null
  return words.reduce((acc, word) => (acc << 16n) | BigInt(word), 0n)
}

function inIpv6Range(value: bigint, base: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix)
  return (value >> shift) === (base >> shift)
}

function blockedIp(host: string): boolean {
  const ipVersion = isIP(host)
  if (ipVersion === 4) return blockedIpv4(host)
  if (ipVersion === 6) return blockedIpv6(host)
  return false
}

function hostEmbedsBlockedIpv4(host: string): boolean {
  const dotted = host.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?:\.|$)/)?.[1]
  const dashed = host.match(/^(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})(?:\.|$)/)
  const ip = dotted ?? (dashed ? `${dashed[1]}.${dashed[2]}.${dashed[3]}.${dashed[4]}` : '')
  return isIP(ip) === 4 && blockedIpv4(ip)
}

export async function validatePublicCallbackUrl(raw: string): Promise<CallbackUrlCheck> {
  const value = raw.trim()
  if (!value) return { ok: true, url: '', addresses: [] }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, detail: '回调地址格式非法' }
  }

  if (url.protocol !== 'https:') return { ok: false, detail: '回调地址必须使用 HTTPS 公网地址' }
  if (url.username || url.password) return { ok: false, detail: '回调地址不能包含用户名或密码' }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return { ok: false, detail: '回调地址缺少主机名' }
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { ok: false, detail: '回调地址不能指向本机或内网主机' }
  }
  if (hostEmbedsBlockedIpv4(host)) return { ok: false, detail: '回调地址不能包含本机或内网 IP' }

  const ipVersion = isIP(host)
  if (ipVersion && blockedIp(host)) return { ok: false, detail: '回调地址不能指向本机或内网 IP' }

  let addresses: ResolvedAddress[]
  if (!ipVersion) {
    let records: { address: string }[]
    try {
      records = await lookup(host, { all: true, verbatim: true })
    } catch {
      return { ok: false, detail: '回调地址域名无法解析' }
    }
    if (records.length === 0) return { ok: false, detail: '回调地址域名无法解析' }
    const blockedRecords = records.filter((r) => blockedIp(r.address))
    const fakeDnsOnly = blockedRecords.length === records.length && records.every((r) => benchmarkIpv4(r.address)) && process.env.ALLOW_FAKE_DNS_CALLBACK_RESOLUTION === 'true'
    if (blockedRecords.length > 0 && !fakeDnsOnly) {
      return { ok: false, detail: '回调地址不能解析到本机或内网 IP' }
    }
    addresses = records.map((r) => ({ address: r.address, family: isIP(r.address) as 4 | 6 }))
  } else {
    addresses = [{ address: host, family: ipVersion as 4 | 6 }]
  }

  return { ok: true, url: url.toString().slice(0, 300), addresses }
}

/** 校验并把 HTTPS 连接固定到本次已验证 IP；不跟随重定向，消除校验后再次 DNS 解析的重绑定窗口。 */
export async function postJsonToPublicCallback(raw: string, payload: unknown, timeoutMs: number): Promise<{ ok: boolean; status: number }> {
  const checked = await validatePublicCallbackUrl(raw)
  if (!checked.ok) throw new Error(checked.detail)
  const url = new URL(checked.url)
  const target = checked.addresses[0]
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      protocol: 'https:',
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      servername: isIP(url.hostname.replace(/^\[|\]$/g, '')) ? undefined : url.hostname,
      lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        if (options?.all) callback(null, [target])
        else callback(null, target.address, target.family)
      }) as never,
      timeout: timeoutMs,
    }, (res) => {
      res.resume()
      resolve({ ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, status: res.statusCode ?? 0 })
    })
    req.on('timeout', () => req.destroy(new Error('回调请求超时')))
    req.on('error', reject)
    req.end(JSON.stringify(payload))
  })
}

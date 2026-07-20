import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

type CallbackUrlCheck = { ok: true; url: string } | { ok: false; detail: string }

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
    inRange(host, '224.0.0.0', 4) ||
    inRange(host, '240.0.0.0', 4) // Class E / 255.255.255.255 广播
  )
}

function benchmarkIpv4(host: string): boolean {
  return inRange(host, '198.18.0.0', 15)
}

// IPv4-mapped IPv6 还原为点分 IPv4。覆盖点分(::ffff:1.2.3.4)与 hex(::ffff:0102:0304)两种形态——
// Node 的 WHATWG URL 会把 [::ffff:169.254.169.254] 规范化成 hex ::ffff:a9fe:a9fe，仅认点分会被绕过。
function mappedIpv4(h: string): string | null {
  const dotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (dotted) return isIP(dotted[1]) === 4 ? dotted[1] : null
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
  }
  return null
}

function blockedIpv6(host: string): boolean {
  const h = host.toLowerCase()
  const m = mappedIpv4(h)
  if (m) return blockedIpv4(m)
  if (h === '::' || h === '::1') return true // 未指定地址 / 环回
  if (h.startsWith('fc') || h.startsWith('fd')) return true // 唯一本地地址 fc00::/7
  if (/^fe[89ab]/.test(h)) return true // 链路本地 fe80::/10（原 'fe80:' 漏了 fe81–febf）
  if (h.startsWith('ff')) return true // 组播 ff00::/8
  return false
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
  if (!value) return { ok: true, url: '' }

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
  }

  return { ok: true, url: url.toString().slice(0, 300) }
}

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
    inRange(host, '224.0.0.0', 4)
  )
}

function benchmarkIpv4(host: string): boolean {
  return inRange(host, '198.18.0.0', 15)
}

function blockedIpv6(host: string): boolean {
  const h = host.toLowerCase()
  const mapped = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return blockedIpv4(mapped[1])
  return h === '::' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')
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

import { BadRequestException } from '@nestjs/common'
import { isIP } from 'net'

/**
 * 回调地址 SSRF 守卫（对外 webhook 地址的统一校验闸）。
 *
 * 为什么需要：品牌可自助写入任意回调地址，且平台会主动 fetch 探测（healthCheck）
 * 与投递（fund 阶段 sign-webhook）。若不校验，攻击者可把回调指向内网服务、
 * 云元数据端点（169.254.169.254）或本机 loopback，借平台之手打内网 → SSRF。
 *
 * 纯函数、无业务依赖，供 portal（写入 + 探测）与 fund 阶段 sign-webhook 独立复用。
 * 仅拦截「字面私有/保留地址与 localhost」；DNS rebinding 需在实际请求时按解析 IP 复核，
 * 不在本闸职责内（本闸只保证配置期不写入明显危险地址）。
 */
export function assertSafeCallbackUrl(rawUrl: string): void {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new BadRequestException('回调地址格式非法')
  }
  // 只允许 https：http 明文回调本身不安全，也堵掉 file:/gopher: 等 SSRF 常用协议
  if (u.protocol !== 'https:') throw new BadRequestException('回调地址必须为 https://')
  if (isBlockedHost(u.hostname.toLowerCase())) {
    throw new BadRequestException('回调地址不允许指向私有/保留网段或本机')
  }
}

function isBlockedHost(host: string): boolean {
  // localhost 及其子域别名
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  const bare = host.replace(/^\[|\]$/g, '') // URL.hostname 对 IPv6 字面量带方括号，先剥离
  const kind = isIP(bare)
  if (kind === 4) return isBlockedIPv4(bare)
  if (kind === 6) return isBlockedIPv6(bare)
  return false // 普通域名放行（解析后是否落私网由请求期复核，非本闸职责）
}

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number(n))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 10) return true // 10.0.0.0/8 RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 168) return true // 192.168.0.0/16 RFC1918
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local（含云元数据 169.254.169.254）
  if (a === 0) return true // 0.0.0.0/8（含 0.0.0.0 本机）
  return false
}

function isBlockedIPv6(ip: string): boolean {
  const h = ip.toLowerCase()
  if (h === '::1' || h === '::') return true // loopback / 未指定地址
  if (h.startsWith('fe80')) return true // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true // unique-local fc00::/7
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) // IPv4-mapped ::ffff:a.b.c.d
  if (mapped) return isBlockedIPv4(mapped[1])
  return false
}

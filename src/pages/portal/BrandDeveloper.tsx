import { useState } from 'react'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { Card, CardTitle, PageHeader, Badge, Button, TableShell, Th, Td, Row } from '../../components/ui/primitives'
import { Modal, useToast } from '../../components/ui/overlays'
import { Field, Input } from '../../components/ui/forms'
import { portalApi } from '../../lib/portalApi'
import { usePortalResource, PortalState, DefaultSkeleton } from '../../components/portal/kit'

interface DevConfig {
  appId: string | null
  secretHint: string | null
  hasCredential: boolean
  callbackUrl: string
  apiBase: string
}
interface WebhookLog {
  id: string; signOrderNo: string; status: number; direction: string
  httpStatus: number; ok: boolean; error: string; createdAt: string
}

// 回调 status 枚举（与对外文档一致）
const STATUS_LABEL: Record<number, string> = { 1: '签约成功', 2: '扣款成功', 3: '解约成功', 4: '退款成功', 5: '扣款失败' }

// 5 类对外接口字段表（与 docs/cps-连续包月对接规范.md 同源）
const ENDPOINTS = [
  {
    method: 'POST', path: '/cps/v1/sign', name: '签约', desc: '连续包月签约，返回签约单号 + 签约链接',
    params: [
      ['sign_content', 'string', '签约商品 ID'],
      ['pay_channel_type', 'number', '1=支付宝'],
      ['mobile', 'string', '用户手机号'],
      ['extra_info', 'string', '透传参数（回调原样返回）'],
      ['appId / timestamp / sign', '-', '鉴权三件套（见签名规范）'],
    ],
  },
  {
    method: 'POST', path: '/cps/v1/refund', name: '退款', desc: '指定某期订单退款（按签约单号 + 交易单号）',
    params: [['signOrderNo', 'string', '签约单号'], ['orderNo', 'string', '交易单号'], ['appId / timestamp / sign', '-', '鉴权']],
  },
  {
    method: 'POST', path: '/cps/v1/unsign', name: '解约', desc: '停止后续扣款 + 取消补扣',
    params: [['signOrderNo', 'string', '签约单号'], ['appId / timestamp / sign', '-', '鉴权']],
  },
  {
    method: 'POST', path: '/cps/v1/query', name: '查询', desc: '签约单 + 各期扣款状态（对账）',
    params: [['signOrderNo', 'string', '签约单号'], ['appId / timestamp / sign', '-', '鉴权']],
  },
  {
    method: 'POST', path: '/cps/v1/callback', name: '回调接收', desc: '我方提供：品牌推订单状态变化通知',
    params: [['signOrderNo / status', 'string/int', '签约单号 + 状态(1~5)'], ['orderNo / amount / period', '-', '扣款/退款时携带'], ['appId / timestamp / sign', '-', '鉴权']],
  },
]

export function BrandDeveloper() {
  const toast = useToast()
  const { data, state, reload } = usePortalResource<DevConfig>(() => portalApi.developer<DevConfig>())
  const logs = usePortalResource<WebhookLog[]>(() => portalApi.webhookLogs<WebhookLog[]>())
  const [cbUrl, setCbUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newSecret, setNewSecret] = useState<{ appId: string; secret: string } | null>(null)
  const [copied, setCopied] = useState('')
  const [openEp, setOpenEp] = useState<string | null>(null)

  const cfg = data
  const callbackValue = cbUrl ?? cfg?.callbackUrl ?? ''

  const copy = (text: string, tag: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(tag); setTimeout(() => setCopied(''), 1500) })
  }
  const rotate = async () => {
    try {
      const r = await portalApi.rotateCredential()
      if (r.ok) { setNewSecret({ appId: r.appId, secret: r.secret }); reload() }
    } catch { toast({ tone: 'alert', text: '重置密钥失败，请重试' }) }
  }
  const saveCallback = async () => {
    setSaving(true)
    try {
      const r = await portalApi.setCallbackUrl(callbackValue)
      if (r.ok) { toast({ tone: 'good', text: '回调地址已保存' }); setCbUrl(null); reload(); logs.reload() }
    } catch { toast({ tone: 'alert', text: '保存失败，请重试' }) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="开发者中心" desc="CPS 连续包月（先签约后代扣）对接：凭证、回调地址与联调日志" />

      <PortalState state={state} data={cfg} skeleton={<DefaultSkeleton />}>
        {(c) => (
          <>
            {/* 对接概览：凭证 + 回调 */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardTitle title="对接凭证" />
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink-3">AppId</span>
                    {c.appId ? (
                      <button onClick={() => copy(c.appId!, 'appId')} className="flex items-center gap-1.5 font-mono text-ink-1 hover:text-brand">
                        {c.appId}{copied === 'appId' ? <Check size={13} className="text-good" /> : <Copy size={13} className="text-ink-4" />}
                      </button>
                    ) : <Badge tone="neutral">未生成</Badge>}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink-3">Secret</span>
                    <span className="font-mono text-ink-2">{c.secretHint ? `••••••••${c.secretHint}` : '—'}</span>
                  </div>
                  <div className="pt-1">
                    <Button variant="ghost" onClick={rotate}><RefreshCw size={13} /> {c.hasCredential ? '重置密钥' : '生成凭证'}</Button>
                    <p className="mt-2 text-xs text-ink-4">密钥明文仅在生成时显示一次，请妥善保存。重置后旧密钥立即失效。</p>
                  </div>
                </div>
              </Card>

              <Card>
                <CardTitle title="回调地址（接收状态通知）" />
                <div className="mt-3 space-y-3">
                  <Field label="Callback URL">
                    <Input value={callbackValue} onChange={(e) => setCbUrl(e.target.value)} placeholder="https://your-domain.com/cps/callback" />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Button onClick={saveCallback} disabled={saving || callbackValue === (cfg?.callbackUrl ?? '')}>保存回调地址</Button>
                    <span className="text-xs text-ink-4">扣款/续费/退款/解约 事件将以 HMAC 签名 POST 推送至此</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* 签名规范 */}
            <Card>
              <CardTitle title="鉴权与签名（HMAC-SHA256）" />
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
                <li>取业务字段，剔除 <code className="rounded bg-surface-muted px-1">sign</code> 与空值</li>
                <li>按 key 升序拼接 <code className="rounded bg-surface-muted px-1">k1=v1&amp;k2=v2&amp;…</code>（对象/数组值 JSON 序列化）</li>
                <li>尾接 <code className="rounded bg-surface-muted px-1">&amp;key=&lt;secret&gt;</code></li>
                <li>计算 <code className="rounded bg-surface-muted px-1">sign = HMAC_SHA256(stringToSign, secret)</code>（小写 hex）</li>
                <li>请求带 <code className="rounded bg-surface-muted px-1">appId / timestamp / sign</code>；timestamp 偏移须 ≤ 300 秒（防重放）</li>
              </ol>
              <p className="mt-2 text-xs text-ink-4">对接基址：<code className="rounded bg-surface-muted px-1 font-mono">{c.apiBase}</code> · 完整规范见对接文档</p>
            </Card>

            {/* 接口总览 */}
            <Card>
              <CardTitle title="接口总览" />
              <div className="mt-3 space-y-2">
                {ENDPOINTS.map((ep) => (
                  <div key={ep.path} className="rounded-lg border border-line">
                    <button onClick={() => setOpenEp(openEp === ep.path ? null : ep.path)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-muted">
                      <Badge tone="neutral">{ep.method}</Badge>
                      <code className="font-mono text-sm text-ink-1">{ep.path}</code>
                      <span className="text-sm text-ink-3">· {ep.name}</span>
                      <span className="ml-auto text-xs text-ink-4">{openEp === ep.path ? '收起' : '字段'}</span>
                    </button>
                    {openEp === ep.path && (
                      <div className="border-t border-line px-3.5 py-3">
                        <p className="mb-2 text-sm text-ink-2">{ep.desc}</p>
                        <table className="w-full text-sm">
                          <tbody>
                            {ep.params.map(([n, t, d]) => (
                              <tr key={n} className="border-b border-line/50 last:border-0">
                                <td className="py-1.5 pr-3 font-mono text-ink-1">{n}</td>
                                <td className="py-1.5 pr-3 text-ink-4">{t}</td>
                                <td className="py-1.5 text-ink-2">{d}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* 联调日志 */}
            <Card>
              <CardTitle title="联调日志（回调投递记录）" />
              <div className="mt-3">
                <PortalState state={logs.state} data={logs.data} skeleton={<DefaultSkeleton />} emptyTitle="暂无投递记录">
                  {(rows) => (
                    <TableShell head={<><Th>签约单号</Th><Th>状态</Th><Th>方向</Th><Th>HTTP</Th><Th>结果</Th><Th>时间</Th></>}>
                        {rows.slice(0, 30).map((l) => (
                          <Row key={l.id}>
                            <Td><code className="font-mono text-xs">{l.signOrderNo}</code></Td>
                            <Td>{STATUS_LABEL[l.status] ?? l.status}</Td>
                            <Td>{l.direction === 'outbound' ? '出站' : '入站'}</Td>
                            <Td>{l.httpStatus || '—'}</Td>
                            <Td><Badge tone={l.ok ? 'good' : 'alert'}>{l.ok ? '成功' : (l.error || '失败')}</Badge></Td>
                            <Td className="text-ink-4">{new Date(l.createdAt).toLocaleString('zh-CN', { hour12: false })}</Td>
                          </Row>
                        ))}
                    </TableShell>
                  )}
                </PortalState>
              </div>
            </Card>
          </>
        )}
      </PortalState>

      {/* 一次性明文密钥弹窗 */}
      <Modal open={!!newSecret} onClose={() => setNewSecret(null)} title="对接密钥已生成">
        {newSecret && (
          <div className="space-y-3">
            <p className="text-sm text-alert">⚠️ 密钥明文仅此一次显示，关闭后无法再次查看，请立即保存。</p>
            <Field label="AppId">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-surface-muted px-3 py-2 font-mono text-sm">{newSecret.appId}</code>
                <Button variant="ghost" onClick={() => copy(newSecret.appId, 'nApp')}>{copied === 'nApp' ? <Check size={14} /> : <Copy size={14} />}</Button>
              </div>
            </Field>
            <Field label="Secret">
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-surface-muted px-3 py-2 font-mono text-sm">{newSecret.secret}</code>
                <Button variant="ghost" onClick={() => copy(newSecret.secret, 'nSec')}>{copied === 'nSec' ? <Check size={14} /> : <Copy size={14} />}</Button>
              </div>
            </Field>
            <Button onClick={() => setNewSecret(null)}>我已保存</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

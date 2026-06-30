import { useState } from 'react'
import { Copy, Check, KeyRound, Webhook, Code2, Activity, ShieldCheck, Upload, Play } from 'lucide-react'
import { Card, CardTitle, PageHeader, Badge, Button, TableShell, Th, Td, Row, Segmented } from '../../components/ui/primitives'
import { Modal, useToast } from '../../components/ui/overlays'
import { Field, Input, Textarea } from '../../components/ui/forms'
import { portalApi } from '../../lib/portalApi'
import { usePortalResource, PortalState, DefaultSkeleton } from '../../components/portal/kit'
import { LANGS, stringToSign, type CodeGenInput } from '../../lib/codeGen'

interface DevConfig {
  custId: string | null
  merchantId: string | null
  publicKeyHint: string | null
  hasPublicKey: boolean
  keySource: string | null
  callbackUrl: string
  apiBase: string
}
interface WebhookLog {
  id: string; signOrderNo: string; status: number; direction: string
  httpStatus: number; ok: boolean; error: string; createdAt: string
}
const YD_STATUS_LABEL: Record<number, string> = { 0: '解约', 1: '签约', 2: '代扣', 3: '退款', 4: '代扣失败', 5: '退款失败' }
type Tab = 'cred' | 'console' | 'code' | 'health' | 'logs'

// 有道续费 5 端点（字段表 + 联调台预设）
const ENDPOINTS = [
  { method: 'POST' as const, path: '/pay/outside/order', name: '续费下单', fields: ['custId', 'merchantId', 'goodsId', 'custOrderId', 'phone', 'payType', 'platform', 'signType', 'deviceId'] },
  { method: 'POST' as const, path: '/order/outside/refund', name: '退款', fields: ['custId', 'merchantId', 'orderId'] },
  { method: 'POST' as const, path: '/order/outside/unsign', name: '解约', fields: ['custId', 'merchantId', 'orderId'] },
  { method: 'GET' as const, path: '/order/outside/orderQuery', name: '订单查询', fields: ['merchantId', 'orderId'] },
]

export function BrandDeveloper() {
  const toast = useToast()
  const { data, state, reload } = usePortalResource<DevConfig>(() => portalApi.developer<DevConfig>())
  const [tab, setTab] = useState<Tab>('cred')
  const [copied, setCopied] = useState('')
  const copy = (text: string, tag: string) => navigator.clipboard?.writeText(text).then(() => { setCopied(tag); setTimeout(() => setCopied(''), 1500) })

  return (
    <div className="space-y-5">
      <PageHeader title="开发者中心" desc="有道会员续费对接（RSA 签名）：密钥自助 · 在线联调 · SDK 生成 · 接入健康分" />
      <PortalState state={state} data={data} skeleton={<DefaultSkeleton />}>
        {(c) => (
          <>
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'cred', label: '凭证密钥' },
                { value: 'console', label: '在线联调' },
                { value: 'code', label: 'SDK / 代码' },
                { value: 'health', label: '接入健康分' },
                { value: 'logs', label: '联调日志' },
              ]}
            />
            {tab === 'cred' && <CredTab c={c} reload={reload} copy={copy} copied={copied} />}
            {tab === 'console' && <ConsoleTab endpoints={ENDPOINTS} baseUrl={c.apiBase} merchantId={c.merchantId ?? ''} custId={c.custId ?? ''} copy={copy} copied={copied} />}
            {tab === 'code' && <CodeTab endpoints={ENDPOINTS} baseUrl={c.apiBase} merchantId={c.merchantId ?? ''} custId={c.custId ?? ''} copy={copy} copied={copied} />}
            {tab === 'health' && <HealthTab />}
            {tab === 'logs' && <LogsTab />}
          </>
        )}
      </PortalState>
    </div>
  )
}

// ── 凭证 + 密钥自助 ──
function CredTab({ c, reload, copy, copied }: { c: DevConfig; reload: () => void; copy: (t: string, tag: string) => void; copied: string }) {
  const toast = useToast()
  const [cbUrl, setCbUrl] = useState<string | null>(null)
  const [newPriv, setNewPriv] = useState<{ publicKey: string; privateKey: string } | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [pubInput, setPubInput] = useState('')
  const callbackValue = cbUrl ?? c.callbackUrl ?? ''

  const keygen = async () => {
    try { const r = await portalApi.rsaKeygen(); if (r.ok) { setNewPriv({ publicKey: r.publicKey, privateKey: r.privateKey }); reload() } }
    catch { toast({ tone: 'alert', text: '生成密钥失败' }) }
  }
  const upload = async () => {
    try { const r = await portalApi.rsaUpload(pubInput); if (r.ok) { toast({ tone: 'good', text: '公钥已保存' }); setUploadOpen(false); setPubInput(''); reload() } else toast({ tone: 'alert', text: r.detail }) }
    catch { toast({ tone: 'alert', text: '上传失败' }) }
  }
  const saveCb = async () => {
    try { const r = await portalApi.setCallbackUrl(callbackValue); if (r.ok) { toast({ tone: 'good', text: '回调地址已保存' }); setCbUrl(null) } }
    catch { toast({ tone: 'alert', text: '保存失败' }) }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="RSA 对接凭证" />
          <div className="mt-3 space-y-3 text-sm">
            <Kv label="custId" val={c.custId} copy={copy} copied={copied} tag="cust" />
            <Kv label="merchantId" val={c.merchantId} copy={copy} copied={copied} tag="mch" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-3">公钥指纹</span>
              <span className="font-mono text-ink-2">{c.publicKeyHint ? `••••${c.publicKeyHint}` : '—'}{c.keySource && <Badge tone="neutral" >{c.keySource === 'keygen' ? '系统生成' : '上传'}</Badge>}</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="ghost" onClick={keygen}><KeyRound size={13} /> {c.hasPublicKey ? '重新生成密钥' : '生成密钥对'}</Button>
              <Button variant="ghost" onClick={() => setUploadOpen(true)}><Upload size={13} /> 上传公钥</Button>
            </div>
            <p className="text-xs text-ink-4">私钥由你自留，仅生成时下载一次；系统只存公钥用于验签。生产请妥善保管私钥。</p>
          </div>
        </Card>
        <Card>
          <CardTitle title="回调地址（接收状态通知）" />
          <div className="mt-3 space-y-3">
            <Field label="Callback URL"><Input value={callbackValue} onChange={(e) => setCbUrl(e.target.value)} placeholder="https://your-domain.com/youdao/callback" /></Field>
            <div className="flex items-center gap-2">
              <Button onClick={saveCb} disabled={callbackValue === (c.callbackUrl ?? '')}>保存回调地址</Button>
              <span className="text-xs text-ink-4">代扣/退款/解约 事件将以平台 RSA 签名 POST 推送至此</span>
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <CardTitle title="签名规范（SHA256withRSA）" />
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
          <li>参数按 key 字母序拼接 <code className="rounded bg-surface-muted px-1">k1=v1&amp;k2=v2&amp;…</code>，剔除空值与 <code className="rounded bg-surface-muted px-1">sign</code></li>
          <li>用私钥 <code className="rounded bg-surface-muted px-1">SHA256withRSA</code> 签名，结果 <code className="rounded bg-surface-muted px-1">base64</code></li>
          <li>请求携带 <code className="rounded bg-surface-muted px-1">sign</code>（form-data）；有道用你的公钥验签</li>
        </ol>
        <p className="mt-2 text-xs text-ink-4">对接基址：<code className="rounded bg-surface-muted px-1 font-mono">{c.apiBase}</code> · 测试 https://dict-paycenter-test.youdao.com/client</p>
      </Card>

      {/* 私钥一次性下载 Modal */}
      <Modal open={!!newPriv} onClose={() => setNewPriv(null)} title="RSA 密钥对已生成" width={560}>
        {newPriv && (
          <div className="space-y-3">
            <p className="text-sm text-alert">⚠️ 私钥仅此一次显示，关闭后无法再次获取。请立即保存为 .pem 文件。</p>
            <Field label="私钥（PKCS8 PEM · 自留，绝不上传）">
              <div className="flex items-start gap-2">
                <code className="flex-1 max-h-40 overflow-auto rounded-lg bg-surface-muted px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">{newPriv.privateKey}</code>
                <Button variant="ghost" onClick={() => copy(newPriv.privateKey, 'npriv')}>{copied === 'npriv' ? <Check size={14} /> : <Copy size={14} />}</Button>
              </div>
            </Field>
            <Field label="公钥（SPKI PEM · 已入库）">
              <code className="block max-h-28 overflow-auto rounded-lg bg-surface-muted px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">{newPriv.publicKey}</code>
            </Field>
            <Button onClick={() => setNewPriv(null)}>我已保存私钥</Button>
          </div>
        )}
      </Modal>

      {/* 上传公钥 Modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="上传 RSA 公钥" width={560}>
        <div className="space-y-3">
          <p className="text-sm text-ink-3">自行用 openssl 生成密钥对，私钥自留，仅上传公钥：</p>
          <code className="block rounded-lg bg-surface-muted px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">openssl genpkey -out private.pem -algorithm RSA -pkeyopt rsa_keygen_bits:2048{'\n'}openssl rsa -in private.pem -out public.pem -pubout</code>
          <Field label="公钥 PEM（SPKI）"><Textarea value={pubInput} onChange={(e) => setPubInput(e.target.value)} rows={5} placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----" /></Field>
          <Button onClick={upload} disabled={!pubInput.includes('PUBLIC KEY')}>保存公钥</Button>
        </div>
      </Modal>
    </div>
  )
}

// ── 在线联调台 ──
function ConsoleTab({ endpoints, baseUrl, merchantId, custId, copy, copied }: { endpoints: typeof ENDPOINTS; baseUrl: string; merchantId: string; custId: string; copy: (t: string, tag: string) => void; copied: string }) {
  const toast = useToast()
  const [epIdx, setEpIdx] = useState(0)
  const ep = endpoints[epIdx]
  const [vals, setVals] = useState<Record<string, string>>({})
  const [sts, setSts] = useState('')
  const params = buildParams(ep.fields, vals, merchantId, custId)

  const preview = async () => {
    try { const r = await portalApi.consoleSign(params); setSts(r.stringToSign) }
    catch { toast({ tone: 'alert', text: '生成待签名串失败' }) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle title="在线联调（私钥本地签，绝不上传）" />
        <div className="mt-3 space-y-3">
          <Segmented value={String(epIdx)} onChange={(v) => { setEpIdx(Number(v)); setSts('') }} options={endpoints.map((e, i) => ({ value: String(i), label: e.name }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            {ep.fields.filter((f) => f !== 'custId' && f !== 'merchantId').map((f) => (
              <Field key={f} label={f}><Input value={vals[f] ?? ''} onChange={(e) => setVals({ ...vals, [f]: e.target.value })} placeholder={PLACEHOLDER[f] ?? ''} /></Field>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={preview}><Play size={13} /> 生成待签名串</Button>
            <span className="text-xs text-ink-4">{ep.method} <code className="font-mono">{baseUrl}{ep.path}</code></span>
          </div>
          {sts && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-3">待签名串（按规范拼接）— 用你的私钥本地签后即为 sign</span>
                <button onClick={() => copy(sts, 'sts')} className="text-xs text-brand">{copied === 'sts' ? '已复制' : '复制'}</button>
              </div>
              <code className="block break-all rounded-lg bg-surface-muted px-3 py-2 font-mono text-[12px]">{sts}</code>
              <p className="text-xs text-ink-4 flex items-center gap-1"><ShieldCheck size={12} /> 私钥从不经过服务端；浏览器本地 WebCrypto 或离线 openssl 完成签名。</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

// ── SDK / 代码生成 ──
function CodeTab({ endpoints, baseUrl, merchantId, custId, copy, copied }: { endpoints: typeof ENDPOINTS; baseUrl: string; merchantId: string; custId: string; copy: (t: string, tag: string) => void; copied: string }) {
  const [epIdx, setEpIdx] = useState(0)
  const [lang, setLang] = useState<string>('curl')
  const ep = endpoints[epIdx]
  const params = buildParams(ep.fields, {}, merchantId, custId)
  const input: CodeGenInput = { baseUrl: `https://dict-paycenter-test.youdao.com/client`, path: ep.path, method: ep.method, params }
  const gen = LANGS.find((l) => l.key === lang)!.gen
  const code = gen(input)
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle title="签名 + 请求代码生成" />
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-3">
            <Segmented value={String(epIdx)} onChange={(v) => setEpIdx(Number(v))} options={endpoints.map((e, i) => ({ value: String(i), label: e.name }))} />
            <Segmented value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.key, label: l.label }))} />
          </div>
          <div className="relative">
            <button onClick={() => copy(code, 'code')} className="absolute right-2 top-2 rounded bg-surface px-2 py-1 text-xs text-brand shadow-sm">{copied === 'code' ? '已复制' : '复制'}</button>
            <pre className="max-h-[420px] overflow-auto rounded-lg bg-surface-muted px-3 py-3 font-mono text-[12px] leading-relaxed">{code}</pre>
          </div>
          <p className="text-xs text-ink-4">私钥以占位符 <code className="font-mono">&lt;YOUR_RSA_PRIVATE_KEY.pem&gt;</code> 表示，替换为你的私钥文件即可运行。</p>
        </div>
      </Card>
    </div>
  )
}

// ── 接入健康分 ──
function HealthTab() {
  const toast = useToast()
  const [result, setResult] = useState<{ score: number; readiness: string; checks: { item: string; pass: boolean; detail: string }[] } | null>(null)
  const [running, setRunning] = useState(false)
  const run = async () => {
    setRunning(true)
    try { const r = await portalApi.healthCheck(); if (r.ok) setResult(r) }
    catch { toast({ tone: 'alert', text: '自检失败' }) } finally { setRunning(false) }
  }
  return (
    <Card>
      <CardTitle title="接入就绪健康分" />
      <div className="mt-3 space-y-4">
        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={running}><Activity size={14} /> {running ? '自检中…' : '一键自检'}</Button>
          <span className="text-xs text-ink-4">沙箱全链路自检（公钥/验签/回调/投递），不产生真实资金</span>
        </div>
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold tnum" style={{ color: result.score >= 75 ? 'var(--color-good)' : result.score >= 50 ? 'var(--color-warn)' : 'var(--color-alert)' }}>{result.score}</div>
              <Badge tone={result.score >= 75 ? 'good' : result.score >= 50 ? 'warn' : 'alert'}>{result.readiness}</Badge>
            </div>
            <div className="space-y-2">
              {result.checks.map((ch) => (
                <div key={ch.item} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                  {ch.pass ? <Check size={15} className="text-good" /> : <span className="text-alert">✗</span>}
                  <span className="text-ink-1">{ch.item}</span>
                  <span className="ml-auto text-xs text-ink-4">{ch.detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── 联调日志 ──
function LogsTab() {
  const logs = usePortalResource<WebhookLog[]>(() => portalApi.webhookLogs<WebhookLog[]>())
  return (
    <Card>
      <CardTitle title="回调投递日志" />
      <div className="mt-3">
        <PortalState state={logs.state} data={logs.data} skeleton={<DefaultSkeleton />} emptyTitle="暂无投递记录">
          {(rows) => (
            <TableShell head={<><Th>签约单号</Th><Th>状态</Th><Th>方向</Th><Th>HTTP</Th><Th>结果</Th><Th>时间</Th></>}>
              {rows.slice(0, 30).map((l) => (
                <Row key={l.id}>
                  <Td><code className="font-mono text-xs">{l.signOrderNo}</code></Td>
                  <Td>{YD_STATUS_LABEL[l.status] ?? l.status}</Td>
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
  )
}

// ── 辅助 ──
const PLACEHOLDER: Record<string, string> = { goodsId: '商品 ID', custOrderId: '合作方订单号', phone: '13900000000', payType: 'ALIPAY', platform: 'android', signType: 'payAfterSigning', deviceId: '设备唯一标志', orderId: '有道订单号' }
function buildParams(fields: string[], vals: Record<string, string>, merchantId: string, custId: string): Record<string, string> {
  const p: Record<string, string> = {}
  for (const f of fields) p[f] = f === 'merchantId' ? merchantId : f === 'custId' ? custId : (vals[f] ?? PLACEHOLDER[f] ?? '')
  p.timestamp = String(Math.floor(Date.now() / 1000))
  return p
}
function Kv({ label, val, copy, copied, tag }: { label: string; val: string | null; copy: (t: string, tag: string) => void; copied: string; tag: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-3">{label}</span>
      {val ? <button onClick={() => copy(val, tag)} className="flex items-center gap-1.5 font-mono text-ink-1 hover:text-brand">{val}{copied === tag ? <Check size={13} className="text-good" /> : <Copy size={13} className="text-ink-4" />}</button> : <span className="text-ink-4">—</span>}
    </div>
  )
}

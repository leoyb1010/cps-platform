import {
  AlertOctagon,
  Landmark,
  FileText,
  Receipt,
  Scale,
  Check,
  X,
} from 'lucide-react'
import {
  Card,
  CardTitle,
  Stat,
  PageHeader,
  Badge,
  Button,
  TONE,
} from '../components/ui/primitives'
import { Donut } from '../components/ui/charts'
import { Modal } from '../components/ui/overlays'
import { DocModal } from '../components/ui/DocModal'
import { Term } from '../components/ui/Term'
import { fundSplit, directSharePct, SETTLE_PATH_LABEL } from '../lib/data'
import { useStore, setChannelState } from '../lib/store'
import { pct, cx } from '../lib/format'
import { useState } from 'react'

const CHANNEL_NOTE: Record<string, string> = {
  '连连支付 · 分账': '主通道', '汇付天下 · 分账': '容灾通道', '微信支付 · 官方分账': '直连品牌', '支付宝 · 分账': '直连品牌', '银行二类户 · 存管': '接入中',
}

export default function Compliance() {
  const { brands, channelStates } = useStore()
  const [cfg, setCfg] = useState(false)
  const [opinionOpen, setOpinionOpen] = useState(false)
  return (
    <>
      <PageHeader
        title="资金合规"
        desc="平台生死线。直连为主、过路只走持牌分账，绝不自建资金池做二清。三流一致 + 个人佣金税务方案是两大暗雷区。"
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpinionOpen(true)}><FileText size={14} /> 合规意见书</Button>
            <Button variant="primary" onClick={() => setCfg(true)}>分账通道配置</Button>
          </>
        }
      />

      {/* 二清红线 */}
      <Card className="border-alert/25 bg-alert-soft/40">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-alert-soft text-alert-ink">
            <AlertOctagon size={18} />
          </span>
          <div className="flex-1">
            <h3 className="text-[14px] font-semibold text-ink"><Term k="erqing">二清</Term>红线（致命风险 · 必须规避）</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              用户付款先进入平台（非持牌机构）控制的账户，再由平台二次清分给品牌和代理，属于无证经营支付结算业务，可被认定为非法经营，账户会被冻结，平台直接归零。
              <span className="font-medium text-alert-ink"> 平台不得自建资金池、不得让用户资金停留在自有账户后由平台手动分给多方。</span>
            </p>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="直连品牌占比" value={pct(directSharePct, 0)} hint="资金不过平台账户" sub={<span className="text-good-ink">合规最干净</span>} /></Card>
        {/* 从通道配置真值派生（原硬编码 2，与配置弹窗 5 通道自相矛盾） */}
        <Card><Stat label="持牌分账通道" value={Object.values(channelStates).filter((st) => st === 'live').length} unit="家" sub={<span>已启用 · 其余评估中</span>} /></Card>
        <Card><Stat label="自建资金池" value="0" sub={<span className="text-good-ink flex items-center gap-1"><Check size={12} /> 零二清敞口</span>} /></Card>
        <Card><Stat label="合规意见书" value="已出具" sub={<span>支付 + 税务双顾问</span>} /></Card>
      </div>

      {/* 双路径详解 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="路径 A · 直连模式" desc="推荐大品牌 / 强信任" right={<Badge tone="good" dot>合规最干净</Badge>} />
          <FlowSteps
            tone="good"
            steps={[
              { t: '用户付款', d: '直达品牌方自有商户号，资金进品牌账户' },
              { t: '品牌回结', d: '品牌按合同费率，T+N 把平台应得分润打给平台' },
              { t: '平台结算', d: '平台扣留服务费后，作为推广服务费结算给代理' },
            ]}
          />
          <div className="mt-3 rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">
            平台只拿订单回传用于归因与对账，钱由品牌结算。需强对账防品牌少报订单。
          </div>
        </Card>

        <Card>
          <CardTitle title="路径 B · 持牌分账过路" desc="推荐新品牌 / 需统一分账" right={<Badge tone="info" dot>规避二清</Badge>} />
          <FlowSteps
            tone="info"
            steps={[
              { t: '用户付款', d: '进入持牌机构分账系统（微信/支付宝官方分账、连连、汇付、银行存管）' },
              { t: '指令下发', d: '平台仅作为分账指令发起方，资金始终在持牌机构监管下' },
              { t: '三方入账', d: '品牌 / 平台服务费 / 代理分润由持牌机构自动清分' },
            ]}
          />
          <div className="mt-3 rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">
            平台不碰资金本体，只碰指令 + 数据。界定平台为「技术/营销服务方」而非「支付方」。
          </div>
        </Card>
      </div>

      {/* 资金分布 + 对比 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle title="资金路径分布" desc="按品牌流水占比" />
          <Donut items={fundSplit} center={{ value: pct(directSharePct, 0), label: '直连占比' }} size={120} />
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle title="合规红线对照" desc="哪些能做，哪些绝不能做" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DoList ok items={['持牌机构分账', '平台下发分账指令', '直连品牌商户号', '收取技术/营销服务费', '三流一致开票']} />
            <DoList items={['自建资金池', '用户资金过平台账户再分', '无证清分给多方', '虚假交易 / 刷单冲量', '大量无票给个人打款', '平台自持商户号借通道']} />
          </div>
        </Card>
      </div>

      {/* 税务 + 三流一致 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InfoCard icon={<Receipt size={16} />} tone="warn" title="个人佣金税务（暗雷）" body="大量小代理是个人，直接转账存在代扣个税 + 无票成本。通过灵活用工/众包平台开票，或要求注册个体户。切勿大量无票给个人打款。" />
        <InfoCard icon={<Scale size={16} />} tone="info" title="三流一致" body="合同流、资金流、发票流一致。直连模式下钱从品牌来、票怎么开、合同怎么签，需法务+财务一起设计。" />
        <InfoCard icon={<Landmark size={16} />} tone="violet" title="连续包月合规" body="遵守《消保法》《网络交易监督管理办法》及微信/支付宝自动续费规范：显著告知 + 便捷取消 + 扣费前提醒。监管与投诉重灾区。" />
      </div>

      {/* 各品牌资金路径 */}
      <Card className="mt-4">
        <CardTitle title="各品牌资金路径配置" desc="混合模式：按品牌信任度与需求选择" />
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">{b.mark}</span>
              <span className="text-[12px] text-ink-2">{b.name.slice(0, 6)}</span>
              <Badge tone={b.path === 'direct' ? 'good' : b.path === 'licensed' ? 'info' : 'violet'}>{SETTLE_PATH_LABEL[b.path]}</Badge>
            </div>
          ))}
        </div>
        <Modal open={cfg} onClose={() => setCfg(false)} width={480} title="持牌分账通道配置" footer={<Button variant="ghost" onClick={() => setCfg(false)}>关闭</Button>}>
          <div className="mb-3 text-[12px] text-ink-3">过路资金只走持牌机构，平台仅下发分账指令、不碰资金本体（规避二清）。</div>
          <div className="space-y-2">
            {Object.keys(CHANNEL_NOTE).map((name) => {
              const st = channelStates[name] ?? 'review'
              return (
                <div key={name} className="flex items-center justify-between rounded-lg border border-line p-3">
                  <div><div className="text-[12.5px] font-medium text-ink">{name}</div><div className="text-[11px] text-ink-4">{CHANNEL_NOTE[name]}</div></div>
                  <button onClick={() => setChannelState(name, st === 'live' ? 'review' : 'live')} title="点击启用/置为评估中">
                    <Badge tone={st === 'live' ? 'good' : 'warn'} dot>{st === 'live' ? '已启用' : '评估中'}</Badge>
                  </button>
                </div>
              )
            })}
          </div>
          <div className="mt-3 text-center text-[11px] text-ink-4">点击状态徽章即时启停，两页配置同步</div>
        </Modal>
      </Card>

      <DocModal
        open={opinionOpen}
        onClose={() => setOpinionOpen(false)}
        title="资金合规意见书（摘要）"
        intro="由支付合规与税务双顾问出具，覆盖资金清分与个人佣金税务两大风险点。"
        sections={[
          { heading: '资金清分（防二清）', bullets: ['平台不自建资金池、不碰用户资金', '资金只走持牌机构（连连/汇付/官方分账），平台仅发清分指令', '直连为主，过路只走持牌分账'] },
          { heading: '三流一致', bullets: ['合同流、资金流、发票流三者口径对齐', '每笔分账可追溯到对应订单与发票'] },
          { heading: '个人佣金税务', bullets: ['代理个人结算经合规灵活用工平台开票', '解决大量个人收入的个税与发票合规', '企业代理走企业开票'] },
          { heading: '连续包月合规', bullets: ['自动续费显著告知 + 便捷退订', '符合《消费者权益保护法实施条例》提醒义务'] },
        ]}
        downloadName="资金合规意见书.txt"
      />
    </>
  )
}

function FlowSteps({ tone, steps }: { tone: 'good' | 'info'; steps: { t: string; d: string }[] }) {
  return (
    <div className="space-y-0">
      {steps.map((s, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold', TONE[tone].soft, TONE[tone].ink)}>{i + 1}</span>
            {i < steps.length - 1 && <span className="my-1 w-px flex-1 bg-line" style={{ minHeight: 18 }} />}
          </div>
          <div className="pb-3">
            <div className="text-[12.5px] font-medium text-ink">{s.t}</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{s.d}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function DoList({ items, ok }: { items: string[]; ok?: boolean }) {
  return (
    <div className={cx('rounded-xl border p-3', ok ? 'border-good/25 bg-good-soft/40' : 'border-alert/25 bg-alert-soft/40')}>
      <div className={cx('mb-2 text-[12px] font-semibold', ok ? 'text-good-ink' : 'text-alert-ink')}>{ok ? '可以做' : '绝不能做'}</div>
      <ul className="space-y-1.5">
        {items.map((x) => (
          <li key={x} className="flex items-start gap-2 text-[12px] text-ink-2">
            {ok ? <Check size={13} className="mt-0.5 shrink-0 text-good-ink" /> : <X size={13} className="mt-0.5 shrink-0 text-alert-ink" />}
            {x}
          </li>
        ))}
      </ul>
    </div>
  )
}

function InfoCard({ icon, tone, title, body }: { icon: React.ReactNode; tone: 'warn' | 'info' | 'violet'; title: string; body: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <span className={cx('grid h-8 w-8 place-items-center rounded-lg', TONE[tone].soft, TONE[tone].ink)}>{icon}</span>
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-3">{body}</p>
    </Card>
  )
}

import type { ReactNode } from 'react'
import { ShieldCheck, Landmark, Waypoints, LineChart } from 'lucide-react'

/**
 * 登录页外壳：左品牌叙事 + 右表单，取代旧版"空画布悬浮表单"。
 * 左栏固定深色（独立于主题令牌）——门面页在明暗两套主题下都保持同一品牌气质；
 * 装饰只用工程网格 + 品牌红辉光 + 错落进入，不引入插画资产。
 */
const FEATURES = [
  { icon: Waypoints, t: '多品牌联运分发', d: '一套底座，品牌 × 代理 × 套餐自由组合投放' },
  { icon: Landmark, t: '资金清结算合规', d: '分润瀑布 · 准备金分期释放 · 二清红线不触碰' },
  { icon: ShieldCheck, t: '三道防线风控', d: '事前准入 · 事中引擎 · 事后仲裁，投诉率即刹车' },
  { icon: LineChart, t: '归因与净 LTV', d: '不看虚荣 GMV，北极星是风险调整后净订阅贡献' },
]

const METRICS = [
  { v: '¥2.84亿', k: '年化基础流水' },
  { v: '99.4%', k: '归因覆盖率' },
  { v: '190', k: '自动化测试' },
  { v: '28', k: 'RBAC 权限点' },
]

export function AuthShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(440px,44%)_1fr]">
      {/* 左：品牌叙事（lg 起显示） */}
      <aside className="relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex" style={{ background: '#101014' }}>
        {/* 工程网格 + 品牌辉光 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand/[0.13] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-brand/[0.07] blur-3xl" />

        {/* 顶：Logo */}
        <div className="relative flex items-center gap-2.5" style={{ animation: 'revUpSm .5s .05s var(--ease-out) both' }}>
          <img src="./youdao-logo.png" alt="网易有道" className="h-[22px] w-auto brightness-0 invert" />
          <span className="h-[18px] w-px bg-white/20" />
          <span className="text-[12px] font-medium tracking-[0.08em] text-white/70">CPS 会员联运平台</span>
        </div>

        {/* 中：主张 + 能力 */}
        <div className="relative max-w-[420px]">
          <h1
            className="text-[30px] font-semibold leading-[1.22] tracking-[-0.02em]"
            style={{ animation: 'revUp .6s .12s var(--ease-out) both' }}
          >
            把单品牌投流
            <br />
            做成<span className="text-[#ff6b71]">可联运、可结算、可风控</span>的平台
          </h1>
          <p className="mt-3.5 text-[13.5px] leading-relaxed text-white/55" style={{ animation: 'revUp .6s .2s var(--ease-out) both' }}>
            业务层在上，投流 SaaS 底座在下。多品牌 · 开放代理 · 混合资金 · SaaS 化。
          </p>
          <div className="mt-8 space-y-4">
            {FEATURES.map((f, i) => (
              <div key={f.t} className="flex items-start gap-3" style={{ animation: `revUpSm .5s ${0.28 + i * 0.07}s var(--ease-out) both` }}>
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-[#ff8a8f]">
                  <f.icon size={15} strokeWidth={1.8} />
                </span>
                <div>
                  <div className="text-[13px] font-medium text-white/90">{f.t}</div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-white/45">{f.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底：数字带 */}
        <div className="relative border-t border-white/10 pt-5" style={{ animation: 'fadeIn .8s .6s both' }}>
          <div className="grid grid-cols-4 gap-4">
            {METRICS.map((m) => (
              <div key={m.k}>
                <div className="tnum text-[17px] font-semibold text-white/90">{m.v}</div>
                <div className="mt-0.5 text-[10.5px] tracking-wide text-white/40">{m.k}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* 右：表单区 */}
      <main className="grid-bg relative flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]" style={{ animation: 'revUpSm .5s .1s var(--ease-out) both' }}>
          {children}
        </div>
        {footer && <div className="absolute inset-x-0 bottom-5 px-5 text-center">{footer}</div>}
      </main>
    </div>
  )
}

import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'

/**
 * 法务文档页外壳：简洁静态文档容器（顶栏 Logo + 标题 + 正文卡）。
 * 用户协议 / 隐私政策共用，保证两页排版一致；公开可达，不套控制台/门户外壳。
 */
export function LegalShell({ icon, title, updated, children }: { icon: ReactNode; title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 flex h-[56px] items-center gap-2.5 border-b border-line bg-canvas/85 px-5 backdrop-blur-md sm:px-8">
        <a href="#/market" className="flex items-center gap-2.5">
          <img src="./youdao-logo.png" alt="网易有道" className="logo-mark h-[22px] w-auto" />
          <span className="h-[18px] w-px shrink-0 bg-line" />
          <span className="text-[13px] font-semibold text-ink">订阅增长平台</span>
        </a>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-ink-4"><ShieldCheck size={13} className="text-good-ink" /> 合规文档</span>
      </header>

      <main className="mx-auto max-w-[760px] px-5 py-10 sm:px-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">{icon}</span>
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
            <p className="mt-0.5 text-[12px] text-ink-4">最近更新：{updated}</p>
          </div>
        </div>

        <article className="space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
          {children}
        </article>

        <p className="mt-6 text-center text-[11.5px] text-ink-4">
          © 网易有道订阅增长平台 · <a href="#/legal/terms" className="text-ink-3 hover:text-brand">用户协议</a> · <a href="#/legal/privacy" className="text-ink-3 hover:text-brand">隐私政策</a>
        </p>
      </main>
    </div>
  )
}

/** 协议分节：编号标题 + 正文（正文用 prose-ish 手工排版，段落/列表统一间距与字号）。 */
export function LegalSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-muted text-[12px] text-ink-3">{n}</span>
        {title}
      </h2>
      <div className="mt-2.5 space-y-2 pl-8 text-[13px] leading-relaxed text-ink-2 [&_li]:relative [&_li]:pl-4 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[9px] [&_li]:before:h-1 [&_li]:before:w-1 [&_li]:before:rounded-full [&_li]:before:bg-ink-4 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  )
}

import { Component, type ReactNode } from 'react'

/**
 * 根级错误边界：渲染异常 / lazy chunk 加载失败（发版后旧 HTML 引用改名资源）时
 * 给出可自救的界面，而非整站白屏。上报钩子留空实现（Sentry 等后续接入）。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    // 上报钩子：接入 Sentry 时在此调用 captureException
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    const isChunk = /Loading chunk|Failed to fetch dynamically imported module/i.test(this.state.error.message)
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-6">
        <div className="w-full max-w-[420px] rounded-2xl border border-line bg-surface p-8 text-center shadow-[var(--shadow-card)]">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-alert-soft text-alert-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </div>
          <div className="text-[16px] font-semibold text-ink">{isChunk ? '页面资源已更新' : '页面出了点问题'}</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
            {isChunk ? '应用刚发布了新版本，刷新即可加载最新资源。' : '发生了一个渲染错误，刷新通常可以恢复。若反复出现请联系平台支持。'}
          </p>
          <button
            onClick={() => location.reload()}
            className="mt-5 w-full rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}

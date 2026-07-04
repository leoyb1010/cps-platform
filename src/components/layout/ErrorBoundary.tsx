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
          <img src="./img/empty-error.webp" alt="" className="mx-auto mb-3 h-28 w-28 object-contain" />
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

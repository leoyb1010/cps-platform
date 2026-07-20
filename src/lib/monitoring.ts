/**
 * 前端监控接入点（错误上报 + web-vitals）。
 *
 * 默认 no-op：未配置 VITE_SENTRY_DSN 时不加载任何外部 SDK、零副作用。
 * 接入 Sentry 时只需：
 *   1) 设 VITE_SENTRY_DSN 环境变量；
 *   2) npm i @sentry/react web-vitals；
 *   3) 在 initMonitoring 内按注释放开动态 import。
 * 这样"接入监控"是配置 + 依赖变更，而非改调用点（ErrorBoundary/http 已在调 reportError）。
 */

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
export const monitoringEnabled = !!DSN

let ready = false

export function initMonitoring(): void {
  if (!monitoringEnabled || ready) return
  ready = true
  // 接入时放开（示例）：
  //   import('@sentry/react').then((S) => { S.init({ dsn: DSN, tracesSampleRate: 0.1, environment: import.meta.env.MODE }) })
  //   import('web-vitals').then(({ onLCP, onCLS, onINP }) => { const send = (m) => reportMetric(m.name, m.value); onLCP(send); onCLS(send); onINP(send) })
  // 未接入时仅标记就绪，reportError 走 console 兜底。
}

/** 捕获异常上报（ErrorBoundary / http 错误分支调用）。未接入时落 console。 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (monitoringEnabled) {
    // 接入时：import('@sentry/react').then((S) => S.captureException(error, { extra: context }))
  }
  // 兜底：始终 console，保证本地/未接入环境仍可见
  console.error('[monitor]', error, context ?? '')
}

/** 性能指标上报（web-vitals）。未接入时静默。 */
export function reportMetric(name: string, value: number): void {
  if (!monitoringEnabled) return
  // 接入时：beacon / Sentry metrics
  void name
  void value
}

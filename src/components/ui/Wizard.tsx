import type { ReactNode } from 'react'
import { Modal } from './overlays'
import { Button } from './primitives'
import { Steps } from './forms'

/* ──────────────────────────────────────────────────────────────
 * Wizard —— 多步表单壳（Modal + Steps + 条件 footer）
 *
 * 抽自 OnboardWizard 反复手搓的脚手架：父组件持有 step 状态与各步字段，
 * 自行算 canNext；Wizard 只负责 Steps 头 + 上一步/下一步/提交 的条件 footer。
 * ────────────────────────────────────────────────────────────── */

export function Wizard({
  open, onClose, title, steps, current,
  onBack, onNext, onSubmit, canNext, submitting = false,
  width = 560, submitLabel = '提交', children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  steps: string[]
  current: number
  onBack: () => void
  onNext: () => void
  onSubmit: () => void
  canNext: boolean
  submitting?: boolean
  width?: number
  submitLabel?: string
  children: ReactNode
}) {
  const isLast = current >= steps.length - 1
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={width}
      footer={
        <>
          {current > 0 && <Button variant="ghost" onClick={onBack}>上一步</Button>}
          {!isLast
            ? <Button variant="primary" onClick={onNext} disabled={!canNext}>下一步</Button>
            : <Button variant="primary" onClick={onSubmit} disabled={!canNext || submitting} loading={submitting}>{submitLabel}</Button>}
        </>
      }
    >
      <div className="mb-4">
        <Steps steps={steps} current={current} />
      </div>
      {children}
    </Modal>
  )
}

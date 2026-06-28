import { Download } from 'lucide-react'
import { Modal } from './overlays'
import { Button } from './primitives'
import { downloadText } from '../../lib/format'

export interface DocSection {
  heading?: string
  body?: string
  bullets?: string[]
}

// 文档/模板/规范类共享展示壳：分区渲染 + 一键下载为文本文件。
// 用于消灭"点了只弹 toast 念一句"的假按钮（素材规范 / 接入字段模板 / 合规意见书等）。
export function DocModal({
  open,
  onClose,
  title,
  intro,
  sections,
  downloadName,
}: {
  open: boolean
  onClose: () => void
  title: string
  intro?: string
  sections: DocSection[]
  downloadName: string
}) {
  if (!open) return null
  const plain = [
    title,
    intro ?? '',
    ...sections.flatMap((s) => [s.heading ? `\n【${s.heading}】` : '', s.body ?? '', ...(s.bullets ?? []).map((b) => `· ${b}`)]),
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>关闭</Button>
          <Button variant="primary" onClick={() => downloadText(downloadName, plain)}><Download size={14} /> 下载</Button>
        </>
      }
    >
      {intro && <p className="mb-3 text-[12.5px] text-ink-3">{intro}</p>}
      <div className="space-y-3.5">
        {sections.map((s, i) => (
          <div key={i} className="rounded-lg border border-line p-3">
            {s.heading && <div className="mb-1.5 text-[12.5px] font-semibold text-ink">{s.heading}</div>}
            {s.body && <p className="text-[12.5px] leading-relaxed text-ink-2">{s.body}</p>}
            {s.bullets && (
              <ul className="mt-1 space-y-1">
                {s.bullets.map((b, j) => (
                  <li key={j} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
                    <span className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-brand" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

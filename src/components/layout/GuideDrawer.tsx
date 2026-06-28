import { Drawer } from '../ui/overlays'
import { Badge } from '../ui/primitives'
import { GUIDES } from '../../lib/guides'
import { getTerm } from '../../lib/terms'

// 操作指引抽屉：按当前路由查 GUIDES，展示"这页干嘛/怎么用/关键名词/避坑"。
// 关键名词区把术语解释完整列出（不靠悬停），小白不悬停也能读完。
export function GuideDrawer({ routeKey, onClose }: { routeKey: string; onClose: () => void }) {
  const g = GUIDES[routeKey]
  if (!g) return null
  const terms = g.terms.map(getTerm).filter(Boolean) as { term: string; plain: string }[]
  return (
    <Drawer open onClose={onClose} title={`使用指引 · ${g.title}`} desc={<span>本页用途与主要操作说明</span>}>
      <div className="space-y-5">
        <section>
          <div className="mb-1.5 flex items-center gap-2"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[13px] font-semibold text-ink">本页用途</span></div>
          <p className="text-[12.5px] leading-relaxed text-ink-2">{g.what}</p>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[13px] font-semibold text-ink">主要操作</span></div>
          <ol className="space-y-2">
            {g.how.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-ink-2">
                <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-brand/10 text-[11px] font-semibold text-brand">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {terms.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[13px] font-semibold text-ink">关键概念</span></div>
            <div className="space-y-2">
              {terms.map((t) => (
                <div key={t.term} className="rounded-lg border border-line p-2.5">
                  <div className="text-[12.5px] font-medium text-ink">{t.term}</div>
                  <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{t.plain}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {g.tip && (
          <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info-soft/40 p-3">
            <Badge tone="info">提示</Badge>
            <span className="text-[12px] leading-relaxed text-ink-2">{g.tip}</span>
          </div>
        )}
      </div>
    </Drawer>
  )
}

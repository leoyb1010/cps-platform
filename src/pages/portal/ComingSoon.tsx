import { PageHeader } from '../../components/ui/primitives'
import { Rocket } from 'lucide-react'

/** 门户新入口占位（B0 上线导航壳，页体在 B1/B2 落地）。保持导航不 404、心智先到位。 */
export function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <>
      <PageHeader title={title} desc={desc} />
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-muted px-6 py-20 text-center">
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand-ink">
          <Rocket size={24} />
        </span>
        <div className="text-[15px] font-semibold text-ink">即将上线</div>
        <p className="mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed text-ink-4">{desc}</p>
      </div>
    </>
  )
}

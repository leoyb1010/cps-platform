import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AreaLine } from './charts'

function renderChart(data:number[],labels:string[]){
  const root=document.createElement('div')
  root.innerHTML=renderToStaticMarkup(<AreaLine data={data} labels={labels} />)
  return root
}
describe('AreaLine responsive date labels',()=>{
  it('keeps four readable HTML ticks outside the stretched SVG',()=>{
    const labels=Array.from({length:14},(_,i)=>`09-${String(i+1).padStart(2,'0')}`)
    const root=renderChart(labels.map((_,i)=>i),labels)
    const ticks=Array.from(root.querySelectorAll<HTMLElement>('[data-testid="area-chart-tick"]'))
    expect(ticks).toHaveLength(4)
    expect(ticks.map(t=>t.textContent)).toEqual(['09-01','09-05','09-10','09-14'])
    for(const tick of ticks){expect(tick.closest('svg')).toBeNull();expect(tick.style.fontSize).toBe('12px')}
  })
  it('deduplicates two-point ticks and keeps empty series in the existing empty state',()=>{
    expect(renderChart([1,2],['Start','End']).querySelectorAll('[data-testid="area-chart-tick"]')).toHaveLength(2)
    const empty=renderChart([],[])
    expect(empty.querySelectorAll('[data-testid="area-chart-tick"]')).toHaveLength(0)
    expect(empty.querySelector('[role="img"][aria-label="暂无数据"]')).not.toBeNull()
  })
})

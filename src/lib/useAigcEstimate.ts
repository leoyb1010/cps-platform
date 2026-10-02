import { useEffect, useRef, useState } from 'react'

/** An estimate belongs to one form revision and one request, never the next. */
export function useAigcEstimate() {
  const [estimate, setEstimate] = useState<number | null>(null)
  const revision = useRef(0)
  useEffect(() => () => { revision.current += 1 }, [])
  const invalidateEstimate = () => { revision.current += 1; setEstimate(null) }
  const estimateWith = async (load: () => Promise<number>) => {
    const request = ++revision.current
    setEstimate(null)
    try {
      const value = await load()
      if (revision.current !== request) return
      if (!Number.isFinite(value) || value < 0) throw new Error('Invalid credit estimate')
      setEstimate(value)
    } catch (error) {
      if (revision.current === request) throw error
    }
  }
  return { estimate, invalidateEstimate, estimateWith }
}

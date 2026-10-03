import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import { getPrincipalId } from './http'
/** Fields only. Request identities live separately until their outcome is known. */
export function useTabDraft<T extends Record<string, unknown>>(slot: string, defaults: T) {
  const key = `cps.form-draft.${getPrincipalId() ?? 'demo'}.${slot}`
  const editor = useRef(crypto.randomUUID())
  const template = useRef(defaults)
  const readDraft = useCallback((): T => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null')?.fields
      const result = { ...template.current }
      for (const field of Object.keys(template.current)) {
        const value = saved?.[field]
        if (Array.isArray(template.current[field]) ? Array.isArray(value) && value.length <= 100 && value.every(v => typeof v === 'string' && v.length <= 20000) : typeof value === typeof template.current[field] && (typeof value !== 'number' || Number.isFinite(value)) && (typeof value !== 'string' || value.length <= 20000)) Object.assign(result, { [field]: value })
      }
      return result
    } catch { return template.current }
  }, [key])
  const [saved, setSaved] = useState(() => ({ key, fields: readDraft() }))
  const draft = saved.key === key ? saved.fields : readDraft()
  if (saved.key !== key) setSaved({ key, fields: draft })
  const setDraft = useCallback((update: SetStateAction<T>) => setSaved(previous => {
    const fields = previous.key === key ? previous.fields : readDraft()
    return { key, fields: typeof update === 'function' ? (update as (value: T) => T)(fields) : update }
  }), [key, readDraft])
  const latest = useRef(draft); latest.current = draft
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify({ editor: editor.current, fields: latest.current })) } catch { /* Remain usable when browser storage is blocked. */ }
  }, [key])
  useEffect(() => {
    try { if (JSON.parse(sessionStorage.getItem(key) || 'null')?.editor === editor.current) sessionStorage.setItem(key, JSON.stringify({ editor: editor.current, fields: draft })) } catch { /* Keep in-memory draft. */ }
  }, [draft, key])
  function clearDraft() {
    try { if (JSON.parse(sessionStorage.getItem(key) || 'null')?.editor === editor.current) sessionStorage.setItem(key, JSON.stringify({ editor: editor.current, fields: template.current })) } catch { /* A retained draft is recoverable. */ }
  }
  return { draft, setDraft, clearDraft }
}

import '@testing-library/jest-dom/vitest'

// localStorage polyfill（jsdom 29 不一定自动启用），保证 store 持久化逻辑可测
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage == null) {
  const mem = new Map<string, string>()
  const store: Storage = {
    get length() {
      return mem.size
    },
    clear: () => mem.clear(),
    getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
    key: (i) => [...mem.keys()][i] ?? null,
    removeItem: (k) => void mem.delete(k),
    setItem: (k, v) => void mem.set(k, String(v)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true })
}

// crypto.randomUUID 边界补齐
if (!('randomUUID' in crypto)) {
  // @ts-expect-error test shim
  crypto.randomUUID = () => 'test-' + Math.random().toString(36).slice(2)
}

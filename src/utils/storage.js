const PREFIX = 'np:'

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw === null ? fallback : JSON.parse(raw)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch { /* ignore quota */ }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key) } catch { /* ignore */ }
  },
  clear() {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))
      keys.forEach((k) => localStorage.removeItem(k))
    } catch { /* ignore */ }
  }
}

/** 离线操作记录，网络恢复后询问是否继续 */
export const offlineOps = {
  push(op) {
    const list = storage.get('offline_ops', [])
    list.push({ ...op, ts: Date.now() })
    storage.set('offline_ops', list)
  },
  list() { return storage.get('offline_ops', []) },
  clear() { storage.remove('offline_ops') }
}

/**
 * localStorage 包一層：私密視窗、被封鎖時不讓頁面壞掉。
 * 只放偏好與小狀態；參數歷程放 IndexedDB（db.ts）。
 */

const PREFIX = 'elevator-tuner:'

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // 儲存失敗不影響使用
  }
}

/** sessionStorage：這個分頁關掉就忘記（機構選擇用：每次進站都要選，重新整理不用重選） */
export function loadSession(key: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function saveSession(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(PREFIX + key)
    else sessionStorage.setItem(PREFIX + key, value)
  } catch {
    // 儲存失敗不影響使用
  }
}

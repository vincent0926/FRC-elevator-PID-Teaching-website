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

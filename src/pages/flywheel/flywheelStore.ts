import { useEffect, useState } from 'react'
import { MOTOR_SPECS } from '../../core/motors'
import { DEFAULT_FLYWHEEL, DEFAULT_PLAN, type FlywheelMechanism, type ShotPlan } from '../../core/flywheel/flywheel'
import { loadJson, saveJson } from '../../storage/local'

/**
 * 射球飛輪 1F、3F 共用的資料：存在 localStorage，換頁時重新讀，所以 1F 改機構 3F 會跟著變。
 * 存的資料只留型別對、數字有限的欄位，其他用預設值（舊版缺欄位、資料壞掉都不會讓頁面掛掉）。
 */

export function sanitize<T extends object>(fallback: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object') return fallback
  const out = { ...fallback }
  for (const k of Object.keys(fallback) as (keyof T)[]) {
    const v = (saved as Partial<T>)[k]
    const ok = typeof v === typeof fallback[k] && (typeof v !== 'number' || Number.isFinite(v))
    if (ok) out[k] = v as T[keyof T]
  }
  return out
}

export function usePersisted<T extends object>(key: string, fallback: T, check: (v: T) => boolean = () => true): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    const s = sanitize(fallback, loadJson<unknown>(key, null))
    return check(s) ? s : fallback
  })
  useEffect(() => {
    saveJson(key, v)
  }, [key, v])
  return [v, setV]
}

export const useFlywheelMechanism = () => usePersisted<FlywheelMechanism>('flywheel:mechanism', DEFAULT_FLYWHEEL, (m) => m.motor in MOTOR_SPECS)
/** 舊版存的發數比新預設少（v0.21 以前預設 3 發），改成新預設；只做一次，之後照使用者設定 */
const PLAN_VERSION = 2
function migratePlan() {
  if (loadJson<number>('flywheel:planVersion', 0) >= PLAN_VERSION) return
  const saved = loadJson<unknown>('flywheel:plan', null)
  if (saved && typeof saved === 'object' && typeof (saved as ShotPlan).shots === 'number' && (saved as ShotPlan).shots < DEFAULT_PLAN.shots)
    saveJson('flywheel:plan', { ...saved, shots: DEFAULT_PLAN.shots })
  saveJson('flywheel:planVersion', PLAN_VERSION)
}

export function useShotPlan() {
  // 要在 usePersisted 讀存檔之前改好
  useState(migratePlan)
  return usePersisted<ShotPlan>('flywheel:plan', DEFAULT_PLAN)
}

export const SHAPES = [
  { v: 0.5, label: '實心圓盤（0.5）' },
  { v: 0.75, label: '外圈比較重（0.75）' },
  { v: 1, label: '薄環，重量都在外圈（1.0）' },
]

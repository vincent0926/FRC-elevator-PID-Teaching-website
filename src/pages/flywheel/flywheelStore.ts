import { useCallback, useEffect, useState } from 'react'
import { MOTOR_SPECS } from '../../core/motors'
import { DEFAULT_FLYWHEEL, DEFAULT_PLAN, DISTANCE_FROM, HUB_TAG_TO_CENTER, type FlywheelMechanism, type ShotPlan } from '../../core/flywheel/flywheel'
import { loadJson, loadSession, saveJson, saveSession } from '../../storage/local'
import { t } from '../../core/lang'

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
  // 改了馬上存：改完立刻換頁（例如 1F 選好軌跡就到 3F）時，effect 來不及跑
  const set = useCallback(
    (x: T) => {
      saveJson(key, x)
      setV(x)
    },
    [key],
  )
  return [v, set]
}

export const useFlywheelMechanism = () => usePersisted<FlywheelMechanism>('flywheel:mechanism', DEFAULT_FLYWHEEL, (m) => m.motor in MOTOR_SPECS && (m.back === 'hood' || m.back === 'rollers'))
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
  return usePersisted<ShotPlan>('flywheel:plan', DEFAULT_PLAN, (p) => DISTANCE_FROM.includes(p.distanceFrom) && p.barrel >= 0)
}

/**
 * 進站選的用法，跟選的機構一樣存在這個分頁（sessionStorage）：
 * 彈道 = 1F 算轉速和仰角（選軌跡）→ 3F 連射模擬；客製化 = 1F 原本的計算頁、3F 連射模擬參數自己設；
 * 邊移動邊射 = 1F 加上機器人速度算轉速、仰角、底盤偏角 → 3F 邊開邊射。
 */
export type FlywheelStyle = 'ballistic' | 'custom' | 'move'
export function loadFlywheelStyle(): FlywheelStyle {
  const s = loadSession('flywheel:style')
  return s === 'ballistic' || s === 'move' ? s : 'custom'
}
export function saveFlywheelStyle(s: FlywheelStyle) {
  saveSession('flywheel:style', s)
}

/** 邊移動邊射的設定：機器人速度、有沒有補償，和自己的發數、間隔（連射 50 發的話機器人早就開走了） */
export interface MoveSettings {
  toward: number
  side: number
  compensate: boolean
  shots: number
  interval: number
}
export const DEFAULT_MOVE: MoveSettings = { toward: 0, side: 1.5, compensate: true, shots: 8, interval: 0.25 }
/** 轉速上限 rps（0 = 沒填，用馬達空載轉速的 90%）；彈道、邊移動邊射選軌跡，和 3F 邊開邊射都用它 */
export const useRpsLimit = () => usePersisted<{ rps: number }>('flywheel:rpsLimit', { rps: 0 }, (r) => r.rps >= 0)
/**
 * 目標那一端的量測點：量到 HUB 中心，或 HUB 前面的 AprilTag（Limelight 量到的）。機器人那一端是 ShotPlan.distanceFrom。
 * 計算一律用到中心的距離（plan.goalDistance）；選 tag 時畫面顯示、輸入的是到 tag 的距離 = 中心距離 − offset。
 */
export interface DistanceRef {
  ref: 'center' | 'tag'
  /** tag 到 HUB 中心的水平距離 m */
  offset: number
}
export const DEFAULT_DISTANCE_REF: DistanceRef = { ref: 'center', offset: HUB_TAG_TO_CENTER }
export const useDistanceRef = () => usePersisted<DistanceRef>('flywheel:distanceRef', DEFAULT_DISTANCE_REF, (d) => (d.ref === 'center' || d.ref === 'tag') && d.offset >= 0 && d.offset <= 2)
export const useMoveSettings = () => usePersisted<MoveSettings>('flywheel:move', DEFAULT_MOVE, (m) => m.shots >= 1 && m.interval > 0)

export const SHAPES = [
  { v: 0.5, label: t('實心圓盤（0.5）', 'Solid disk (0.5)') },
  { v: 0.75, label: t('外圈比較重（0.75）', 'Heavier toward the rim (0.75)') },
  { v: 1, label: t('薄環，重量都在外圈（1.0）', 'Thin ring, all weight on the rim (1.0)') },
]

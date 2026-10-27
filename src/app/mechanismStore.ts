import { useCallback, useState } from 'react'
import type { FieldMapping } from '../core/log/fieldMap'
import type { Spec } from '../core/physics/spec'
import { usePersisted } from '../storage/usePersisted'
import type { SimLogHandoff } from './simLog'

/**
 * 電梯、手臂各自的 store 都有的部分（同一套介面，2F 診斷、4F 單元零用同一份程式）。
 * 全站共用的（機構選擇、樓層、教學關卡）在 store.tsx；機構自己特有的（例如電梯的模型校正）放各自的 store。
 * 要加第四種機構時，照這個介面做一個新的 store。
 */

/** 調參循環的一輪：看了哪份日誌、找到什麼問題、改了什麼 */
export interface TuningRound {
  at: string
  logName: string
  issue: string
  change: string
}
export const ROUND_LIMIT = 30

export const isRounds = (v: unknown): v is TuningRound[] =>
  Array.isArray(v) && v.every((r) => typeof r === 'object' && r !== null && ['at', 'logName', 'issue', 'change'].every((k) => typeof (r as Record<string, unknown>)[k] === 'string'))

export interface MechanismStore<P, FF> {
  ff: FF
  /** 由機構資料即時算出的參數組 */
  theory: P
  custom: P | null
  setCustom: (p: P | null) => void
  /** 達標標準（3F 指標、穩健性測試、挑戰模式共用），可以依賽季需求調 */
  spec: Spec
  setSpec: (s: Spec) => void
  /** 4F 單元零的勾選（每次上機前重做） */
  unit0: boolean[]
  setUnit0: (v: boolean[]) => void
  /** 2F 日誌的欄位對應（各機構分開記） */
  fieldMapping: Partial<FieldMapping>
  setFieldMapping: (m: Partial<FieldMapping>) => void
  /** 3F 送來 2F 分析的模擬結果（2F 讀走就清掉；只在記憶體） */
  simLog: SimLogHandoff<P> | null
  setSimLog: (l: SimLogHandoff<P> | null) => void
  /** 2F 調參歷程 */
  rounds: TuningRound[]
  addRound: (r: TuningRound) => void
  clearRounds: () => void
  /** 最近一次存到瀏覽器失敗：畫面上的值還在，但重新整理會回到上次存的值 */
  unsaved: boolean
}

/** 每個 key 各自記有沒有存成功：一個存失敗、另一個存成功，提醒不能被蓋掉 */
export function useSaveTracker() {
  const [unsavedByKey, setUnsavedByKey] = useState<Record<string, boolean>>({})
  const onSaved = useCallback((key: string, ok: boolean) => setUnsavedByKey((cur) => (cur[key] === !ok ? cur : { ...cur, [key]: !ok })), [])
  return { onSaved, unsaved: Object.values(unsavedByKey).some(Boolean) }
}

export function useRounds(key: string, onSaved: (key: string, ok: boolean) => void) {
  const [rounds, setRounds] = usePersisted<TuningRound[]>(key, [], { parse: (v) => (isRounds(v) ? v : undefined), onSaved })
  const addRound = useCallback((r: TuningRound) => setRounds([...rounds, r].slice(-ROUND_LIMIT)), [rounds, setRounds])
  const clearRounds = useCallback(() => setRounds([]), [setRounds])
  return { rounds, addRound, clearRounds }
}

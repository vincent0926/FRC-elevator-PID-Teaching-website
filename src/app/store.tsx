import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { computeFeedforward, kPFromVoltsPerCm, type FeedforwardResult } from '../core/feedforward'
import type { AlignedLog, FieldMapping } from '../core/log/fieldMap'
import { DEFAULT_MECHANISM, ElevatorMechanismSchema, ParameterSetSchema, type ElevatorMechanism, type ParameterSet } from '../schema/parameterSet'
import { loadJson, saveJson } from '../storage/local'

/**
 * 全站共用狀態。參數組只有一種格式（ParameterSet），三個來源：
 *   theory  由機構資料即時算出
 *   tuning  調參建議（2F 套用建議後產生，一次只改一個參數）
 *   custom  使用者自己改的
 */

export type PageId = 'home' | 'calc' | 'tune' | 'sim' | 'learn'
export const PAGES: PageId[] = ['home', 'calc', 'tune', 'sim', 'learn']
export type SimSource = 'theory' | 'tuning' | 'custom'

export const UNIT0_ITEMS = 5

/** 調參循環的一輪：看了哪份日誌、找到什麼問題、改了什麼 */
export interface TuningRound {
  at: string
  logName: string
  issue: string
  change: string
}
export const ROUND_LIMIT = 30

/** 3F 模型校正的結果：真實機構相對理論值的倍率（對應受控體設定的欄位） */
export interface Calibration {
  at: string
  logName: string
  kGScale: number
  kVScale: number
  kAScale: number
  friction: number
  /** 開迴路重播的位置 RMS 誤差（m） */
  rms: number
  rmsTheory: number
}

interface Store {
  mechanism: ElevatorMechanism
  setMechanism: (m: ElevatorMechanism) => void
  voltsPerCm: number
  setVoltsPerCm: (v: number) => void
  ff: FeedforwardResult
  theory: ParameterSet
  custom: ParameterSet | null
  setCustom: (p: ParameterSet | null) => void
  tuning: ParameterSet | null
  setTuning: (p: ParameterSet | null) => void
  rounds: TuningRound[]
  addRound: (r: TuningRound) => void
  clearRounds: () => void
  simSource: SimSource
  setSimSource: (s: SimSource) => void
  lessonsDone: Record<string, boolean>
  markLesson: (id: string) => void
  unit0: boolean[]
  setUnit0: (v: boolean[]) => void
  fieldMapping: Partial<FieldMapping>
  setFieldMapping: (m: Partial<FieldMapping>) => void
  /** 3F 自訂參數的基準（「重置為基準」用） */
  baseline: ParameterSet | null
  setBaseline: (p: ParameterSet | null) => void
  calibration: Calibration | null
  setCalibration: (c: Calibration | null) => void
  /** 2F 最後匯入的日誌（只在記憶體，不存檔），3F 模型校正用 */
  lastLog: { log: AlignedLog; name: string } | null
  setLastLog: (l: { log: AlignedLog; name: string } | null) => void
  page: PageId
  go: (p: PageId) => void
}

const Ctx = createContext<Store | null>(null)

function usePersisted<T>(key: string, initial: T, validate?: (v: unknown) => v is T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const v = loadJson<unknown>(key, initial)
    return validate && !validate(v) ? initial : (v as T)
  })
  const set = useCallback(
    (v: T) => {
      setValue(v)
      saveJson(key, v)
    },
    [key],
  )
  return [value, set]
}

const isMechanism = (v: unknown): v is ElevatorMechanism => ElevatorMechanismSchema.safeParse(v).success
const isCalibrationOrNull = (v: unknown): v is Calibration | null =>
  v === null ||
  (typeof v === 'object' &&
    typeof (v as Record<string, unknown>).logName === 'string' &&
    ['kGScale', 'kVScale', 'kAScale', 'friction', 'rms', 'rmsTheory'].every((k) => Number.isFinite((v as Record<string, unknown>)[k])))
const isParamsOrNull = (v: unknown): v is ParameterSet | null => v === null || ParameterSetSchema.safeParse(v).success

export function buildTheory(mechanism: ElevatorMechanism, ff: FeedforwardResult, voltsPerCm: number): ParameterSet {
  return {
    schemaVersion: 1,
    source: 'theory',
    createdAt: new Date().toISOString(),
    mechanism,
    feedforward: { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA },
    feedback: { kP: kPFromVoltsPerCm(voltsPerCm), kI: 0, kD: 0 },
    motionMagic: {
      cruiseVelocity: ff.cruiseVelocity > 0 ? ff.cruiseVelocity : 0.1,
      acceleration: ff.acceleration > 0 ? ff.acceleration : 0.1,
    },
  }
}

function pageFromHash(): PageId {
  const h = location.hash.slice(1) as PageId
  return PAGES.includes(h) ? h : 'home'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [mechanism, setMechanism] = usePersisted('mechanism', DEFAULT_MECHANISM, isMechanism)
  const [voltsPerCm, setVoltsPerCm] = usePersisted('voltsPerCm', 0.5)
  const [custom, setCustom] = usePersisted<ParameterSet | null>('custom', null, isParamsOrNull)
  const [tuning, setTuning] = usePersisted<ParameterSet | null>('tuning', null, isParamsOrNull)
  const [rounds, setRounds] = usePersisted<TuningRound[]>('tuningRounds', [], (v): v is TuningRound[] => Array.isArray(v))
  const addRound = useCallback((r: TuningRound) => setRounds([...rounds, r].slice(-ROUND_LIMIT)), [rounds, setRounds])
  const clearRounds = useCallback(() => setRounds([]), [setRounds])
  const [simSource, setSimSource] = usePersisted<SimSource>('simSource', 'theory')
  const [lessonsDone, setLessonsDone] = usePersisted<Record<string, boolean>>('lessons', {})
  const [unit0, setUnit0] = usePersisted<boolean[]>('unit0', Array(UNIT0_ITEMS).fill(false))
  const [fieldMapping, setFieldMapping] = usePersisted<Partial<FieldMapping>>('fieldMapping', {})
  const [page, setPage] = useState<PageId>(pageFromHash)
  const [baseline, setBaseline] = usePersisted<ParameterSet | null>('baseline', null, isParamsOrNull)
  const [calibration, setCalibration] = usePersisted<Calibration | null>('calibration', null, isCalibrationOrNull)
  const [lastLog, setLastLog] = useState<{ log: AlignedLog; name: string } | null>(null)

  useEffect(() => {
    const on = () => setPage(pageFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const go = useCallback((p: PageId) => {
    if (location.hash !== '#' + p) location.hash = p
    setPage(p)
    window.scrollTo(0, 0)
  }, [])

  const ff = useMemo(() => computeFeedforward(mechanism), [mechanism])
  const theory = useMemo(() => buildTheory(mechanism, ff, voltsPerCm), [mechanism, ff, voltsPerCm])
  const markLesson = useCallback((id: string) => setLessonsDone({ ...lessonsDone, [id]: true }), [lessonsDone, setLessonsDone])

  const value: Store = {
    mechanism,
    setMechanism,
    voltsPerCm,
    setVoltsPerCm,
    ff,
    theory,
    custom,
    setCustom,
    tuning,
    setTuning,
    rounds,
    addRound,
    clearRounds,
    simSource,
    setSimSource,
    lessonsDone,
    markLesson,
    unit0,
    setUnit0,
    fieldMapping,
    setFieldMapping,
    baseline,
    setBaseline,
    calibration,
    setCalibration,
    lastLog,
    setLastLog,
    page,
    go,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore 必須在 StoreProvider 裡使用')
  return s
}

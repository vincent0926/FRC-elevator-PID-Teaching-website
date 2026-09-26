import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { computeFeedforward, kPFromVoltsPerCm, type FeedforwardResult } from '../core/feedforward'
import type { FieldMapping } from '../core/log/fieldMap'
import { DEFAULT_MECHANISM, ElevatorMechanismSchema, ParameterSetSchema, type ElevatorMechanism, type ParameterSet } from '../schema/parameterSet'
import { loadJson, saveJson } from '../storage/local'

/**
 * 全站共用狀態。參數組只有一種格式（ParameterSet），三個來源：
 *   theory  由機構資料即時算出
 *   tuning  調參建議（Phase 2）
 *   custom  使用者自己改的
 */

export type PageId = 'home' | 'calc' | 'tune' | 'sim' | 'learn'
export const PAGES: PageId[] = ['home', 'calc', 'tune', 'sim', 'learn']
export type SimSource = 'theory' | 'tuning' | 'custom'

export const UNIT0_ITEMS = 5

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
  simSource: SimSource
  setSimSource: (s: SimSource) => void
  lessonsDone: Record<string, boolean>
  markLesson: (id: string) => void
  unit0: boolean[]
  setUnit0: (v: boolean[]) => void
  fieldMapping: Partial<FieldMapping>
  setFieldMapping: (m: Partial<FieldMapping>) => void
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
  const [simSource, setSimSource] = usePersisted<SimSource>('simSource', 'theory')
  const [lessonsDone, setLessonsDone] = usePersisted<Record<string, boolean>>('lessons', {})
  const [unit0, setUnit0] = usePersisted<boolean[]>('unit0', Array(UNIT0_ITEMS).fill(false))
  const [fieldMapping, setFieldMapping] = usePersisted<Partial<FieldMapping>>('fieldMapping', {})
  const [page, setPage] = useState<PageId>(pageFromHash)

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
    tuning: null,
    simSource,
    setSimSource,
    lessonsDone,
    markLesson,
    unit0,
    setUnit0,
    fieldMapping,
    setFieldMapping,
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

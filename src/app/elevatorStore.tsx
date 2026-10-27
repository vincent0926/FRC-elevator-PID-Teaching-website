import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { computeFeedforward, kPFromVoltsPerCm, type FeedforwardResult } from '../core/feedforward'
import { parseFieldMapping, type AlignedLog, type FieldMapping } from '../core/log/fieldMap'
import { DEFAULT_MECHANISM, ElevatorMechanismSchema, ParameterSetSchema, type ElevatorMechanism, type ParameterSet } from '../schema/parameterSet'
import { DEFAULT_SPEC, isSpec, type Spec } from '../core/physics/spec'
import { guard, isBoolArray, isNonNegative, oneOf, usePersisted } from '../storage/usePersisted'
import { decodeMechanism, SHARE_PARAM } from '../core/shareLink'
import { useRounds, useSaveTracker, type MechanismStore } from './mechanismStore'
import type { SimLogHandoff } from './simLog'
import { t } from '../core/lang'

/**
 * 電梯線的狀態。參數組只有一種格式（ParameterSet），三個來源：
 *   theory  由機構資料即時算出
 *   tuning  調參建議（2F 套用建議後產生，一次只改一個參數）
 *   custom  使用者自己改的
 */

export type SimSource = 'theory' | 'tuning' | 'custom'

export const UNIT0_ITEMS = 5

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

interface ElevatorStore extends MechanismStore<ParameterSet, FeedforwardResult> {
  mechanism: ElevatorMechanism
  setMechanism: (m: ElevatorMechanism) => void
  voltsPerCm: number
  setVoltsPerCm: (v: number) => void
  tuning: ParameterSet | null
  setTuning: (p: ParameterSet | null) => void
  simSource: SimSource
  setSimSource: (s: SimSource) => void
  /** 3F 自訂參數的基準（「重置為基準」用） */
  baseline: ParameterSet | null
  setBaseline: (p: ParameterSet | null) => void
  calibration: Calibration | null
  setCalibration: (c: Calibration | null) => void
  /** 2F 最後匯入的日誌（只在記憶體，不存檔），3F 模型校正用 */
  lastLog: { log: AlignedLog; name: string } | null
  setLastLog: (l: { log: AlignedLog; name: string } | null) => void
  /** 3F 從滑桿切到自訂時，疊圖要比的那組（例如調參建議值；只在記憶體） */
  compareSet: { id?: number; label: string; params: ParameterSet } | null
  setCompareSet: (c: { id?: number; label: string; params: ParameterSet } | null) => void
  /** 從分享連結打開時的結果；prev 是被取代的機構資料（可以復原） */
  shared: { ok: boolean; text: string; prev?: ElevatorMechanism } | null
  dismissShared: (undo: boolean) => void
}

const Ctx = createContext<ElevatorStore | null>(null)

const isMechanism = (v: unknown): v is ElevatorMechanism => ElevatorMechanismSchema.safeParse(v).success
const isCalibrationOrNull = (v: unknown): v is Calibration | null =>
  v === null ||
  (typeof v === 'object' &&
    typeof (v as Record<string, unknown>).logName === 'string' &&
    ['kGScale', 'kVScale', 'kAScale', 'friction', 'rms', 'rmsTheory'].every((k) => Number.isFinite((v as Record<string, unknown>)[k])))
const isParamsOrNull = (v: unknown): v is ParameterSet | null => v === null || ParameterSetSchema.safeParse(v).success
/** 單元零的勾選：項目數要對（舊版項目數不同就重來） */
const isUnit0 = (v: unknown): v is boolean[] => isBoolArray(v) && v.length === UNIT0_ITEMS

export function buildTheory(mechanism: ElevatorMechanism, ff: FeedforwardResult, voltsPerCm: number): ParameterSet {
  return {
    schemaVersion: 1,
    source: 'theory',
    createdAt: new Date().toISOString(),
    mechanism,
    feedforward: { kS: ff.kS, kG: ff.kG, kV: ff.kV, kA: ff.kA },
    feedback: { kP: kPFromVoltsPerCm(voltsPerCm), kI: 0, kD: 0 },
    motionMagic: {
      cruiseVelocity: ff.cruiseVelocity > 0 ? ff.cruiseVelocity : 0.1,
      acceleration: ff.acceleration > 0 ? ff.acceleration : 0.1,
    },
  }
}

export function ElevatorStoreProvider({ children }: { children: ReactNode }) {
  const { onSaved, unsaved } = useSaveTracker()
  const [mechanism, setMechanism] = usePersisted('mechanism', DEFAULT_MECHANISM, { parse: guard(isMechanism), onSaved })
  const [voltsPerCm, setVoltsPerCm] = usePersisted('voltsPerCm', 0.5, { parse: guard(isNonNegative), onSaved })
  const [custom, setCustom] = usePersisted<ParameterSet | null>('custom', null, { parse: guard(isParamsOrNull), onSaved })
  const [tuning, setTuning] = usePersisted<ParameterSet | null>('tuning', null, { parse: guard(isParamsOrNull), onSaved })
  const { rounds, addRound, clearRounds } = useRounds('tuningRounds', onSaved)
  const [simSource, setSimSource] = usePersisted<SimSource>('simSource', 'theory', { parse: guard(oneOf<SimSource>('theory', 'tuning', 'custom')), onSaved })
  const [unit0, setUnit0] = usePersisted<boolean[]>('unit0', Array(UNIT0_ITEMS).fill(false), { parse: guard(isUnit0), onSaved })
  const [fieldMapping, setFieldMapping] = usePersisted<Partial<FieldMapping>>('fieldMapping', {}, { parse: parseFieldMapping, onSaved })
  const [baseline, setBaseline] = usePersisted<ParameterSet | null>('baseline', null, { parse: guard(isParamsOrNull), onSaved })
  const [calibration, setCalibration] = usePersisted<Calibration | null>('calibration', null, { parse: guard(isCalibrationOrNull), onSaved })
  const [spec, setSpec] = usePersisted<Spec>('spec', DEFAULT_SPEC, { parse: guard(isSpec), onSaved })
  const [lastLog, setLastLog] = useState<{ log: AlignedLog; name: string } | null>(null)
  const [simLog, setSimLog] = useState<SimLogHandoff<ParameterSet> | null>(null)
  const [compareSet, setCompareSet] = useState<ElevatorStore['compareSet']>(null)
  const [shared, setShared] = useState<ElevatorStore['shared']>(null)

  // 分享連結（?m=）：載入機構資料後把查詢字串拿掉，重新整理才不會又蓋掉一次（選電梯線在 store.tsx）
  useEffect(() => {
    const code = new URLSearchParams(location.search).get(SHARE_PARAM)
    if (!code) return
    const url = new URL(location.href)
    url.searchParams.delete(SHARE_PARAM)
    history.replaceState(null, '', url.toString())
    const r = decodeMechanism(code)
    if (r.ok) {
      setShared({ ok: true, text: t(`已載入分享連結的機構資料「${r.value.name}」。`, `Loaded the mechanism “${r.value.name}” from the shared link.`), prev: mechanism })
      setMechanism(r.value)
    } else setShared({ ok: false, text: t(`分享連結沒有載入：${r.error}。`, `The shared link didn’t load: ${r.error}.`) })
    // 只在打開網頁時做一次
  }, [])
  const dismissShared = useCallback(
    (undo: boolean) => {
      if (undo && shared?.prev) setMechanism(shared.prev)
      setShared(null)
    },
    [shared, setMechanism],
  )

  const ff = useMemo(() => computeFeedforward(mechanism), [mechanism])
  const theory = useMemo(() => buildTheory(mechanism, ff, voltsPerCm), [mechanism, ff, voltsPerCm])

  const value: ElevatorStore = {
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
    simLog,
    setSimLog,
    compareSet,
    setCompareSet,
    shared,
    dismissShared,
    spec,
    setSpec,
    unsaved,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useElevator(): ElevatorStore {
  const s = useContext(Ctx)
  if (!s) throw new Error('useElevator 必須在 ElevatorStoreProvider 裡使用')
  return s
}

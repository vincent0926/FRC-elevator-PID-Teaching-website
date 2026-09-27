import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { computeArmFeedforward, kPFromVoltsPerDeg, type ArmFeedforwardResult } from '../../core/arm/feedforward'
import { ARM_DEFAULT_SPEC, isSpec, type Spec } from '../../core/physics/spec'
import { ArmMechanismSchema, ArmParameterSetSchema, DEFAULT_ARM, type ArmMechanism, type ArmParameterSet } from '../../schema/armParameterSet'
import { loadJson, saveJson } from '../../storage/local'

/**
 * 手臂線的狀態（跟電梯分開存，互不影響）：機構資料、入門 kP、自訂參數、達標標準。
 * 教學關卡完成狀態共用主 store 的 lessonsDone，key 加 arm- 前綴。
 */

export type ArmSource = 'theory' | 'custom'

interface ArmStore {
  arm: ArmMechanism
  setArm: (m: ArmMechanism) => void
  voltsPerDeg: number
  setVoltsPerDeg: (v: number) => void
  ff: ArmFeedforwardResult
  theory: ArmParameterSet
  custom: ArmParameterSet | null
  setCustom: (p: ArmParameterSet | null) => void
  source: ArmSource
  setSource: (s: ArmSource) => void
  spec: Spec
  setSpec: (s: Spec) => void
}

const Ctx = createContext<ArmStore | null>(null)

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

const isArm = (v: unknown): v is ArmMechanism => ArmMechanismSchema.safeParse(v).success
const isArmParamsOrNull = (v: unknown): v is ArmParameterSet | null => v === null || ArmParameterSetSchema.safeParse(v).success
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

export function buildArmTheory(arm: ArmMechanism, ff: ArmFeedforwardResult, voltsPerDeg: number): ArmParameterSet {
  return {
    schemaVersion: 1,
    source: 'theory',
    createdAt: new Date().toISOString(),
    mechanism: arm,
    feedforward: { kS: ff.kS, kG: ff.kG, kV: ff.kV, kA: ff.kA },
    feedback: { kP: kPFromVoltsPerDeg(voltsPerDeg), kI: 0, kD: 0 },
    motionMagic: {
      cruiseVelocity: ff.cruiseVelocity > 0 ? ff.cruiseVelocity : 0.1,
      acceleration: ff.acceleration > 0 ? ff.acceleration : 0.1,
    },
  }
}

export function ArmStoreProvider({ children }: { children: ReactNode }) {
  const [arm, setArm] = usePersisted('armMechanism', DEFAULT_ARM, isArm)
  const [voltsPerDeg, setVoltsPerDeg] = usePersisted('armVoltsPerDeg', 0.3, isNum)
  const [custom, setCustom] = usePersisted<ArmParameterSet | null>('armCustom', null, isArmParamsOrNull)
  const [source, setSource] = usePersisted<ArmSource>('armSource', 'theory', (v): v is ArmSource => v === 'theory' || v === 'custom')
  const [spec, setSpec] = usePersisted<Spec>('armSpec', ARM_DEFAULT_SPEC, isSpec)
  const ff = useMemo(() => computeArmFeedforward(arm), [arm])
  const theory = useMemo(() => buildArmTheory(arm, ff, voltsPerDeg), [arm, ff, voltsPerDeg])
  const value: ArmStore = { arm, setArm, voltsPerDeg, setVoltsPerDeg, ff, theory, custom, setCustom, source, setSource, spec, setSpec }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useArm(): ArmStore {
  const s = useContext(Ctx)
  if (!s) throw new Error('useArm 要在 ArmStoreProvider 裡面用')
  return s
}

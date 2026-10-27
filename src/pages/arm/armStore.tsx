import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { computeArmFeedforward, kPFromVoltsPerDeg, type ArmFeedforwardResult } from '../../core/arm/feedforward'
import { ARM_DEFAULT_SPEC, isSpec, type Spec } from '../../core/physics/spec'
import { ArmMechanismSchema, ArmParameterSetSchema, DEFAULT_ARM, type ArmMechanism, type ArmParameterSet } from '../../schema/armParameterSet'
import { parseFieldMapping, type FieldMapping } from '../../core/log/fieldMap'
import { guard, isBoolArray, isNonNegative, oneOf, usePersisted } from '../../storage/usePersisted'
import type { SimLogHandoff } from '../../app/simLog'
import { useRounds, useSaveTracker, type MechanismStore } from '../../app/mechanismStore'

/**
 * 手臂線的狀態（跟電梯分開存，互不影響）：機構資料、入門 kP、自訂參數、達標標準、調參歷程。
 * 跟電梯共用 MechanismStore 介面（app/mechanismStore.ts）。
 * 教學關卡完成狀態共用主 store 的 lessonsDone，key 加 arm- 前綴。
 */

export type ArmSource = 'theory' | 'custom'

interface ArmStore extends MechanismStore<ArmParameterSet, ArmFeedforwardResult> {
  arm: ArmMechanism
  setArm: (m: ArmMechanism) => void
  voltsPerDeg: number
  setVoltsPerDeg: (v: number) => void
  source: ArmSource
  setSource: (s: ArmSource) => void
}

const Ctx = createContext<ArmStore | null>(null)

const isArm = (v: unknown): v is ArmMechanism => ArmMechanismSchema.safeParse(v).success
const isArmParamsOrNull = (v: unknown): v is ArmParameterSet | null => v === null || ArmParameterSetSchema.safeParse(v).success

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
  const { onSaved, unsaved } = useSaveTracker()
  const [arm, setArm] = usePersisted('armMechanism', DEFAULT_ARM, { parse: guard(isArm), onSaved })
  const [voltsPerDeg, setVoltsPerDeg] = usePersisted('armVoltsPerDeg', 0.3, { parse: guard(isNonNegative), onSaved })
  const [custom, setCustom] = usePersisted<ArmParameterSet | null>('armCustom', null, { parse: guard(isArmParamsOrNull), onSaved })
  const [source, setSource] = usePersisted<ArmSource>('armSource', 'theory', { parse: guard(oneOf<ArmSource>('theory', 'custom')), onSaved })
  const [spec, setSpec] = usePersisted<Spec>('armSpec', ARM_DEFAULT_SPEC, { parse: guard(isSpec), onSaved })
  const [fieldMapping, setFieldMapping] = usePersisted<Partial<FieldMapping>>('armFieldMapping', {}, { parse: parseFieldMapping, onSaved })
  const [unit0, setUnit0] = usePersisted<boolean[]>('armUnit0', [], { parse: guard(isBoolArray), onSaved })
  const { rounds, addRound, clearRounds } = useRounds('armTuningRounds', onSaved)
  const [simLog, setSimLog] = useState<SimLogHandoff<ArmParameterSet> | null>(null)
  const ff = useMemo(() => computeArmFeedforward(arm), [arm])
  const theory = useMemo(() => buildArmTheory(arm, ff, voltsPerDeg), [arm, ff, voltsPerDeg])
  const value: ArmStore = { arm, setArm, voltsPerDeg, setVoltsPerDeg, ff, theory, custom, setCustom, source, setSource, spec, setSpec, fieldMapping, setFieldMapping, unit0, setUnit0, simLog, setSimLog, rounds, addRound, clearRounds, unsaved }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useArm(): ArmStore {
  const s = useContext(Ctx)
  if (!s) throw new Error('useArm 要在 ArmStoreProvider 裡面用')
  return s
}

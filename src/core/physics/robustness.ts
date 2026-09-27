import { computeFeedforward, type FeedforwardResult } from '../feedforward'
import type { ElevatorMechanism } from '../../schema/parameterSet'
import { simulate, type SimInput, type SimResult } from './simulate'
import { DEFAULT_SPEC, moveFailures, passesSpec, specScore, type Spec } from './spec'

/**
 * 穩健性測試（3F 步驟 10）：在範圍內隨機改變質量、電池電壓、摩擦，
 * 用同一組參數跑很多次模擬，看有幾成達標，並回傳最差那一次的完整曲線。
 *
 * 質量改變會同時改 kG 與 kA（用 1F 的公式重算，配重不變）；kV 只跟齒比、馬達有關，不變。
 * 其他受控體設定（電流限制、效率、感測器…）沿用 base。
 */

export interface RobustRanges {
  /** 質量 ±百分比（0.2 = ±20%） */
  massPct: number
  batteryMin: number
  batteryMax: number
  /** 摩擦範圍（V），往上往下相同 */
  frictionMin: number
  frictionMax: number
  runs: number
  seed?: number
}

export const DEFAULT_RANGES: RobustRanges = { massPct: 0.2, batteryMin: 11.5, batteryMax: 12.8, frictionMin: 0.05, frictionMax: 0.35, runs: 40 }

export interface RobustSample {
  massScale: number
  battery: number
  friction: number
}

export interface RobustRun extends RobustSample {
  pass: boolean
  score: number
  failures: string[]
}

export interface RobustResult {
  runs: RobustRun[]
  passRate: number
  worstIndex: number
  /** 最差那一次的完整模擬結果 */
  worst: SimResult
}

/** 可重現的均勻亂數（mulberry32） */
function uniformRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sampleRanges(r: RobustRanges): RobustSample[] {
  const rand = uniformRng(r.seed ?? 9427)
  const lerp = (a: number, b: number) => a + (b - a) * rand()
  return Array.from({ length: Math.max(1, Math.round(r.runs)) }, () => ({
    massScale: lerp(1 - r.massPct, 1 + r.massPct),
    battery: lerp(r.batteryMin, r.batteryMax),
    friction: lerp(r.frictionMin, r.frictionMax),
  }))
}

/** 把一組抽樣套到 base 的受控體上 */
export function applySample(base: SimInput, mechanism: ElevatorMechanism, ff: FeedforwardResult, s: RobustSample): SimInput {
  const scaled = computeFeedforward({
    ...mechanism,
    stages: mechanism.stages.map((st) => ({ ...st, mass: st.mass * s.massScale })),
    payloadMass: mechanism.payloadMass * s.massScale,
  })
  return {
    ...base,
    plant: {
      ...base.plant,
      kG: ff.kG !== 0 ? base.plant.kG * (scaled.kG / ff.kG) : scaled.kG,
      kA: base.plant.kA * (scaled.kA / ff.kA),
      frictionKs: s.friction,
      frictionKsDown: s.friction,
      batteryVoltage: s.battery,
    },
  }
}

export function runRobustness(base: SimInput, mechanism: ElevatorMechanism, ff: FeedforwardResult, ranges: RobustRanges, spec: Spec = DEFAULT_SPEC): RobustResult {
  const samples = sampleRanges(ranges)
  const runs: RobustRun[] = samples.map((s) => {
    const r = simulate(applySample(base, mechanism, ff, s))
    const failures = [...new Set(r.moves.flatMap((m) => moveFailures(m, spec)))]
    return { ...s, pass: passesSpec(r.moves, spec), score: specScore(r.moves, spec), failures }
  })
  let worstIndex = 0
  runs.forEach((r, i) => {
    if (r.score > runs[worstIndex].score) worstIndex = i
  })
  return {
    runs,
    passRate: runs.filter((r) => r.pass).length / runs.length,
    worstIndex,
    worst: simulate(applySample(base, mechanism, ff, samples[worstIndex])),
  }
}

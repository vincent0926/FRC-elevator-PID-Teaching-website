import type { Slot0Gains } from '../controller/slot0'
import type { FeedforwardResult } from '../feedforward'
import { plantFromMechanism, type PlantOptions } from '../physics/elevator'
import { simulate, type Move, type SimInput, type SimResult } from '../physics/simulate'
import type { AlignedLog } from './fieldMap'
import type { ElevatorMechanism } from '../../schema/parameterSet'
import { WpilogWriter } from './wpilogWriter'

/**
 * 用模擬器產生一份跟 robot-example 欄位名稱相同的 .wpilog（50 Hz，AdvantageKit 預設）。
 * 用途：沒有機器人也能練習匯入；Phase 2 用它故意設錯參數，驗證診斷規則。
 */

export const SAMPLE_KEYS = {
  position: '/Elevator/PositionMeters',
  velocity: '/Elevator/VelocityMetersPerSec',
  reference: '/Elevator/ClosedLoopReferenceMeters',
  referenceSlope: '/Elevator/ClosedLoopReferenceSlopeMetersPerSec',
  appliedVolts: '/Elevator/AppliedVolts',
  statorCurrent: '/Elevator/StatorCurrentAmps',
  supplyVoltage: '/Elevator/SupplyVoltage',
  closedLoopOutput: '/Elevator/ClosedLoopOutputVolts',
  feedforwardOutput: '/Elevator/ClosedLoopFeedForwardVolts',
  battery: '/SystemStats/BatteryVoltage',
  enabled: '/DriverStation/Enabled',
} as const

export interface SampleLogOptions {
  mechanism: ElevatorMechanism
  ff: FeedforwardResult
  /** 機器人上用的參數（可以故意設錯） */
  gains: Slot0Gains
  motionMagic: { cruiseVelocity: number; acceleration: number }
  plant?: PlantOptions
  /** 閉迴路週期（s），預設 TalonFX 1 ms */
  controlPeriod?: number
  moves?: Move[]
  duration?: number
  /** 量測雜訊標準差（m），只加在記錄的值上 */
  noise?: number
  seed?: number
  /** 控制器看到的感測延遲與雜訊（例如 kD 放大雜訊的情境） */
  sensor?: SimInput['sensor']
}

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

function simulateSample(o: SampleLogOptions): SimResult {
  const travel = o.mechanism.travel
  const moves = o.moves ?? [
    { time: 1, goal: travel * 0.75 },
    { time: 3.5, goal: travel * 0.2 },
    { time: 6, goal: travel * 0.5 },
    { time: 8.5, goal: travel * 0.05 },
  ]
  return simulate({
    plant: plantFromMechanism(o.mechanism, o.ff, o.plant ?? { realistic: true }),
    gains: o.gains,
    motionMagic: o.motionMagic,
    controlPeriod: o.controlPeriod ?? 0.001,
    initialPosition: 0,
    moves,
    duration: o.duration ?? 11,
    sensor: o.sensor,
  })
}

const LOG_EVERY = 20 // 1 ms 模擬 → 50 Hz 日誌
const ENABLE_OFFSET = 0.5 // 開機後 0.5 s 才 Enable

function noiseSource(o: { noise?: number; seed?: number }) {
  const rand = rng(o.seed ?? 9427)
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
  const noise = o.noise ?? 0.0003
  return { pos: () => noise * gauss(), vel: () => noise * 20 * gauss() }
}

export type SampleKeys = Record<keyof typeof SAMPLE_KEYS, string>

/** 模擬結果 → .wpilog（50 Hz）。電梯、手臂共用，只有欄位名稱不同 */
export function logFromSim(r: SimResult, keys: SampleKeys, o: { noise?: number; seed?: number } = {}): Uint8Array {
  const nz = noiseSource(o)
  const w = new WpilogWriter('AdvantageKit')
  const id = Object.fromEntries(
    Object.entries(keys).map(([k, name]) => [k, w.start(name, k === 'enabled' ? 'boolean' : 'double')]),
  ) as Record<keyof typeof SAMPLE_KEYS, number>
  for (let i = 0; i < r.t.length; i += LOG_EVERY) {
    const ts = (r.t[i] + ENABLE_OFFSET) * 1e6
    w.appendBoolean(id.enabled, ts, true)
    w.appendDouble(id.position, ts, r.pos[i] + nz.pos())
    w.appendDouble(id.velocity, ts, r.vel[i] + nz.vel())
    w.appendDouble(id.reference, ts, r.refPos[i])
    w.appendDouble(id.referenceSlope, ts, r.refVel[i])
    w.appendDouble(id.appliedVolts, ts, r.voltage[i])
    w.appendDouble(id.statorCurrent, ts, r.statorCurrent[i])
    w.appendDouble(id.supplyVoltage, ts, r.supplyVoltage[i])
    w.appendDouble(id.battery, ts, r.supplyVoltage[i])
    w.appendDouble(id.closedLoopOutput, ts, r.feedback[i])
    w.appendDouble(id.feedforwardOutput, ts, r.feedforward[i])
  }
  return w.toBytes()
}

/** 模擬結果 → 對齊好的欄位（不經過 .wpilog 編碼、解析） */
export function alignedFromSim(r: SimResult, o: { noise?: number; seed?: number } = {}): AlignedLog {
  const nz = noiseSource(o)
  const n = Math.ceil(r.t.length / LOG_EVERY)
  const col = () => new Float64Array(n)
  const c = {
    position: col(),
    velocity: col(),
    reference: col(),
    referenceSlope: col(),
    appliedVolts: col(),
    statorCurrent: col(),
    supplyVoltage: col(),
    closedLoopOutput: col(),
    feedforwardOutput: col(),
    enabled: new Float64Array(n).fill(1),
  }
  const t = col()
  for (let k = 0, i = 0; i < r.t.length; i += LOG_EVERY, k++) {
    t[k] = r.t[i] + ENABLE_OFFSET
    c.position[k] = r.pos[i] + nz.pos()
    c.velocity[k] = r.vel[i] + nz.vel()
    c.reference[k] = r.refPos[i]
    c.referenceSlope[k] = r.refVel[i]
    c.appliedVolts[k] = r.voltage[i]
    c.statorCurrent[k] = r.statorCurrent[i]
    c.supplyVoltage[k] = r.supplyVoltage[i]
    c.closedLoopOutput[k] = r.feedback[i]
    c.feedforwardOutput[k] = r.feedforward[i]
  }
  return { t, cols: c }
}

export function makeSampleLog(o: SampleLogOptions): Uint8Array {
  return logFromSim(simulateSample(o), SAMPLE_KEYS, o)
}

/** 跟 makeSampleLog 同一份資料，但直接給對齊好的欄位。3F 校正練習與測試用 */
export function sampleAlignedLog(o: SampleLogOptions): AlignedLog {
  return alignedFromSim(simulateSample(o), o)
}

import type { Slot0Gains } from '../controller/slot0'
import type { FeedforwardResult } from '../feedforward'
import { plantFromMechanism, type PlantOptions } from '../physics/elevator'
import { simulate, type Move } from '../physics/simulate'
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
  /** 量測雜訊標準差（m） */
  noise?: number
  seed?: number
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

export function makeSampleLog(o: SampleLogOptions): Uint8Array {
  const travel = o.mechanism.travel
  const moves = o.moves ?? [
    { time: 1, goal: travel * 0.75 },
    { time: 3.5, goal: travel * 0.2 },
    { time: 6, goal: travel * 0.5 },
    { time: 8.5, goal: travel * 0.05 },
  ]
  const duration = o.duration ?? 11
  const r = simulate({
    plant: plantFromMechanism(o.mechanism, o.ff, o.plant ?? { realistic: true }),
    gains: o.gains,
    motionMagic: o.motionMagic,
    controlPeriod: o.controlPeriod ?? 0.001,
    initialPosition: 0,
    moves,
    duration,
  })
  const rand = rng(o.seed ?? 9427)
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
  const noise = o.noise ?? 0.0003

  const w = new WpilogWriter('AdvantageKit')
  const id = Object.fromEntries(
    Object.entries(SAMPLE_KEYS).map(([k, name]) => [k, w.start(name, k === 'enabled' ? 'boolean' : 'double')]),
  ) as Record<keyof typeof SAMPLE_KEYS, number>
  const offset = 0.5 // 開機後 0.5 s 才 Enable
  for (let i = 0; i < r.t.length; i += 20) {
    const ts = (r.t[i] + offset) * 1e6
    w.appendBoolean(id.enabled, ts, true)
    w.appendDouble(id.position, ts, r.pos[i] + noise * gauss())
    w.appendDouble(id.velocity, ts, r.vel[i] + noise * 20 * gauss())
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

import type { GravityType, Slot0Gains } from '../controller/slot0'
import { alignedFromSim, logFromSim, type SampleKeys } from '../log/sampleLog'
import type { AlignedLog } from '../log/fieldMap'
import type { PlantOptions } from '../physics/elevator'
import { simulate, type Move, type SimInput, type SimResult } from '../physics/simulate'
import type { ArmMechanism } from '../../schema/armParameterSet'
import type { ArmFeedforwardResult } from './feedforward'
import { plantFromArm } from './plant'

/**
 * 手臂的範例日誌：欄位名稱跟 robot-example 的 ArmIO 一樣（/Arm/PositionRad…），50 Hz。
 * 動作照 Arm.tuningRoutine()：停在水平、抬高、回水平、中間、收起，kG（cos θ）和 kS 才分得開。
 */

export const ARM_SAMPLE_KEYS: SampleKeys = {
  position: '/Arm/PositionRad',
  velocity: '/Arm/VelocityRadPerSec',
  reference: '/Arm/ClosedLoopReferenceRad',
  referenceSlope: '/Arm/ClosedLoopReferenceSlopeRadPerSec',
  appliedVolts: '/Arm/AppliedVolts',
  statorCurrent: '/Arm/StatorCurrentAmps',
  supplyVoltage: '/Arm/SupplyVoltage',
  closedLoopOutput: '/Arm/ClosedLoopOutputVolts',
  feedforwardOutput: '/Arm/ClosedLoopFeedForwardVolts',
  battery: '/SystemStats/BatteryVoltage',
  enabled: '/DriverStation/Enabled',
}

export interface ArmSampleOptions {
  arm: ArmMechanism
  ff: ArmFeedforwardResult
  gains: Slot0Gains
  motionMagic: { cruiseVelocity: number; acceleration: number }
  plant?: PlantOptions
  controlPeriod?: number
  gravityType?: GravityType
  /** 編碼器的 0 跟水平差多少（rad） */
  zeroOffset?: number
  sensor?: SimInput['sensor']
  moves?: Move[]
  duration?: number
  noise?: number
  seed?: number
}

const DEG = Math.PI / 180

export function armSampleMoves(arm: ArmMechanism): Move[] {
  const lo = arm.minAngle + 10 * DEG
  const hi = Math.min(arm.maxAngle - 10 * DEG, 80 * DEG)
  const zero = Math.min(Math.max(0, lo), hi)
  return [
    { time: 1, goal: zero },
    { time: 3.5, goal: hi },
    { time: 6, goal: zero },
    { time: 8.5, goal: (zero + hi) / 2 },
    { time: 11, goal: lo },
  ]
}

function simulateArmSample(o: ArmSampleOptions): SimResult {
  const plant = plantFromArm(o.arm, o.ff, o.plant ?? { realistic: true })
  return simulate({
    plant: o.zeroOffset ? { ...plant, gravityCosineOffset: o.zeroOffset } : plant,
    gains: o.gains,
    motionMagic: o.motionMagic,
    controlPeriod: o.controlPeriod ?? 0.001,
    initialPosition: Math.min(o.arm.maxAngle, o.arm.minAngle + 5 * DEG),
    moves: o.moves ?? armSampleMoves(o.arm),
    duration: o.duration ?? 13.5,
    sensor: o.sensor,
    gravityType: o.gravityType ?? 'armCosine',
  })
}

export function makeArmSampleLog(o: ArmSampleOptions): Uint8Array {
  return logFromSim(simulateArmSample(o), ARM_SAMPLE_KEYS, o)
}

export function armSampleAlignedLog(o: ArmSampleOptions): AlignedLog {
  return alignedFromSim(simulateArmSample(o), o)
}

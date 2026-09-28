import { CONTROL_PERIOD, type AntiWindup, type ControllerLocation, type GravityType } from '../../core/controller/slot0'
import type { ArmFeedforwardResult } from '../../core/arm/feedforward'
import { plantFromArm } from '../../core/arm/plant'
import type { SimInput } from '../../core/physics/simulate'
import { trapezoidProfile } from '../../core/profile'
import { DEG, type ArmMechanism, type ArmParameterSet } from '../../schema/armParameterSet'

/**
 * 3F 手臂模擬的設定：受控體開關（電梯的子集合）、控制器位置、重力型態、移動方式。
 * 移動：從收起的角度（下限上面 5°）轉到目標，停 1.5 s，再轉回來。
 */

export interface ArmKnobs {
  realistic: boolean
  friction: boolean
  frictionUp: number
  frictionDown: number
  currentLimit: boolean
  batterySag: boolean
  batteryVoltage: number
  gearbox: boolean
  efficiency: number
  sensor: boolean
  sensorDelay: number
  /** 角度雜訊標準差（rad） */
  sensorNoise: number
  voltageLimit: boolean
  /** 真實手臂跟理論值的倍率（教學情境用） */
  kGScale: number
  kAScale: number
  /** 編碼器的 0 跟水平差多少（rad）；0 表示零點設對 */
  zeroOffset: number
}

export const DEFAULT_ARM_KNOBS: ArmKnobs = {
  realistic: false,
  friction: true,
  frictionUp: 0.15,
  frictionDown: 0.15,
  currentLimit: true,
  batterySag: true,
  batteryVoltage: 12.5,
  gearbox: false,
  efficiency: 0.9,
  sensor: false,
  sensorDelay: 0.005,
  sensorNoise: 0.1 * DEG,
  voltageLimit: true,
  kGScale: 1,
  kAScale: 1,
  zeroOffset: 0,
}

export interface ArmSimSetup {
  arm: ArmMechanism
  ff: ArmFeedforwardResult
  knobs: ArmKnobs
  location: ControllerLocation
  /** 目標角度（rad） */
  goal: number
  /** 起始角度（rad）；沒給就是收起的角度（下限上面 5°） */
  start?: number
  gravityType: GravityType
  tolerance?: number
  antiWindup?: AntiWindup
}

export function armStartAngle(arm: ArmMechanism): number {
  return Math.min(arm.maxAngle, arm.minAngle + 5 * DEG)
}

export function buildArmSimInput(s: ArmSimSetup, ps: ArmParameterSet): SimInput {
  const { arm, ff, knobs: k } = s
  const real = k.realistic
  const plant = plantFromArm(arm, ff, {
    realistic: real,
    frictionKs: real && k.friction ? k.frictionUp : 0,
    frictionKsDown: real && k.friction ? k.frictionDown : 0,
    currentLimit: k.currentLimit,
    batterySag: k.batterySag,
    batteryVoltage: k.batteryVoltage,
    gearboxEfficiency: k.gearbox ? k.efficiency : 1,
    kGScale: k.kGScale,
    kAScale: k.kAScale,
  })
  plant.gravityCosineOffset = k.zeroOffset
  const start = Math.min(arm.maxAngle, Math.max(arm.minAngle, s.start ?? armStartAngle(arm)))
  const goal = Math.min(arm.maxAngle, Math.max(arm.minAngle, s.goal))
  const mm = ps.motionMagic
  const there = trapezoidProfile(start, goal, mm.cruiseVelocity, mm.acceleration)
  const back = trapezoidProfile(goal, start, mm.cruiseVelocity, mm.acceleration)
  const t2 = 0.5 + there.duration + 1.5
  return {
    plant,
    gains: { ...ps.feedforward, ...ps.feedback },
    motionMagic: mm,
    controlPeriod: CONTROL_PERIOD[s.location],
    initialPosition: start,
    moves: [
      { time: 0.5, goal },
      { time: t2, goal: start },
    ],
    duration: Math.min(30, t2 + back.duration + 1.5),
    tolerance: s.tolerance,
    sensor: real && k.sensor ? { delay: k.sensorDelay, positionNoise: k.sensorNoise, velocityNoise: k.sensorNoise * 20 } : undefined,
    voltageLimit: real ? k.voltageLimit : true,
    antiWindup: s.antiWindup,
    gravityType: s.gravityType,
  }
}

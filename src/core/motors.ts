/**
 * 馬達常數，數值與 WPILib DCMotor 相同（單顆馬達）。
 * 由四個規格推出直流馬達模型：
 *   R  = 12 / stallCurrent               繞組電阻（Ω）
 *   kT = stallTorque / stallCurrent      扭矩常數（N·m/A）
 *   Kv = ω_free / (12 − R · freeCurrent)  轉速常數（rad/s/V）
 */

export type MotorId = 'krakenX60' | 'krakenX60Foc' | 'falcon500' | 'falcon500Foc' | 'neo'

export interface MotorSpec {
  id: MotorId
  label: string
  vendor: 'CTRE' | 'REV'
  nominalVoltage: number
  stallTorque: number // N·m
  stallCurrent: number // A
  freeCurrent: number // A
  freeSpeedRpm: number
}

export interface MotorModel extends MotorSpec {
  R: number
  kT: number
  Kv: number
  freeSpeedRadPerSec: number
}

export const MOTOR_SPECS: Record<MotorId, MotorSpec> = {
  krakenX60: { id: 'krakenX60', label: 'Kraken X60', vendor: 'CTRE', nominalVoltage: 12, stallTorque: 7.09, stallCurrent: 366, freeCurrent: 2, freeSpeedRpm: 6000 },
  krakenX60Foc: { id: 'krakenX60Foc', label: 'Kraken X60（FOC）', vendor: 'CTRE', nominalVoltage: 12, stallTorque: 9.37, stallCurrent: 483, freeCurrent: 2, freeSpeedRpm: 5800 },
  falcon500: { id: 'falcon500', label: 'Falcon 500', vendor: 'CTRE', nominalVoltage: 12, stallTorque: 4.69, stallCurrent: 257, freeCurrent: 1.5, freeSpeedRpm: 6380 },
  falcon500Foc: { id: 'falcon500Foc', label: 'Falcon 500（FOC）', vendor: 'CTRE', nominalVoltage: 12, stallTorque: 5.84, stallCurrent: 304, freeCurrent: 1.5, freeSpeedRpm: 6080 },
  neo: { id: 'neo', label: 'NEO（REV，第一版不支援輸出）', vendor: 'REV', nominalVoltage: 12, stallTorque: 2.6, stallCurrent: 105, freeCurrent: 1.8, freeSpeedRpm: 5676 },
}

export function motorModel(id: MotorId): MotorModel {
  const s = MOTOR_SPECS[id]
  const R = s.nominalVoltage / s.stallCurrent
  const kT = s.stallTorque / s.stallCurrent
  const freeSpeedRadPerSec = (s.freeSpeedRpm * 2 * Math.PI) / 60
  const Kv = freeSpeedRadPerSec / (s.nominalVoltage - R * s.freeCurrent)
  return { ...s, R, kT, Kv, freeSpeedRadPerSec }
}

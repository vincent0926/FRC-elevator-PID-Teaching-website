import type { Slot0Gains } from '../controller/slot0'
import type { ElevatorMechanism, ParameterSet } from '../../schema/parameterSet'
import type { ParamChange } from './diagnose'

/**
 * 把「機器人上當時的參數」包成參數組，再套上一個建議，得到調參建議值（source = 'tuning'）。
 * 一次只改一個參數：其他全部照舊，隊員上機後才知道這一步有沒有用。
 */

export function paramsFromGains(
  mechanism: ElevatorMechanism,
  gains: Slot0Gains,
  motionMagic: ParameterSet['motionMagic'],
  source: ParameterSet['source'],
  note?: string,
): ParameterSet {
  return {
    schemaVersion: 1,
    source,
    createdAt: new Date().toISOString(),
    ...(note ? { note } : {}),
    mechanism,
    feedforward: { kS: gains.kS, kG: gains.kG, kV: gains.kV, kA: gains.kA },
    feedback: { kP: gains.kP, kI: gains.kI, kD: gains.kD },
    motionMagic: { cruiseVelocity: Math.max(1e-3, motionMagic.cruiseVelocity), acceleration: Math.max(1e-3, motionMagic.acceleration) },
  }
}

export function applyChange(base: ParameterSet, change: ParamChange, note?: string): ParameterSet {
  const next: ParameterSet = {
    ...base,
    source: 'tuning',
    createdAt: new Date().toISOString(),
    feedforward: { ...base.feedforward },
    feedback: { ...base.feedback },
    motionMagic: { ...base.motionMagic },
  }
  if (note) next.note = note
  if (change.kind === 'motionMagic') {
    next.motionMagic = { cruiseVelocity: change.cruiseVelocity.to, acceleration: change.acceleration.to }
    return next
  }
  const { param, to } = change
  if (param === 'kS' || param === 'kG' || param === 'kV' || param === 'kA') next.feedforward[param] = to
  else next.feedback[param] = to
  return next
}

/** 參數組 → Slot0 參數（診斷與模擬用） */
export function gainsOf(ps: ParameterSet): Slot0Gains {
  return { ...ps.feedforward, ...ps.feedback }
}

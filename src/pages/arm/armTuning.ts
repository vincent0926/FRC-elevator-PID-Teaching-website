import type { ParamChange } from '../../core/analysis/diagnose'
import type { Slot0Gains } from '../../core/controller/slot0'
import type { ArmMechanism, ArmParameterSet } from '../../schema/armParameterSet'

/** 手臂參數組 ↔ Slot0 參數、套用一個建議（跟電梯的 core/analysis/apply.ts 同一套規則） */

export const armGains = (ps: ArmParameterSet): Slot0Gains => ({ ...ps.feedforward, ...ps.feedback })

export function armParamsFromGains(arm: ArmMechanism, g: Slot0Gains, motionMagic: ArmParameterSet['motionMagic'], source: ArmParameterSet['source'], note?: string): ArmParameterSet {
  return {
    schemaVersion: 1,
    source,
    createdAt: new Date().toISOString(),
    ...(note ? { note } : {}),
    mechanism: arm,
    feedforward: { kS: g.kS, kG: g.kG, kV: g.kV, kA: g.kA },
    feedback: { kP: g.kP, kI: g.kI, kD: g.kD },
    motionMagic: { cruiseVelocity: Math.max(1e-3, motionMagic.cruiseVelocity), acceleration: Math.max(1e-3, motionMagic.acceleration) },
  }
}

/** 套用一個建議，存成「自訂」（手臂 3F 用自訂預覽） */
export function applyArmChange(base: ArmParameterSet, change: ParamChange, note?: string): ArmParameterSet {
  const next: ArmParameterSet = {
    ...base,
    source: 'custom',
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

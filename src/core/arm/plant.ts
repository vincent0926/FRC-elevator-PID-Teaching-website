import type { ArmMechanism } from '../../schema/armParameterSet'
import type { PlantOptions, PlantParams } from '../physics/elevator'
import type { ArmFeedforwardResult } from './feedforward'

/**
 * 手臂受控體：跟電梯同一條方程式（控制輸入以電壓表示），只是位置換成角度、重力項是 kG·cos θ：
 *
 *   kA · α = η·(u_eff − kV·ω) − kG·cos θ − kS_friction·sgn(ω)
 *
 * 機械上下限就是可以動的角度範圍（撞到硬擋就停）。其他真實效應（電流限制、電池壓降、摩擦、效率）跟電梯共用。
 */
export function plantFromArm(m: ArmMechanism, ff: ArmFeedforwardResult, opt: PlantOptions): PlantParams {
  return {
    kG: ff.kG * (opt.kGScale ?? 1),
    gravityCosine: true,
    kV: ff.kV * (opt.kVScale ?? 1),
    kA: ff.kA * (opt.kAScale ?? 1),
    frictionKs: opt.realistic ? (opt.frictionKs ?? 0.15) : 0,
    frictionKsDown: opt.realistic ? (opt.frictionKsDown ?? opt.frictionKs ?? 0.15) : 0,
    gearboxEfficiency: opt.realistic ? (opt.gearboxEfficiency ?? 1) : 1,
    motorResistance: ff.motorResistance,
    motorCount: m.motorCount,
    statorCurrentLimit: opt.realistic && (opt.currentLimit ?? true) ? (opt.statorCurrentLimit ?? m.statorCurrentLimit) : null,
    supplyCurrentLimit: opt.realistic ? (opt.supplyCurrentLimit ?? null) : null,
    batteryVoltage: opt.batteryVoltage ?? 12.5,
    batteryResistance: opt.realistic && (opt.batterySag ?? true) ? 0.02 : 0,
    minPosition: m.minAngle,
    maxPosition: m.maxAngle,
  }
}

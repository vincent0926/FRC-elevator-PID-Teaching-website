import type { FlywheelGains, FlywheelKnobs, FlywheelMechanism, ShotPlan } from '../flywheel/flywheel'
import { jd } from './index'

/**
 * 射球飛輪的 Phoenix 6 設定片段。SensorToMechanismRatio = 齒比，所以速度單位是「飛輪每秒轉幾圈」（rps），
 * 增益從 SI（rad/s）換成 rps 都是乘 2π。
 */

const TAU = 2 * Math.PI

export interface FlywheelRotGains {
  kS: number
  kV: number
  kA: number
  kP: number
  kI: number
  kD: number
}

/** SI → Phoenix 6 轉數制：kS 是伏特不變，其他乘 2π（V/(rad/s) → V/rps、V/rad → V/rot…） */
export function flywheelToRotations(g: FlywheelGains): FlywheelRotGains {
  return { kS: g.kS, kV: g.kV * TAU, kA: g.kA * TAU, kP: g.kP * TAU, kI: g.kI * TAU, kD: g.kD * TAU }
}

export function flywheelJava(g: FlywheelGains, mech: FlywheelMechanism, knobs: FlywheelKnobs, plan: ShotPlan): string {
  const r = flywheelToRotations(g)
  const magic = plan.accel > 0
  const lines = [
    '// 射球飛輪（Phoenix 6）：速度單位是飛輪的 rps',
    'var config = new TalonFXConfiguration();',
    `config.Feedback.SensorToMechanismRatio = ${jd(mech.gearRatio)}; // 馬達轉幾圈飛輪轉 1 圈`,
    `config.Slot0.kS = ${jd(r.kS)}; // V`,
    `config.Slot0.kV = ${jd(r.kV)}; // V/rps`,
    `config.Slot0.kA = ${jd(r.kA)}; // V/(rps/s)`,
    `config.Slot0.kP = ${jd(r.kP)}; // V/rps`,
    `config.Slot0.kI = ${jd(r.kI)}; // V/rot`,
    `config.Slot0.kD = ${jd(r.kD)}; // V/(rps/s)`,
  ]
  if (magic) lines.push(`config.MotionMagic.MotionMagicAcceleration = ${jd(plan.accel / TAU)}; // rps/s`)
  if (knobs.noReverse) lines.push('config.Voltage.PeakReverseVoltage = 0.0; // 不出反向電壓，掉速時不會反過來煞車')
  if (knobs.statorLimit > 0) {
    lines.push(`config.CurrentLimits.StatorCurrentLimit = ${jd(knobs.statorLimit)}; // A`)
    lines.push('config.CurrentLimits.StatorCurrentLimitEnable = true;')
  }
  lines.push('shooter.getConfigurator().apply(config);')
  if (mech.motorCount > 1) lines.push('// 其他馬達設成 Follower（方向相反的話用 MotorAlignmentValue.Opposed）')
  lines.push('')
  lines.push(
    magic
      ? 'private final MotionMagicVelocityVoltage request = new MotionMagicVelocityVoltage(0).withSlot(0);'
      : 'private final VelocityVoltage request = new VelocityVoltage(0).withSlot(0);',
  )
  lines.push(`shooter.setControl(request.withVelocity(${jd(plan.target / TAU)})); // 目標 rps`)
  return lines.join('\n')
}

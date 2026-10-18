import { motorModel, type MotorId } from '../motors'

/**
 * 射球飛輪：速度控制（Phoenix 6 VelocityVoltage／MotionMagicVelocityVoltage）。
 * 內部一律 SI：轉速 rad/s、增益 V/(rad/s)；畫面和程式碼才換成 rps（× 2π，見 codegen/flywheel.ts）。
 *
 * 受控體：J·ω̇ = G·n·kT·I − 摩擦 − 球帶走的扭矩，每顆馬達 I = (u − ω·G/Kv)/R。
 * 沒有重力，所以沒有 kG；前饋只有 kS、kV、kA。
 */

export interface FlywheelMechanism {
  motor: MotorId
  motorCount: number
  /** 馬達轉幾圈飛輪轉 1 圈（加速傳動小於 1） */
  gearRatio: number
  /** 會一起轉的質量（飛輪＋輪子＋軸），kg */
  wheelMass: number
  /** 輪子半徑，m（球從這裡被帶出去） */
  wheelRadius: number
  /** J = shape·m·r²：實心圓盤 0.5，質量集中在外圈接近 1 */
  shape: number
}

export const DEFAULT_FLYWHEEL: FlywheelMechanism = {
  motor: 'krakenX60',
  motorCount: 2,
  gearRatio: 1,
  wheelMass: 1.5,
  wheelRadius: 0.0508,
  shape: 0.5,
}

/** 增益（SI）：kS [V]、kV [V/(rad/s)]、kA [V/(rad/s²)]、kP [V/(rad/s)]、kI [V/rad]、kD [V/(rad/s²)] */
export interface FlywheelGains {
  kS: number
  kV: number
  kA: number
  kP: number
  kI: number
  kD: number
}

export interface FlywheelFeedforward {
  /** 轉動慣量 kg·m² */
  J: number
  kV: number
  kA: number
  /** 12 V、沒有負載時飛輪的最高轉速 rad/s（不含摩擦） */
  freeSpeed: number
}

export function flywheelInertia(m: FlywheelMechanism): number {
  return m.shape * m.wheelMass * m.wheelRadius ** 2
}

export function computeFlywheelFeedforward(m: FlywheelMechanism): FlywheelFeedforward {
  const mot = motorModel(m.motor)
  const J = flywheelInertia(m)
  return {
    J,
    kV: m.gearRatio / mot.Kv,
    kA: (J * mot.R) / (m.gearRatio * m.motorCount * mot.kT),
    freeSpeed: (mot.Kv * 12) / m.gearRatio,
  }
}

/** kP 起始值 0.2 V/rps：不是算出來的，是常見的起點，要在模擬裡調 */
export const START_KP = 0.2 / (2 * Math.PI)

export function theoryGains(ff: FlywheelFeedforward): FlywheelGains {
  return { kS: 0, kV: ff.kV, kA: ff.kA, kP: START_KP, kI: 0, kD: 0 }
}

/** 受控體開關（都是近似模型） */
export interface FlywheelKnobs {
  /** 摩擦，用等效 kS 表示（V） */
  friction: number
  /** Stator 電流限制（每顆馬達，A）；0 = 不限 */
  statorLimit: number
  /** PeakReverseVoltage = 0：控制器不會出反向電壓，掉速只能靠摩擦慢下來 */
  noReverse: boolean
}

export const DEFAULT_KNOBS: FlywheelKnobs = { friction: 0.2, statorLimit: 80, noReverse: true }

export interface ShotPlan {
  /** 目標轉速 rad/s */
  target: number
  /** 加速度限制 rad/s²（MotionMagicVelocity）；0 = VelocityVoltage 直接跳到目標 */
  accel: number
  /** 第一發的時間 s */
  firstShot: number
  shots: number
  /** 兩發間隔 s */
  interval: number
  /** 球的質量 kg */
  ballMass: number
}

export const DEFAULT_PLAN: ShotPlan = { target: 50 * 2 * Math.PI, accel: 0, firstShot: 1.5, shots: 3, interval: 0.3, ballMass: 0.235 }

/** 球出去的速度 ≈ 輪緣速度的一半（單邊飛輪、另一邊是固定的導板） */
export const EXIT_RATIO = 0.5
/** 球和輪子接觸的時間 s */
export const CONTACT = 0.03
/** 控制器週期：TalonFX 1 kHz */
export const CONTROL_DT = 0.001
const SUBSTEPS = 4
/** 最後一發之後再看多久 */
const TAIL = 0.8

export interface FlywheelSimResult {
  t: Float64Array
  ref: Float64Array
  vel: Float64Array
  /** 總輸出電壓、前饋、回授（V） */
  volt: Float64Array
  ff: Float64Array
  fb: Float64Array
  /** 每顆馬達的電流 A */
  motorCurrent: Float64Array
  /** 輸出被夾到上下限 */
  saturated: Uint8Array
  shotTimes: number[]
}

export function simEnd(plan: ShotPlan): number {
  return plan.firstShot + (plan.shots - 1) * plan.interval + TAIL
}

export function simulateFlywheel(mech: FlywheelMechanism, gains: FlywheelGains, knobs: FlywheelKnobs, plan: ShotPlan): FlywheelSimResult {
  const mot = motorModel(mech.motor)
  const J = flywheelInertia(mech)
  const G = mech.gearRatio
  const n = mech.motorCount
  const r = mech.wheelRadius
  const frictionTorque = (knobs.friction * G * n * mot.kT) / mot.R
  const steps = Math.round(simEnd(plan) / CONTROL_DT) + 1
  const out: FlywheelSimResult = {
    t: new Float64Array(steps),
    ref: new Float64Array(steps),
    vel: new Float64Array(steps),
    volt: new Float64Array(steps),
    ff: new Float64Array(steps),
    fb: new Float64Array(steps),
    motorCurrent: new Float64Array(steps),
    saturated: new Uint8Array(steps),
    shotTimes: Array.from({ length: plan.shots }, (_, i) => plan.firstShot + i * plan.interval),
  }
  // 每一發的角衝量在球碰到輪子那一刻決定（當時轉速越高，球帶走越多）
  const impulse: number[] = new Array(plan.shots).fill(0)
  const shotStep = out.shotTimes.map((s) => Math.round(s / CONTROL_DT))
  const contactSteps = Math.round(CONTACT / CONTROL_DT)
  let w = 0
  let ref = 0
  let integ = 0
  let prevErr = 0
  const minU = knobs.noReverse ? 0 : -12
  const h = CONTROL_DT / SUBSTEPS
  for (let k = 0; k < steps; k++) {
    const t = k * CONTROL_DT
    // 參考轉速：直接跳，或照加速度限制往目標爬
    let aRef = 0
    if (plan.accel > 0) {
      if (ref < plan.target) {
        ref = Math.min(plan.target, ref + plan.accel * CONTROL_DT)
        aRef = ref < plan.target ? plan.accel : 0
      }
    } else ref = plan.target
    const err = ref - w
    integ += err * CONTROL_DT
    const deriv = k === 0 ? 0 : (err - prevErr) / CONTROL_DT
    prevErr = err
    const ff = gains.kS * Math.sign(ref) + gains.kV * ref + gains.kA * aRef
    const fb = gains.kP * err + gains.kI * integ + gains.kD * deriv
    const raw = ff + fb
    const u = Math.min(12, Math.max(minU, raw))

    // 球的扭矩：接觸的 30 ms 內平均分配
    let ballTorque = 0
    for (let s = 0; s < plan.shots; s++) {
      if (k === shotStep[s]) impulse[s] = plan.ballMass * EXIT_RATIO * Math.max(0, w) * r * r
      if (k >= shotStep[s] && k < shotStep[s] + contactSteps) ballTorque += impulse[s] / CONTACT
    }

    let current = 0
    for (let j = 0; j < SUBSTEPS; j++) {
      let i = (u - (w * G) / mot.Kv) / mot.R
      if (knobs.statorLimit > 0) i = Math.max(-knobs.statorLimit, Math.min(knobs.statorLimit, i))
      if (knobs.noReverse && i < 0) i = 0
      current = i
      const drive = G * n * mot.kT * i - ballTorque
      // 庫倫摩擦：停著的時候推不動就不動
      let torque: number
      if (Math.abs(w) < 1e-6 && Math.abs(drive) <= frictionTorque) torque = 0
      else torque = drive - frictionTorque * Math.sign(Math.abs(w) < 1e-6 ? drive : w)
      const wNext = w + (torque / J) * h
      // 摩擦不會讓飛輪反轉
      w = w > 0 && wNext < 0 && drive <= frictionTorque ? 0 : wNext
    }

    out.t[k] = t
    out.ref[k] = ref
    out.vel[k] = w
    out.volt[k] = u
    out.ff[k] = ff
    out.fb[k] = fb
    out.motorCurrent[k] = current
    out.saturated[k] = raw > 12 || raw < minU ? 1 : 0
  }
  return out
}

/** 教學用的達標標準（不是 FRC 規定） */
export interface FlywheelSpec {
  /** 轉速誤差在目標的幾 % 以內算「可以射」 */
  tolPct: number
  /** 從 0 到可以射的時間上限 s */
  spinUp: number
  /** 每一發之後回到可以射的時間上限 s */
  recovery: number
}

export const DEFAULT_FLYWHEEL_SPEC: FlywheelSpec = { tolPct: 2, spinUp: 0.5, recovery: 0.1 }

export interface ShotMetrics {
  at: number
  /** 最多掉了多少 rad/s */
  dip: number
  /** 回到誤差範圍內（而且到下一發前都待著）花的時間；回不來是 null */
  recovery: number | null
}

export interface FlywheelMetrics {
  /** 從 0 到可以射（進入誤差範圍並待到第一發）的時間；第一發前都沒到是 null */
  spinUp: number | null
  /** 第一發前最多衝過頭多少 rad/s */
  overshoot: number
  /** 第一發前 0.2 s 的平均誤差（目標 − 實際）rad/s */
  steadyError: number
  shots: ShotMetrics[]
  peakCurrent: number
  /** 輸出被夾住的時間比例 */
  saturation: number
}

/** 從 from 往後找，最後一次進入誤差範圍的時間（到 to 之前都待在範圍內）；to 那時不在範圍內就是 null */
function settleTime(res: FlywheelSimResult, from: number, to: number, target: number, tol: number): number | null {
  if (to <= from || Math.abs(res.vel[to - 1] - target) > tol) return null
  let i = to - 1
  while (i > from && Math.abs(res.vel[i - 1] - target) <= tol) i--
  return res.t[i] - res.t[from]
}

export function flywheelMetrics(res: FlywheelSimResult, plan: ShotPlan, spec: FlywheelSpec): FlywheelMetrics {
  const tol = (spec.tolPct / 100) * plan.target
  const idx = (t: number) => Math.min(res.t.length, Math.max(0, Math.round(t / CONTROL_DT)))
  const first = idx(plan.firstShot)
  let overshoot = 0
  for (let i = 0; i < first; i++) overshoot = Math.max(overshoot, res.vel[i] - plan.target)
  const avgFrom = idx(plan.firstShot - 0.2)
  let sum = 0
  for (let i = avgFrom; i < first; i++) sum += plan.target - res.vel[i]
  const shots: ShotMetrics[] = res.shotTimes.map((at, s) => {
    const a = idx(at)
    const b = s + 1 < res.shotTimes.length ? idx(res.shotTimes[s + 1]) : res.t.length
    let low = Infinity
    for (let i = a; i < b; i++) low = Math.min(low, res.vel[i])
    return { at, dip: Math.max(0, plan.target - low), recovery: settleTime(res, a, b, plan.target, tol) }
  })
  let peak = 0
  let sat = 0
  for (let i = 0; i < res.t.length; i++) {
    peak = Math.max(peak, Math.abs(res.motorCurrent[i]))
    sat += res.saturated[i]
  }
  return {
    spinUp: settleTime(res, 0, first, plan.target, tol),
    overshoot,
    steadyError: first > avgFrom ? sum / (first - avgFrom) : 0,
    shots,
    peakCurrent: peak,
    saturation: sat / res.t.length,
  }
}

export type FlywheelCheck = 'spinUp' | 'steady' | 'overshoot' | 'recovery'

/** 哪幾項沒過 */
export function flywheelFailures(m: FlywheelMetrics, plan: ShotPlan, spec: FlywheelSpec): FlywheelCheck[] {
  const tol = (spec.tolPct / 100) * plan.target
  const out: FlywheelCheck[] = []
  if (m.spinUp === null || m.spinUp > spec.spinUp) out.push('spinUp')
  if (Math.abs(m.steadyError) > tol) out.push('steady')
  if (m.overshoot > tol) out.push('overshoot')
  if (m.shots.some((s) => s.recovery === null || s.recovery > spec.recovery)) out.push('recovery')
  return out
}

import { motorModel, type MotorId } from '../motors'
import { t } from '../lang'

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
  /** 球的另一邊：固定導板（hood），或是對面也有滾輪一起夾著球（rollers） */
  back: 'hood' | 'rollers'
  /** 對面滾輪半徑 m（back = rollers 才用） */
  backRadius: number
  /** 對面滾輪加起來的質量 kg（當實心滾筒算，形狀 0.5） */
  backMass: number
  /** 對面滾輪轉速 ÷ 大輪轉速（同一顆馬達 1:1 帶就是 1） */
  backRatio: number
}

export const DEFAULT_FLYWHEEL: FlywheelMechanism = {
  motor: 'krakenX60',
  motorCount: 2,
  gearRatio: 1,
  wheelMass: 1.5,
  wheelRadius: 0.0508,
  shape: 0.5,
  back: 'hood',
  backRadius: 0.0254,
  backMass: 0.3,
  backRatio: 1,
}

/** 對面滾輪的輪緣速度是大輪的幾倍；固定導板是 0 */
export function backSurfaceRatio(m: FlywheelMechanism): number {
  return m.back === 'rollers' ? (m.backRatio * m.backRadius) / m.wheelRadius : 0
}

/**
 * 換算用的半徑：球速 = EXIT_RATIO × ω × exitRadius。
 * 球夾在兩個面中間，中心速度是兩邊輪緣速度的平均：0.5 × (ω·r + ω·r·s) = 0.5 × ω × r(1 + s)。
 */
export function exitRadius(m: FlywheelMechanism): number {
  return m.wheelRadius * (1 + backSurfaceRatio(m))
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

/** 換算到大輪的轉動慣量：對面滾輪轉速是大輪的 backRatio 倍，慣量要乘 backRatio² */
export function flywheelInertia(m: FlywheelMechanism): number {
  const back = m.back === 'rollers' ? 0.5 * m.backMass * m.backRadius ** 2 * m.backRatio ** 2 : 0
  return m.shape * m.wheelMass * m.wheelRadius ** 2 + back
}

/**
 * 一發從大輪那根軸（換算後）帶走的角動量 = ballMass × EXIT_RATIO × ω × impulseRadiusSq。
 * 球的動量 m·v 由兩邊推出去，假設各邊出的力跟它的輪緣速度成正比（固定導板不出力）：
 * m·v·[r/(1+s) + r·s·s/(1+s)] = m·0.5·ω·r²·(1 + s²)。固定導板（s = 0）就是原本的 m·0.5·ω·r²。
 */
export function impulseRadiusSq(m: FlywheelMechanism): number {
  return m.wheelRadius ** 2 * (1 + backSurfaceRatio(m) ** 2)
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
  /** 出射仰角 rad（0 = 水平） */
  angle: number
  /** 砲台轉軸離地高度 m（barrel = 0 時就是出射點的高度） */
  height: number
  /** 轉軸到出射點的距離 m，沿著球射出去的方向；0 = 球從轉軸那裡出去 */
  barrel: number
  /** 目標距離從機器人哪裡量：砲台轉軸、機器人中心、保險桿前緣（見 releasePlan） */
  distanceFrom: DistanceFrom
  /** 量距離的那一點到砲台轉軸的水平距離 m，往目標為正（轉軸在那一點後面是負的）；distanceFrom = 'pivot' 時不用 */
  pivotAhead: number
  /** 目標離量距離那一點的水平距離 m */
  goalDistance: number
  /** 目標高度 m（球往下掉經過這個高度的地方算落點；0 = 地面） */
  goalHeight: number
  /** 目標開口寬度 m：落點離目標距離在一半以內算進 */
  goalWidth: number
}

export type DistanceFrom = 'pivot' | 'center' | 'bumper'
export const DISTANCE_FROM: DistanceFrom[] = ['pivot', 'center', 'bumper']

/**
 * 出射點相對「量距離那一點」往目標多遠 m（仰角 angle 時）：
 * 那一點 → 轉軸（pivotAhead）→ 出射點（barrel 沿射出方向的水平分量）。
 */
export function releaseAhead(plan: ShotPlan, angle = plan.angle): number {
  return (plan.distanceFrom === 'pivot' ? 0 : plan.pivotAhead) + plan.barrel * Math.cos(angle)
}

/** 出射點離地高度 m（仰角 angle 時）= 轉軸高度 + barrel 沿射出方向的垂直分量 */
export function releaseHeight(plan: ShotPlan, angle = plan.angle): number {
  return Math.max(0, plan.height + plan.barrel * Math.sin(angle))
}

/**
 * 把使用者填的砲台幾何換成「從出射點算」的 plan：height = 出射點高度、goalDistance = 出射點到目標，
 * 彈道公式都用這個。換過的再換一次不會變（barrel、pivotAhead 歸零）。
 */
export function releasePlan(plan: ShotPlan, angle = plan.angle): ShotPlan {
  return {
    ...plan,
    angle,
    height: releaseHeight(plan, angle),
    goalDistance: plan.goalDistance - releaseAhead(plan, angle),
    barrel: 0,
    distanceFrom: 'pivot',
    pivotAhead: 0,
  }
}

export const DEFAULT_PLAN: ShotPlan = {
  target: 50 * 2 * Math.PI,
  accel: 0,
  firstShot: 1.5,
  shots: 50,
  interval: 0.3,
  ballMass: 0.235,
  angle: (50 * Math.PI) / 180,
  height: 0.5,
  barrel: 0,
  distanceFrom: 'pivot',
  pivotAhead: 0,
  goalDistance: 4.6,
  goalHeight: 2,
  goalWidth: 0.6,
}

/**
 * FRC 2026 REBUILT 的 HUB（2026 Game Manual）：開口前緣離地 72 in、六角形開口寬 41.7 in。
 * 只換目標高度和開口寬度，距離看你站哪裡射，不動。
 */
export const HUB_2026 = { goalHeight: 72 * 0.0254, goalWidth: 41.7 * 0.0254 }

/**
 * HUB 前面的 AprilTag 到 HUB 中心的水平距離 m：HUB 底座 47 in 見方，tag 貼在側面，取一半 23.5 in。
 * 用 Limelight 量到的是到 tag 的距離，算轉速要用到中心的距離（球要掉進開口中間），所以要加上這段。
 */
export const HUB_TAG_TO_CENTER = 23.5 * 0.0254

/** lb → kg，取到 g（輸入框才不會出現一長串小數） */
const lbToKg = (lb: number) => Math.round(lb * 453.59237) / 1000
/** FRC 2026 REBUILT 的得分物件 FUEL（2026 Game Manual）：直徑 5.91 in 的泡棉球，0.448～0.500 lb */
export const GAME_PIECES_2026 = [
  { id: 'fuel', label: t('FUEL 中間值', 'FUEL typical'), mass: lbToKg((0.448 + 0.5) / 2) },
  { id: 'fuel-light', label: t('FUEL 最輕', 'FUEL lightest'), mass: lbToKg(0.448) },
  { id: 'fuel-heavy', label: t('FUEL 最重', 'FUEL heaviest'), mass: lbToKg(0.5) },
]

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
  /** 每一發射的時候的目標轉速 rad/s（沒給 targets 時都是 plan.target） */
  shotTargets: number[]
}

export function simEnd(plan: ShotPlan): number {
  return plan.firstShot + (plan.shots - 1) * plan.interval + TAIL
}

/**
 * targets：每一發各自的目標轉速 rad/s（邊移動邊射時每一發的距離不同）。
 * 第一發前用 targets[0]，第 s 發離開輪子後換成 targets[s + 1]。沒給就全部用 plan.target。
 */
export function simulateFlywheel(mech: FlywheelMechanism, gains: FlywheelGains, knobs: FlywheelKnobs, plan: ShotPlan, targets?: number[]): FlywheelSimResult {
  const mot = motorModel(mech.motor)
  const J = flywheelInertia(mech)
  const G = mech.gearRatio
  const n = mech.motorCount
  const r2 = impulseRadiusSq(mech)
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
    shotTargets: Array.from({ length: plan.shots }, (_, i) => targets?.[i] ?? plan.target),
  }
  // 每一發的角衝量在球碰到輪子那一刻決定（當時轉速越高，球帶走越多）
  const impulse: number[] = new Array(plan.shots).fill(0)
  const shotStep = out.shotTimes.map((s) => Math.round(s / CONTROL_DT))
  const contactSteps = Math.round(CONTACT / CONTROL_DT)
  let next = 0
  let target = out.shotTargets[0] ?? plan.target
  let w = 0
  let ref = 0
  let integ = 0
  let prevErr = 0
  const minU = knobs.noReverse ? 0 : -12
  const h = CONTROL_DT / SUBSTEPS
  for (let k = 0; k < steps; k++) {
    const t = k * CONTROL_DT
    // 參考轉速：直接跳，或照加速度限制往目標爬
    while (next < plan.shots && k >= shotStep[next] + contactSteps) {
      next++
      if (next < plan.shots) target = out.shotTargets[next]
    }
    let aRef = 0
    if (plan.accel > 0) {
      if (ref < target) {
        ref = Math.min(target, ref + plan.accel * CONTROL_DT)
        aRef = ref < target ? plan.accel : 0
      } else ref = target
    } else ref = target
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
      if (k === shotStep[s]) impulse[s] = plan.ballMass * EXIT_RATIO * Math.max(0, w) * r2
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
  // 每一發看它自己的目標轉速（邊移動邊射時每一發不同）
  const goal = (s: number) => res.shotTargets[s] ?? plan.target
  const tolOf = (s: number) => (spec.tolPct / 100) * goal(s)
  const idx = (t: number) => Math.min(res.t.length, Math.max(0, Math.round(t / CONTROL_DT)))
  const first = idx(plan.firstShot)
  let overshoot = 0
  for (let i = 0; i < first; i++) overshoot = Math.max(overshoot, res.vel[i] - goal(0))
  const avgFrom = idx(plan.firstShot - 0.2)
  let sum = 0
  for (let i = avgFrom; i < first; i++) sum += goal(0) - res.vel[i]
  const shots: ShotMetrics[] = res.shotTimes.map((at, s) => {
    const a = idx(at)
    const b = s + 1 < res.shotTimes.length ? idx(res.shotTimes[s + 1]) : res.t.length
    let low = Infinity
    for (let i = a; i < b; i++) low = Math.min(low, res.vel[i])
    return { at, dip: Math.max(0, goal(s) - low), recovery: settleTime(res, a, b, goal(s), tolOf(s)) }
  })
  let peak = 0
  let sat = 0
  for (let i = 0; i < res.t.length; i++) {
    peak = Math.max(peak, Math.abs(res.motorCurrent[i]))
    sat += res.saturated[i]
  }
  return {
    spinUp: settleTime(res, 0, first, goal(0), tolOf(0)),
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

/**
 * 球速與射程：拋體運動，不計空氣阻力、球的旋轉（近似模型）。
 * 球出去的速度 = EXIT_RATIO × ω × r，r 傳 exitRadius(mech)（對面有滾輪時會比輪子半徑大），跟模擬裡球帶走的角動量用同一個假設。
 */
/**
 * 砲台角度（畫面和 Java 用的度數，決策 130、131）：球往正上方是 0°，往目標倒角度變大，
 * 水平朝目標是 90°；= 90° − 仰角。內部還是存仰角 rad（0 = 水平朝目標）。
 */
export function turretDeg(angle: number): number {
  return 90 - (angle * 180) / Math.PI
}
export function angleFromTurret(deg: number): number {
  return ((90 - deg) * Math.PI) / 180
}

export const GRAVITY = 9.81

export function exitSpeed(w: number, r: number): number {
  return EXIT_RATIO * Math.max(0, w) * r
}

/**
 * 從離地 height、仰角 angle、速度 v 射出，往下掉經過 goal 高度的時間 s。
 * 最高點比 goal 低（打不到那麼高）是 NaN。
 */
export function flightTime(v: number, angle: number, height: number, goal = 0): number {
  const vy = v * Math.sin(angle)
  const disc = vy * vy - 2 * GRAVITY * (goal - Math.max(0, height))
  if (disc < 0) return NaN
  return (vy + Math.sqrt(disc)) / GRAVITY
}

/** 往下掉經過 goal 高度時離出射點的水平距離 m；打不到那麼高是 NaN */
export function launchRange(v: number, angle: number, height: number, goal = 0): number {
  return v * Math.cos(angle) * flightTime(v, angle, height, goal)
}

/** 最高點離地多高 m */
export function apexHeight(v: number, angle: number, height: number): number {
  return Math.max(0, height) + (v * Math.sin(angle)) ** 2 / (2 * GRAVITY)
}

/** 飛行 τ 秒後的位置（相對出射點，往上為正）m */
export function ballAt(v: number, angle: number, tau: number): { x: number; y: number } {
  return { x: v * Math.cos(angle) * tau, y: v * Math.sin(angle) * tau - 0.5 * GRAVITY * tau * tau }
}

/**
 * 要在 range 遠的地方、往下掉經過 goal 高度，需要的球速 m/s。
 * 這個仰角做不到（或只能在往上飛的時候經過）是 null。
 */
export function speedForRange(range: number, angle: number, height: number, goal = 0): number | null {
  const c = Math.cos(angle)
  const d = 2 * c * c * (range * Math.tan(angle) + Math.max(0, height) - goal)
  if (range <= 0 || c <= 1e-6 || d <= 0) return null
  const v = Math.sqrt((GRAVITY * range * range) / d)
  // 最高點的水平距離要在 range 之前，球才是往下掉進去
  if ((v * v * Math.sin(angle) * c) / GRAVITY > range + 1e-9) return null
  return v
}

/** 要進目標（距離、高度）需要的輪子轉速 rad/s；這個仰角做不到是 null */
export function wheelForGoal(r: number, input: ShotPlan): number | null {
  const plan = releasePlan(input)
  const v = speedForRange(plan.goalDistance, plan.angle, plan.height, plan.goalHeight)
  return v === null ? null : v / (EXIT_RATIO * r)
}

/** 輪子轉速 rad/s → 到目標高度時離量距離那一點的水平距離 m（打不到那麼高是 NaN） */
export function rangeAtWheel(w: number, r: number, plan: ShotPlan): number {
  return launchRange(exitSpeed(w, r), plan.angle, releaseHeight(plan), plan.goalHeight) + releaseAhead(plan)
}

/**
 * 一發大概掉多少（比例）：球帶走 m_ball·EXIT_RATIO·ω·r²(1+s²) 的角動量（見 impulseRadiusSq），馬達在 30 ms 內來不及補，
 * Δω/ω ≈ m_ball·EXIT_RATIO·r²(1+s²) / J。只有固定導板時 = m_ball·EXIT_RATIO / (shape·m_wheel)，跟轉速、半徑都無關。
 */
export function dipFraction(mech: FlywheelMechanism, ballMass: number): number {
  return (ballMass * EXIT_RATIO * impulseRadiusSq(mech)) / flywheelInertia(mech)
}

export interface ShotOutcome {
  /** 球碰到輪子的時間 s */
  at: number
  /** 那時輪子的轉速 rad/s */
  wheel: number
  /** 出口球速 m/s */
  exit: number
  /** 離開輪子的時間 s */
  release: number
  /** 往下掉經過目標高度時離量距離那一點的水平距離 m；打不到那麼高是 NaN */
  range: number
  /** 落點減目標距離 m（負的是近了；打不到那麼高是 NaN） */
  miss: number
  /** 有沒有進（落點離目標在開口一半以內） */
  hit: boolean
}

export function shotOutcomes(res: FlywheelSimResult, mech: FlywheelMechanism, plan: ShotPlan): ShotOutcome[] {
  return res.shotTimes.map((at) => {
    const k = Math.min(res.vel.length - 1, Math.round(at / CONTROL_DT))
    const wheel = res.vel[k]
    const exit = exitSpeed(wheel, exitRadius(mech))
    const range = rangeAtWheel(wheel, exitRadius(mech), plan)
    const miss = range - plan.goalDistance
    return { at, wheel, exit, release: at + CONTACT, range, miss, hit: Math.abs(miss) <= plan.goalWidth / 2 }
  })
}

/**
 * 最快到速：12 V 全開、每顆馬達電流限在 statorLimit（0 = 不限），不含摩擦和回授，
 * 從 0 到目標的 98% 要多久 s。到不了是 null。1F 用來估「馬達夠不夠力」。
 */
export function fastestSpinUp(mech: FlywheelMechanism, target: number, statorLimit: number): number | null {
  const mot = motorModel(mech.motor)
  const J = flywheelInertia(mech)
  const G = mech.gearRatio
  const goal = 0.98 * target
  if (goal >= (mot.Kv * 12) / G) return null
  const dt = 1e-4
  let w = 0
  for (let t = 0; t < 30; t += dt) {
    if (w >= goal) return t
    let i = (12 - (w * G) / mot.Kv) / mot.R
    if (statorLimit > 0) i = Math.min(i, statorLimit)
    w += ((G * mech.motorCount * mot.kT * i) / J) * dt
  }
  return null
}

/** 彈道 1F「算轉速和仰角」的一條候選軌跡 */
export interface TrajectoryOption {
  /** 出射仰角 rad（發射機構相對機器人的仰角） */
  angle: number
  /** 打到目標中心要的輪子轉速 rad/s */
  wheel: number
  /** 出口球速 m/s（相對機器人） */
  exit: number
  /** 底盤要往哪偏才會進 rad，往左為正；機器人沒動時是 0 */
  yaw: number
  /** 加上機器人速度後，球對地的速度 m/s 和仰角 rad（畫軌跡用；沒動時跟 exit、angle 一樣） */
  fieldExit: number
  fieldAngle: number
  /** 轉速可以差多少還會進（比例，取偏低、偏高比較小的那邊）；算不出來是 null */
  tolerance: number | null
  /** 球往下掉進目標高度時跟水平的夾角 rad（越大越陡） */
  entry: number
  /** 最高點離地 m */
  apex: number
  /** 轉得到（不超過最高轉速的 90%） */
  reachable: boolean
}

/** 轉速上限預設是馬達空載轉速的 90%（12 V、不含摩擦，再高電壓就不夠追了） */
export const DEFAULT_LIMIT_FRACTION = 0.9

/**
 * 轉速上限 rad/s：使用者填的上限（rps，0 = 沒填）跟空載轉速的 90% 取小的。
 * 填得比 90% 還高也沒用，馬達本身就轉不到。
 */
export function wheelLimit(freeSpeed: number, userRps: number): number {
  const motor = freeSpeed * DEFAULT_LIMIT_FRACTION
  return userRps > 0 ? Math.min(motor, userRps * 2 * Math.PI) : motor
}

/** 彈道 1F 列出來給人選的仰角：20° 到 75°，每 5° 一條 */
export const TRAJECTORY_ANGLES = Array.from({ length: 12 }, (_, i) => ((20 + i * 5) * Math.PI) / 180)
/** 每 5° 找到的太少（邊移動邊射、距離很近時，能打進的仰角範圍會很窄，可能不到 1°）時，改用 10°～85° 每 0.1° 找 */
export const FINE_TRAJECTORY_ANGLES = Array.from({ length: 751 }, (_, i) => ((100 + i) * Math.PI) / 1800)
/** 每 5° 找到少於這麼多條，就改用每 0.1° 找 */
const MIN_OPTIONS = 5
/** 每 0.1° 找的時候，平均挑這麼多條（含頭尾） */
const FINE_PICKS = 6

/**
 * 同一個距離，不同仰角各要多少轉速才會打到目標中心（往下掉進去）。打不進的仰角不列。
 * 容許誤差：開口近邊、遠邊各要多少轉速，跟中心比，取比較小的那邊。
 * 給 motion（邊移動邊射）時，轉速和底盤偏角用 solveMovingShot 算。
 * maxWheel 是轉速上限 rad/s（見 wheelLimit），超過的標成 reachable = false。
 * 沒指定 angles 時用預設仰角（每 5°）；在上限內的少於 5 條時，改成每 0.1° 找，從能打進、又在上限內的仰角平均挑 6 條（含最低、最高的仰角）。
 * 每 0.1° 找也沒有在上限內的，就從能打進的平均挑（都標成超過上限），讓人看得到差多少。
 */
export function trajectoryOptions(mech: FlywheelMechanism, plan: ShotPlan, maxWheel: number, angles?: number[], motion: RobotMotion = STILL): TrajectoryOption[] {
  // 有指定仰角就只算那些
  if (angles) return optionsAt(mech, plan, maxWheel, angles, motion)
  const out = optionsAt(mech, plan, maxWheel, TRAJECTORY_ANGLES, motion)
  const ok = (list: TrajectoryOption[]) => list.filter((o) => o.reachable)
  if (ok(out).length >= MIN_OPTIONS) return out
  const all = optionsAt(mech, plan, maxWheel, FINE_TRAJECTORY_ANGLES, motion)
  const fine = ok(all).length ? ok(all) : all
  // 每 0.1° 找也沒有比較多，維持每 5°
  if (fine.length <= (fine === all ? out.length : ok(out).length)) return out
  if (fine.length <= FINE_PICKS) return fine
  const idx = new Set(Array.from({ length: FINE_PICKS }, (_, i) => Math.round((i * (fine.length - 1)) / (FINE_PICKS - 1))))
  return [...idx].map((i) => fine[i])
}

function optionsAt(mech: FlywheelMechanism, plan: ShotPlan, maxWheel: number, angles: number[], motion: RobotMotion): TrajectoryOption[] {
  const rx = exitRadius(mech)
  const moving = motion.toward !== 0 || motion.side !== 0
  const solve = (angle: number, d: number) => (moving ? solveMovingShot(rx, plan, angle, motion, d) : stillShot(rx, { ...plan, angle, goalDistance: d }))
  const out: TrajectoryOption[] = []
  for (const angle of angles) {
    const s = solve(angle, plan.goalDistance)
    if (s === null) continue
    const near = solve(angle, plan.goalDistance - plan.goalWidth / 2)
    const far = solve(angle, plan.goalDistance + plan.goalWidth / 2)
    const tolerance = near === null || far === null ? null : Math.min(s.wheel - near.wheel, far.wheel - s.wheel) / s.wheel
    const h = releaseHeight(plan, angle)
    const T = flightTime(s.fieldExit, s.fieldAngle, h, plan.goalHeight)
    const vy = s.fieldExit * Math.sin(s.fieldAngle) - GRAVITY * T
    out.push({
      angle,
      ...s,
      tolerance,
      entry: Math.atan2(-vy, s.fieldExit * Math.cos(s.fieldAngle)),
      apex: apexHeight(s.fieldExit, s.fieldAngle, h),
      reachable: s.wheel <= maxWheel,
    })
  }
  return out
}

/**
 * 邊移動邊射（shoot on the move）：機器人在動，球出去的對地速度 = 發射機構給的速度 + 機器人的速度。
 * 沒有砲塔，左右靠底盤轉（偏角 yaw）。不計空氣阻力；機器人速度用出射那一刻的。
 */
export interface RobotMotion {
  /** 往目標方向的速度 m/s（離目標越來越近為正） */
  toward: number
  /** 側向速度 m/s（面向目標時往左為正） */
  side: number
}
export const STILL: RobotMotion = { toward: 0, side: 0 }

export interface MovingShot {
  /** 要的輪子轉速 rad/s */
  wheel: number
  /** 發射機構給的球速（相對機器人）m/s */
  exit: number
  /** 底盤要偏的角度 rad，往左為正（面向目標時） */
  yaw: number
  /** 球對地的速度 m/s、仰角 rad */
  fieldExit: number
  fieldAngle: number
}

/** 機器人沒動：就是 wheelForGoal */
function stillShot(rx: number, plan: ShotPlan): MovingShot | null {
  const wheel = wheelForGoal(rx, plan)
  if (wheel === null) return null
  const exit = exitSpeed(wheel, rx)
  return { wheel, exit, yaw: 0, fieldExit: exit, fieldAngle: plan.angle }
}

/**
 * 仰角 pitch 固定（發射機構相對機器人），離目標 distance 遠、機器人速度 motion 時，
 * 要多少球速、底盤偏多少，球才會往下掉進目標中心。做不到是 null。
 *
 * 球對地的水平速度要正對目標：側向 vs·cos(pitch)·sin(yaw) + side = 0，
 * 往目標 H = √((vs·cos pitch)² − side²) + toward，往上 vz = vs·sin(pitch)。
 * 射程 H·T(vz) 隨 vs 變大，用二分法找剛好等於 distance 的 vs。
 */
export function solveMovingShot(rx: number, input: ShotPlan, pitch: number, motion: RobotMotion, distance = input.goalDistance): MovingShot | null {
  // 距離、高度換成從出射點算（出射點偏移沿著往目標的方向，側向速度造成的小偏角不計）
  const plan = releasePlan({ ...input, goalDistance: distance }, pitch)
  distance = plan.goalDistance
  const c = Math.cos(pitch)
  const sn = Math.sin(pitch)
  if (distance <= 0 || c <= 1e-6 || sn <= 1e-6) return null
  const rise = plan.goalHeight - Math.max(0, plan.height)
  const at = (vs: number) => {
    const q = vs * c
    const H = Math.sqrt(Math.max(0, q * q - motion.side * motion.side)) + motion.toward
    const vz = vs * sn
    const disc = vz * vz - 2 * GRAVITY * rise
    const T = disc < 0 ? NaN : (vz + Math.sqrt(disc)) / GRAVITY
    return { H, vz, range: H * T }
  }
  // 最小速度：要能抵銷側向速度、要打得到目標高度
  let lo = Math.max(Math.abs(motion.side) / c, Math.sqrt(2 * GRAVITY * Math.max(0, rise)) / sn) * (1 + 1e-12) + 1e-9
  let hi = lo * 2 + 1
  const r0 = at(lo).range
  if (Number.isFinite(r0) && r0 > distance) return null
  while (!(at(hi).range >= distance)) {
    hi *= 2
    if (hi > 1e4) return null
  }
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (at(mid).range >= distance) hi = mid
    else lo = mid
  }
  const vs = hi
  const { H, vz } = at(vs)
  // 球要往下掉進去：最高點的水平距離要在目標之前
  if (H <= 0 || (H * vz) / GRAVITY > distance + 1e-9) return null
  const q = vs * c
  return {
    wheel: vs / (EXIT_RATIO * rx),
    exit: vs,
    // + 0：沒有側向速度時不要出現 -0
    yaw: Math.atan2(-motion.side, Math.sqrt(Math.max(0, q * q - motion.side * motion.side))) + 0,
    fieldExit: Math.hypot(H, vz),
    fieldAngle: Math.atan2(vz, H),
  }
}

/** 3F 邊移動邊射的設定 */
export interface MoveSetup {
  motion: RobotMotion
  /** 有補償：每一發照當時的距離和速度算轉速、底盤偏角。沒補償：照靜止的轉速表（只看距離），底盤正對目標 */
  compensate: boolean
  /** 轉速上限 rad/s：要的轉速超過就只給到上限（程式裡也會這樣夾住），那一發會打近 */
  maxWheel?: number
}

/** 每一發出射時機器人在哪、怎麼動（目標在原點；第一發時機器人在目標正前方 plan.goalDistance） */
export interface MovePose {
  /** 機器人位置 m（x 往目標，y 往左，以第一發時的方向為準） */
  x: number
  y: number
  distance: number
  /** 這時的往目標、側向速度（以這時面向目標為準） */
  motion: RobotMotion
}

export function movePose(plan: ShotPlan, motion: RobotMotion, t: number): MovePose {
  const tau = t - plan.firstShot
  const x = -plan.goalDistance + motion.toward * tau
  const y = motion.side * tau
  const d = Math.hypot(x, y)
  // u：往目標的單位向量；n：u 往左轉 90°
  const ux = d > 0 ? -x / d : 1
  const uy = d > 0 ? -y / d : 0
  return { x, y, distance: d, motion: { toward: motion.toward * ux + motion.side * uy, side: -motion.toward * uy + motion.side * ux } }
}

export interface MoveAim {
  pose: MovePose
  /** 這一發的目標轉速 rad/s */
  target: number
  /** 底盤偏角 rad */
  yaw: number
  /** 算不出來（太近、太遠、做不到）：沿用前一發的轉速、底盤正對目標 */
  solved: boolean
  /** 要的轉速超過上限，只給到上限 */
  capped: boolean
}

/** 每一發要設的轉速和底盤偏角 */
export function moveAims(mech: FlywheelMechanism, plan: ShotPlan, setup: MoveSetup): MoveAim[] {
  const rx = exitRadius(mech)
  let last = plan.target
  return Array.from({ length: plan.shots }, (_, i) => {
    const pose = movePose(plan, setup.motion, plan.firstShot + i * plan.interval)
    const p = { ...plan, goalDistance: pose.distance }
    const sol = setup.compensate ? solveMovingShot(rx, p, plan.angle, pose.motion) : stillShot(rx, p)
    if (sol) last = sol.wheel
    const capped = setup.maxWheel !== undefined && last > setup.maxWheel
    return { pose, target: capped ? setup.maxWheel! : last, yaw: sol ? sol.yaw : 0, solved: sol !== null, capped }
  })
}

/** 邊移動邊射：能打進的仰角範圍窄於這個就很難射（仰角差一點就不進），給參數修正意見 */
export const NARROW_WINDOW = (3 * Math.PI) / 180

/** 能打進、轉速又在上限內的仰角範圍 rad */
export interface AimWindow {
  lo: number
  hi: number
  width: number
}

/** 10°～85° 每 step 試一次，找能打進、轉速在上限內的仰角範圍；一個都沒有回傳 null */
export function moveWindow(rx: number, plan: ShotPlan, motion: RobotMotion, maxWheel: number, step = (0.5 * Math.PI) / 180): AimWindow | null {
  let lo = NaN
  let hi = NaN
  const n = Math.round(((75 * Math.PI) / 180) / step)
  for (let i = 0; i <= n; i++) {
    const a = (10 * Math.PI) / 180 + i * step
    const s = solveMovingShot(rx, plan, a, motion)
    if (s === null || s.wheel > maxWheel) continue
    if (Number.isNaN(lo)) lo = a
    hi = a
  }
  return Number.isNaN(lo) ? null : { lo, hi, width: hi - lo }
}

/** 修正意見改哪個參數：往目標速度、側向速度 m/s，目標距離 m，轉速上限 rad/s */
export type MoveFixParam = 'toward' | 'side' | 'distance' | 'limit'
export interface MoveFix {
  param: MoveFixParam
  /** 改成多少 */
  value: number
  /** 改了之後的仰角範圍 */
  window: AimWindow
}

/**
 * 邊移動邊射的參數修正意見：一次只改一個參數，找離現在最近、仰角範圍有 NARROW_WINDOW 以上的值。
 * 速度在 ±5 m/s（0.1 m/s 一格，同樣近的先挑慢的）、距離 0.5～15 m（0.1 m 一格）、轉速上限到 motorMax（1 rps 一格）裡找，找不到的不列。
 */
export function moveFixes(mech: FlywheelMechanism, plan: ShotPlan, motion: RobotMotion, maxWheel: number, motorMax: number): MoveFix[] {
  const rx = exitRadius(mech)
  const good = (w: AimWindow | null): w is AimWindow => w !== null && w.width >= NARROW_WINDOW - 1e-9
  const nearest = (cur: number, min: number, max: number, step: number, test: (v: number) => AimWindow | null) => {
    for (let k = 1; ; k++) {
      const cands = [cur - k * step, cur + k * step].map((v) => Math.round(v / step) * step).filter((v) => v >= min - 1e-9 && v <= max + 1e-9)
      if (!cands.length) return null
      for (const v of cands.sort((a, b) => Math.abs(a) - Math.abs(b))) {
        const w = test(v)
        if (good(w)) return { value: Number(v.toFixed(6)), window: w }
      }
    }
  }
  const out: MoveFix[] = []
  const push = (param: MoveFixParam, r: { value: number; window: AimWindow } | null) => r && out.push({ param, ...r })
  push('toward', nearest(motion.toward, -5, 5, 0.1, (v) => moveWindow(rx, plan, { ...motion, toward: v }, maxWheel)))
  push('side', nearest(motion.side, -5, 5, 0.1, (v) => moveWindow(rx, plan, { ...motion, side: v }, maxWheel)))
  push('distance', nearest(plan.goalDistance, 0.5, 15, 0.1, (v) => moveWindow(rx, { ...plan, goalDistance: v }, motion, maxWheel)))
  if (maxWheel < motorMax && good(moveWindow(rx, plan, motion, motorMax))) {
    const TAU_ = 2 * Math.PI
    for (let rps = Math.floor(maxWheel / TAU_) + 1; rps * TAU_ <= motorMax + 1e-9; rps++) {
      const w = moveWindow(rx, plan, motion, rps * TAU_)
      if (good(w)) {
        out.push({ param: 'limit', value: rps * TAU_, window: w })
        break
      }
    }
  }
  return out
}

export interface MoveOutcome extends ShotOutcome {
  pose: MovePose
  yaw: number
  /** 球掉到目標高度時的位置 m（目標在原點） */
  landX: number
  landY: number
  /** 偏右的距離 m（往左偏是負的；面向目標看） */
  side: number
}

/**
 * 邊移動邊射每一發落在哪：用模擬裡那一發的真實轉速，加上機器人速度。
 * miss 是往目標方向的遠近，side 是左右偏，落點離目標中心在開口一半以內算進（開口當成圓的）。
 */
export function moveOutcomes(res: FlywheelSimResult, mech: FlywheelMechanism, plan: ShotPlan, aims: MoveAim[]): MoveOutcome[] {
  const c = Math.cos(plan.angle)
  const sn = Math.sin(plan.angle)
  return res.shotTimes.map((at, i) => {
    const k = Math.min(res.vel.length - 1, Math.round(at / CONTROL_DT))
    const wheel = res.vel[k]
    const exit = exitSpeed(wheel, exitRadius(mech))
    const { pose, yaw } = aims[i]
    const d = pose.distance
    // 出射點在量距離那一點往目標方向前面 ahead；a 從量距離那一點算
    const ahead = releaseAhead(plan)
    const ux = d > 0 ? -pose.x / d : 1
    const uy = d > 0 ? -pose.y / d : 0
    // 球對地的水平速度：發射機構（往目標轉 yaw）+ 機器人
    const along = exit * c * Math.cos(yaw) + pose.motion.toward
    const left = exit * c * Math.sin(yaw) + pose.motion.side
    const vz = exit * sn
    const disc = vz * vz - 2 * GRAVITY * (plan.goalHeight - releaseHeight(plan))
    const T = disc < 0 ? NaN : (vz + Math.sqrt(disc)) / GRAVITY
    const a = along * T + ahead
    const l = left * T
    const landX = pose.x + a * ux - l * uy
    const landY = pose.y + a * uy + l * ux
    const miss = a - d
    const side = -l
    const range = Math.hypot(a, l)
    const hit = Number.isFinite(T) && Math.hypot(miss, side) <= plan.goalWidth / 2
    return { at, wheel, exit, release: at + CONTACT, range, miss: Number.isFinite(T) ? miss : NaN, hit, pose, yaw, landX, landY, side }
  })
}

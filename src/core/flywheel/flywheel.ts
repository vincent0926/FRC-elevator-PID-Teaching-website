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
  /** 出射點離地高度 m */
  height: number
  /** 目標離出射點的水平距離 m */
  goalDistance: number
  /** 目標高度 m（球往下掉經過這個高度的地方算落點；0 = 地面） */
  goalHeight: number
  /** 目標開口寬度 m：落點離目標距離在一半以內算進 */
  goalWidth: number
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
  goalDistance: 4.6,
  goalHeight: 2,
  goalWidth: 0.6,
}

/**
 * FRC 2026 REBUILT 的 HUB（2026 Game Manual）：開口前緣離地 72 in、六角形開口寬 41.7 in。
 * 只換目標高度和開口寬度，距離看你站哪裡射，不動。
 */
export const HUB_2026 = { goalHeight: 72 * 0.0254, goalWidth: 41.7 * 0.0254 }

/** lb → kg，取到 g（輸入框才不會出現一長串小數） */
const lbToKg = (lb: number) => Math.round(lb * 453.59237) / 1000
/** FRC 2026 REBUILT 的得分物件 FUEL（2026 Game Manual）：直徑 5.91 in 的泡棉球，0.448～0.500 lb */
export const GAME_PIECES_2026 = [
  { id: 'fuel', label: 'FUEL 中間值', mass: lbToKg((0.448 + 0.5) / 2) },
  { id: 'fuel-light', label: 'FUEL 最輕', mass: lbToKg(0.448) },
  { id: 'fuel-heavy', label: 'FUEL 最重', mass: lbToKg(0.5) },
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
}

export function simEnd(plan: ShotPlan): number {
  return plan.firstShot + (plan.shots - 1) * plan.interval + TAIL
}

export function simulateFlywheel(mech: FlywheelMechanism, gains: FlywheelGains, knobs: FlywheelKnobs, plan: ShotPlan): FlywheelSimResult {
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

/**
 * 球速與射程：拋體運動，不計空氣阻力、球的旋轉（近似模型）。
 * 球出去的速度 = EXIT_RATIO × ω × r，r 傳 exitRadius(mech)（對面有滾輪時會比輪子半徑大），跟模擬裡球帶走的角動量用同一個假設。
 */
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
export function wheelForGoal(r: number, plan: ShotPlan): number | null {
  const v = speedForRange(plan.goalDistance, plan.angle, plan.height, plan.goalHeight)
  return v === null ? null : v / (EXIT_RATIO * r)
}

/** 輪子轉速 rad/s → 到目標高度時的水平距離 m（打不到那麼高是 NaN） */
export function rangeAtWheel(w: number, r: number, plan: ShotPlan): number {
  return launchRange(exitSpeed(w, r), plan.angle, plan.height, plan.goalHeight)
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
  /** 往下掉經過目標高度時的水平距離 m；打不到那麼高是 NaN */
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
    const range = launchRange(exit, plan.angle, plan.height, plan.goalHeight)
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

/** 模式 1「算轉速和仰角」的一條候選軌跡 */
export interface TrajectoryOption {
  /** 出射仰角 rad */
  angle: number
  /** 打到目標中心要的輪子轉速 rad/s */
  wheel: number
  /** 出口球速 m/s */
  exit: number
  /** 轉速可以差多少還會進（比例，取偏低、偏高比較小的那邊）；算不出來是 null */
  tolerance: number | null
  /** 球往下掉進目標高度時跟水平的夾角 rad（越大越陡） */
  entry: number
  /** 最高點離地 m */
  apex: number
  /** 轉得到（不超過最高轉速的 90%） */
  reachable: boolean
}

/** 模式 1 列出來給人選的仰角：20° 到 75°，每 5° 一條 */
export const TRAJECTORY_ANGLES = Array.from({ length: 12 }, (_, i) => ((20 + i * 5) * Math.PI) / 180)

/**
 * 同一個距離，不同仰角各要多少轉速才會打到目標中心（往下掉進去）。打不進的仰角不列。
 * 容許誤差：開口近邊、遠邊各要多少轉速，跟中心比，取比較小的那邊。
 */
export function trajectoryOptions(mech: FlywheelMechanism, plan: ShotPlan, freeSpeed: number, angles = TRAJECTORY_ANGLES): TrajectoryOption[] {
  const rx = exitRadius(mech)
  const out: TrajectoryOption[] = []
  for (const angle of angles) {
    const p = { ...plan, angle }
    const wheel = wheelForGoal(rx, p)
    if (wheel === null) continue
    const exit = exitSpeed(wheel, rx)
    const near = wheelForGoal(rx, { ...p, goalDistance: plan.goalDistance - plan.goalWidth / 2 })
    const far = wheelForGoal(rx, { ...p, goalDistance: plan.goalDistance + plan.goalWidth / 2 })
    const tolerance = near === null || far === null ? null : Math.min(wheel - near, far - wheel) / wheel
    const T = flightTime(exit, angle, plan.height, plan.goalHeight)
    const vy = exit * Math.sin(angle) - GRAVITY * T
    out.push({
      angle,
      wheel,
      exit,
      tolerance,
      entry: Math.atan2(-vy, exit * Math.cos(angle)),
      apex: apexHeight(exit, angle, plan.height),
      reachable: wheel <= freeSpeed * 0.9,
    })
  }
  return out
}

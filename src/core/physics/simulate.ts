import { Slot0Controller, type Slot0Gains } from '../controller/slot0'
import { trapezoidProfile, type TrapezoidProfile } from '../profile'
import { applyCurrentLimit, stepRK4, type PlantParams, type PlantState } from './elevator'

/**
 * 閉迴路模擬：Motion Magic 軌跡 → Slot0 控制公式 → 受控體（RK4）。
 * 物理積分固定 1 ms；控制器依位置每 1 ms（TalonFX）或 20 ms（roboRIO）更新一次，
 * 中間維持上一筆輸出（零階保持）。
 *
 * 量測可以加延遲與雜訊（控制器看到的是延遲、加雜訊後的位置和速度；圖上畫的是真實位置）。
 * 有 slotByDirection 時照 Phoenix 6 的 Slot 切換：往上的移動用 Slot 0、往下用 Slot 1，
 * 在下達指令那一刻決定，之後保持到下一個指令。
 *
 * output 模擬馬達控制器本身的限制（控制公式算完之後才套用，跟真的控制器一樣）：
 *   輸出上限（TalonFX PeakForward/ReverseVoltage；SPARK MAX 輸出範圍，佔空比）
 *   軟體限位（到了就把那個方向的輸出設成 neutral，依 Brake / Coast 決定馬達短路或斷路）
 *   SPARK MAX 沒開電壓補償時，指令照 12 V 換成佔空比，電池沒電時實際電壓跟著變小
 */

export interface Move {
  /** 下達指令的時間（s） */
  time: number
  goal: number
}

export interface SimInput {
  plant: PlantParams
  gains: Slot0Gains
  motionMagic: { cruiseVelocity: number; acceleration: number }
  controlPeriod: number
  physicsDt?: number
  initialPosition: number
  moves: Move[]
  duration: number
  /** 到位判定的容許誤差（m），預設 1 cm */
  tolerance?: number
  /** 感測器：延遲（s）、位置雜訊標準差（m）、速度雜訊標準差（m/s） */
  sensor?: { delay: number; positionNoise: number; velocityNoise: number; seed?: number }
  /** 輸出電壓是否限制在電池電壓（預設 true；關掉只是教學用，真的馬達做不到） */
  voltageLimit?: boolean
  /** 依移動方向切換 Slot（往上 Slot 0、往下 Slot 1），覆蓋 gains 的 kS、kG */
  slotByDirection?: { up: { kS: number; kG: number }; down: { kS: number; kG: number } }
  /** 馬達控制器的輸出設定；沒給就是 TalonFX、不限輸出、沒有軟體限位、Brake */
  output?: OutputConfig
}

export interface OutputConfig {
  controller: 'talonfx' | 'sparkmax'
  /**
   * 往上、往下的最大輸出（都是正數）。
   * TalonFX：伏特（PeakForwardVoltage / −PeakReverseVoltage）；SPARK MAX：佔空比 0–1（closed loop 輸出範圍）
   */
  peakForward?: number
  peakReverse?: number
  /** 軟體限位（m，用控制器看到的位置判斷） */
  softLimit?: { forward: number; reverse: number }
  neutralMode?: 'brake' | 'coast'
  /** SPARK MAX 電壓補償（V）；null 表示沒開，佔空比 = 指令 / 12 V、實際電壓 = 佔空比 × 電池電壓 */
  voltageCompensation?: number | null
}

/** SPARK MAX 沒開電壓補償時，控制器把「伏特」換成佔空比用的名目電壓 */
export const NOMINAL_VOLTAGE = 12

/**
 * 控制器算出指令電壓 cmd 之後，馬達控制器實際輸出多少。
 * 回傳 neutral 表示被軟體限位擋下（輸出 0，依 neutralMode 短路或斷路）。
 */
export function applyOutputStage(cmd: number, measPos: number, supplyVoltage: number, o: OutputConfig | undefined): { u: number; clamped: boolean; neutral: boolean } {
  if (!o) return { u: cmd, clamped: false, neutral: false }
  let u = cmd
  let clamped = false
  if (o.controller === 'sparkmax') {
    const comp = o.voltageCompensation ?? null
    let duty = u / (comp ?? NOMINAL_VOLTAGE)
    const hi = Math.min(1, o.peakForward ?? 1)
    const lo = -Math.min(1, o.peakReverse ?? 1)
    if (duty > hi) (duty = hi), (clamped = true)
    if (duty < lo) (duty = lo), (clamped = true)
    // 開了電壓補償：佔空比 × 補償電壓，但不會超過電池電壓
    u = comp ? Math.max(-supplyVoltage, Math.min(supplyVoltage, duty * comp)) : duty * supplyVoltage
  } else {
    if (o.peakForward !== undefined && u > o.peakForward) (u = o.peakForward), (clamped = true)
    if (o.peakReverse !== undefined && u < -o.peakReverse) (u = -o.peakReverse), (clamped = true)
  }
  const sl = o.softLimit
  if (sl && ((measPos >= sl.forward && u > 0) || (measPos <= sl.reverse && u < 0))) return { u: 0, clamped, neutral: true }
  return { u, clamped, neutral: false }
}

/** 可重現的亂數（mulberry32 + Box–Muller），同一組輸入每次模擬結果都一樣 */
export function gaussianRng(seed: number): () => number {
  let a = seed >>> 0
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform())
}

export interface MoveMetrics {
  goal: number
  profileDuration: number
  /** 超過目標的最大距離（m），往下移動時為往下超過 */
  overshoot: number
  /** 軌跡結束後到穩定在容許誤差內的時間；null 表示時段結束前沒穩定 */
  settlingTime: number | null
  steadyStateError: number
  maxFollowingError: number
  peakStatorCurrent: number
  /** 輸出電壓飽和的時間比例 */
  saturationFraction: number
  currentLimitFraction: number
  /** 這段移動用的 Slot（0 或 1） */
  slot: 0 | 1
  /** 到位後（軌跡結束 0.3 s 起）輸出電壓的標準差（V）：kD 放大雜訊時會變大 */
  holdVoltageRipple: number
  /** 被軟體限位擋住（輸出 neutral）的時間比例 */
  softLimitFraction: number
  /** 觸發 Supply 電流限制的時間比例 */
  supplyLimitFraction: number
}

export interface SimResult {
  t: Float64Array
  pos: Float64Array
  vel: Float64Array
  refPos: Float64Array
  refVel: Float64Array
  refAcc: Float64Array
  voltage: Float64Array
  feedforward: Float64Array
  feedback: Float64Array
  statorCurrent: Float64Array
  supplyVoltage: Float64Array
  /** 所有馬達加起來的電池端電流（A）：正的是從電池拿電，負的是回充 */
  supplyCurrent: Float64Array
  moves: MoveMetrics[]
}

export function simulate(input: SimInput): SimResult {
  const dt = input.physicsDt ?? 0.001
  const ratio = Math.max(1, Math.round(input.controlPeriod / dt))
  const steps = Math.floor(input.duration / dt) + 1
  const tol = input.tolerance ?? 0.01
  const p = input.plant

  const out: SimResult = {
    t: new Float64Array(steps),
    pos: new Float64Array(steps),
    vel: new Float64Array(steps),
    refPos: new Float64Array(steps),
    refVel: new Float64Array(steps),
    refAcc: new Float64Array(steps),
    voltage: new Float64Array(steps),
    feedforward: new Float64Array(steps),
    feedback: new Float64Array(steps),
    statorCurrent: new Float64Array(steps),
    supplyVoltage: new Float64Array(steps),
    supplyCurrent: new Float64Array(steps),
    moves: [],
  }
  const saturated = new Uint8Array(steps)
  const limited = new Uint8Array(steps)
  const softBlocked = new Uint8Array(steps)
  const supplyLimitedArr = new Uint8Array(steps)
  const coastMode = input.output?.neutralMode === 'coast'

  const controller = new Slot0Controller({ ...input.gains }, p.batteryVoltage)
  const voltageLimit = input.voltageLimit ?? true
  const slotOf: (0 | 1)[] = []
  const sensor = input.sensor
  const delaySteps = sensor ? Math.max(0, Math.round(sensor.delay / dt)) : 0
  const histPos = new Float64Array(delaySteps + 1)
  const histVel = new Float64Array(delaySteps + 1)
  const noise = gaussianRng(sensor?.seed ?? 9427)
  const moves = [...input.moves].sort((a, b) => a.time - b.time)
  let moveIdx = -1
  let profile: TrapezoidProfile | null = null
  let profileStart = 0
  let holdGoal = input.initialPosition
  let s: PlantState = { pos: input.initialPosition, vel: 0 }
  let u = 0
  let ff = 0
  let fb = 0
  let sat = false
  let neutral = false
  let ref = { pos: s.pos, vel: 0, acc: 0 }
  let supplyVoltage = p.batteryVoltage

  let meas: PlantState = s
  for (let i = 0; i < steps; i++) {
    const t = i * dt
    if (sensor) {
      // 環形緩衝：histPos[i % n] 是這一步的真實值，取 delaySteps 步以前的
      const n = delaySteps + 1
      histPos[i % n] = s.pos
      histVel[i % n] = s.vel
      const k = i < delaySteps ? 0 : (i - delaySteps) % n
      meas = { pos: histPos[k] + sensor.positionNoise * noise(), vel: histVel[k] + sensor.velocityNoise * noise() }
    } else {
      meas = s
    }
    if (i % ratio === 0) {
      while (moveIdx + 1 < moves.length && moves[moveIdx + 1].time <= t + 1e-9) {
        moveIdx++
        const m = moves[moveIdx]
        // 軌跡從控制器看到的位置出發（Phoenix 6 用當下的量測位置）
        const from = meas.pos
        profile = trapezoidProfile(from, m.goal, input.motionMagic.cruiseVelocity, input.motionMagic.acceleration)
        profileStart = t
        holdGoal = m.goal
        const slot: 0 | 1 = input.slotByDirection && m.goal < from ? 1 : 0
        slotOf[moveIdx] = slot
        if (input.slotByDirection) Object.assign(controller.gains, slot ? input.slotByDirection.down : input.slotByDirection.up)
      }
      ref = profile ? profile.sample(t - profileStart) : { pos: holdGoal, vel: 0, acc: 0 }
      controller.peakVoltage = voltageLimit ? supplyVoltage : Infinity
      const c = controller.calculate(ref, meas, dt * ratio)
      const stage = applyOutputStage(c.output, meas.pos, supplyVoltage, input.output)
      u = stage.u
      neutral = stage.neutral
      ff = c.feedforward
      fb = c.feedback
      sat = c.saturated || stage.clamped
    }

    const coast = neutral && coastMode
    const drive = applyCurrentLimit(p, u, s.vel, coast)
    // 供電電流 ≈ Stator 電流 × 佔空比，用它估電池壓降
    // 有正負號：正的是從電池拿電，負的是回充（煞車往下時）
    const supplyCurrent = p.motorCount * drive.statorCurrent * (drive.effectiveVoltage / Math.max(supplyVoltage, 1))
    supplyVoltage = p.batteryVoltage - p.batteryResistance * Math.abs(supplyCurrent)

    out.t[i] = t
    out.pos[i] = s.pos
    out.vel[i] = s.vel
    out.refPos[i] = ref.pos
    out.refVel[i] = ref.vel
    out.refAcc[i] = ref.acc
    out.voltage[i] = drive.effectiveVoltage
    out.feedforward[i] = ff
    out.feedback[i] = fb
    out.statorCurrent[i] = drive.statorCurrent
    out.supplyVoltage[i] = supplyVoltage
    out.supplyCurrent[i] = supplyCurrent
    saturated[i] = sat ? 1 : 0
    limited[i] = drive.currentLimited ? 1 : 0
    softBlocked[i] = neutral ? 1 : 0
    supplyLimitedArr[i] = drive.supplyLimited ? 1 : 0

    s = stepRK4(p, s, u, dt, coast)
  }

  for (let k = 0; k < moves.length; k++) {
    const m = moves[k]
    const startIdx = Math.min(steps - 1, Math.ceil(m.time / dt - 1e-9))
    const endIdx = k + 1 < moves.length ? Math.min(steps, Math.ceil(moves[k + 1].time / dt - 1e-9)) : steps
    if (startIdx >= endIdx) continue
    const startPos = out.pos[startIdx]
    const dir = Math.sign(m.goal - startPos) || 1
    // 指標用的軌跡時間照真實起點算（有感測延遲時跟控制器看到的差一點點，可忽略）
    const prof = trapezoidProfile(startPos, m.goal, input.motionMagic.cruiseVelocity, input.motionMagic.acceleration)
    const profileEnd = m.time + prof.duration

    let overshoot = 0
    let lastOutside = -1
    let maxFollow = 0
    let peakI = 0
    let satCount = 0
    let limCount = 0
    let softCount = 0
    let supCount = 0
    let rs = 0
    let rs2 = 0
    let rn = 0
    for (let i = startIdx; i < endIdx; i++) {
      if (out.t[i] >= profileEnd + 0.3) {
        rs += out.voltage[i]
        rs2 += out.voltage[i] * out.voltage[i]
        rn++
      }
      const x = out.pos[i]
      maxFollow = Math.max(maxFollow, Math.abs(out.refPos[i] - x))
      peakI = Math.max(peakI, Math.abs(out.statorCurrent[i]))
      satCount += saturated[i]
      limCount += limited[i]
      softCount += softBlocked[i]
      supCount += supplyLimitedArr[i]
      if (out.t[i] >= profileEnd) {
        overshoot = Math.max(overshoot, (x - m.goal) * dir)
        if (Math.abs(x - m.goal) > tol) lastOutside = i
      }
    }
    const lastIdx = endIdx - 1
    const settled = Math.abs(out.pos[lastIdx] - m.goal) <= tol && out.t[lastIdx] >= profileEnd
    let settlingTime: number | null = null
    if (settled) settlingTime = lastOutside < 0 ? 0 : Math.max(0, out.t[lastOutside] + dt - profileEnd)
    const n = endIdx - startIdx
    out.moves.push({
      goal: m.goal,
      profileDuration: prof.duration,
      overshoot: Math.max(0, overshoot),
      settlingTime,
      steadyStateError: Math.abs(m.goal - out.pos[lastIdx]),
      maxFollowingError: maxFollow,
      peakStatorCurrent: peakI,
      saturationFraction: satCount / n,
      currentLimitFraction: limCount / n,
      slot: slotOf[k] ?? 0,
      holdVoltageRipple: rn > 1 ? Math.sqrt(Math.max(0, rs2 / rn - (rs / rn) ** 2)) : 0,
      softLimitFraction: softCount / n,
      supplyLimitFraction: supCount / n,
    })
  }
  return out
}

import { Slot0Controller, type Slot0Gains } from '../controller/slot0'
import { trapezoidProfile, type TrapezoidProfile } from '../profile'
import { applyCurrentLimit, stepRK4, type PlantParams, type PlantState } from './elevator'

/**
 * 閉迴路模擬：Motion Magic 軌跡 → Slot0 控制公式 → 受控體（RK4）。
 * 物理積分固定 1 ms；控制器依位置每 1 ms（TalonFX）或 20 ms（roboRIO）更新一次，
 * 中間維持上一筆輸出（零階保持）。
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
    moves: [],
  }
  const saturated = new Uint8Array(steps)
  const limited = new Uint8Array(steps)

  const controller = new Slot0Controller(input.gains, p.batteryVoltage)
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
  let ref = { pos: s.pos, vel: 0, acc: 0 }
  let supplyVoltage = p.batteryVoltage

  for (let i = 0; i < steps; i++) {
    const t = i * dt
    if (i % ratio === 0) {
      while (moveIdx + 1 < moves.length && moves[moveIdx + 1].time <= t + 1e-9) {
        moveIdx++
        const m = moves[moveIdx]
        profile = trapezoidProfile(s.pos, m.goal, input.motionMagic.cruiseVelocity, input.motionMagic.acceleration)
        profileStart = t
        holdGoal = m.goal
      }
      ref = profile ? profile.sample(t - profileStart) : { pos: holdGoal, vel: 0, acc: 0 }
      controller.peakVoltage = supplyVoltage
      const c = controller.calculate(ref, s, dt * ratio)
      u = c.output
      ff = c.feedforward
      fb = c.feedback
      sat = c.saturated
    }

    const drive = applyCurrentLimit(p, u, s.vel)
    // 供電電流 ≈ Stator 電流 × 佔空比，用它估電池壓降
    const supplyCurrent = p.motorCount * Math.abs(drive.statorCurrent * (drive.effectiveVoltage / Math.max(supplyVoltage, 1)))
    supplyVoltage = p.batteryVoltage - p.batteryResistance * supplyCurrent

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
    saturated[i] = sat ? 1 : 0
    limited[i] = drive.currentLimited ? 1 : 0

    s = stepRK4(p, s, u, dt)
  }

  for (let k = 0; k < moves.length; k++) {
    const m = moves[k]
    const startIdx = Math.min(steps - 1, Math.ceil(m.time / dt - 1e-9))
    const endIdx = k + 1 < moves.length ? Math.min(steps, Math.ceil(moves[k + 1].time / dt - 1e-9)) : steps
    if (startIdx >= endIdx) continue
    const startPos = out.pos[startIdx]
    const dir = Math.sign(m.goal - startPos) || 1
    const prof = trapezoidProfile(startPos, m.goal, input.motionMagic.cruiseVelocity, input.motionMagic.acceleration)
    const profileEnd = m.time + prof.duration

    let overshoot = 0
    let lastOutside = -1
    let maxFollow = 0
    let peakI = 0
    let satCount = 0
    let limCount = 0
    for (let i = startIdx; i < endIdx; i++) {
      const x = out.pos[i]
      maxFollow = Math.max(maxFollow, Math.abs(out.refPos[i] - x))
      peakI = Math.max(peakI, Math.abs(out.statorCurrent[i]))
      satCount += saturated[i]
      limCount += limited[i]
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
    })
  }
  return out
}

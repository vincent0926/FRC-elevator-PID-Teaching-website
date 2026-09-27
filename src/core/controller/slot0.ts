/**
 * Phoenix 6 Slot0 位置閉迴路（MotionMagicVoltage）的控制公式：
 *
 *   u = kS·sgn(v_ref) + kG + kV·v_ref + kA·a_ref + kP·e + kI·∫e + kD·ė
 *
 * - 前饋只用「參考」速度與加速度，不用量測值
 * - e = x_ref − x；ė 在連續時間等於 v_ref − v，這裡直接用量測速度計算
 * - kS 的正負號跟著 v_ref（Phoenix 6 預設 StaticFeedforwardSign = UseVelocitySign），v_ref = 0 時 kS 不作用
 * - 輸出限制在 ±peakVoltage
 * - 積分防飽和（anti-windup）是模擬器的教學選項，預設沒有；真的控制器怎麼處理積分，以 WPILib／CTRE 官方文件為準
 */

/**
 * 積分防飽和：
 *   none      一直積分（輸出頂到上限時積分還在長，就是積分飽和）
 *   clamp     輸出頂到上限、而且誤差還在把它往上限推時，暫停積分（條件積分）
 *   izone     誤差超過 iZone 就把積分清成 0，只在接近目標時積分（WPILib PIDController.setIZone 的做法）
 *   backCalc  反算：輸出被限制時，把「想要的 − 實際給的」回饋到積分，讓積分往回退（時間常數 tracking）
 */
export type AntiWindupMode = 'none' | 'clamp' | 'izone' | 'backCalc'
export interface AntiWindup {
  mode: AntiWindupMode
  /** I-Zone（m） */
  iZone?: number
  /** 反算的時間常數（s） */
  tracking?: number
}
export const DEFAULT_I_ZONE = 0.02
export const DEFAULT_TRACKING = 0.05

export interface Slot0Gains {
  kS: number
  kG: number
  kV: number
  kA: number
  kP: number
  kI: number
  kD: number
}

export interface Slot0Output {
  output: number
  feedforward: number
  proportional: number
  integral: number
  derivative: number
  /** 回授輸出 = P + I + D（診斷時看它偏哪一邊） */
  feedback: number
  saturated: boolean
}

export class Slot0Controller {
  private integral = 0
  gains: Slot0Gains
  peakVoltage: number
  antiWindup: AntiWindup

  constructor(gains: Slot0Gains, peakVoltage = 12, antiWindup: AntiWindup = { mode: 'none' }) {
    this.gains = gains
    this.peakVoltage = peakVoltage
    this.antiWindup = antiWindup
  }

  reset(): void {
    this.integral = 0
  }

  calculate(
    ref: { pos: number; vel: number; acc: number },
    meas: { pos: number; vel: number },
    dt: number,
  ): Slot0Output {
    const g = this.gains
    const e = ref.pos - meas.pos
    const eDot = ref.vel - meas.vel
    const aw = this.antiWindup
    const clamp = (v: number) => Math.max(-this.peakVoltage, Math.min(this.peakVoltage, v))

    const feedforward = g.kS * Math.sign(ref.vel) + g.kG + g.kV * ref.vel + g.kA * ref.acc
    const proportional = g.kP * e
    const derivative = g.kD * eDot

    let acc = this.integral
    if (g.kI !== 0) {
      if (aw.mode === 'izone' && Math.abs(e) > (aw.iZone ?? DEFAULT_I_ZONE)) acc = 0
      else acc += e * dt
      const raw0 = feedforward + proportional + derivative + g.kI * acc
      const out0 = clamp(raw0)
      if (out0 !== raw0) {
        // 條件積分：誤差還在把輸出往上限推，就不要再積
        if (aw.mode === 'clamp' && Math.sign(g.kI * e) === Math.sign(raw0 - out0)) acc = this.integral
        // 反算：把被限制掉的部分回饋給積分
        if (aw.mode === 'backCalc') acc += ((out0 - raw0) / g.kI) * (dt / (aw.tracking ?? DEFAULT_TRACKING))
      }
    }
    this.integral = acc

    const integral = g.kI * acc
    const feedback = proportional + integral + derivative
    const raw = feedforward + feedback
    const output = clamp(raw)
    return { output, feedforward, proportional, integral, derivative, feedback, saturated: output !== raw }
  }
}

/** 控制器位置決定控制週期。 */
export type ControllerLocation = 'talonfx' | 'roborio'
export const CONTROL_PERIOD: Record<ControllerLocation, number> = {
  talonfx: 0.001,
  roborio: 0.02,
}

/**
 * Phoenix 6 Slot0 位置閉迴路（MotionMagicVoltage）的控制公式：
 *
 *   u = kS·sgn(v_ref) + kG + kV·v_ref + kA·a_ref + kP·e + kI·∫e + kD·ė
 *
 * - 前饋只用「參考」速度與加速度，不用量測值
 * - e = x_ref − x；ė 在連續時間等於 v_ref − v，這裡直接用量測速度計算
 * - kS 的正負號跟著 v_ref（Phoenix 6 預設 StaticFeedforwardSign = UseVelocitySign），v_ref = 0 時 kS 不作用
 * - 輸出限制在 ±peakVoltage
 */

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

  constructor(gains: Slot0Gains, peakVoltage = 12) {
    this.gains = gains
    this.peakVoltage = peakVoltage
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
    if (g.kI !== 0) this.integral += e * dt

    const feedforward = g.kS * Math.sign(ref.vel) + g.kG + g.kV * ref.vel + g.kA * ref.acc
    const proportional = g.kP * e
    const integral = g.kI * this.integral
    const derivative = g.kD * eDot
    const feedback = proportional + integral + derivative
    const raw = feedforward + feedback
    const output = Math.max(-this.peakVoltage, Math.min(this.peakVoltage, raw))
    return { output, feedforward, proportional, integral, derivative, feedback, saturated: output !== raw }
  }
}

/** 控制器位置決定控制週期。 */
export type ControllerLocation = 'talonfx' | 'roborio'
export const CONTROL_PERIOD: Record<ControllerLocation, number> = {
  talonfx: 0.001,
  roborio: 0.02,
}

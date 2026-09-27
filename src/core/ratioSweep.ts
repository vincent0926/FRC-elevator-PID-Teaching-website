import { computeFeedforward } from './feedforward'
import type { ElevatorMechanism } from '../schema/parameterSet'

/**
 * 齒比掃描（參考 ReCalc 的做法）：其他機構資料不變，只換齒比，看
 *   跑完全程要多久（用 1F 的 Motion Magic 建議值，也就是速度、加速度上限的 75%）
 *   停在半空中每顆馬達要吃多少電流（kG / R）
 * 齒比小：跑得快但扛重力吃電流、起步加速度受電流限制；齒比大：省電流但最高速度低。
 */

export interface RatioPoint {
  ratio: number
  /** 跑完全程（0 → travel）的時間（s）；動不了時為 Infinity */
  travelTime: number
  kG: number
  /** 靜止撐住時每顆馬達的電流（A） */
  holdCurrent: number
  cruiseVelocity: number
  acceleration: number
}

/** 梯形軌跡從靜止走 d 公尺再停下所需時間 */
export function trapezoidTime(d: number, vMax: number, aMax: number): number {
  if (!(vMax > 0) || !(aMax > 0)) return Infinity
  if (d <= 0) return 0
  // 加速到 vMax 要走 v²/(2a)，加減速共 v²/a
  if ((vMax * vMax) / aMax >= d) return 2 * Math.sqrt(d / aMax)
  return d / vMax + vMax / aMax
}

export function ratioPoint(m: ElevatorMechanism, ratio: number): RatioPoint {
  const ff = computeFeedforward({ ...m, gearRatio: ratio })
  return {
    ratio,
    travelTime: trapezoidTime(m.travel, ff.cruiseVelocity, ff.acceleration),
    kG: ff.kG,
    holdCurrent: ff.kG / ff.motorResistance,
    cruiseVelocity: ff.cruiseVelocity,
    acceleration: ff.acceleration,
  }
}

/** 在 [min, max] 之間掃 steps 個齒比，同時回傳最快的那一個 */
export function sweepRatios(m: ElevatorMechanism, min = 3, max = 40, steps = 150): { points: RatioPoint[]; fastest: RatioPoint | null } {
  const points: RatioPoint[] = []
  for (let i = 0; i < steps; i++) points.push(ratioPoint(m, min + ((max - min) * i) / (steps - 1)))
  const ok = points.filter((p) => Number.isFinite(p.travelTime))
  const fastest = ok.length ? ok.reduce((a, b) => (b.travelTime < a.travelTime ? b : a)) : null
  return { points, fastest }
}

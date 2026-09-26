/**
 * Motion Magic 梯形軌跡（Jerk = 0）。
 * 從 start 移到 goal，速度上限 vMax、加速度上限 aMax，起訖速度皆為 0。
 * 距離太短到不了巡航速度時退化成三角形。
 */

export interface ProfileState {
  pos: number
  vel: number
  acc: number
}

export interface TrapezoidProfile {
  start: number
  goal: number
  /** 總時間（s） */
  duration: number
  /** 加速段時間 */
  accelTime: number
  /** 等速段時間 */
  cruiseTime: number
  peakVelocity: number
  sample(t: number): ProfileState
}

export function trapezoidProfile(start: number, goal: number, vMax: number, aMax: number): TrapezoidProfile {
  if (!(vMax > 0) || !(aMax > 0)) throw new RangeError('巡航速度與加速度必須大於 0')
  const dir = Math.sign(goal - start) || 1
  const dist = Math.abs(goal - start)

  let accelTime = vMax / aMax
  let accelDist = 0.5 * aMax * accelTime * accelTime
  let peak = vMax
  let cruiseTime: number
  if (2 * accelDist >= dist) {
    accelTime = Math.sqrt(dist / aMax)
    accelDist = dist / 2
    peak = aMax * accelTime
    cruiseTime = 0
  } else {
    cruiseTime = (dist - 2 * accelDist) / vMax
  }
  const duration = 2 * accelTime + cruiseTime

  function sample(t: number): ProfileState {
    let p: number, v: number, a: number
    if (t <= 0) {
      p = 0; v = 0; a = 0
    } else if (t < accelTime) {
      p = 0.5 * aMax * t * t; v = aMax * t; a = aMax
    } else if (t < accelTime + cruiseTime) {
      p = accelDist + peak * (t - accelTime); v = peak; a = 0
    } else if (t < duration) {
      const d = duration - t
      p = dist - 0.5 * aMax * d * d; v = aMax * d; a = -aMax
    } else {
      p = dist; v = 0; a = 0
    }
    return { pos: start + dir * p, vel: dir * v, acc: dir * a }
  }

  return { start, goal, duration, accelTime, cruiseTime, peakVelocity: peak, sample }
}

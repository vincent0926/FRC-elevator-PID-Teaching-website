/**
 * 單位換算。網站內部一律 SI（m、m/s、m/s²、kg、V），
 * 只有 codegen/ 與日誌欄位對應會用到這裡的換算。
 *
 * Phoenix 6 設定 SensorToMechanismRatio = 齒比後，機構 1 圈 = 鼓輪轉 1 圈 = 2πr 公尺。
 * 串級式若把「機構座標」定為最上層高度，1 圈 = 2πr × 最上層速度比。
 *
 * 注意 Phoenix 5 的速度單位是「每 100 ms 的感測器刻度」（2048 刻度/圈），
 * 與 Phoenix 6 的 rps 差 2048 × 10 = 20480 倍，舊範例的數字不能直接搬。
 */

export const GRAVITY = 9.81 // m/s²
export const PHOENIX5_VELOCITY_FACTOR = 20480

/** 機構轉 1 圈對應的線性距離（m）。 */
export function metersPerRotation(drumRadius: number, topSpeedRatio = 1): number {
  return 2 * Math.PI * drumRadius * topSpeedRatio
}

export interface SiGains {
  kS: number // V
  kG: number // V
  kV: number // V/(m/s)
  kA: number // V/(m/s²)
  kP: number // V/m
  kI: number // V/(m·s)
  kD: number // V/(m/s)
}

export interface RotationGains {
  kS: number // V
  kG: number // V
  kV: number // V/rps
  kA: number // V/(rps/s)
  kP: number // V/rot
  kI: number // V/(rot·s)
  kD: number // V/rps
}

/** SI → Phoenix 6 轉數制。kS、kG 是伏特，不用換；其餘乘上每圈公尺數。 */
export function siToRotations(g: SiGains, mPerRot: number): RotationGains {
  return {
    kS: g.kS,
    kG: g.kG,
    kV: g.kV * mPerRot,
    kA: g.kA * mPerRot,
    kP: g.kP * mPerRot,
    kI: g.kI * mPerRot,
    kD: g.kD * mPerRot,
  }
}

export function rotationsToSi(g: RotationGains, mPerRot: number): SiGains {
  return {
    kS: g.kS,
    kG: g.kG,
    kV: g.kV / mPerRot,
    kA: g.kA / mPerRot,
    kP: g.kP / mPerRot,
    kI: g.kI / mPerRot,
    kD: g.kD / mPerRot,
  }
}

/** m/s → rps、m/s² → rps/s（Motion Magic 巡航速度與加速度）。 */
export function linearToRotations(value: number, mPerRot: number): number {
  return value / mPerRot
}

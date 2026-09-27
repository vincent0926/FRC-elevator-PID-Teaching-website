import { ols, savitzkyGolayDerivative } from '../analysis/regression'
import { PHASES, segment } from '../analysis/segment'
import type { FeedforwardResult } from '../feedforward'
import type { AlignedLog } from '../log/fieldMap'
import type { ElevatorMechanism } from '../../schema/parameterSet'
import { plantFromMechanism, stepRK4, type PlantParams } from './elevator'

/**
 * 模型校正（3F 步驟 9）：讓模擬的電梯跟實機對得上。
 *
 * 1. 參數擬合：實機的輸出電壓 ~ kS·sgn(v) + kG + kV·v + kA·a（a 用 Savitzky-Golay 對速度微分）。
 *    這四個數就是受控體（伏特為力的單位），分別對應重力＋配重、反電動勢＋齒輪箱效率、等效質量、摩擦。
 * 2. 開迴路重播：把日誌記錄的輸出電壓直接餵給受控體，每一次移動從實測位置、速度出發，
 *    比較模擬和實測的位置。理論模型跟校正後模型都重播一次，吻合度用位置 RMS 誤差表示。
 *
 * 日誌的輸出電壓已經是限流後真正加在馬達上的電壓，重播時不再套電流限制與電池壓降。
 */

export interface PlantFitResult {
  kS: number
  kG: number
  kV: number
  kA: number
  r2: number
  n: number
}

export interface ReplayResult {
  t: Float64Array
  measured: Float64Array
  /** 重播的位置，不在重播視窗內的是 NaN */
  replayed: Float64Array
  /** 位置 RMS 誤差（m） */
  rms: number
  windows: number
}

export interface CalibrationResult {
  fit: PlantFitResult
  kGScale: number
  kVScale: number
  kAScale: number
  friction: number
  theory: ReplayResult
  calibrated: ReplayResult
  /** 吻合度夠高（RMS < 門檻）才標成「已校正模型」 */
  ok: boolean
  problems: string[]
}

/** 位置 RMS 誤差低於這個值才算校正成功 */
export const CALIBRATION_RMS_LIMIT = 0.01

const OFF = PHASES.indexOf('off')
const TRANSITION = PHASES.indexOf('transition')

export function fitPlantFromLog(log: AlignedLog): PlantFitResult | null {
  const { t, cols } = log
  const u = cols.appliedVolts
  const v = cols.velocity
  if (!u || !v || t.length < 20) return null
  const n = t.length
  const acc = savitzkyGolayDerivative(t, v, 0.12)
  const seg = segment(log)
  const supply = cols.supplyVoltage
  const vTh = Math.max(0.02, 0.05 * seg.vScale)
  const use = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const vmax = supply && Number.isFinite(supply[i]) ? supply[i] : 12
    // 移動中、不在相位交界（加速度跳變處 SG 會糊）、沒飽和
    if (seg.phase[i] === OFF || seg.phase[i] === TRANSITION) continue
    if (Math.abs(v[i]) < vTh || !Number.isFinite(acc[i]) || !Number.isFinite(u[i]) || Math.abs(u[i]) > vmax - 0.3) continue
    use[i] = 1
  }
  const fit = ols([Float64Array.from(v, Math.sign), new Float64Array(n).fill(1), v, acc], u, use)
  if (!fit) return null
  return { kS: fit.coef[0], kG: fit.coef[1], kV: fit.coef[2], kA: fit.coef[3], r2: fit.r2, n: fit.n }
}

/** 每一次移動：從軌跡開始前 0.1 s 到到位穩定段結束，用實測的輸出電壓開迴路重播 */
export function replayLog(log: AlignedLog, plant: PlantParams): ReplayResult {
  const { t, cols } = log
  const pos = cols.position!
  const vel = cols.velocity!
  const u = cols.appliedVolts!
  const n = t.length
  const replayed = new Float64Array(n).fill(NaN)
  const seg = segment(log)
  const p: PlantParams = { ...plant, statorCurrentLimit: null, batteryResistance: 0 }
  let se = 0
  let cnt = 0
  let windows = 0
  for (const m of seg.moves) {
    let a = m.startIdx
    while (a > 0 && t[m.startIdx] - t[a - 1] <= 0.1) a--
    const b = m.endIdx
    if (b - a < 5) continue
    windows++
    let s = { pos: pos[a], vel: vel[a] }
    replayed[a] = s.pos
    for (let i = a; i < b; i++) {
      // 日誌 50 Hz：兩筆之間電壓零階保持，物理用 1 ms 步長積分
      const span = t[i + 1] - t[i]
      const steps = Math.max(1, Math.round(span / 0.001))
      const dt = span / steps
      for (let k = 0; k < steps; k++) s = stepRK4(p, s, u[i], dt)
      replayed[i + 1] = s.pos
      const e = s.pos - pos[i + 1]
      se += e * e
      cnt++
    }
  }
  return { t, measured: pos, replayed, rms: cnt ? Math.sqrt(se / cnt) : NaN, windows }
}

export function calibrate(log: AlignedLog, mechanism: ElevatorMechanism, ff: FeedforwardResult): CalibrationResult | null {
  const fit = fitPlantFromLog(log)
  if (!fit) return null
  const problems: string[] = []
  if (fit.r2 < 0.9) problems.push(`擬合 R² 只有 ${fit.r2.toFixed(2)}：電壓和速度、加速度的關係不穩定，可能是機構卡住或資料有雜訊。`)
  if (!(fit.kV > 0) || !(fit.kA > 0)) problems.push('擬合出來的 kV 或 kA 不是正的，這份資料不能拿來校正（加速段太短或都沒在動）。')
  const kS = Math.max(0, fit.kS)
  const kVScale = fit.kV > 0 ? fit.kV / ff.kV : 1
  const kAScale = fit.kA > 0 ? fit.kA / ff.kA : 1
  const kGScale = ff.kG !== 0 ? fit.kG / ff.kG : 1
  const theory = replayLog(log, plantFromMechanism(mechanism, ff, { realistic: false }))
  const calibrated = replayLog(
    log,
    plantFromMechanism(mechanism, ff, { realistic: true, frictionKs: kS, frictionKsDown: kS, kGScale, kVScale, kAScale, currentLimit: false, batterySag: false }),
  )
  if (!theory.windows) problems.push('日誌裡沒有完整的移動，沒辦法重播。')
  const ok = problems.length === 0 && calibrated.rms < CALIBRATION_RMS_LIMIT
  if (problems.length === 0 && !ok) problems.push(`重播的位置誤差 ${(calibrated.rms * 100).toFixed(1)} cm，超過 ${CALIBRATION_RMS_LIMIT * 100} cm：模型還解釋不了這台電梯（可能有換級、拖鏈等隨高度變化的力）。`)
  return { fit, kGScale, kVScale, kAScale, friction: kS, theory, calibrated, ok, problems }
}

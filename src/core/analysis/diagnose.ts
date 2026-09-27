import type { Slot0Gains } from '../controller/slot0'
import type { AlignedLog } from '../log/fieldMap'
import type { CheckReport } from './checks'
import { ols, savitzkyGolayDerivative, type OlsResult } from './regression'
import { PHASES, segment, spansWhere, type Phase, type Segments } from './segment'

/**
 * 步驟 1–2：找問題、給建議。
 *
 * 問題排序（一次只處理最前面那一個）：
 *   物理限制 → 振盪 → 機構問題 → kG → kS → kV → kA → kP → kD
 *
 * 兩種迴歸分開做：
 *   前饋誤差分析  回授輸出 ~ sgn(v_ref) + 1 + v_ref + a_ref   係數就是「前饋還差多少」
 *   機構特性量測  輸出電壓 ~ sgn(v) + 1 + v + a（實際加速度，Savitzky-Golay 微分）  用來判斷機構是否正常
 */

export const ISSUE_ORDER = ['physical', 'oscillation', 'mechanism', 'kG', 'kS', 'kV', 'kA', 'kP', 'kD'] as const
export type IssueKey = (typeof ISSUE_ORDER)[number]

export const ISSUE_LABEL: Record<IssueKey, string> = {
  physical: '物理限制',
  oscillation: '振盪',
  mechanism: '機構問題',
  kG: 'kG 不對',
  kS: 'kS 不對（摩擦）',
  kV: 'kV 不對',
  kA: 'kA 不對',
  kP: 'kP 不夠（到位慢）',
  kD: 'kD 不夠（到位後超過、晃）',
}

export type GainKey = keyof Slot0Gains

export type ParamChange =
  | { kind: 'gain'; param: GainKey; from: number; to: number }
  | { kind: 'motionMagic'; cruiseVelocity: { from: number; to: number }; acceleration: { from: number; to: number } }

export interface Issue {
  key: IssueKey
  /** 一句話結論 */
  summary: string
  /** 支持這個判斷的數字 */
  evidence: string[]
  /** 要看的相位與圖（給引導模式的第二層提示） */
  lookAt: string
  spans: [number, number][]
  change?: ParamChange
  /** 沒有參數可改時（機構問題）給檢查清單 */
  checklist?: string[]
}

export interface FfErrorFit {
  /** 前饋還差多少（加到目前的值上） */
  dKs: number
  dKg: number
  dKv: number
  dKa: number
  fit: OlsResult
  /** 各係數標準誤（沒估的是 0） */
  se: Record<FfKey, number>
  /** kS、kG 分得開嗎（有上有下） */
  separable: boolean
  /** 速度幾乎都一樣時 kS 和 kV 分不開：dKs 放「巡航速度下往上往下的合併差值」，dKv = 0 */
  ksKvCombined: boolean
  /** kS、kV 是靠機構特性量測拆開的（準度較差，kS 門檻放寬） */
  splitByPlant: boolean
  /** 加速段太短，沒有估 kA（dKa = 0） */
  noKa: boolean
}

export interface PlantFit {
  kS: number
  kG: number
  kV: number
  kA: number
  fit: OlsResult
}

export interface LogMoveMetrics {
  dir: 1 | -1
  goal: number
  profileEnd: number
  /** 軌跡結束後多久進入容許誤差並不再出去；null = 觀察時間內沒穩定 */
  settlingTime: number | null
  overshoot: number
  finalError: number
}

export interface Oscillation {
  detected: boolean
  /** 高通後輸出電壓的 RMS（V），取最嚴重的視窗 */
  voltageRms: number
  /** 高通後位置的 RMS（m） */
  positionRms: number
  frequency: number
  spans: [number, number][]
}

export interface DiagnoseOptions {
  /** 閉迴路週期（s）：TalonFX 0.001、roboRIO 0.02 */
  controlPeriod?: number
  /** 到位容許誤差（m） */
  tolerance?: number
  statorCurrentLimit?: number
}

export interface Diagnosis {
  issues: Issue[]
  primary: Issue | null
  seg: Segments
  ffError: FfErrorFit | null
  plant: PlantFit | null
  oscillation: Oscillation
  moves: LogMoveMetrics[]
  notes: string[]
}

const PI = Object.fromEntries(PHASES.map((p, i) => [p, i])) as Record<Phase, number>
const isMoving = (ph: number) => ph === PI.accel || ph === PI.cruise || ph === PI.decel

/** 3 位有效數字，畫面與輸出都用這個精度 */
export function round3(x: number): number {
  if (!Number.isFinite(x) || x === 0) return 0
  const d = Math.pow(10, 2 - Math.floor(Math.log10(Math.abs(x))))
  return Math.round(x * d) / d
}

const V = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)} V`
const cm = (x: number) => `${(x * 100).toFixed(1)} cm`

/**
 * 回授輸出（P+I+D）。有記錄就直接用；否則用輸出電壓減前饋欄位；
 * 兩個都沒有時用目前參數算前饋再相減（不準，會提醒）。
 */
export function feedbackSignal(log: AlignedLog, seg: Segments, gains: Slot0Gains): { fb: Float64Array; source: 'logged' | 'ffColumn' | 'computed' } {
  const c = log.cols
  if (c.closedLoopOutput) return { fb: c.closedLoopOutput, source: 'logged' }
  const u = c.appliedVolts!
  if (c.feedforwardOutput) return { fb: Float64Array.from(u, (v, i) => v - c.feedforwardOutput![i]), source: 'ffColumn' }
  const fb = Float64Array.from(u, (v, i) => v - (gains.kS * Math.sign(seg.vref[i]) + gains.kG + gains.kV * seg.vref[i] + gains.kA * seg.aref[i]))
  return { fb, source: 'computed' }
}

/** 條件數超過這個值就當作欄位分不開 */
export const COND_LIMIT = 1e3

export type FfKey = 'kS' | 'kG' | 'kV' | 'kA'

/**
 * 前饋形式的迴歸 y ~ kS·sgn + kG + kV·v + kA·a，欄位依資料能分辨多少自動減少：
 *   只有一個方向 → 拿掉 sgn（kS 併入 kG）
 *   加速樣本太少 → 拿掉 a
 *   速度幾乎都一樣（sgn 和 v 共線）→ 拿掉 v，sgn 的係數是巡航速度下的合併值
 * transform 讓前饋誤差分析可以先把欄位過閉迴路濾波。
 */
export function adaptiveFfFit(
  y: ArrayLike<number>,
  use: Uint8Array,
  x: { sgn: Float64Array; v: Float64Array; a: Float64Array; ones: Float64Array },
  opt: { separable: boolean; enoughAccel: boolean; transform?: (c: Float64Array) => Float64Array },
): { coef: Record<FfKey, number>; se: Record<FfKey, number>; fit: OlsResult; ksKvCombined: boolean; noKa: boolean } | null {
  const tf = opt.transform ?? ((c: Float64Array) => c)
  const cache = new Map<FfKey, Float64Array>()
  const col = (k: FfKey) => {
    if (!cache.has(k)) cache.set(k, tf(k === 'kS' ? x.sgn : k === 'kG' ? x.ones : k === 'kV' ? x.v : x.a))
    return cache.get(k)!
  }
  const tryFit = (keys: FfKey[]) => {
    const f = ols(keys.map(col), y, use)
    return f ? { keys, f } : null
  }
  const keys: FfKey[] = ['kG']
  if (opt.separable) keys.push('kS')
  keys.push('kV')
  if (opt.enoughAccel) keys.push('kA')
  let r = tryFit(keys)
  let noKa = !opt.enoughAccel
  if ((!r || r.f.cond > COND_LIMIT) && keys.includes('kA')) {
    const r2 = tryFit(keys.filter((k) => k !== 'kA'))
    if (r2 && (!r || r2.f.cond < r.f.cond / 10)) {
      r = r2
      noKa = true
    }
  }
  let combined = false
  if ((!r || r.f.cond > COND_LIMIT) && opt.separable) {
    const r3 = tryFit((r ? r.keys : keys).filter((k) => k !== 'kV'))
    if (r3) {
      r = r3
      combined = true
    }
  }
  if (!r) return null
  const coef = { kS: 0, kG: 0, kV: 0, kA: 0 }
  const se = { kS: 0, kG: 0, kV: 0, kA: 0 }
  const res = r
  res.keys.forEach((k, j) => {
    coef[k] = res.f.coef[j]
    se[k] = res.f.se[j]
  })
  return { coef, se, fit: res.f, ksKvCombined: combined, noKa: noKa || !res.keys.includes('kA') }
}

/**
 * 從日誌推回機器人上當時的參數：前饋欄位對參考速度、加速度迴歸（應該幾乎完全吻合），
 * 回授欄位對誤差與誤差變化率迴歸得到 kP、kD。
 * 推不準的改用 fallback（使用者選的參數組），並列在 fromFallback：
 *   前饋很準時誤差只剩雜訊 → kP、kD；速度都一樣 → kS；加速段太短 → kA。
 * 欄位不夠時回傳 null，改讓使用者選。
 */
export function estimateRobotGains(
  log: AlignedLog,
  fallback: Pick<Slot0Gains, 'kS' | 'kA' | 'kP' | 'kD'>,
  seg?: Segments,
): { gains: Slot0Gains; r2: number; feedbackReliable: boolean; fromFallback: GainKey[] } | null {
  const c = log.cols
  if (!c.feedforwardOutput || !c.closedLoopOutput || !c.reference || !c.position || !c.velocity) return null
  const s = seg ?? segment(log)
  const n = log.t.length
  const use = new Uint8Array(n)
  let up = 0
  let down = 0
  for (let i = 0; i < n; i++) {
    const ph = s.phase[i]
    if (ph === PI.off || ph === PI.transition) continue
    use[i] = 1
    if (s.vref[i] > 0) up++
    else if (s.vref[i] < 0) down++
  }
  const sgn = Float64Array.from(s.vref, Math.sign)
  const ones = new Float64Array(n).fill(1)
  let nAcc = 0
  for (let i = 0; i < n; i++) if (use[i] && (s.phase[i] === PI.accel || s.phase[i] === PI.decel)) nAcc++
  const ff = adaptiveFfFit(c.feedforwardOutput, use, { sgn, v: s.vref, a: s.aref, ones }, { separable: up > 10 && down > 10, enoughAccel: nAcc >= 6 })
  if (!ff) return null
  let { kS, kV, kA } = ff.coef
  const kG = ff.coef.kG
  // 速度都一樣時分不出 kS 和 kV：kS 用使用者選的參數組，kV 由合併值反推
  if (ff.ksKvCombined) {
    kS = fallback.kS
    kV = (ff.coef.kS - kS) / Math.max(s.vScale, 1e-3)
  }
  if (ff.noKa) kA = fallback.kA

  const e = Float64Array.from(c.reference, (r, i) => r - c.position![i])
  const eDot = Float64Array.from(s.vref, (v, i) => v - c.velocity![i])
  const fbFit = ols([e, eDot], c.closedLoopOutput, use)
  // 回授要大到蓋過雜訊（> 0.1 V）才推得準
  let fbRms = 0
  let cnt = 0
  for (let i = 0; i < n; i++) if (use[i] && Number.isFinite(c.closedLoopOutput[i])) (fbRms += c.closedLoopOutput[i] ** 2), cnt++
  fbRms = Math.sqrt(fbRms / Math.max(1, cnt))
  const feedbackReliable = !!fbFit && fbFit.r2 > 0.8 && fbRms > 0.1 && fbFit.coef[0] > 0
  const clean = (x: number) => (Number.isFinite(x) ? round3(x) : 0)
  return {
    gains: {
      kS: Math.max(0, clean(kS)),
      kG: clean(kG),
      kV: clean(kV),
      kA: Math.max(0, clean(kA)),
      kP: feedbackReliable ? clean(fbFit!.coef[0]) : fallback.kP,
      kI: 0,
      kD: feedbackReliable ? Math.max(0, clean(fbFit!.coef[1])) : fallback.kD,
    },
    r2: ff.fit.r2,
    feedbackReliable,
    fromFallback: [
      ...(ff.ksKvCombined ? (['kS'] as const) : []),
      ...(ff.noKa ? (['kA'] as const) : []),
      ...(feedbackReliable ? [] : (['kP', 'kD'] as const)),
    ],
  }
}

/**
 * 閉迴路對前饋誤差的反應。前饋差 Δff 時，誤差 e 滿足
 *   kA·ë + (kV + kD)·ė + kP·e = Δff
 * 回授輸出 = kP·e + kD·ė = H(s)·Δff，穩態 H = 1，但加減速時會落後。
 * 迴歸前先把每個自變數都過一次 H(s)，加減速段的資料才能拿來用（kA、以及分開 kS 和 kV）。
 * 1 ms 子步；回授依控制週期零階保持（roboRIO 20 ms 的延遲會讓加減速段落後更多）；未 Enable 時狀態歸零。
 */
export function closedLoopFilter(
  t: Float64Array,
  x: Float64Array,
  g: Pick<Slot0Gains, 'kA' | 'kV' | 'kP' | 'kD'>,
  enabled?: (i: number) => boolean,
  controlPeriod = 0.001,
): Float64Array {
  const n = x.length
  const out = new Float64Array(n)
  const kA = Math.max(g.kA, 1e-4)
  const kV = Math.max(g.kV, 0)
  const kP = Math.max(g.kP, 0)
  const h = 0.001
  const every = Math.max(1, Math.round(controlPeriod / h))
  let e = 0
  let ed = 0
  let held = 0
  let tick = 0
  for (let i = 0; i < n; i++) {
    if (enabled && !enabled(i)) {
      e = 0
      ed = 0
      held = 0
      out[i] = 0
      continue
    }
    out[i] = held
    if (i + 1 < n) {
      const steps = Math.max(1, Math.min(200, Math.round((t[i + 1] - t[i]) / h)))
      const u = Number.isFinite(x[i]) ? x[i] : 0
      for (let k = 0; k < steps; k++) {
        // 控制器每 controlPeriod 算一次回授，中間維持（零階保持），跟模擬器與實機一樣
        if (tick++ % every === 0) held = kP * e + g.kD * ed
        // 半隱式 Euler：先更新速度再更新位置，剛性高時比較穩
        ed += (h * (u - kV * ed - held)) / kA
        e += h * ed
      }
    }
  }
  return out
}

function movingMean(x: Float64Array, half: number): Float64Array {
  const n = x.length
  const out = new Float64Array(n)
  let s = 0
  let c = 0
  let lo = 0
  let hi = -1
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(n - 1, i + half)
    while (hi < b) {
      hi++
      if (Number.isFinite(x[hi])) {
        s += x[hi]
        c++
      }
    }
    while (lo < a) {
      if (Number.isFinite(x[lo])) {
        s -= x[lo]
        c--
      }
      lo++
    }
    out[i] = c ? s / c : 0
  }
  return out
}

/**
 * 振盪：輸出電壓減掉 0.4 s 移動平均（高通），在 1 s 視窗內看 RMS 與過零次數（有遲滯）。
 * 軌跡的加減速切換只會造成一兩次過零，來回抖才會有很多次。
 */
export function detectOscillation(log: AlignedLog, seg: Segments): Oscillation {
  const { t, cols } = log
  const u = cols.appliedVolts
  const n = t.length
  const none: Oscillation = { detected: false, voltageRms: 0, positionRms: 0, frequency: 0, spans: [] }
  if (!u || n < 20) return none
  const dt = (t[n - 1] - t[0]) / (n - 1)
  const hp = (x: Float64Array) => {
    const m = movingMean(x, Math.max(2, Math.round(0.2 / dt)))
    return Float64Array.from(x, (v, i) => v - m[i])
  }
  const hu = hp(u)
  const err = cols.reference && cols.position ? hp(Float64Array.from(cols.reference, (r, i) => r - cols.position![i])) : null
  const w = Math.max(10, Math.round(1 / dt))
  const hyst = 0.1
  const flag = new Uint8Array(n)
  let worstRms = 0
  let worstPos = 0
  let worstFreq = 0
  for (let s = 0; s + w <= n; s += Math.max(1, Math.floor(w / 4))) {
    let sq = 0
    let psq = 0
    let cross = 0
    let state = 0
    let valid = 0
    for (let i = s; i < s + w; i++) {
      if (seg.phase[i] === PI.off || !Number.isFinite(hu[i])) continue
      valid++
      sq += hu[i] * hu[i]
      if (err) psq += err[i] * err[i]
      const st = hu[i] > hyst ? 1 : hu[i] < -hyst ? -1 : state
      if (state !== 0 && st !== state) cross++
      state = st
    }
    if (valid < w * 0.8) continue
    const rms = Math.sqrt(sq / valid)
    const freq = cross / 2 / (w * dt)
    // 至少 3 個完整週期、RMS 夠大
    if (cross >= 6 && rms > 0.15) {
      for (let i = s; i < s + w; i++) flag[i] = 1
      if (rms > worstRms) {
        worstRms = rms
        worstPos = err ? Math.sqrt(psq / valid) : 0
        worstFreq = freq
      }
    }
  }
  const spans = spansWhere(t, (i) => flag[i] === 1)
  return { detected: spans.length > 0, voltageRms: worstRms, positionRms: worstPos, frequency: worstFreq, spans }
}

/** 每次移動的到位指標（用日誌的目標與實際位置算）。 */
export function moveMetrics(log: AlignedLog, seg: Segments, tolerance: number): LogMoveMetrics[] {
  const { t, cols } = log
  const pos = cols.position!
  const out: LogMoveMetrics[] = []
  for (let k = 0; k < seg.moves.length; k++) {
    const m = seg.moves[k]
    const nextStart = k + 1 < seg.moves.length ? seg.moves[k + 1].startIdx : t.length
    // 最多看軌跡結束後 1.5 s
    let endIdx = m.profileEndIdx
    while (endIdx + 1 < nextStart && seg.phase[endIdx + 1] !== PI.off && t[endIdx + 1] - m.profileEnd <= 1.5) endIdx++
    if (t[endIdx] - m.profileEnd < 0.3) continue // 觀察時間太短，不算
    let overshoot = 0
    let lastOutside = -1
    for (let i = m.profileEndIdx; i <= endIdx; i++) {
      overshoot = Math.max(overshoot, (pos[i] - m.goal) * m.dir)
      if (Math.abs(pos[i] - m.goal) > tolerance) lastOutside = i
    }
    const finalError = Math.abs(pos[endIdx] - m.goal)
    out.push({
      dir: m.dir,
      goal: m.goal,
      profileEnd: m.profileEnd,
      settlingTime: finalError > tolerance ? null : lastOutside < 0 ? 0 : t[Math.min(endIdx, lastOutside + 1)] - m.profileEnd,
      overshoot: Math.max(0, overshoot),
      finalError,
    })
  }
  return out
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** 臨界阻尼附近的 kD：電梯近似 kA·s² + (kV + kD)·s + kP，取阻尼比 0.7 */
export function suggestedKd(g: Slot0Gains, zeta = 0.7): number {
  return Math.max(0, 2 * zeta * Math.sqrt(Math.max(0, g.kA * g.kP)) - g.kV)
}

/**
 * 電壓抖得很兇、位置卻幾乎沒動：抖動不是來自位置誤差（kP），也不會是 kI（積分不會抖這麼快），
 * 只剩 kD 乘上速度雜訊。真的振盪時 kP × 位置振幅 跟電壓振幅差不多；kD 放大雜訊時前者小很多。
 * 不看 kD 本身：TalonFX 用 1 kHz 的速度算 D，日誌 50 Hz 的速度看不到那些雜訊，kD 常常推不回來。
 */
export function isDerivativeNoise(osc: Oscillation, gains: Slot0Gains): boolean {
  // kP = 0 時乘積一定是 0，只有真的有 kD 才算 kD 放大雜訊
  return osc.voltageRms > 0 && (gains.kP > 0 || gains.kD > 0) && gains.kP * osc.positionRms < 0.3 * osc.voltageRms
}

function oscillationIssue(osc: Oscillation, gains: Slot0Gains, kPFactor: number): Issue {
  const evidence = [`高通後輸出電壓 RMS ${osc.voltageRms.toFixed(2)} V，約 ${osc.frequency.toFixed(1)} Hz`, `位置來回約 ±${cm(osc.positionRms * Math.SQRT2)}`]
  if (isDerivativeNoise(osc, gains)) {
    return {
      key: 'oscillation',
      summary: '輸出電壓一直抖，但位置幾乎沒動：不是 kP 造成的振盪，是 kD 把速度量測的雜訊放大了。降 kD，不要降 kP。',
      evidence: [
        ...evidence,
        `kP × 位置振幅只有 ${(gains.kP * osc.positionRms).toFixed(2)} V，解釋不了電壓的抖動`,
        gains.kD > 0 ? `目前 kD = ${gains.kD.toFixed(2)}` : '日誌看不出目前的 kD（TalonFX 用 1 kHz 的速度算 D）：把機器人上的 kD 改成 0 或原本的三分之一以下',
      ],
      lookAt: '電壓圖：到位後回授輸出（紅線）是不是一條很粗的毛線？位置圖卻幾乎是平的？',
      spans: osc.spans,
      change: gains.kD > 0 ? { kind: 'gain', param: 'kD', from: gains.kD, to: round3(Math.min(gains.kD * 0.3, Math.max(0, suggestedKd(gains)) || gains.kD * 0.1)) } : undefined,
    }
  }
  return {
    key: 'oscillation',
    summary: '輸出電壓來回抖。振盪會污染後面所有的分析，先把它壓下來。',
    evidence,
    lookAt: '電壓圖與位置圖：放大看有沒有一直來回的鋸齒，特別是靜止保持和到位穩定的時候。',
    spans: osc.spans,
    change: { kind: 'gain', param: 'kP', from: gains.kP, to: round3(gains.kP * kPFactor) },
  }
}

export function diagnose(log: AlignedLog, checks: CheckReport, gains: Slot0Gains, motionMagic: { cruiseVelocity: number; acceleration: number }, opt: DiagnoseOptions = {}): Diagnosis {
  const tol = opt.tolerance ?? 0.01
  const { t, cols } = log
  const n = t.length
  const seg = segment(log)
  const notes: string[] = []
  const issues: Issue[] = []
  const osc = detectOscillation(log, seg)
  const moves = moveMetrics(log, seg, tol)
  const { fb, source } = feedbackSignal(log, seg, gains)
  if (source === 'computed') notes.push('日誌裡沒有回授輸出或前饋欄位，回授是用「輸出電壓 − 目前參數算的前饋」估的，參數選錯結果就會錯。建議照範例程式記錄 ClosedLoopOutput。')
  if (source === 'ffColumn') notes.push('日誌裡沒有回授輸出欄位，改用「輸出電壓 − 前饋欄位」。飽和時會不準。')

  // 飽和或限流的樣本不拿來迴歸：那時候輸出不是控制器想要的值
  const sat = new Uint8Array(n)
  const u = cols.appliedVolts
  const supply = cols.supplyVoltage
  const cur = cols.statorCurrent
  for (let i = 0; i < n; i++) {
    if (u && Math.abs(u[i]) >= (supply && Number.isFinite(supply[i]) ? supply[i] : 12) - 0.3) sat[i] = 1
    if (cur && opt.statorCurrentLimit && Math.abs(cur[i]) >= opt.statorCurrentLimit * 0.95) sat[i] = 1
  }

  const ones = new Float64Array(n).fill(1)
  const on = (i: number) => seg.phase[i] !== PI.off
  const inOsc = (i: number) => osc.spans.some(([a, b]) => t[i] >= a && t[i] <= b)

  // ---------- 機構特性量測 ----------
  // 用實際速度與加速度（Savitzky-Golay 微分），避開相位交界：參考加速度在那裡跳，平滑後的實際加速度會糊
  let plant: PlantFit | null = null
  const vel = cols.velocity
  if (u && vel) {
    const acc = savitzkyGolayDerivative(t, vel, 0.12)
    const nearEdge = (i: number) => seg.phase[i] === PI.transition
    const useB = new Uint8Array(n)
    const vTh = Math.max(0.02, 0.05 * seg.vScale)
    for (let i = 0; i < n; i++) if (on(i) && !sat[i] && !nearEdge(i) && !inOsc(i) && Math.abs(vel[i]) > vTh && Number.isFinite(acc[i])) useB[i] = 1
    const sv = Float64Array.from(vel, Math.sign)
    const fitB = ols([sv, ones, vel, acc], u, useB)
    if (fitB) plant = { kS: fitB.coef[0], kG: fitB.coef[1], kV: fitB.coef[2], kA: fitB.coef[3], fit: fitB }
  }
  const plantOk = !!plant && plant.fit.cond < COND_LIMIT && plant.fit.r2 > 0.95 && plant.kV > 0 && plant.kA > 0

  // ---------- 前饋誤差分析 ----------
  // 飽和結束後誤差還在消，這段回授不是前饋誤差造成的，也不用
  const afterSat = new Uint8Array(n)
  for (let i = 0, last = -Infinity; i < n; i++) {
    if (sat[i]) last = t[i]
    if (t[i] - last < 0.25) afterSat[i] = 1
  }
  const useFf = new Uint8Array(n)
  let up = 0
  let down = 0
  for (let i = 0; i < n; i++) {
    if (!isMoving(seg.phase[i]) || afterSat[i] || inOsc(i)) continue
    useFf[i] = 1
    if (seg.vref[i] > 0) up++
    else down++
  }
  // 閉迴路反應由「真實機構」決定：量得到就用量測值，否則用目前參數
  const loop = { kP: gains.kP, kD: gains.kD, kA: plantOk ? plant!.kA : gains.kA, kV: plantOk ? plant!.kV : gains.kV }
  const H = (x: Float64Array) => closedLoopFilter(t, x, loop, on, opt.controlPeriod ?? 0.001)
  const sgn = Float64Array.from(seg.vref, Math.sign)
  const separable = up >= 10 && down >= 10
  let nAcc = 0
  for (let i = 0; i < n; i++) if (useFf[i] && (seg.phase[i] === PI.accel || seg.phase[i] === PI.decel)) nAcc++
  const vTyp = Math.max(seg.vScale, 1e-3)
  let ffError: FfErrorFit | null = null
  const fitA = adaptiveFfFit(fb, useFf, { sgn, v: seg.vref, a: seg.aref, ones }, { separable, enoughAccel: nAcc >= 10, transform: H })
  if (fitA) {
    const c = fitA.coef
    ffError = { dKs: c.kS, dKg: c.kG, dKv: c.kV, dKa: c.kA, fit: fitA.fit, se: { ...fitA.se }, separable, ksKvCombined: fitA.ksKvCombined, splitByPlant: false, noKa: fitA.noKa }
    if (!separable) notes.push(`只有往${up ? '上' : '下'}的移動，kS 和 kG 分不開，先當成都是 kG。錄一段上下來回的資料會比較準。`)
    if (fitA.noKa) notes.push('加速段太短（Motion Magic 加速度很大，50 Hz 的日誌只抓到一兩格），這份資料看不出 kA 對不對。想檢查 kA，錄一段加速度調低的。')
    if (fitA.ksKvCombined) {
      // 合併值 = ΔkS + ΔkV·v；機構特性量測（用實際速度，加減速時有變化）分得開就用它拆
      if (plantOk) {
        ffError.dKs = plant!.kS - gains.kS
        ffError.dKv = (c.kS - ffError.dKs) / vTyp
        ffError.se = { ...ffError.se, kV: ffError.se.kS / vTyp }
        ffError.ksKvCombined = false
        ffError.splitByPlant = true
        notes.push('移動時速度幾乎都一樣，kS 和 kV 是用機構特性量測拆開的，準度差一點。')
      } else {
        notes.push(`移動時速度幾乎都一樣，kS 和 kV 分不開：只知道在 ${vTyp.toFixed(2)} m/s 時往上往下差 ${V(c.kS * 2)}。錄一段 Motion Magic 速度只有一半的資料，就能分開。`)
      }
    }
  } else notes.push('移動的資料太少，沒辦法做前饋誤差分析。')

  // ---------- 物理限制 ----------
  // 只有「前饋修正好之後還是會頂到」才算物理限制；kA 太大或振盪造成的限流，修掉參數就沒了
  const phys = checks.items.filter((it) => (it.key === 'saturation' || it.key === 'currentLimit') && it.status !== 'pass' && it.status !== 'skip')
  if (phys.length) {
    let limited = 0
    let stillLimited = 0
    const g = ffError ? { kS: gains.kS + ffError.dKs, kG: gains.kG + ffError.dKg, kV: gains.kV + ffError.dKv, kA: gains.kA + ffError.dKa } : null
    const kVp = plantOk ? plant!.kV : (g?.kV ?? gains.kV)
    // 每安培要幾伏特（馬達電阻），用沒限流的樣本估：u − kV·v = R·I
    let sxy = 0
    let sxx = 0
    if (cur && vel && u) {
      for (let i = 0; i < n; i++) {
        if (!on(i) || sat[i] || Math.abs(cur[i]) < 5) continue
        sxy += (u[i] - kVp * vel[i]) * cur[i]
        sxx += cur[i] * cur[i]
      }
    }
    const R = sxx > 0 ? sxy / sxx : NaN
    for (let i = 0; i < n; i++) {
      if (!on(i) || !sat[i]) continue
      if (inOsc(i)) continue
      limited++
      if (!g) continue
      const ffStar = g.kS * Math.sign(seg.vref[i]) + g.kG + g.kV * seg.vref[i] + g.kA * seg.aref[i]
      const vmax = (supply && Number.isFinite(supply[i]) ? supply[i] : 12) - 0.3
      const iStar = R > 0 ? (ffStar - kVp * seg.vref[i]) / R : 0
      if (Math.abs(ffStar) >= vmax || (opt.statorCurrentLimit && Math.abs(iStar) >= opt.statorCurrentLimit)) stillLimited++
    }
    // 振盪時限流多半是振盪造成的，前饋迴歸也被污染，先處理振盪
    if (!osc.detected && (!ffError || limited === 0 || stillLimited > 0.5 * limited)) {
      const f = 0.8
      issues.push({
        key: 'physical',
        summary: '馬達在部分時間已經全力輸出，這段調任何參數都沒用，先把 Motion Magic 放慢。',
        evidence: phys.map((p) => `${p.label}：${p.detail}`),
        lookAt: '電壓圖：輸出電壓有沒有貼著電池電壓；電流圖：有沒有頂到限制。通常發生在加速段。',
        spans: phys.flatMap((p) => p.spans ?? []),
        change: {
          kind: 'motionMagic',
          cruiseVelocity: { from: motionMagic.cruiseVelocity, to: round3(motionMagic.cruiseVelocity * f) },
          acceleration: { from: motionMagic.acceleration, to: round3(motionMagic.acceleration * f) },
        },
      })
    } else {
      notes.push(`有 ${phys.map((p) => p.label).join('、')}，但算起來是參數錯${osc.detected ? '或振盪' : ''}造成的：前饋修正後就不會頂到。先處理下面的問題。`)
    }
  }

  // ---------- 振盪 ----------
  if (osc.detected) {
    issues.push(oscillationIssue(osc, gains, 0.6))
    if (!isDerivativeNoise(osc, gains)) notes.push('振盪時先降 kP。如果閉迴路在 roboRIO 上跑（50 Hz），延遲會讓振盪更容易發生，改用 TalonFX 內建的閉迴路（1 kHz）。')
  }

  // ---------- 機構問題 ----------
  // 排除振盪與激勵不足之後，機構模型還是解釋不了電壓 → 不是參數的問題
  const excitationOk = checks.items.find((i) => i.key === 'excitation')?.status === 'pass'
  if (plant && plant.fit.cond < COND_LIMIT && !osc.detected && excitationOk && (plant.fit.r2 < 0.85 || plant.kV <= 0)) {
    issues.push({
      key: 'mechanism',
      summary: '用馬達模型解釋不了這份資料：電壓和速度、加速度的關係亂掉了，通常是機構本身有問題，不是參數。',
      evidence: [`機構特性量測 R² = ${plant.fit.r2.toFixed(2)}（正常應 > 0.9）`, `量到 kV = ${plant.kV.toFixed(2)}、kA = ${plant.kA.toFixed(3)}`],
      lookAt: '速度圖：實際速度有沒有忽快忽慢、卡一下又衝出去；電流圖：同樣速度電流差很多。',
      spans: [],
      checklist: [
        '皮帶或鏈條鬆了、跳齒',
        '軌道卡住或某一段特別緊（用手推推看整個行程）',
        '線材勾到機構',
        '兩顆馬達方向或 follower 設定錯，互相對抗',
        '編碼器鬆脫、SensorToMechanismRatio 設錯',
      ],
    })
  }

  // ---------- kG、kS、kV、kA ----------
  if (ffError && !osc.detected && ffError.fit.n >= 30) {
    const f = ffError
    const { kS: seS, kG: seG, kV: seV, kA: seA } = f.se
    const aTyp = Math.max(seg.aScale, 1e-3)
    const holdSpans = spansWhere(t, (i) => seg.phase[i] === PI.hold || seg.phase[i] === PI.settle)
    const cruiseSpans = spansWhere(t, (i) => seg.phase[i] === PI.cruise)
    const accSpans = spansWhere(t, (i) => seg.phase[i] === PI.accel || seg.phase[i] === PI.decel)
    // 前饋誤差分析要顯著；機構特性量測（跟 kP 無關的另一種方法）量得準時，方向也要一致
    const sig = (d: number, s: number, th: number, plantDelta?: number) =>
      Math.abs(d) > th && Math.abs(d) > 3 * s && (plantDelta === undefined || (Math.sign(plantDelta) === Math.sign(d) && Math.abs(plantDelta) > 0.4 * th))
    const pd = plantOk
      ? { kS: plant!.kS - gains.kS, kG: plant!.kG - gains.kG, kV: plant!.kV - gains.kV, kA: plant!.kA - gains.kA }
      : { kS: undefined, kG: undefined, kV: undefined, kA: undefined }

    if (sig(f.dKg, seG, Math.max(0.05, 0.1 * Math.abs(gains.kG)), pd.kG)) {
      issues.push({
        key: 'kG',
        summary: `回授一直在幫忙${f.dKg > 0 ? '往上撐' : '往下壓'}：kG ${f.dKg > 0 ? '太小' : '太大'}。`,
        evidence: [`回授輸出的固定偏移 ${V(f.dKg)}（往上往下都一樣）`, `目前 kG = ${gains.kG.toFixed(3)} V`],
        lookAt: '電壓圖的靜止保持段：回授輸出（紅線）是不是一直偏同一邊？往上、往下移動時也一樣偏？',
        spans: holdSpans,
        change: { kind: 'gain', param: 'kG', from: gains.kG, to: round3(gains.kG + f.dKg) },
      })
    }
    if (f.separable && !f.ksKvCombined && sig(f.dKs, seS, f.splitByPlant ? 0.08 : 0.04, pd.kS)) {
      // kS 是機構的摩擦，量得到就直接用量測值；前饋誤差分析在靜摩擦附近會高估
      const to = Math.max(0, round3(plantOk ? plant!.kS : gains.kS + f.dKs))
      issues.push({
        key: 'kS',
        summary: `往上時回授${f.dKs > 0 ? '偏正' : '偏負'}、往下時${f.dKs > 0 ? '偏負' : '偏正'}，大小差不多：這是摩擦，kS ${f.dKs > 0 ? '太小' : '太大'}。`,
        evidence: [`往上偏 ${V(f.dKg + f.dKs)}、往下偏 ${V(f.dKg - f.dKs)}`, `差的一半就是 kS 要補的量：${V(f.dKs)}`, `目前 kS = ${gains.kS.toFixed(3)} V`],
        lookAt: '電壓圖的移動段：往上和往下時回授輸出的正負號是不是相反？（同號就是 kG）',
        spans: spansWhere(t, (i) => isMoving(seg.phase[i])),
        change: { kind: 'gain', param: 'kS', from: gains.kS, to },
      })
    }
    if (!f.ksKvCombined && sig(f.dKv * vTyp, seV * vTyp, Math.max(0.1, 0.05 * Math.abs(gains.kV) * vTyp), pd.kV === undefined ? undefined : pd.kV * vTyp)) {
      issues.push({
        key: 'kV',
        summary: `等速段回授輸出跟著速度變大、方向${f.dKv > 0 ? '相同' : '相反'}：kV ${f.dKv > 0 ? '太小，一直落後' : '太大，一直超前'}。`,
        evidence: [
          `在 ${vTyp.toFixed(2)} m/s 時回授要多補 ${V(f.dKv * vTyp)}`,
          `前饋還差 ${f.dKv >= 0 ? '+' : ''}${f.dKv.toFixed(3)} V/(m/s)，目前 kV = ${gains.kV.toFixed(3)}`,
        ],
        lookAt: '速度圖和位置圖的等速段：實際是不是一直落後（或超前）目標？電壓圖的回授輸出往上往下是不是正負相反、跟速度同方向？',
        spans: cruiseSpans,
        change: { kind: 'gain', param: 'kV', from: gains.kV, to: round3(gains.kV + f.dKv) },
      })
    }
    if (!f.noKa && sig(f.dKa * aTyp, seA * aTyp, Math.max(0.15, 0.15 * Math.abs(gains.kA) * aTyp), pd.kA === undefined ? undefined : pd.kA * aTyp)) {
      issues.push({
        key: 'kA',
        summary: `只有加速、減速的時候對不上：kA ${f.dKa > 0 ? '太小' : '太大'}。`,
        evidence: [`在 ${aTyp.toFixed(1)} m/s² 時回授要多補 ${V(f.dKa * aTyp)}`, `目前 kA = ${gains.kA.toFixed(4)}`],
        lookAt: '電壓圖的加速、減速段：回授輸出是不是只在速度變化時冒出來，等速時又回到 0？',
        spans: accSpans,
        change: { kind: 'gain', param: 'kA', from: gains.kA, to: Math.max(0, round3(gains.kA + f.dKa)) },
      })
    }
    // 往上往下需要的電壓不一樣（摩擦不對稱）：kG、kS 各補一半就是最佳解，不需要 Slot 1
    // kS、kV 分不開時 dKs 是兩者的合併值，不能拿來算往上往下各要多少
    if (issues.some((i) => i.key === 'kG' || i.key === 'kS') && f.separable && !f.ksKvCombined) {
      const upV = gains.kG + f.dKg + gains.kS + f.dKs
      const downV = gains.kG + f.dKg - (gains.kS + f.dKs)
      notes.push(
        `等速時往上需要 ${upV.toFixed(2)} V、往下 ${downV.toFixed(2)} V（不含 kV·v）。就算摩擦往上往下不一樣，把 kG、kS 照建議改好，kG 剛好落在靜摩擦範圍中間，一個 Slot 就夠；改好後指標還是不過，才考慮往下用 Slot 1。`,
      )
    }
    // 前饋誤差迴歸解釋不了、殘差又很大：可能是機構或雜訊
    if (f.fit.sigma > 0.5 && f.fit.r2 < 0.3 && !issues.some((i) => i.key === 'mechanism') && !osc.detected) {
      notes.push(`回授輸出有 ${f.fit.sigma.toFixed(2)} V 的變化解釋不了（R² ${f.fit.r2.toFixed(2)}）。如果重錄還是這樣，檢查機構。`)
    }
  }

  // ---------- kP、kD ----------
  if (moves.length && !osc.detected) {
    const unsettled = moves.filter((m) => m.settlingTime === null)
    const settleMed = median(moves.map((m) => m.settlingTime ?? 1.5))
    const worstFinal = Math.max(...moves.map((m) => m.finalError))
    const overs = moves.map((m) => m.overshoot)
    const overMed = median(overs)
    const settleSpans = spansWhere(t, (i) => seg.phase[i] === PI.settle)
    if (unsettled.length > 0 || settleMed > 0.3) {
      issues.push({
        key: 'kP',
        summary: '軌跡跑完之後，位置要很久才進到目標附近（或停在差一點的地方）：kP 不夠。前饋是常數，高度不同重力不一樣、摩擦不一樣的部分，只能靠回授補。',
        evidence: [
          `到位時間中位數 ${settleMed >= 1.5 ? '> 1.5' : settleMed.toFixed(2)} s（容許誤差 ${cm(tol)}）`,
          `最大殘留誤差 ${cm(worstFinal)}，${unsettled.length}/${moves.length} 次沒到位`,
        ],
        lookAt: '位置圖的到位穩定段：軌跡（虛線）停了以後，實際位置是不是慢慢爬過去、或停在差一點的地方？',
        spans: settleSpans,
        change: { kind: 'gain', param: 'kP', from: gains.kP, to: round3(Math.max(gains.kP * 1.5, 10)) },
      })
    }
    if (overMed > tol) {
      const target = suggestedKd(gains)
      issues.push({
        key: 'kD',
        summary: '到位時衝過頭再拉回來：阻尼不夠，加 kD。',
        evidence: [`超過目標的中位數 ${cm(overMed)}（容許 ${cm(tol)}）`, `目前 kD = ${gains.kD.toFixed(2)}，建議值由 kA、kP 算阻尼比 0.7`],
        lookAt: '位置圖的到位穩定段：實際位置有沒有超過目標再回來？',
        spans: settleSpans,
        change: { kind: 'gain', param: 'kD', from: gains.kD, to: round3(target > gains.kD * 1.2 ? target : Math.max(gains.kD * 1.5, 0.5)) },
      })
    }
  }

  issues.sort((a, b) => ISSUE_ORDER.indexOf(a.key) - ISSUE_ORDER.indexOf(b.key))
  return { issues, primary: issues[0] ?? null, seg, ffError, plant, oscillation: osc, moves, notes }
}

/**
 * 步驟 0 沒過的日誌：不做分析，但如果是在振盪，飽和、跟隨誤差多半是振盪造成的，
 * 直接告訴隊員先降 kP，而不是只說「放慢 Motion Magic」。
 */
export function oscillationBehindRefusal(log: AlignedLog, gains: Slot0Gains): Issue | null {
  const seg = segment(log)
  const osc = detectOscillation(log, seg)
  if (!osc.detected) return null
  const issue = oscillationIssue(osc, gains, 0.5)
  if (isDerivativeNoise(osc, gains)) return { ...issue, summary: '資料檢查沒過，但主因看起來是 kD 放大了雜訊：電壓一直抖、位置沒動。先把 kD 降下來再重錄。' }
  return {
    ...issue,
    summary: '資料檢查沒過，但主因看起來是振盪：電壓來回打到上下限。先把 kP 降下來再重錄，不要先去改 Motion Magic。',
    lookAt: '電壓圖與位置圖：放大看有沒有一直來回的鋸齒。',
  }
}

export function describeChange(c: ParamChange): string {
  if (c.kind === 'motionMagic') {
    return `Motion Magic 巡航速度 ${c.cruiseVelocity.from.toFixed(2)} → ${c.cruiseVelocity.to.toFixed(2)} m/s，加速度 ${c.acceleration.from.toFixed(2)} → ${c.acceleration.to.toFixed(2)} m/s²`
  }
  return `${c.param} ${round3(c.from)} → ${round3(c.to)}`
}

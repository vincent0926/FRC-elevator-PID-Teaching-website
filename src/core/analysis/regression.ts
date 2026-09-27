/**
 * 最小平方迴歸（小維度，正規方程 + 高斯消去）。
 * 除了係數，也給標準誤（判斷信心）、R² 與條件數（判斷激勵夠不夠、欄位是不是分不開）。
 */

export interface OlsResult {
  coef: number[]
  /** 係數標準誤 */
  se: number[]
  r2: number
  /** 殘差標準差 */
  sigma: number
  n: number
  /** 標準化後 XᵀX 的條件數；很大代表欄位共線（例如只有往上的資料，kS 和 kG 分不開） */
  cond: number
}

/**
 * @param cols 自變數欄位（每欄長度 = 資料長度）
 * @param y 應變數
 * @param use 哪些樣本要用（1 = 用）
 */
export function ols(cols: ArrayLike<number>[], y: ArrayLike<number>, use: Uint8Array): OlsResult | null {
  const p = cols.length
  const xtx = Array.from({ length: p }, () => new Array<number>(p).fill(0))
  const xty = new Array<number>(p).fill(0)
  let n = 0
  let sy = 0
  let syy = 0
  const row = new Array<number>(p)
  for (let i = 0; i < y.length; i++) {
    if (!use[i]) continue
    let ok = Number.isFinite(y[i])
    for (let j = 0; j < p && ok; j++) {
      row[j] = cols[j][i]
      ok = Number.isFinite(row[j])
    }
    if (!ok) continue
    n++
    sy += y[i]
    syy += y[i] * y[i]
    for (let a = 0; a < p; a++) {
      xty[a] += row[a] * y[i]
      for (let b = a; b < p; b++) xtx[a][b] += row[a] * row[b]
    }
  }
  if (n <= p) return null
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) xtx[a][b] = xtx[b][a]

  const inv = invert(xtx)
  if (!inv) return null
  const coef = inv.map((r) => r.reduce((s, v, j) => s + v * xty[j], 0))

  // 殘差平方和 = yᵀy − βᵀXᵀy
  let sse = syy
  for (let j = 0; j < p; j++) sse -= coef[j] * xty[j]
  sse = Math.max(0, sse)
  const sst = syy - (sy * sy) / n
  const sigma2 = sse / (n - p)
  return {
    coef,
    se: inv.map((r, j) => Math.sqrt(Math.max(0, r[j] * sigma2))),
    r2: sst > 1e-12 ? 1 - sse / sst : 0,
    sigma: Math.sqrt(sigma2),
    n,
    cond: conditionNumber(xtx),
  }
}

function invert(m: number[][]): number[][] | null {
  const p = m.length
  const a = m.map((r, i) => [...r, ...Array.from({ length: p }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < p; c++) {
    let piv = c
    for (let r = c + 1; r < p; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r
    if (Math.abs(a[piv][c]) < 1e-12) return null
    ;[a[c], a[piv]] = [a[piv], a[c]]
    const d = a[c][c]
    for (let j = 0; j < 2 * p; j++) a[c][j] /= d
    for (let r = 0; r < p; r++) {
      if (r === c) continue
      const f = a[r][c]
      if (f !== 0) for (let j = 0; j < 2 * p; j++) a[r][j] -= f * a[c][j]
    }
  }
  return a.map((r) => r.slice(p))
}

/** 先把 XᵀX 標準化成相關矩陣（去掉單位的影響），再用 Jacobi 求特徵值。 */
export function conditionNumber(xtx: number[][]): number {
  const p = xtx.length
  const d = xtx.map((r, i) => Math.sqrt(Math.max(r[i], 1e-300)))
  const a = xtx.map((r, i) => r.map((v, j) => v / (d[i] * d[j])))
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) off += a[i][j] ** 2
    if (off < 1e-20) break
    for (let i = 0; i < p; i++) {
      for (let j = i + 1; j < p; j++) {
        if (Math.abs(a[i][j]) < 1e-15) continue
        const theta = (a[j][j] - a[i][i]) / (2 * a[i][j])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < p; k++) {
          const aki = a[k][i]
          const akj = a[k][j]
          a[k][i] = c * aki - s * akj
          a[k][j] = s * aki + c * akj
        }
        for (let k = 0; k < p; k++) {
          const aik = a[i][k]
          const ajk = a[j][k]
          a[i][k] = c * aik - s * ajk
          a[j][k] = s * aik + c * ajk
        }
      }
    }
  }
  const ev = a.map((r, i) => Math.abs(r[i]))
  const min = Math.min(...ev)
  return min > 1e-15 ? Math.max(...ev) / min : Infinity
}

/**
 * Savitzky-Golay 微分（二次多項式，等間距）。視窗用時間指定，依取樣率換成點數。
 * 機構特性量測要用實際加速度時用它，不要對位置直接微分兩次。
 */
export function savitzkyGolayDerivative(t: Float64Array, y: Float64Array, windowSec: number): Float64Array {
  const n = y.length
  const out = new Float64Array(n).fill(NaN)
  if (n < 5) return out
  const dt = (t[n - 1] - t[0]) / (n - 1)
  const half = Math.max(2, Math.round(windowSec / dt / 2))
  // 二次多項式擬合的一階導數權重：w_k = k / Σk²
  let denom = 0
  for (let k = -half; k <= half; k++) denom += k * k
  for (let i = half; i < n - half; i++) {
    let s = 0
    for (let k = -half; k <= half; k++) s += k * y[i + k]
    out[i] = s / (denom * dt)
  }
  return out
}

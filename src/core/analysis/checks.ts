import type { AlignedLog } from '../log/fieldMap'

/**
 * 步驟 0：資料檢查。任一項 fail 就拒絕分析，並說明原因。
 * 只看機器人 Enable 的時段（有對應 Enabled 欄位時）。
 */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface CheckItem {
  key: string
  label: string
  status: CheckStatus
  detail: string
  /** 有問題的時段，給圖表標示 */
  spans?: [number, number][]
}

export interface CheckOptions {
  statorCurrentLimit: number
  /** 跟隨誤差超過多少算失敗（m） */
  maxFollowingError?: number
  /** 參考速度至少要多大才算有激勵（m/s） */
  minExcitationVelocity?: number
  /** 手臂：位置是角度（rad），文字顯示度；門檻預設 10°、0.1 rad/s */
  angle?: boolean
}

export interface CheckReport {
  items: CheckItem[]
  ok: boolean
  enabledSeconds: number
}

function spansOf(t: Float64Array, flag: (i: number) => boolean, mask: Uint8Array): [number, number][] {
  const spans: [number, number][] = []
  let start = -1
  for (let i = 0; i < t.length; i++) {
    const on = mask[i] === 1 && flag(i)
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      spans.push([t[start], t[i - 1]])
      start = -1
    }
  }
  if (start >= 0) spans.push([t[start], t[t.length - 1]])
  return spans
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function runDataChecks(log: AlignedLog, opt: CheckOptions): CheckReport {
  const { t, cols } = log
  const n = t.length
  const items: CheckItem[] = []
  const mask = new Uint8Array(n)
  const en = cols.enabled
  let active = 0
  for (let i = 0; i < n; i++) {
    mask[i] = !en || en[i] === 1 ? 1 : 0
    active += mask[i]
  }
  let enabledSeconds = 0
  for (let i = 1; i < n; i++) if (mask[i] && mask[i - 1]) enabledSeconds += t[i] - t[i - 1]

  if (active < 50) {
    items.push({ key: 'enabled', label: '有效資料', status: 'fail', detail: en ? 'Enable 的時間太短（少於 50 筆），沒有東西可以分析。' : '資料少於 50 筆。' })
    return { items, ok: false, enabledSeconds }
  }

  const frac = (flag: (i: number) => boolean) => {
    let c = 0
    for (let i = 0; i < n; i++) if (mask[i] && flag(i)) c++
    return c / active
  }

  // 電壓飽和
  const volts = cols.appliedVolts
  const supply = cols.supplyVoltage
  if (volts) {
    const sat = (i: number) => Math.abs(volts[i]) >= (supply && Number.isFinite(supply[i]) ? supply[i] : 12) - 0.3
    const f = frac(sat)
    items.push({
      key: 'saturation',
      label: '電壓飽和',
      status: f > 0.1 ? 'fail' : f > 0.02 ? 'warn' : 'pass',
      detail: f > 0.02 ? `輸出貼著電池電壓的時間占 ${pct(f)}。馬達已經全力了，調 PID 沒有用：降低 Motion Magic 速度或加速度。` : `飽和時間 ${pct(f)}，正常。`,
      spans: spansOf(t, sat, mask),
    })
  } else items.push({ key: 'saturation', label: '電壓飽和', status: 'skip', detail: '沒有對應輸出電壓欄位。' })

  // 電流限制
  const cur = cols.statorCurrent
  if (cur) {
    const lim = (i: number) => Math.abs(cur[i]) >= opt.statorCurrentLimit * 0.95
    const f = frac(lim)
    items.push({
      key: 'currentLimit',
      label: '電流限制',
      status: f > 0.1 ? 'fail' : f > 0.02 ? 'warn' : 'pass',
      detail: f > 0.02 ? `碰到 Stator 電流限制（${opt.statorCurrentLimit} A）的時間占 ${pct(f)}。這段馬達出不了更多力，屬於物理限制。` : `觸發電流限制 ${pct(f)}，正常。`,
      spans: spansOf(t, lim, mask),
    })
  } else items.push({ key: 'currentLimit', label: '電流限制', status: 'skip', detail: '沒有對應 Stator 電流欄位。' })

  // 電池電壓
  if (supply) {
    let min = Infinity
    let first = NaN
    for (let i = 0; i < n; i++) {
      if (!mask[i] || !Number.isFinite(supply[i])) continue
      if (Number.isNaN(first)) first = supply[i]
      min = Math.min(min, supply[i])
    }
    const status: CheckStatus = min < 8 ? 'fail' : first < 12.3 || min < 10 ? 'warn' : 'pass'
    items.push({
      key: 'battery',
      label: '電池電壓',
      status,
      detail: `開始 ${first.toFixed(2)} V，最低 ${min.toFixed(2)} V。${first < 12.3 ? '開始前電池就不夠滿（建議 12.5 V 以上），kG、kV 會被估得偏大。' : ''}${min < 8 ? '掉到 8 V 以下，roboRIO 可能已經限電（brownout）。' : ''}`,
    })
  } else items.push({ key: 'battery', label: '電池電壓', status: 'skip', detail: '沒有對應電池電壓欄位。' })

  // 掉資料
  const dts: number[] = []
  for (let i = 1; i < n; i++) if (mask[i] && mask[i - 1]) dts.push(t[i] - t[i - 1])
  if (dts.length) {
    const sorted = [...dts].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    let gapTime = 0
    let gaps = 0
    for (const d of dts) if (d > median * 5) { gaps++; gapTime += d }
    const f = gapTime / Math.max(enabledSeconds, 1e-9)
    items.push({
      key: 'dropout',
      label: '掉資料',
      status: f > 0.05 ? 'fail' : gaps > 0 ? 'warn' : 'pass',
      detail: `取樣週期中位數 ${(median * 1000).toFixed(1)} ms，超過 5 倍的空檔 ${gaps} 處${gaps ? `，合計 ${gapTime.toFixed(2)} s` : ''}。`,
    })
  }

  // 跟隨誤差
  const pos = cols.position
  const ref = cols.reference
  const maxErr = opt.maxFollowingError ?? (opt.angle ? (10 * Math.PI) / 180 : 0.1)
  if (pos && ref) {
    let worst = 0
    for (let i = 0; i < n; i++) if (mask[i] && Number.isFinite(ref[i])) worst = Math.max(worst, Math.abs(ref[i] - pos[i]))
    const big = (i: number) => Math.abs(ref[i] - pos[i]) > maxErr
    items.push({
      key: 'following',
      label: '跟隨誤差',
      status: worst > maxErr ? 'fail' : worst > maxErr / 2 ? 'warn' : 'pass',
      detail: `最大跟隨誤差 ${opt.angle ? `${((worst * 180) / Math.PI).toFixed(1)}°` : `${(worst * 100).toFixed(1)} cm`}。${worst > maxErr ? '誤差大到不正常：先確認方向、單位、有沒有卡住，再談調參。' : ''}`,
      spans: spansOf(t, big, mask),
    })
  }

  // 激勵是否足夠
  const vref = cols.referenceSlope ?? cols.velocity
  if (vref) {
    const minV = opt.minExcitationVelocity ?? 0.1
    let up = 0
    let down = 0
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue
      if (vref[i] > minV) up++
      else if (vref[i] < -minV) down++
    }
    const status: CheckStatus = up === 0 && down === 0 ? 'fail' : up === 0 || down === 0 ? 'warn' : 'pass'
    items.push({
      key: 'excitation',
      label: '激勵是否足夠',
      status,
      detail:
        status === 'fail'
          ? `速度一直低於 ${opt.angle ? `${((minV * 180) / Math.PI).toFixed(0)} °/s` : `${minV} m/s`}，看不出前饋對不對。請錄一段上下來回移動的資料。`
          : status === 'warn'
            ? `只有往${up ? '上' : '下'}的移動，看不出上下是否對稱（kS、kG 分不開）。`
            : `往上 ${((up / active) * 100).toFixed(0)}%、往下 ${((down / active) * 100).toFixed(0)}% 的時間在移動。`,
    })
  }

  return { items, ok: !items.some((i) => i.status === 'fail'), enabledSeconds }
}

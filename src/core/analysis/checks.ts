import type { AlignedLog } from '../log/fieldMap'
import { t } from '../lang'

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
  const { t: time, cols } = log
  const n = time.length
  const items: CheckItem[] = []
  const mask = new Uint8Array(n)
  const en = cols.enabled
  let active = 0
  for (let i = 0; i < n; i++) {
    mask[i] = !en || en[i] === 1 ? 1 : 0
    active += mask[i]
  }
  let enabledSeconds = 0
  for (let i = 1; i < n; i++) if (mask[i] && mask[i - 1]) enabledSeconds += time[i] - time[i - 1]

  if (active < 50) {
    items.push({ key: 'enabled', label: t('有效資料', 'Usable data'), status: 'fail', detail: en ? t('Enable 的時間太短（少於 50 筆），沒有東西可以分析。', 'Enabled for too short (under 50 samples); nothing to analyze.') : t('資料少於 50 筆。', 'Fewer than 50 samples.') })
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
      label: t('電壓飽和', 'Voltage saturation'),
      status: f > 0.1 ? 'fail' : f > 0.02 ? 'warn' : 'pass',
      detail: f > 0.02 ? t(`輸出貼著電池電壓的時間占 ${pct(f)}。馬達已經全力了，調 PID 沒有用：降低 Motion Magic 速度或加速度。`, `Output was pinned to battery voltage ${pct(f)} of the time. The motor is already at full effort and tuning PID won’t help: lower the Motion Magic velocity or acceleration.`) : t(`飽和時間 ${pct(f)}，正常。`, `Saturated ${pct(f)} of the time, normal.`),
      spans: spansOf(time, sat, mask),
    })
  } else items.push({ key: 'saturation', label: t('電壓飽和', 'Voltage saturation'), status: 'skip', detail: t('沒有對應輸出電壓欄位。', 'No output voltage field mapped.') })

  // 電流限制
  const cur = cols.statorCurrent
  if (cur) {
    const lim = (i: number) => Math.abs(cur[i]) >= opt.statorCurrentLimit * 0.95
    const f = frac(lim)
    items.push({
      key: 'currentLimit',
      label: t('電流限制', 'Current limit'),
      status: f > 0.1 ? 'fail' : f > 0.02 ? 'warn' : 'pass',
      detail: f > 0.02 ? t(`碰到 Stator 電流限制（${opt.statorCurrentLimit} A）的時間占 ${pct(f)}。這段馬達出不了更多力，屬於物理限制。`, `Hit the stator current limit (${opt.statorCurrentLimit} A) ${pct(f)} of the time. The motor can’t give more force there; this is a physical limit.`) : t(`觸發電流限制 ${pct(f)}，正常。`, `Current limit triggered ${pct(f)}, normal.`),
      spans: spansOf(time, lim, mask),
    })
  } else items.push({ key: 'currentLimit', label: t('電流限制', 'Current limit'), status: 'skip', detail: t('沒有對應 Stator 電流欄位。', 'No stator current field mapped.') })

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
      label: t('電池電壓', 'Battery voltage'),
      status,
      detail: t(`開始 ${first.toFixed(2)} V，最低 ${min.toFixed(2)} V。${first < 12.3 ? '開始前電池就不夠滿（建議 12.5 V 以上），kG、kV 會被估得偏大。' : ''}${min < 8 ? '掉到 8 V 以下，roboRIO 可能已經限電（brownout）。' : ''}`, `Starts at ${first.toFixed(2)} V, lowest ${min.toFixed(2)} V. ${first < 12.3 ? 'The battery wasn’t full enough at the start (12.5 V or more recommended), so kG and kV will be estimated high. ' : ''}${min < 8 ? 'It dropped below 8 V, so the roboRIO may have browned out.' : ''}`),
    })
  } else items.push({ key: 'battery', label: t('電池電壓', 'Battery voltage'), status: 'skip', detail: t('沒有對應電池電壓欄位。', 'No battery voltage field mapped.') })

  // 掉資料
  const dts: number[] = []
  for (let i = 1; i < n; i++) if (mask[i] && mask[i - 1]) dts.push(time[i] - time[i - 1])
  if (dts.length) {
    const sorted = [...dts].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    let gapTime = 0
    let gaps = 0
    for (const d of dts) if (d > median * 5) { gaps++; gapTime += d }
    const f = gapTime / Math.max(enabledSeconds, 1e-9)
    items.push({
      key: 'dropout',
      label: t('掉資料', 'Dropped data'),
      status: f > 0.05 ? 'fail' : gaps > 0 ? 'warn' : 'pass',
      detail: t(
        `取樣週期中位數 ${(median * 1000).toFixed(1)} ms，超過 5 倍的空檔 ${gaps} 處${gaps ? `，合計 ${gapTime.toFixed(2)} s` : ''}。`,
        `Median sample period ${(median * 1000).toFixed(1)} ms; ${gaps} gaps over 5×${gaps ? `, ${gapTime.toFixed(2)} s in total` : ''}.`,
      ),
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
      label: t('跟隨誤差', 'Following error'),
      status: worst > maxErr ? 'fail' : worst > maxErr / 2 ? 'warn' : 'pass',
      detail: t(
        `最大跟隨誤差 ${opt.angle ? `${((worst * 180) / Math.PI).toFixed(1)}°` : `${(worst * 100).toFixed(1)} cm`}。${worst > maxErr ? '誤差大到不正常：先確認方向、單位、有沒有卡住，再談調參。' : ''}`,
        `Max following error ${opt.angle ? `${((worst * 180) / Math.PI).toFixed(1)}°` : `${(worst * 100).toFixed(1)} cm`}. ${worst > maxErr ? 'The error is abnormally large: check direction, units and whether it’s stuck before tuning.' : ''}`,
      ),
      spans: spansOf(time, big, mask),
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
      label: t('激勵是否足夠', 'Enough excitation'),
      status,
      detail:
        status === 'fail'
          ? t(
              `速度一直低於 ${opt.angle ? `${((minV * 180) / Math.PI).toFixed(0)} °/s` : `${minV} m/s`}，看不出前饋對不對。請錄一段上下來回移動的資料。`,
              `Velocity stayed below ${opt.angle ? `${((minV * 180) / Math.PI).toFixed(0)} °/s` : `${minV} m/s`}, so feedforward can’t be judged. Record a section moving up and down.`,
            )
          : status === 'warn'
            ? t(`只有往${up ? '上' : '下'}的移動，看不出上下是否對稱（kS、kG 分不開）。`, `Only moves going ${up ? 'up' : 'down'}, so up/down symmetry can’t be judged (kS and kG can’t be separated).`)
            : t(`往上 ${((up / active) * 100).toFixed(0)}%、往下 ${((down / active) * 100).toFixed(0)}% 的時間在移動。`, `Moving up ${((up / active) * 100).toFixed(0)}% and down ${((down / active) * 100).toFixed(0)}% of the time.`),
    })
  }

  return { items, ok: !items.some((i) => i.status === 'fail'), enabledSeconds }
}

import { t } from './lang'
/**
 * 兩點法量 kS、kG（不用 SysId）：
 *   慢慢加電壓，電梯剛好開始往上爬的電壓 V_up = kG + kS
 *   從撐住的電壓慢慢減，電梯剛好開始往下滑的電壓 V_down = kG − kS
 * 所以 kG = (V_up + V_down) / 2、kS = (V_up − V_down) / 2。
 */

export interface TwoPointResult {
  kG: number
  kS: number
  warnings: string[]
}

export function twoPointKsKg(vUp: number, vDown: number): TwoPointResult | { error: string } {
  if (!Number.isFinite(vUp) || !Number.isFinite(vDown)) return { error: t('兩個電壓都要填。', 'Fill in both voltages.') }
  if (vUp < vDown) return { error: t('往上爬的電壓應該比往下滑的大（摩擦會擋住兩個方向）。檢查是不是填反了。', 'The climbing voltage should be higher than the sliding voltage (friction resists both directions). Check whether they’re swapped.') }
  const kG = (vUp + vDown) / 2
  const kS = (vUp - vDown) / 2
  const warnings: string[] = []
  if (kS > 1) warnings.push(t('kS 超過 1 V：摩擦很大，先檢查滑軌、軸承、鏈條鬆緊。', 'kS is over 1 V: that’s a lot of friction; check the slides, bearings and chain tension first.'))
  if (vDown < 0) warnings.push(t('往下滑要給負電壓：配重、彈簧比重力還大，或摩擦大到電梯自己不會掉。', 'Sliding down needs negative voltage: the counterweight or springs outweigh gravity, or friction is so high the elevator won’t drop on its own.'))
  if (kS < 0.01) warnings.push(t('兩個電壓幾乎一樣：確認有「剛好開始動」才記錄，不是已經在動了。', 'The two voltages are almost the same: make sure you recorded the moment it “just starts moving”, not while it was already moving.'))
  return { kG, kS, warnings }
}

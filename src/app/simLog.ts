import type { ControllerLocation } from '../core/controller/slot0'
import type { AlignedLog } from '../core/log/fieldMap'

/**
 * 3F 把這次模擬的結果送去 2F 分析時帶過去的東西（只在記憶體，2F 讀走就清掉）。
 * 模擬時用的參數一起帶：2F 就不用從日誌猜機器人當時跑哪一組。
 */
export interface SimLogHandoff<P> {
  log: AlignedLog
  /** 2F 畫面上顯示的檔名 */
  name: string
  params: P
  /** 模擬時閉迴路在哪裡跑 */
  location: ControllerLocation
}

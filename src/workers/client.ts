import type { FeedforwardResult } from '../core/feedforward'
import type { RobustRanges, RobustResult } from '../core/physics/robustness'
import type { SimInput, SimResult } from '../core/physics/simulate'
import type { ElevatorMechanism } from '../schema/parameterSet'
import type { ScanResult, Series } from '../core/log/reader'
import type { SimRequest, SimResponse } from './sim.worker'
import type { LogRequest, LogResponse } from './log.worker'

/** 主執行緒這邊的 Worker 介面：Promise 化，模擬只保留最新一次的結果。 */

let simWorker: Worker | null = null
let simSeq = 0
const simPending = new Map<number, { channel: string; resolve: (r: never) => void; reject: (e: Error) => void }>()

function getSimWorker(): Worker {
  if (!simWorker) {
    simWorker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
    simWorker.onmessage = (ev: MessageEvent<SimResponse>) => {
      const p = simPending.get(ev.data.id)
      if (!p) return
      simPending.delete(ev.data.id)
      const d = ev.data
      if (!d.ok) p.reject(new Error(d.error))
      else p.resolve(('robust' in d ? d.robust : d.result) as never)
    }
  }
  return simWorker
}

/**
 * 連續拖滑桿時，同一個 channel 的舊請求會被標成過期（reject 'stale'），畫面只畫最新的。
 * 疊圖比較用不同 channel，兩組模擬互不取消。
 */
function simCall<T>(channel: string, build: (id: number) => SimRequest): Promise<T> {
  const id = ++simSeq
  for (const [k, p] of simPending) {
    if (p.channel !== channel) continue
    p.reject(new Error('stale'))
    simPending.delete(k)
  }
  return new Promise<T>((resolve, reject) => {
    simPending.set(id, { channel, resolve: resolve as (r: never) => void, reject })
    getSimWorker().postMessage(build(id))
  })
}

export function runSimulation(input: SimInput, channel = 'main'): Promise<SimResult> {
  return simCall<SimResult>(channel, (id) => ({ id, kind: 'sim', input }))
}

/** 穩健性測試：幾十次模擬在 Worker 裡一次跑完，只傳回最差那一次的曲線 */
export function runRobustnessTest(base: SimInput, mechanism: ElevatorMechanism, ff: FeedforwardResult, ranges: RobustRanges): Promise<RobustResult> {
  return simCall<RobustResult>('robust', (id) => ({ id, kind: 'robust', base, mechanism, ff, ranges }))
}

let logSeq = 0

function logCall<T>(build: (id: number) => LogRequest, pick: (r: LogResponse) => T | undefined, onProgress?: (f: number) => void): Promise<T> {
  const worker = new Worker(new URL('./log.worker.ts', import.meta.url), { type: 'module' })
  const id = ++logSeq
  return new Promise<T>((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent<LogResponse>) => {
      const r = ev.data
      if (r.id !== id) return
      if (r.kind === 'progress') return onProgress?.(r.fraction)
      worker.terminate()
      if (r.kind === 'error') return reject(new Error(r.error))
      const v = pick(r)
      if (v === undefined) reject(new Error('Worker 回傳格式不對'))
      else resolve(v)
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || '日誌 Worker 發生錯誤'))
    }
    worker.postMessage(build(id))
  })
}

export function scanLog(file: Blob, onProgress?: (f: number) => void): Promise<ScanResult> {
  return logCall((id) => ({ id, kind: 'scan', file }), (r) => (r.kind === 'scan' ? r.result : undefined), onProgress)
}

export function extractLog(file: Blob, names: string[], onProgress?: (f: number) => void): Promise<Map<string, Series>> {
  return logCall(
    (id) => ({ id, kind: 'extract', file, names }),
    (r) => (r.kind === 'extract' ? new Map(r.series.map((s) => [s.name, s])) : undefined),
    onProgress,
  )
}

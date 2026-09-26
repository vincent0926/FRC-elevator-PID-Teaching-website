/// <reference lib="webworker" />
import { blobChunks, extractSeries, scanWpilog, type ScanResult, type Series } from '../core/log/reader'

export type LogRequest = { id: number; kind: 'scan'; file: Blob } | { id: number; kind: 'extract'; file: Blob; names: string[] }

export type LogResponse =
  | { id: number; kind: 'progress'; fraction: number }
  | { id: number; kind: 'scan'; result: ScanResult }
  | { id: number; kind: 'extract'; series: Series[] }
  | { id: number; kind: 'error'; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (ev: MessageEvent<LogRequest>) => {
  const req = ev.data
  const size = req.file.size || 1
  let last = 0
  const progress = (bytes: number) => {
    const f = bytes / size
    if (f - last > 0.02 || f >= 1) {
      last = f
      ctx.postMessage({ id: req.id, kind: 'progress', fraction: f } satisfies LogResponse)
    }
  }
  try {
    if (req.kind === 'scan') {
      const result = await scanWpilog(blobChunks(req.file), progress)
      ctx.postMessage({ id: req.id, kind: 'scan', result } satisfies LogResponse)
    } else {
      const map = await extractSeries(blobChunks(req.file), req.names, progress)
      const series = [...map.values()]
      const transfer = series.flatMap((s) => [s.t.buffer, s.v.buffer])
      ctx.postMessage({ id: req.id, kind: 'extract', series } satisfies LogResponse, transfer)
    }
  } catch (e) {
    ctx.postMessage({ id: req.id, kind: 'error', error: e instanceof Error ? e.message : String(e) } satisfies LogResponse)
  }
}

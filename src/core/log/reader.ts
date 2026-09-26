import { NUMERIC_TYPES, readNumeric, WpilogStreamParser } from './wpilog'

/**
 * 兩階段讀取：
 *   1. scanWpilog：只數每個欄位有幾筆，不存資料，給使用者做欄位對應
 *   2. extractSeries：只取出選定欄位的數值，存成 Float64Array
 * 這樣 20 分鐘、上百個欄位的日誌也不會把記憶體吃光。
 */

export interface WpilogEntryInfo {
  name: string
  type: string
  metadata: string
  count: number
  firstTimestamp: number // s
  lastTimestamp: number // s
}

export interface ScanResult {
  entries: WpilogEntryInfo[]
  extraHeader: string
  bytes: number
  records: number
  trailingBytes: number
}

export interface Series {
  name: string
  type: string
  /** 時間（s） */
  t: Float64Array
  v: Float64Array
}

export type ChunkSource = AsyncIterable<Uint8Array> | Iterable<Uint8Array>
export type ProgressFn = (bytesRead: number) => void

export async function scanWpilog(source: ChunkSource, onProgress?: ProgressFn): Promise<ScanResult> {
  const byId = new Map<number, WpilogEntryInfo>()
  const all: WpilogEntryInfo[] = []
  const parser = new WpilogStreamParser({
    onStart(id, name, type, metadata, ts) {
      const e = { name, type, metadata, count: 0, firstTimestamp: ts / 1e6, lastTimestamp: ts / 1e6 }
      byId.set(id, e)
      all.push(e)
    },
    onFinish(id) {
      byId.delete(id)
    },
    onSetMetadata(id, metadata) {
      const e = byId.get(id)
      if (e) e.metadata = metadata
    },
    onRecord(id, ts) {
      const e = byId.get(id)
      if (!e) return
      if (e.count === 0) e.firstTimestamp = ts / 1e6
      e.count++
      e.lastTimestamp = ts / 1e6
    },
  })
  let bytes = 0
  for await (const chunk of source) {
    parser.push(chunk)
    bytes += chunk.length
    onProgress?.(bytes)
  }
  // 同名欄位（重新 start 的）合併
  const merged = new Map<string, WpilogEntryInfo>()
  for (const e of all) {
    const m = merged.get(e.name)
    if (!m) merged.set(e.name, { ...e })
    else {
      m.count += e.count
      m.firstTimestamp = Math.min(m.firstTimestamp, e.firstTimestamp)
      m.lastTimestamp = Math.max(m.lastTimestamp, e.lastTimestamp)
    }
  }
  return {
    entries: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name)),
    extraHeader: parser.extraHeader,
    bytes,
    records: parser.recordCount,
    trailingBytes: parser.trailingBytes,
  }
}

class GrowableSeries {
  t = new Float64Array(1024)
  v = new Float64Array(1024)
  n = 0
  push(t: number, v: number) {
    if (this.n === this.t.length) {
      const t2 = new Float64Array(this.n * 2)
      t2.set(this.t)
      this.t = t2
      const v2 = new Float64Array(this.n * 2)
      v2.set(this.v)
      this.v = v2
    }
    this.t[this.n] = t
    this.v[this.n] = v
    this.n++
  }
}

export async function extractSeries(source: ChunkSource, names: string[], onProgress?: ProgressFn): Promise<Map<string, Series>> {
  const wanted = new Set(names)
  const idInfo = new Map<number, { name: string; type: string; buf: GrowableSeries }>()
  const bufs = new Map<string, { type: string; buf: GrowableSeries }>()
  const parser = new WpilogStreamParser({
    onStart(id, name, type) {
      if (!wanted.has(name) || !NUMERIC_TYPES.has(type)) return
      let b = bufs.get(name)
      if (!b) {
        b = { type, buf: new GrowableSeries() }
        bufs.set(name, b)
      }
      idInfo.set(id, { name, type, buf: b.buf })
    },
    onFinish(id) {
      idInfo.delete(id)
    },
    onRecord(id, ts, view, offset, length) {
      const info = idInfo.get(id)
      if (info) info.buf.push(ts / 1e6, readNumeric(info.type, view, offset, length))
    },
  })
  let bytes = 0
  for await (const chunk of source) {
    parser.push(chunk)
    bytes += chunk.length
    onProgress?.(bytes)
  }
  const out = new Map<string, Series>()
  for (const [name, { type, buf }] of bufs) {
    out.set(name, { name, type, t: buf.t.slice(0, buf.n), v: buf.v.slice(0, buf.n) })
  }
  return out
}

/** 把 Blob / File 切成固定大小的塊依序讀出（瀏覽器與 Node 都能用）。 */
export async function* blobChunks(blob: Blob, chunkSize = 4 * 1024 * 1024): AsyncGenerator<Uint8Array> {
  for (let off = 0; off < blob.size; off += chunkSize) {
    const buf = await blob.slice(off, Math.min(blob.size, off + chunkSize)).arrayBuffer()
    yield new Uint8Array(buf)
  }
}

/**
 * WPILib DataLog（.wpilog）串流解析。
 * 規格：https://github.com/wpilibsuite/allwpilib/blob/main/wpiutil/doc/datalog.adoc
 *
 * 檔頭：'WPILOG' + uint16 版本（0x0100）+ uint32 額外檔頭長度 + 額外檔頭字串
 * 紀錄：1 byte 位元欄位
 *        bit 0–1  entry ID 長度 − 1（1–4 bytes）
 *        bit 2–3  payload 大小長度 − 1（1–4 bytes）
 *        bit 4–6  時間戳長度 − 1（1–8 bytes，單位 µs）
 *      接著依序為 entry ID、payload 大小、時間戳（皆 little-endian）、payload
 * entry ID 0 是控制紀錄：payload[0] = 0 Start、1 Finish、2 SetMetadata
 *
 * 解析器一次吃一塊（chunk），跨塊的紀錄會暫存到下一塊，所以長日誌不必整個讀進記憶體。
 */

const MAGIC = [0x57, 0x50, 0x49, 0x4c, 0x4f, 0x47] // 'WPILOG'
const textDecoder = new TextDecoder()

export interface WpilogVisitor {
  onStart?(id: number, name: string, type: string, metadata: string, timestamp: number): void
  onFinish?(id: number, timestamp: number): void
  onSetMetadata?(id: number, metadata: string, timestamp: number): void
  /** payload 只在回呼期間有效；需要保存請自行複製 */
  onRecord?(id: number, timestamp: number, view: DataView, offset: number, length: number): void
}

export class WpilogFormatError extends Error {}

export class WpilogStreamParser {
  version = 0
  extraHeader = ''
  bytesConsumed = 0
  recordCount = 0
  private headerDone = false
  private pending: Uint8Array | null = null
  private readonly visitor: WpilogVisitor

  constructor(visitor: WpilogVisitor) {
    this.visitor = visitor
  }

  push(chunk: Uint8Array): void {
    let buf: Uint8Array
    if (this.pending && this.pending.length) {
      buf = new Uint8Array(this.pending.length + chunk.length)
      buf.set(this.pending, 0)
      buf.set(chunk, this.pending.length)
    } else {
      buf = chunk
    }
    const used = this.parse(buf)
    this.bytesConsumed += used
    this.pending = used < buf.length ? buf.slice(used) : null
  }

  /** 結束時剩下無法組成完整紀錄的位元組數（斷電造成的截斷日誌會 > 0） */
  get trailingBytes(): number {
    return this.pending?.length ?? 0
  }

  private parse(buf: Uint8Array): number {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    let pos = 0
    if (!this.headerDone) {
      if (buf.length < 12) return 0
      for (let i = 0; i < 6; i++) {
        if (buf[i] !== MAGIC[i]) throw new WpilogFormatError('不是 .wpilog 檔（檔頭不是 WPILOG）')
      }
      this.version = view.getUint16(6, true)
      if (this.version >> 8 !== 1) throw new WpilogFormatError(`不支援的 wpilog 版本 0x${this.version.toString(16)}`)
      const extraLen = view.getUint32(8, true)
      if (buf.length < 12 + extraLen) return 0
      this.extraHeader = textDecoder.decode(buf.subarray(12, 12 + extraLen))
      pos = 12 + extraLen
      this.headerDone = true
    }

    const len = buf.length
    const v = this.visitor
    while (pos < len) {
      const bits = buf[pos]
      const idLen = (bits & 0x3) + 1
      const sizeLen = ((bits >> 2) & 0x3) + 1
      const tsLen = ((bits >> 4) & 0x7) + 1
      const headerLen = 1 + idLen + sizeLen + tsLen
      if (pos + headerLen > len) break
      let p = pos + 1
      let id = 0
      for (let i = 0; i < idLen; i++) id += buf[p + i] * 2 ** (8 * i)
      p += idLen
      let size = 0
      for (let i = 0; i < sizeLen; i++) size += buf[p + i] * 2 ** (8 * i)
      p += sizeLen
      let ts = 0
      for (let i = 0; i < tsLen; i++) ts += buf[p + i] * 2 ** (8 * i)
      p += tsLen
      if (p + size > len) break

      if (id === 0) {
        // 只有解析與邊界檢查包在 try 裡；損毀的控制紀錄（長度超出紀錄範圍）略過這一筆，其他紀錄照讀。
        // visitor 的回呼放在 try 外面，它丟的錯要照常往外傳
        let notify: (() => void) | undefined
        try {
          notify = this.control(buf, view, p, size, ts)
        } catch (e) {
          if (!(e instanceof RangeError)) throw e
        }
        notify?.()
      } else if (v.onRecord) {
        v.onRecord(id, ts, view, p, size)
      }
      this.recordCount++
      pos = p + size
    }
    return pos
  }

  private control(buf: Uint8Array, view: DataView, p: number, size: number, ts: number): (() => void) | undefined {
    if (size < 5) return undefined
    const end = p + size
    const kind = buf[p]
    const id = view.getUint32(p + 1, true)
    const v = this.visitor
    if (kind === 0) {
      let q = p + 5
      const readStr = () => {
        if (q + 4 > end) throw new RangeError('控制紀錄字串長度欄位超出紀錄範圍')
        const n = view.getUint32(q, true)
        q += 4
        if (q + n > end) throw new RangeError('控制紀錄字串超出紀錄範圍')
        const s = textDecoder.decode(buf.subarray(q, q + n))
        q += n
        return s
      }
      const name = readStr()
      const type = readStr()
      const metadata = readStr()
      return () => v.onStart?.(id, name, type, metadata, ts)
    }
    if (kind === 1) return () => v.onFinish?.(id, ts)
    if (kind === 2) {
      if (p + 9 > end) throw new RangeError('控制紀錄 metadata 長度欄位超出紀錄範圍')
      const n = view.getUint32(p + 5, true)
      if (p + 9 + n > end) throw new RangeError('控制紀錄 metadata 超出紀錄範圍')
      const meta = textDecoder.decode(buf.subarray(p + 9, p + 9 + n))
      return () => v.onSetMetadata?.(id, meta, ts)
    }
    return undefined
  }
}

/** 可以轉成單一數字畫圖的型別 */
export const NUMERIC_TYPES = new Set(['double', 'float', 'int64', 'boolean'])

export function readNumeric(type: string, view: DataView, offset: number, length: number): number {
  switch (type) {
    case 'double':
      return length >= 8 ? view.getFloat64(offset, true) : NaN
    case 'float':
      return length >= 4 ? view.getFloat32(offset, true) : NaN
    case 'int64':
      return length >= 8 ? Number(view.getBigInt64(offset, true)) : NaN
    case 'boolean':
      return length >= 1 ? (view.getUint8(offset) ? 1 : 0) : NaN
    default:
      return NaN
  }
}

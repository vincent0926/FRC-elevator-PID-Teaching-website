/**
 * 產生 .wpilog。用途：
 * - 單元測試（組出已知內容的日誌驗證解析器）
 * - 之後的診斷驗證：用模擬器故意設錯參數，產生測試日誌
 */

const enc = new TextEncoder()

function byteLen(v: number): number {
  if (v < 0x100) return 1
  if (v < 0x10000) return 2
  if (v < 0x1000000) return 3
  return 4
}

function tsLen(v: number): number {
  let n = 1
  while (n < 8 && v >= 2 ** (8 * n)) n++
  return n
}

export class WpilogWriter {
  private parts: Uint8Array[] = []
  private size = 0
  private nextId = 1
  private readonly types = new Map<number, string>()

  constructor(extraHeader = '') {
    const extra = enc.encode(extraHeader)
    const h = new Uint8Array(12 + extra.length)
    h.set([0x57, 0x50, 0x49, 0x4c, 0x4f, 0x47], 0)
    const dv = new DataView(h.buffer)
    dv.setUint16(6, 0x0100, true)
    dv.setUint32(8, extra.length, true)
    h.set(extra, 12)
    this.push(h)
  }

  private push(b: Uint8Array) {
    this.parts.push(b)
    this.size += b.length
  }

  private record(id: number, timestampUs: number, payload: Uint8Array) {
    const ts = Math.max(0, Math.round(timestampUs))
    const il = byteLen(id)
    const sl = byteLen(payload.length)
    const tl = tsLen(ts)
    const head = new Uint8Array(1 + il + sl + tl)
    head[0] = (il - 1) | ((sl - 1) << 2) | ((tl - 1) << 4)
    let p = 1
    for (let i = 0; i < il; i++) head[p++] = Math.floor(id / 2 ** (8 * i)) & 0xff
    for (let i = 0; i < sl; i++) head[p++] = Math.floor(payload.length / 2 ** (8 * i)) & 0xff
    for (let i = 0; i < tl; i++) head[p++] = Math.floor(ts / 2 ** (8 * i)) & 0xff
    this.push(head)
    this.push(payload)
  }

  start(name: string, type: string, metadata = '', timestampUs = 0): number {
    const id = this.nextId++
    const n = enc.encode(name)
    const t = enc.encode(type)
    const m = enc.encode(metadata)
    const payload = new Uint8Array(1 + 4 + 4 + n.length + 4 + t.length + 4 + m.length)
    const dv = new DataView(payload.buffer)
    let p = 0
    payload[p++] = 0
    dv.setUint32(p, id, true); p += 4
    dv.setUint32(p, n.length, true); p += 4
    payload.set(n, p); p += n.length
    dv.setUint32(p, t.length, true); p += 4
    payload.set(t, p); p += t.length
    dv.setUint32(p, m.length, true); p += 4
    payload.set(m, p)
    this.record(0, timestampUs, payload)
    this.types.set(id, type)
    return id
  }

  finishEntry(id: number, timestampUs: number): void {
    const payload = new Uint8Array(5)
    new DataView(payload.buffer).setUint32(1, id, true)
    payload[0] = 1
    this.record(0, timestampUs, payload)
  }

  appendDouble(id: number, timestampUs: number, value: number): void {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setFloat64(0, value, true)
    this.record(id, timestampUs, b)
  }

  appendFloat(id: number, timestampUs: number, value: number): void {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setFloat32(0, value, true)
    this.record(id, timestampUs, b)
  }

  appendInt64(id: number, timestampUs: number, value: number): void {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setBigInt64(0, BigInt(Math.round(value)), true)
    this.record(id, timestampUs, b)
  }

  appendBoolean(id: number, timestampUs: number, value: boolean): void {
    this.record(id, timestampUs, new Uint8Array([value ? 1 : 0]))
  }

  appendString(id: number, timestampUs: number, value: string): void {
    this.record(id, timestampUs, enc.encode(value))
  }

  /** 依 start 時的型別寫入數值 */
  append(id: number, timestampUs: number, value: number): void {
    switch (this.types.get(id)) {
      case 'double': return this.appendDouble(id, timestampUs, value)
      case 'float': return this.appendFloat(id, timestampUs, value)
      case 'int64': return this.appendInt64(id, timestampUs, value)
      case 'boolean': return this.appendBoolean(id, timestampUs, value !== 0)
      default: throw new Error(`entry ${id} 不是數值型別`)
    }
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.size)
    let p = 0
    for (const b of this.parts) {
      out.set(b, p)
      p += b.length
    }
    return out
  }
}

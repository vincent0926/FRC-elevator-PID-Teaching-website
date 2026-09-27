/**
 * 最小的 ZIP 寫入器（只用「不壓縮」儲存，給「下載完整子系統」用）。
 * 不引入套件：網站要離線可用，而且檔案只有幾十 KB，不需要壓縮。
 * 檔名用 UTF-8（設 general purpose bit 11），中文檔名也不會亂碼。
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  path: string
  content: string | Uint8Array
}

/** DOS 日期時間（ZIP 標頭用） */
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export function makeZip(entries: ZipEntry[], now = new Date()): Uint8Array {
  const enc = new TextEncoder()
  const { time, date } = dosTime(now)
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.path)
    const data = typeof e.content === 'string' ? enc.encode(e.content) : e.content
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // UTF-8 檔名
    lv.setUint16(8, 0, true) // stored
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const out = new Uint8Array(offset + centralSize + 22)
  let p = 0
  for (const a of [...locals, ...centrals, end]) {
    out.set(a, p)
    p += a.length
  }
  return out
}

/** 讀回 makeZip 產生的 ZIP（只支援不壓縮），驗證 CRC；測試與除錯用 */
export function readZip(z: Uint8Array): { name: string; data: string }[] {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength)
  const end = z.length - 22
  if (v.getUint32(end, true) !== 0x06054b50) throw new Error('不是 ZIP 檔（找不到結尾記錄）')
  const count = v.getUint16(end + 10, true)
  let p = v.getUint32(end + 16, true)
  const dec = new TextDecoder()
  const out: { name: string; data: string }[] = []
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('中央目錄損壞')
    const crc = v.getUint32(p + 16, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const off = v.getUint32(p + 42, true)
    const name = dec.decode(z.subarray(p + 46, p + 46 + nameLen))
    const dataStart = off + 30 + v.getUint16(off + 26, true)
    const data = z.subarray(dataStart, dataStart + size)
    if (crc32(data) !== crc) throw new Error(`${name} 的 CRC 不對`)
    out.push({ name, data: dec.decode(data) })
    p += 46 + nameLen
  }
  return out
}


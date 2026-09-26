import { describe, expect, it } from 'vitest'
import { blobChunks, extractSeries, scanWpilog } from './reader'
import { WpilogFormatError, WpilogStreamParser } from './wpilog'
import { WpilogWriter } from './wpilogWriter'

function sampleLog() {
  const w = new WpilogWriter('AdvantageKit')
  const pos = w.start('/Elevator/PositionMeters', 'double', '', 0)
  const en = w.start('/DriverStation/Enabled', 'boolean', '', 0)
  const cnt = w.start('/Elevator/Counter', 'int64', '', 0)
  const f = w.start('/Elevator/TempCelsius', 'float', '', 0)
  const s = w.start('/Metadata/Note', 'string', '{"x":1}', 0)
  w.appendString(s, 1, 'hello')
  for (let i = 0; i < 100; i++) {
    const ts = 20000 * i + 5 // 50 Hz
    w.appendDouble(pos, ts, i * 0.01)
    w.appendInt64(cnt, ts, i)
    if (i % 10 === 0) w.appendBoolean(en, ts, i >= 20)
    w.appendFloat(f, ts, 30.5)
  }
  return w.toBytes()
}

function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size))
  return out
}

describe('WpilogStreamParser', () => {
  it('讀出檔頭與欄位', async () => {
    const r = await scanWpilog([sampleLog()])
    expect(r.extraHeader).toBe('AdvantageKit')
    const names = r.entries.map((e) => e.name)
    expect(names).toContain('/Elevator/PositionMeters')
    const pos = r.entries.find((e) => e.name === '/Elevator/PositionMeters')!
    expect(pos.type).toBe('double')
    expect(pos.count).toBe(100)
    expect(pos.firstTimestamp).toBeCloseTo(5e-6)
    expect(pos.lastTimestamp).toBeCloseTo(99 * 0.02 + 5e-6)
    expect(r.entries.find((e) => e.name === '/Metadata/Note')!.metadata).toBe('{"x":1}')
    expect(r.trailingBytes).toBe(0)
  })

  it('每一種切塊大小（含切在紀錄中間）結果都一樣', async () => {
    const bytes = sampleLog()
    const ref = await extractSeries([bytes], ['/Elevator/PositionMeters', '/DriverStation/Enabled', '/Elevator/Counter', '/Elevator/TempCelsius'])
    for (const size of [1, 2, 3, 7, 13, 64, 1000]) {
      const got = await extractSeries(chunked(bytes, size), ['/Elevator/PositionMeters', '/DriverStation/Enabled', '/Elevator/Counter', '/Elevator/TempCelsius'])
      for (const [k, s] of ref) {
        expect(Array.from(got.get(k)!.v)).toEqual(Array.from(s.v))
        expect(Array.from(got.get(k)!.t)).toEqual(Array.from(s.t))
      }
    }
  })

  it('各型別數值正確', async () => {
    const m = await extractSeries([sampleLog()], ['/Elevator/PositionMeters', '/DriverStation/Enabled', '/Elevator/Counter', '/Elevator/TempCelsius', '/Metadata/Note'])
    expect(m.get('/Elevator/PositionMeters')!.v[42]).toBeCloseTo(0.42)
    expect(Array.from(m.get('/DriverStation/Enabled')!.v.slice(0, 4))).toEqual([0, 0, 1, 1])
    expect(m.get('/Elevator/Counter')!.v[99]).toBe(99)
    expect(m.get('/Elevator/TempCelsius')!.v[0]).toBeCloseTo(30.5)
    expect(m.has('/Metadata/Note')).toBe(false) // 字串不取
  })

  it('只取出要求的欄位', async () => {
    const m = await extractSeries([sampleLog()], ['/Elevator/Counter'])
    expect([...m.keys()]).toEqual(['/Elevator/Counter'])
  })

  it('截斷的日誌（斷電）不會丟錯，回報剩餘位元組', async () => {
    const bytes = sampleLog()
    const r = await scanWpilog([bytes.slice(0, bytes.length - 3)])
    expect(r.trailingBytes).toBeGreaterThan(0)
    // 最後一筆是溫度，被截掉的是它
    expect(r.entries.find((e) => e.name === '/Elevator/TempCelsius')!.count).toBe(99)
    expect(r.entries.find((e) => e.name === '/Elevator/PositionMeters')!.count).toBe(100)
  })

  it('不是 wpilog 會丟出看得懂的錯誤', () => {
    const p = new WpilogStreamParser({})
    expect(() => p.push(new TextEncoder().encode('hello world, not a log'))).toThrow(WpilogFormatError)
  })

  it('finish 後以同一個 id 重新 start 也能正確歸屬', async () => {
    const w = new WpilogWriter()
    const a = w.start('/A', 'double')
    w.appendDouble(a, 10, 1)
    w.finishEntry(a, 20)
    // writer 不重用 id，這裡手動測 finish 後的紀錄會被忽略
    w.appendDouble(a, 30, 999)
    const m = await extractSeries([w.toBytes()], ['/A'])
    expect(Array.from(m.get('/A')!.v)).toEqual([1])
  })

  it('Blob 分塊讀取', async () => {
    const bytes = sampleLog()
    const blob = new Blob([bytes as BlobPart])
    const r = await scanWpilog(blobChunks(blob, 100))
    expect(r.bytes).toBe(bytes.length)
    expect(r.entries.length).toBe(5)
  })

  it('壓力測試：20 分鐘、40 個欄位、50 Hz（約 240 萬筆）', async () => {
    const w = new WpilogWriter('AdvantageKit')
    const ids: number[] = []
    for (let k = 0; k < 40; k++) ids.push(w.start(`/Robot/Field${k}`, 'double'))
    const cycles = 20 * 60 * 50
    for (let i = 0; i < cycles; i++) {
      const ts = i * 20000
      for (let k = 0; k < 40; k++) w.appendDouble(ids[k], ts, Math.sin(i * 0.01 + k))
    }
    const bytes = w.toBytes()
    const t0 = performance.now()
    const scan = await scanWpilog(chunked(bytes, 4 * 1024 * 1024))
    const series = await extractSeries(chunked(bytes, 4 * 1024 * 1024), ['/Robot/Field3', '/Robot/Field7'])
    const ms = performance.now() - t0
    expect(scan.records).toBe(40 + cycles * 40)
    expect(series.get('/Robot/Field3')!.v.length).toBe(cycles)
    expect(series.get('/Robot/Field7')!.v[1000]).toBeCloseTo(Math.sin(10 + 7))
    // 約 40 MB，兩次掃描在一般筆電應該幾秒內完成
    expect(ms).toBeLessThan(15000)
    console.log(`壓力測試：${(bytes.length / 1e6).toFixed(1)} MB，掃描＋取值 ${ms.toFixed(0)} ms`)
  }, 60000)
})

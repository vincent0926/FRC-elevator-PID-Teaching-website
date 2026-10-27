import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guard, isBoolRecord, isNonNegative, oneOf, readPersisted, sanitized } from './usePersisted'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const put = (key: string, v: unknown) => store.set('elevator-tuner:' + key, JSON.stringify(v))

describe('readPersisted：瀏覽器存的值一定要檢查過才用', () => {
  it('沒存過用預設值，不警告', () => {
    expect(readPersisted('voltsPerCm', 0.5, guard(isNonNegative))).toBe(0.5)
    expect(console.warn).not.toHaveBeenCalled()
  })
  it('格式對就用存的', () => {
    put('voltsPerCm', 0.8)
    expect(readPersisted('voltsPerCm', 0.5, guard(isNonNegative))).toBe(0.8)
  })
  it('舊版或被改壞的值（字串、不在選項裡）改用預設值並警告', () => {
    put('voltsPerCm', '0.5')
    expect(readPersisted('voltsPerCm', 0.5, guard(isNonNegative))).toBe(0.5)
    put('simSource', 'foo')
    expect(readPersisted('simSource', 'theory', guard(oneOf('theory', 'tuning', 'custom')))).toBe('theory')
    expect(console.warn).toHaveBeenCalledTimes(2)
  })
  it('null 也可以是合法的值', () => {
    put('custom', null)
    expect(readPersisted<number | null>('custom', 1, (v) => (v === null || typeof v === 'number' ? v : undefined))).toBeNull()
  })
})

describe('守衛', () => {
  it('isBoolRecord：教學關卡完成狀態', () => {
    expect(isBoolRecord({ a: true, b: false })).toBe(true)
    expect(isBoolRecord({ a: 'yes' })).toBe(false)
    expect(isBoolRecord([true])).toBe(false)
  })
  it('sanitized：逐欄補預設值，再檢查欄位之間的關係', () => {
    const parse = sanitized({ shots: 8, interval: 0.25 }, (m) => m.shots >= 1)
    expect(parse({ shots: 3, interval: 'x' })).toEqual({ shots: 3, interval: 0.25 })
    expect(parse({ shots: 0 })).toBeUndefined()
  })
})

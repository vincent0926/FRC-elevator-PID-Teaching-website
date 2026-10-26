import { describe, expect, it } from 'vitest'
import { fixed } from './format'

describe('fixed：參數卡數字', () => {
  it('一般數字照小數位數', () => {
    expect(fixed(4.9718, 3)).toBe('4.972')
    expect(fixed(-0.01009, 5)).toBe('-0.01009')
    expect(fixed(99999.4, 1)).toBe('99999.4')
  })
  it('離譜的大數字改科學記號，不會一長串', () => {
    expect(fixed(1595103126991104.75, 5)).toBe('1.60e+15')
    expect(fixed(-249049941.352, 3)).toBe('-2.49e+8')
  })
  it('不是有限數字顯示 —', () => {
    expect(fixed(NaN, 2)).toBe('—')
    expect(fixed(Infinity, 2)).toBe('—')
  })
})

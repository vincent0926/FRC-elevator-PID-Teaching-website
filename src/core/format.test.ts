import { describe, expect, it } from 'vitest'
import { fixed } from './format'

describe('fixed：畫面上的數字', () => {
  it('一般數字照小數位數', () => {
    expect(fixed(4.9718, 3)).toBe('4.972')
    expect(fixed(-0.01009, 5)).toBe('-0.01009')
    expect(fixed(99999.4, 1)).toBe('99999.4')
    expect(fixed(0, 4)).toBe('0.0000')
  })
  it('離譜的大數字改科學記號，不會一長串', () => {
    expect(fixed(1595103126991104.75, 5)).toBe('1.60e+15')
    expect(fixed(-249049941.352, 3)).toBe('-2.49e+8')
  })
  it('看的是整串字的長度，不只是數字大小：小數位數多的也會改', () => {
    expect(fixed(99999.4, 5)).toBe('1.00e+5')
    expect(fixed(123456789, 0)).toBe('123456789')
    expect(fixed(12.5, 2, 4)).toBe('1.25e+1')
  })
  it('不是 0 卻會被四捨五入成 0 的小數字改科學記號', () => {
    expect(fixed(3e-6, 4)).toBe('3.00e-6')
    expect(fixed(-4e-5, 2)).toBe('-4.00e-5')
    // 整數位數的（cm、°）照樣顯示 0
    expect(fixed(0.3, 0)).toBe('0')
  })
  it('不是有限數字顯示 —', () => {
    expect(fixed(NaN, 2)).toBe('—')
    expect(fixed(Infinity, 2)).toBe('—')
  })
})

import { describe, expect, it } from 'vitest'
import { frameIndex } from './playback'

describe('frameIndex', () => {
  it('rAF 時間比按下播放還早時不會變成負的索引（手臂 3F 播放黑屏）', () => {
    expect(frameIndex(0, 1500, -3, 0.001, 1)).toBe(0)
    expect(frameIndex(200, 1500, -16, 0.001, 2)).toBe(200)
  })

  it('照時間與速度前進，停在最後一格', () => {
    expect(frameIndex(0, 1500, 100, 0.001, 1)).toBe(100)
    expect(frameIndex(0, 1500, 100, 0.001, 0.25)).toBe(25)
    expect(frameIndex(10, 1500, 100, 0.001, 2)).toBe(210)
    expect(frameIndex(0, 1500, 60_000, 0.001, 1)).toBe(1500)
  })

  it('dt 異常時停在起點', () => {
    expect(frameIndex(5, 100, 100, 0, 1)).toBe(5)
    expect(frameIndex(5, 100, 100, NaN, 1)).toBe(5)
  })
})

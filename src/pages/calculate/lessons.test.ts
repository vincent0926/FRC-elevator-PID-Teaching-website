import { describe, expect, it } from 'vitest'
import { computeFeedforward } from '../../core/feedforward'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { compareMoves, kiCases, pidVsFfCases } from './lessons'

const m = DEFAULT_MECHANISM
const ff = computeFeedforward(m)

describe('1F 教學關卡的比較模擬（圖上要真的看得到說明的現象）', () => {
  it('純 PID 一路落後、停不準；前饋 + PID 跟得上', () => {
    const { metrics: [pid, pid4, ffPid] } = compareMoves(m, ff, pidVsFfCases(ff, 50))
    expect(pid.maxFollowingError).toBeGreaterThan(0.1)
    expect(pid.steadyStateError).toBeGreaterThan(0.005)
    expect(pid4.maxFollowingError).toBeLessThan(pid.maxFollowingError)
    expect(pid4.maxFollowingError).toBeGreaterThan(ffPid.maxFollowingError * 3)
    expect(ffPid.maxFollowingError).toBeLessThan(0.01)
  })

  it('kI：平常能補穩態誤差，電池低時積分飽和衝過頭；修好 kG 最好', () => {
    const { metrics: [p, pi, piLow, fixed] } = compareMoves(m, ff, kiCases(ff, 50))
    expect(p.steadyStateError).toBeGreaterThan(pi.steadyStateError)
    expect(piLow.overshoot).toBeGreaterThan(0.02)
    expect(pi.overshoot).toBeLessThan(piLow.overshoot / 3)
    expect(fixed.steadyStateError).toBeLessThan(p.steadyStateError / 2)
  })
})

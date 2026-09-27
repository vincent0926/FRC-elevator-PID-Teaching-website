import { describe, expect, it } from 'vitest'
import { buildTheory } from '../../app/store'
import { computeFeedforward } from '../../core/feedforward'
import { simulate } from '../../core/physics/simulate'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { DEFAULT_KNOBS, buildSimInput } from './plantKnobs'
import { TUNING_STEPS, tuningStepParams } from './tuningSteps'

const mechanism = DEFAULT_MECHANISM
const ff = computeFeedforward(mechanism)
const theory = buildTheory(mechanism, ff, 0.5)
const run = (step: number) =>
  simulate(buildSimInput({ mechanism, ff, knobs: { ...DEFAULT_KNOBS, realistic: false }, controlPeriod: 0.001, goal: 0.9 }, tuningStepParams(theory, step, 0))).moves[0]

describe('3F 照順序調：每一步圖上要真的看得到說明的變化', () => {
  it('四步都有說明', () => {
    expect(TUNING_STEPS).toHaveLength(4)
  })
  it('只有 kG：跟不上；加 kV、kA：跟隨誤差大幅變小；加 kP：穩態誤差更小', () => {
    const [s1, s2, s3] = [run(0), run(1), run(2)]
    expect(s1.maxFollowingError).toBeGreaterThan(0.05)
    expect(s2.maxFollowingError).toBeLessThan(s1.maxFollowingError / 5)
    expect(s3.steadyStateError).toBeLessThanOrEqual(s2.steadyStateError + 1e-9)
  })
})

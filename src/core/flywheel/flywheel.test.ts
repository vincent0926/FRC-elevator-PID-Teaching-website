import { describe, expect, it } from 'vitest'
import { motorModel } from '../motors'
import {
  computeFlywheelFeedforward,
  DEFAULT_FLYWHEEL,
  DEFAULT_FLYWHEEL_SPEC,
  DEFAULT_KNOBS,
  DEFAULT_PLAN,
  ballAt,
  dipFraction,
  exitSpeed,
  fastestSpinUp,
  flightTime,
  flywheelFailures,
  flywheelInertia,
  flywheelMetrics,
  launchRange,
  shotOutcomes,
  simulateFlywheel,
  speedForRange,
  theoryGains,
  type FlywheelGains,
  type FlywheelKnobs,
  type ShotPlan,
} from './flywheel'

const TAU = 2 * Math.PI
const ff = computeFlywheelFeedforward(DEFAULT_FLYWHEEL)
const theory = theoryGains(ff)
const IDEAL: FlywheelKnobs = { friction: 0, statorLimit: 0, noReverse: false }
const run = (g: FlywheelGains, k: FlywheelKnobs = DEFAULT_KNOBS, plan: ShotPlan = DEFAULT_PLAN, mech = DEFAULT_FLYWHEEL) => {
  const res = simulateFlywheel(mech, g, k, plan)
  return { res, m: flywheelMetrics(res, plan, DEFAULT_FLYWHEEL_SPEC) }
}

describe('飛輪前饋', () => {
  it('kV 就是 12 V 對最高轉速（Kraken 1:1 約 0.12 V/rps）', () => {
    expect(ff.kV * ff.freeSpeed).toBeCloseTo(12, 9)
    expect(ff.kV * TAU).toBeCloseTo(0.119, 3)
  })

  it('kA = J·R/(G·n·kT)，齒比加速（G < 1）kV 變小、kA 變大', () => {
    const mot = motorModel('krakenX60')
    expect(ff.kA).toBeCloseTo((flywheelInertia(DEFAULT_FLYWHEEL) * mot.R) / (2 * mot.kT), 12)
    const up = computeFlywheelFeedforward({ ...DEFAULT_FLYWHEEL, gearRatio: 0.5 })
    expect(up.kV).toBeCloseTo(ff.kV / 2, 12)
    expect(up.kA).toBeCloseTo(ff.kA * 2, 12)
  })
})

describe('飛輪模擬', () => {
  it('理想模型、只有理論前饋：穩態剛好在目標', () => {
    const { res } = run({ ...theory, kP: 0 }, IDEAL, { ...DEFAULT_PLAN, shots: 1, firstShot: 1.5 })
    const i = Math.round(1.49 / 0.001)
    expect(res.vel[i] / res.ref[i]).toBeCloseTo(1, 4)
  })

  it('有摩擦沒有 kS：轉速差一點；kS 補上摩擦就到', () => {
    const noKs = run({ ...theory, kP: 0 })
    const withKs = run({ ...theory, kP: 0, kS: DEFAULT_KNOBS.friction })
    expect(noKs.m.steadyError).toBeGreaterThan(0.5 * TAU)
    expect(Math.abs(withKs.m.steadyError)).toBeLessThan(0.01)
  })

  it('kP 越大，掉速越少、恢復越快', () => {
    const small = run({ ...theory, kS: DEFAULT_KNOBS.friction })
    const big = run({ ...theory, kS: DEFAULT_KNOBS.friction, kP: 1 / TAU })
    expect(big.m.shots[0].dip).toBeLessThan(small.m.shots[0].dip)
    expect(big.m.shots[0].recovery!).toBeLessThan(small.m.shots[0].recovery!)
  })

  it('球越重掉越多，飛輪越重掉越少', () => {
    const base = run(theory).m.shots[0].dip
    expect(run(theory, DEFAULT_KNOBS, { ...DEFAULT_PLAN, ballMass: 0.4 }).m.shots[0].dip).toBeGreaterThan(base)
    expect(run(theory, DEFAULT_KNOBS, DEFAULT_PLAN, { ...DEFAULT_FLYWHEEL, wheelMass: 3 }).m.shots[0].dip).toBeLessThan(base)
  })

  it('PeakReverseVoltage = 0 時不出反向電壓；電流不超過 Stator 限制', () => {
    const { res } = run({ ...theory, kP: 5 / TAU, kI: 20 / TAU })
    expect(Math.min(...res.volt)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...res.motorCurrent.map(Math.abs))).toBeLessThanOrEqual(DEFAULT_KNOBS.statorLimit + 1e-9)
    const free = run({ ...theory, kI: 20 / TAU }, { ...DEFAULT_KNOBS, noReverse: false })
    expect(Math.min(...free.res.volt)).toBeLessThan(0)
  })

  it('加速度限制：參考轉速照斜率爬，kA 前饋只在爬的時候有', () => {
    const plan = { ...DEFAULT_PLAN, accel: 100 * TAU }
    const { res } = run(theory, DEFAULT_KNOBS, plan)
    expect(res.ref[100]).toBeCloseTo(0.101 * 100 * TAU, 6)
    const late = Math.round(1.4 / 0.001)
    expect(res.ff[late]).toBeCloseTo(theory.kV * plan.target, 9)
  })

  it('kV 少 20%：到不了，三項都沒過', () => {
    const { m } = run({ ...theory, kS: DEFAULT_KNOBS.friction, kV: theory.kV * 0.8 })
    expect(flywheelFailures(m, DEFAULT_PLAN, DEFAULT_FLYWHEEL_SPEC)).toEqual(expect.arrayContaining(['spinUp', 'steady', 'recovery']))
  })

  it('補上 kS、kP 1 V/rps：全部達標', () => {
    const { m } = run({ ...theory, kS: DEFAULT_KNOBS.friction, kP: 1 / TAU })
    expect(flywheelFailures(m, DEFAULT_PLAN, DEFAULT_FLYWHEEL_SPEC)).toEqual([])
  })

  it('kI 太大：起步時積分累積，衝過頭', () => {
    const { m } = run({ ...theory, kI: 1 / TAU })
    expect(m.overshoot).toBeGreaterThan(0.02 * DEFAULT_PLAN.target)
  })
})

describe('球速與射程', () => {
  it('出口球速是輪緣速度的一半', () => {
    expect(exitSpeed(50 * TAU, 0.0508)).toBeCloseTo(0.5 * 50 * TAU * 0.0508, 9)
    expect(exitSpeed(-5, 0.05)).toBe(0)
  })

  it('從地面射出：射程 = v²·sin2θ/g，45° 最遠', () => {
    const v = 8
    expect(launchRange(v, Math.PI / 4, 0)).toBeCloseTo((v * v) / 9.81, 6)
    expect(launchRange(v, Math.PI / 6, 0)).toBeCloseTo((v * v * Math.sin(Math.PI / 3)) / 9.81, 6)
  })

  it('落地時 y 回到 −高度', () => {
    const v = 7
    const a = 0.8
    const h = 0.5
    expect(ballAt(v, a, flightTime(v, a, h)).y).toBeCloseTo(-h, 9)
  })

  it('反推球速：射到 launchRange 算出來的距離要剛好是原本的速度', () => {
    const v = 7.5
    const a = (50 * Math.PI) / 180
    expect(speedForRange(launchRange(v, a, 0.5), a, 0.5)).toBeCloseTo(v, 9)
    expect(speedForRange(-1, a, 0.5)).toBeNull()
  })

  it('一發掉的比例 = 球質量·0.5 / (形狀·飛輪質量)，跟模擬沒有回授時的掉速接近', () => {
    expect(dipFraction(DEFAULT_FLYWHEEL, 0.235)).toBeCloseTo((0.235 * 0.5) / (0.5 * 1.5), 9)
    const { res } = run({ ...theory, kP: 0 }, IDEAL, { ...DEFAULT_PLAN, shots: 1 })
    const k = Math.round(DEFAULT_PLAN.firstShot / 0.001)
    const before = res.vel[k - 1]
    let low = Infinity
    for (let i = k; i < k + 40; i++) low = Math.min(low, res.vel[i])
    // 30 ms 內馬達會補一點，所以實際掉得比估的少，但差不多
    const frac = (before - low) / before
    expect(frac).toBeLessThan(dipFraction(DEFAULT_FLYWHEEL, 0.235))
    expect(frac).toBeGreaterThan(0.5 * dipFraction(DEFAULT_FLYWHEEL, 0.235))
  })

  it('每一發的落點：沒調好的第二發比調好的近', () => {
    const plan = { ...DEFAULT_PLAN, interval: 0.15 }
    const weak = shotOutcomes(run(theory, DEFAULT_KNOBS, plan).res, DEFAULT_FLYWHEEL, plan)
    const strong = shotOutcomes(run({ ...theory, kS: DEFAULT_KNOBS.friction, kP: 1 / TAU }, DEFAULT_KNOBS, plan).res, DEFAULT_FLYWHEEL, plan)
    expect(weak).toHaveLength(3)
    expect(weak[1].range).toBeLessThan(strong[1].range)
    expect(weak[1].miss).toBeLessThan(0)
    expect(strong[0].release).toBeCloseTo(plan.firstShot + 0.03, 9)
  })
})

describe('最快到速', () => {
  it('不限電流時跟一階系統的解析解一樣：t = −(kA/kV)·ln(1 − 0.98·目標/最高轉速)', () => {
    const target = 50 * TAU
    const exact = -(ff.kA / ff.kV) * Math.log(1 - (0.98 * target) / ff.freeSpeed)
    expect(fastestSpinUp(DEFAULT_FLYWHEEL, target, 0)).toBeCloseTo(exact, 3)
  })

  it('限電流會變慢；目標超過最高轉速就到不了', () => {
    const target = 50 * TAU
    expect(fastestSpinUp(DEFAULT_FLYWHEEL, target, 40)!).toBeGreaterThan(fastestSpinUp(DEFAULT_FLYWHEEL, target, 0)!)
    expect(fastestSpinUp(DEFAULT_FLYWHEEL, ff.freeSpeed * 1.05, 80)).toBeNull()
  })
})

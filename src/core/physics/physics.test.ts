import { describe, expect, it } from 'vitest'
import { stepRK4, type PlantParams } from './elevator'
import { simulate } from './simulate'
import { computeFeedforward } from '../feedforward'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { plantFromMechanism } from './elevator'

const ff = computeFeedforward(DEFAULT_MECHANISM)

const ideal: PlantParams = {
  kG: ff.kG,
  kV: ff.kV,
  kA: ff.kA,
  frictionKs: 0,
  motorResistance: ff.motorResistance,
  motorCount: 2,
  statorCurrentLimit: null,
  batteryVoltage: 12,
  batteryResistance: 0,
  minPosition: -100,
  maxPosition: 100,
}

describe('受控體（開迴路）', () => {
  it('定電壓起步與解析解誤差 < 1%（Phase 0 標準）', () => {
    // kA·a = u − kG − kV·v → v(t) = v∞(1 − e^(−t/τ))，τ = kA/kV
    const u = 6
    const vInf = (u - ideal.kG) / ideal.kV
    const tau = ideal.kA / ideal.kV
    const exact = (t: number) => vInf * (t - tau * (1 - Math.exp(-t / tau)))
    let s = { pos: 0, vel: 0 }
    const dt = 0.001
    let worst = 0
    for (let i = 1; i <= 2000; i++) {
      s = stepRK4(ideal, s, u, dt)
      const t = i * dt
      if (t > 0.05) worst = Math.max(worst, Math.abs(s.pos - exact(t)) / exact(t))
    }
    expect(worst).toBeLessThan(0.01)
    expect(worst).toBeLessThan(1e-6) // RK4 實際上遠比 1% 準
  })

  it('給剛好 kG 會停在原地', () => {
    let s = { pos: 0.5, vel: 0 }
    for (let i = 0; i < 1000; i++) s = stepRK4(ideal, s, ideal.kG, 0.001)
    expect(s.pos).toBeCloseTo(0.5, 9)
  })

  it('靜摩擦撐得住時不會動', () => {
    const p = { ...ideal, frictionKs: 0.3 }
    let s = { pos: 0.5, vel: 0 }
    for (let i = 0; i < 1000; i++) s = stepRK4(p, s, ideal.kG + 0.2, 0.001)
    expect(s.pos).toBe(0.5)
    expect(s.vel).toBe(0)
  })

  it('撞到上限會停', () => {
    const p = { ...ideal, maxPosition: 0.2 }
    let s = { pos: 0, vel: 0 }
    for (let i = 0; i < 2000; i++) s = stepRK4(p, s, 12, 0.001)
    expect(s.pos).toBe(0.2)
    expect(s.vel).toBe(0)
  })

  it('電流限制會讓加速變慢', () => {
    const limited = { ...ideal, statorCurrentLimit: 20 }
    let a = { pos: 0, vel: 0 }
    let b = { pos: 0, vel: 0 }
    for (let i = 0; i < 100; i++) {
      a = stepRK4(ideal, a, 12, 0.001)
      b = stepRK4(limited, b, 12, 0.001)
    }
    expect(b.vel).toBeLessThan(a.vel)
  })
})

describe('閉迴路模擬', () => {
  const mm = { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration }
  const exact = { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP: 50, kI: 0, kD: 0 }

  it('參數完全正確時，前饋幾乎就能追上軌跡', () => {
    const r = simulate({ plant: ideal, gains: exact, motionMagic: mm, controlPeriod: 0.001, initialPosition: 0, moves: [{ time: 0.1, goal: 0.9 }], duration: 3 })
    const m = r.moves[0]
    expect(m.maxFollowingError).toBeLessThan(0.002)
    expect(m.steadyStateError).toBeLessThan(0.001)
    expect(m.settlingTime).not.toBeNull()
  })

  it('kG = 0 且 kP 很小時，會掉在目標下面', () => {
    const r = simulate({ plant: ideal, gains: { ...exact, kG: 0, kP: 5 }, motionMagic: mm, controlPeriod: 0.001, initialPosition: 0, moves: [{ time: 0, goal: 0.6 }], duration: 3 })
    const lastPos = r.pos[r.pos.length - 1]
    // 穩態：kP·e = kG → e = kG / kP
    expect(0.6 - lastPos).toBeCloseTo(ff.kG / 5, 2)
  })

  it('roboRIO 50 Hz 比 TalonFX 1 kHz 更容易振盪', () => {
    const gains = { ...exact, kP: 300 }
    const fast = simulate({ plant: ideal, gains, motionMagic: mm, controlPeriod: 0.001, initialPosition: 0, moves: [{ time: 0, goal: 0.6 }], duration: 3 })
    const slow = simulate({ plant: ideal, gains, motionMagic: mm, controlPeriod: 0.02, initialPosition: 0, moves: [{ time: 0, goal: 0.6 }], duration: 3 })
    expect(slow.moves[0].maxFollowingError).toBeGreaterThan(fast.moves[0].maxFollowingError)
  })

  it('真實模型：摩擦會產生穩態誤差或需要較長時間穩定', () => {
    const plant = plantFromMechanism(DEFAULT_MECHANISM, ff, { realistic: true, frictionKs: 0.4 })
    const r = simulate({ plant, gains: { ...exact, kP: 10 }, motionMagic: mm, controlPeriod: 0.001, initialPosition: 0, moves: [{ time: 0, goal: 0.6 }], duration: 3 })
    // kP·e 要大於 kS 才推得動：e ≤ kS / kP = 4 cm
    expect(r.moves[0].steadyStateError).toBeGreaterThan(0)
    expect(r.moves[0].steadyStateError).toBeLessThanOrEqual(0.4 / 10 + 1e-6)
  })

  it('多段移動分別計算指標', () => {
    const r = simulate({ plant: ideal, gains: exact, motionMagic: mm, controlPeriod: 0.001, initialPosition: 0, moves: [{ time: 0, goal: 0.8 }, { time: 2, goal: 0.2 }], duration: 4 })
    expect(r.moves).toHaveLength(2)
    expect(r.moves[1].goal).toBe(0.2)
    expect(r.moves[1].steadyStateError).toBeLessThan(0.001)
  })
})

describe('真實模型的各項開關（Phase 3 步驟 5：變化方向要符合物理直覺）', () => {
  const mm = { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration }
  const gains = { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP: 30, kI: 0, kD: 0 }
  const run = (over: Partial<Parameters<typeof simulate>[0]> = {}, plantOver: Partial<PlantParams> = {}) =>
    simulate({
      plant: { ...ideal, minPosition: 0, maxPosition: 1.2, ...plantOver },
      gains,
      motionMagic: mm,
      controlPeriod: 0.001,
      initialPosition: 0.1,
      moves: [
        { time: 0.2, goal: 0.9 },
        { time: 2.5, goal: 0.1 },
      ],
      duration: 5,
      ...over,
    })

  it('齒輪箱效率：固定電壓下最後速度 = (V − kG/η)/kV', () => {
    const eta = 0.8
    const p = { ...ideal, gearboxEfficiency: eta }
    let s = { pos: 0, vel: 0 }
    for (let i = 0; i < 3000; i++) s = stepRK4(p, s, 8, 0.001)
    expect(s.vel).toBeCloseTo((8 - ideal.kG / eta) / ideal.kV, 3)
  })

  it('齒輪箱效率越低，跟隨誤差越大', () => {
    expect(run({}, { gearboxEfficiency: 0.7 }).moves[0].maxFollowingError).toBeGreaterThan(run().moves[0].maxFollowingError)
  })

  it('摩擦不對稱：往上摩擦大時，往上比往下落後更多', () => {
    const r = run({}, { frictionKs: 0.5, frictionKsDown: 0.05 })
    expect(r.moves[0].maxFollowingError).toBeGreaterThan(r.moves[1].maxFollowingError * 2)
  })

  it('Slot 切換：往下的移動用 Slot 1，各自補摩擦後兩個方向都準', () => {
    const plant = { frictionKs: 0.5, frictionKsDown: 0.1 }
    const one = run({}, plant)
    const two = run({ slotByDirection: { up: { kS: 0.5, kG: ff.kG }, down: { kS: 0.1, kG: ff.kG } } }, plant)
    expect(two.moves.map((m) => m.slot)).toEqual([0, 1])
    expect(one.moves.map((m) => m.slot)).toEqual([0, 0])
    expect(two.moves[0].maxFollowingError).toBeLessThan(one.moves[0].maxFollowingError)
    expect(two.moves[1].maxFollowingError).toBeLessThan(0.005)
  })

  it('換級 kG 跳變：超過換級高度後停在目標下面', () => {
    const r = run({ gains: { ...gains, kP: 10 } }, { kGStep: { position: 0.6, delta: 0.3 } })
    // 穩態 kP·e = 跳變量 → e = 0.3 / 10 = 3 cm
    expect(r.moves[0].steadyStateError).toBeCloseTo(0.03, 2)
  })

  it('感測延遲讓 kP 大時更容易振盪', () => {
    const g = { ...gains, kP: 150, kD: 0 }
    const noDelay = run({ gains: g })
    const delayed = run({ gains: g, sensor: { delay: 0.03, positionNoise: 0, velocityNoise: 0 } })
    expect(delayed.moves[0].overshoot).toBeGreaterThan(noDelay.moves[0].overshoot + 0.005)
  })

  it('感測雜訊加上 kD 很大，到位後輸出電壓亂跳', () => {
    const sensor = { delay: 0, positionNoise: 0.0005, velocityNoise: 0.01 }
    const small = run({ sensor, gains: { ...gains, kD: 0.5 } })
    const big = run({ sensor, gains: { ...gains, kD: 20 } })
    expect(big.moves[0].holdVoltageRipple).toBeGreaterThan(small.moves[0].holdVoltageRipple * 5)
  })

  it('同一組輸入雜訊可重現', () => {
    const sensor = { delay: 0.005, positionNoise: 0.001, velocityNoise: 0.01, seed: 1 }
    expect(run({ sensor }).pos[3000]).toBe(run({ sensor }).pos[3000])
  })

  it('關掉電壓飽和時，輸出可以超過電池電壓', () => {
    const fast = { cruiseVelocity: 10, acceleration: 40 }
    const on = run({ motionMagic: fast })
    const off = run({ motionMagic: fast, voltageLimit: false })
    expect(Math.max(...on.voltage)).toBeLessThanOrEqual(12 + 1e-9)
    expect(Math.max(...off.voltage)).toBeGreaterThan(12)
  })

  it('plantFromMechanism 的單獨開關', () => {
    const p = plantFromMechanism(DEFAULT_MECHANISM, ff, { realistic: true, currentLimit: false, batterySag: false, frictionKs: 0.3, frictionKsDown: 0.1 })
    expect(p.statorCurrentLimit).toBeNull()
    expect(p.batteryResistance).toBe(0)
    expect(p.frictionKsDown).toBe(0.1)
    const ideal2 = plantFromMechanism(DEFAULT_MECHANISM, ff, { realistic: false, gearboxEfficiency: 0.5, kGStepDelta: 1 })
    expect(ideal2.gearboxEfficiency).toBe(1)
    expect(ideal2.kGStep).toBeUndefined()
  })
})

describe('馬達控制器的限制（Current Limit、Soft Limit、Peak Output、Neutral Mode）', () => {
  const mm = { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration }
  const gains = { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP: 50, kI: 0, kD: 0 }
  const plant = { ...ideal, minPosition: 0, maxPosition: 1.2 }
  const run = (over: Partial<Parameters<typeof simulate>[0]> = {}, plantOver: Partial<PlantParams> = {}) =>
    simulate({
      plant: { ...plant, ...plantOver },
      gains,
      motionMagic: mm,
      controlPeriod: 0.001,
      initialPosition: 0.1,
      moves: [
        { time: 0.2, goal: 0.9 },
        { time: 2.5, goal: 0.1 },
      ],
      duration: 5,
      ...over,
    })

  it('Supply 電流限制：每顆馬達的電池端電流不超過上限，加速變慢', () => {
    const free = run()
    const lim = run({}, { supplyCurrentLimit: 15 })
    const perMotorMax = Math.max(...lim.supplyCurrent) / plant.motorCount
    expect(perMotorMax).toBeLessThan(15 * 1.02)
    expect(Math.max(...free.supplyCurrent) / plant.motorCount).toBeGreaterThan(15)
    expect(lim.moves[0].supplyLimitFraction).toBeGreaterThan(0)
    expect(lim.moves[0].maxFollowingError).toBeGreaterThan(free.moves[0].maxFollowingError)
  })

  it('Supply 限制比 Stator 限制寬鬆時不會觸發（低速時佔空比小）', () => {
    const r = run({}, { statorCurrentLimit: 40, supplyCurrentLimit: 200 })
    expect(r.moves[0].supplyLimitFraction).toBe(0)
  })

  it('軟體限位：目標在限位外面時，電梯停在限位附近，不會衝到目標', () => {
    const r = run({ output: { controller: 'talonfx', softLimit: { forward: 0.7, reverse: 0 } } })
    const maxPos = Math.max(...r.pos)
    // 到限位時還有速度，會衝過 1–3 cm：控制器只是在限位把輸出關掉，不會提前煞車
    expect(maxPos).toBeLessThan(0.75)
    expect(maxPos).toBeGreaterThan(0.69)
    expect(r.moves[0].softLimitFraction).toBeGreaterThan(0)
    expect(r.moves[0].steadyStateError).toBeGreaterThan(0.15)
  })

  it('軟體限位擋住時：Coast 比 Brake 往下掉得多（Brake 靠反電動勢煞住）', () => {
    const soft = { forward: 0.7, reverse: 0 }
    const brake = run({ output: { controller: 'talonfx', softLimit: soft, neutralMode: 'brake' } })
    const coast = run({ output: { controller: 'talonfx', softLimit: soft, neutralMode: 'coast' } })
    // 到限位後的最低點：Coast 放掉的時候重力直接拉下去
    const minAfter = (r: typeof brake) => Math.min(...Array.from(r.pos.slice(1500, 2400)))
    expect(minAfter(coast)).toBeLessThan(minAfter(brake))
  })

  it('輸出上限：往上最多 6 V 時，跑得比較慢、會飽和', () => {
    const free = run()
    const capped = run({ output: { controller: 'talonfx', peakForward: 6, peakReverse: 12 } })
    expect(Math.max(...capped.voltage)).toBeLessThanOrEqual(6 + 1e-9)
    expect(capped.moves[0].saturationFraction).toBeGreaterThan(0.1)
    expect(capped.moves[0].maxFollowingError).toBeGreaterThan(free.moves[0].maxFollowingError + 0.02)
  })

  it('輸出上限：往下限制 1 V（比 kG 還小）時，往下只能靠重力，下降被限制住', () => {
    const r = run({ output: { controller: 'talonfx', peakForward: 12, peakReverse: 1 } })
    expect(Math.min(...r.voltage)).toBeGreaterThanOrEqual(-1 - 1e-9)
  })

  it('SPARK MAX 沒開電壓補償：電池 10.5 V 時電壓少一截，停得比有補償低', () => {
    const low = { ...plant, batteryVoltage: 10.5 }
    const noComp = run({ plant: low, gains: { ...gains, kP: 10 }, output: { controller: 'sparkmax', voltageCompensation: null } })
    const comp = run({ plant: low, gains: { ...gains, kP: 10 }, output: { controller: 'sparkmax', voltageCompensation: 10 } })
    // 沒補償：kG 只剩 10.5/12，靜止時停在目標下面
    expect(noComp.moves[0].steadyStateError).toBeGreaterThan(comp.moves[0].steadyStateError + 0.003)
  })

  it('SPARK MAX 輸出範圍用佔空比：50% 在 12 V 電池 = 6 V', () => {
    const r = run({ plant: { ...plant, batteryVoltage: 12 }, output: { controller: 'sparkmax', peakForward: 0.5, peakReverse: 1, voltageCompensation: 12 } })
    expect(Math.max(...r.voltage)).toBeLessThanOrEqual(6 + 1e-9)
  })
})

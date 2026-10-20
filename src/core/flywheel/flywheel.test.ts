import { describe, expect, it } from 'vitest'
import { motorModel } from '../motors'
import {
  angleFromTurret,
  turretDeg,
  GAME_PIECES_2026,
  HUB_2026,
  HUB_TAG_TO_CENTER,
  computeFlywheelFeedforward,
  DEFAULT_FLYWHEEL,
  DEFAULT_FLYWHEEL_SPEC,
  DEFAULT_KNOBS,
  DEFAULT_PLAN,
  apexHeight,
  ballAt,
  dipFraction,
  backSurfaceRatio,
  exitRadius,
  releaseAhead,
  releaseHeight,
  releasePlan,
  impulseRadiusSq,
  exitSpeed,
  fastestSpinUp,
  flightTime,
  flywheelFailures,
  flywheelInertia,
  flywheelMetrics,
  launchRange,
  rangeAtWheel,
  shotOutcomes,
  simulateFlywheel,
  speedForRange,
  wheelForGoal,
  wheelLimit,
  moveWindow,
  moveFixes,
  NARROW_WINDOW,
  TRAJECTORY_ANGLES,
  trajectoryOptions,
  theoryGains,
  moveAims,
  moveOutcomes,
  movePose,
  solveMovingShot,
  STILL,
  GRAVITY,
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
    expect(weak).toHaveLength(DEFAULT_PLAN.shots)
    expect(weak[1].range).toBeLessThan(strong[1].range)
    expect(weak[1].miss).toBeLessThan(strong[1].miss)
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

describe('目標高度', () => {
  const a = (50 * Math.PI) / 180

  it('往下掉經過目標高度的那一刻，y 剛好是目標高度', () => {
    const v = 8
    const T = flightTime(v, a, 0.5, 2)
    expect(0.5 + ballAt(v, a, T).y).toBeCloseTo(2, 9)
    // 是往下掉的那一次：比最高點晚
    expect(T).toBeGreaterThan((v * Math.sin(a)) / 9.81)
  })

  it('目標越高，經過的地方越近；比最高點還高就打不到（NaN）', () => {
    const v = 8
    expect(launchRange(v, a, 0.5, 2)).toBeLessThan(launchRange(v, a, 0.5, 0))
    expect(launchRange(v, a, 0.5, apexHeight(v, a, 0.5) + 0.1)).toBeNaN()
  })

  it('反推球速：有目標高度也算得回原本的速度；往上飛時才經過的距離不算', () => {
    const v = 8
    expect(speedForRange(launchRange(v, a, 0.5, 2), a, 0.5, 2)).toBeCloseTo(v, 9)
    expect(speedForRange(0.5, a, 0.5, 2)).toBeNull()
  })

  it('要進目標的轉速：用那個轉速射，落點剛好是目標距離', () => {
    const w = wheelForGoal(DEFAULT_FLYWHEEL.wheelRadius, DEFAULT_PLAN)!
    expect(rangeAtWheel(w, DEFAULT_FLYWHEEL.wheelRadius, DEFAULT_PLAN)).toBeCloseTo(DEFAULT_PLAN.goalDistance, 9)
    // 預設目標大約要 50 rps
    expect(w / TAU).toBeGreaterThan(48)
    expect(w / TAU).toBeLessThan(52)
    expect(wheelForGoal(DEFAULT_FLYWHEEL.wheelRadius, { ...DEFAULT_PLAN, goalDistance: 0.3 })).toBeNull()
  })

  it('每一發：落點減目標距離，開口一半以內算進；打不到那麼高算沒進', () => {
    const res = run({ ...theory, kS: DEFAULT_KNOBS.friction, kP: 1 / TAU }).res
    const o = shotOutcomes(res, DEFAULT_FLYWHEEL, DEFAULT_PLAN)
    expect(o[0].miss).toBeCloseTo(o[0].range - DEFAULT_PLAN.goalDistance, 9)
    expect(o[0].hit).toBe(Math.abs(o[0].miss) <= DEFAULT_PLAN.goalWidth / 2)
    expect(o.every((x) => x.hit)).toBe(true)
    const high = shotOutcomes(res, DEFAULT_FLYWHEEL, { ...DEFAULT_PLAN, goalHeight: 10 })
    expect(high[0].range).toBeNaN()
    expect(high[0].hit).toBe(false)
  })

  it('每一發的落點用目標高度算；預設 2 m', () => {
    expect(DEFAULT_PLAN.goalHeight).toBe(2)
    const res = run({ ...theory, kS: DEFAULT_KNOBS.friction, kP: 1 / TAU }).res
    const o = shotOutcomes(res, DEFAULT_FLYWHEEL, DEFAULT_PLAN)
    expect(o[0].range).toBeCloseTo(launchRange(o[0].exit, DEFAULT_PLAN.angle, DEFAULT_PLAN.height, 2), 9)
    expect(o[0].range).toBeLessThan(launchRange(o[0].exit, DEFAULT_PLAN.angle, DEFAULT_PLAN.height, 0))
  })
})

describe('2026 HUB', () => {
  it('72 in 高、41.7 in 開口換成 m，預設機構換上去還打得到', () => {
    expect(HUB_2026.goalHeight).toBeCloseTo(1.829, 3)
    expect(HUB_2026.goalWidth).toBeCloseTo(1.059, 3)
    expect(wheelForGoal(DEFAULT_FLYWHEEL.wheelRadius, { ...DEFAULT_PLAN, ...HUB_2026 })).not.toBeNull()
  })

  it('tag 到中心 23.5 in；從 tag 量的距離加上去，要的轉速比直接用 tag 距離高', () => {
    expect(HUB_TAG_TO_CENTER).toBeCloseTo(0.597, 3)
    const plan = { ...DEFAULT_PLAN, ...HUB_2026, goalDistance: 3 }
    const toTag = wheelForGoal(DEFAULT_FLYWHEEL.wheelRadius, plan)!
    const toCenter = wheelForGoal(DEFAULT_FLYWHEEL.wheelRadius, { ...plan, goalDistance: 3 + HUB_TAG_TO_CENTER })!
    expect(toCenter).toBeGreaterThan(toTag)
  })
})

describe('2026 得分物件', () => {
  it('FUEL 0.448～0.500 lb 換成 kg', () => {
    const m = Object.fromEntries(GAME_PIECES_2026.map((p) => [p.id, p.mass]))
    expect(m['fuel-light']).toBe(0.203)
    expect(m['fuel-heavy']).toBe(0.227)
    expect(m.fuel).toBe(0.215)
  })
})

describe('對面也有滾輪（上下夾射）', () => {
  // 大輪半徑 2 in，對面滾輪 1 in、同一顆馬達 1:1：對面輪緣速度是大輪的一半
  const pinch = { ...DEFAULT_FLYWHEEL, back: 'rollers' as const, backRadius: 0.0254, backMass: 0.3, backRatio: 1 }
  it('固定導板的結果跟原本一樣', () => {
    expect(backSurfaceRatio(DEFAULT_FLYWHEEL)).toBe(0)
    expect(exitRadius(DEFAULT_FLYWHEEL)).toBe(DEFAULT_FLYWHEEL.wheelRadius)
    expect(impulseRadiusSq(DEFAULT_FLYWHEEL)).toBe(DEFAULT_FLYWHEEL.wheelRadius ** 2)
    expect(flywheelInertia(DEFAULT_FLYWHEEL)).toBeCloseTo(0.5 * 1.5 * 0.0508 ** 2, 12)
  })
  it('球速 = 兩邊輪緣速度的平均', () => {
    const w = 50 * TAU
    expect(backSurfaceRatio(pinch)).toBeCloseTo(0.5, 9)
    expect(exitSpeed(w, exitRadius(pinch))).toBeCloseTo(0.5 * (w * 0.0508 + w * 0.0254), 9)
    // 同樣的目標，要的轉速比較低
    expect(wheelForGoal(exitRadius(pinch), DEFAULT_PLAN)!).toBeLessThan(wheelForGoal(exitRadius(DEFAULT_FLYWHEEL), DEFAULT_PLAN)!)
  })
  it('對面滾輪的慣量照轉速比平方算進去', () => {
    const J0 = flywheelInertia(DEFAULT_FLYWHEEL)
    expect(flywheelInertia(pinch)).toBeCloseTo(J0 + 0.5 * 0.3 * 0.0254 ** 2, 12)
    expect(flywheelInertia({ ...pinch, backRatio: 2 })).toBeCloseTo(J0 + 0.5 * 0.3 * 0.0254 ** 2 * 4, 12)
  })
  it('估的掉速跟模擬接近，射出去的球速用夾射公式', () => {
    const ffp = computeFlywheelFeedforward(pinch)
    const g = { ...theoryGains(ffp), kP: 0 }
    const plan = { ...DEFAULT_PLAN, shots: 1 }
    const res = simulateFlywheel(pinch, g, IDEAL, plan)
    const k = Math.round(plan.firstShot / 0.001)
    const before = res.vel[k - 1]
    let low = Infinity
    for (let i = k; i < k + 40; i++) low = Math.min(low, res.vel[i])
    const frac = (before - low) / before
    expect(frac).toBeLessThan(dipFraction(pinch, plan.ballMass))
    expect(frac).toBeGreaterThan(0.5 * dipFraction(pinch, plan.ballMass))
    const o = shotOutcomes(res, pinch, plan)[0]
    expect(o.exit).toBeCloseTo(0.5 * o.wheel * (0.0508 + 0.0254), 9)
  })
})

describe('彈道：同一個距離的候選軌跡', () => {
  const ffd = computeFlywheelFeedforward(DEFAULT_FLYWHEEL)
  const lim = wheelLimit(ffd.freeSpeed, 0)
  const opts = trajectoryOptions(DEFAULT_FLYWHEEL, DEFAULT_PLAN, lim)
  it('每一條都剛好打到目標中心、往下掉進去', () => {
    expect(opts.length).toBeGreaterThan(3)
    for (const o of opts) {
      expect(launchRange(o.exit, o.angle, DEFAULT_PLAN.height, DEFAULT_PLAN.goalHeight)).toBeCloseTo(DEFAULT_PLAN.goalDistance, 6)
      expect(o.entry).toBeGreaterThan(0)
      expect(o.apex).toBeGreaterThan(DEFAULT_PLAN.goalHeight)
      expect(o.exit).toBeCloseTo(exitSpeed(o.wheel, exitRadius(DEFAULT_FLYWHEEL)), 9)
    }
  })
  it('容許誤差：差這麼多轉速剛好打到開口邊緣', () => {
    const o = opts.find((x) => x.tolerance !== null)!
    const edge = (w: number) => Math.abs(rangeAtWheel(w, exitRadius(DEFAULT_FLYWHEEL), { ...DEFAULT_PLAN, angle: o.angle }) - DEFAULT_PLAN.goalDistance)
    const lo = edge(o.wheel * (1 - o.tolerance!))
    const hi = edge(o.wheel * (1 + o.tolerance!))
    // 比較小的那邊剛好在邊緣，另一邊還在開口裡
    expect(Math.max(lo, hi)).toBeCloseTo(DEFAULT_PLAN.goalWidth / 2, 6)
    expect(Math.min(lo, hi)).toBeLessThanOrEqual(DEFAULT_PLAN.goalWidth / 2 + 1e-9)
  })
  it('仰角越高，進框角度越陡', () => {
    for (let i = 1; i < opts.length; i++) expect(opts[i].entry).toBeGreaterThan(opts[i - 1].entry)
  })
  it('打不進的仰角不列；轉速超過上限（預設空載的 90%）標成超過上限', () => {
    const far = trajectoryOptions(DEFAULT_FLYWHEEL, { ...DEFAULT_PLAN, goalDistance: 12 }, lim)
    expect(far.some((o) => !o.reachable)).toBe(true)
    const close = { ...DEFAULT_PLAN, goalDistance: 0.3 }
    expect(trajectoryOptions(DEFAULT_FLYWHEEL, close, lim, TRAJECTORY_ANGLES)).toEqual([])
    // 每 5° 都打不進時改每 0.1° 找：太近只有很陡的仰角掉得進去
    const steep = trajectoryOptions(DEFAULT_FLYWHEEL, close, lim)
    for (const o of steep) expect(o.angle).toBeGreaterThan((75 * Math.PI) / 180)
    expect(trajectoryOptions(DEFAULT_FLYWHEEL, { ...DEFAULT_PLAN, goalDistance: 0.05 }, lim)).toEqual([])
  })
})

describe('邊移動邊射', () => {
  const rx = exitRadius(DEFAULT_FLYWHEEL)
  const pitch = DEFAULT_PLAN.angle
  /** 照球對地的速度算落點：回傳往目標的距離、左右偏 */
  const land = (motion: { toward: number; side: number }) => {
    const s = solveMovingShot(rx, DEFAULT_PLAN, pitch, motion)!
    const along = s.exit * Math.cos(pitch) * Math.cos(s.yaw) + motion.toward
    const left = s.exit * Math.cos(pitch) * Math.sin(s.yaw) + motion.side
    const T = flightTime(s.exit, pitch, DEFAULT_PLAN.height, DEFAULT_PLAN.goalHeight)
    return { s, along: along * T, left: left * T }
  }
  it('機器人沒動時跟靜止的公式一樣', () => {
    expect(solveMovingShot(rx, DEFAULT_PLAN, pitch, STILL)!.wheel).toBeCloseTo(wheelForGoal(rx, DEFAULT_PLAN)!, 6)
    expect(solveMovingShot(rx, DEFAULT_PLAN, pitch, STILL)!.yaw).toBe(0)
  })
  it('補償後球對地剛好飛到目標中心（往目標、往後、側向都一樣）', () => {
    for (const m of [
      { toward: 1.5, side: 0 },
      { toward: -1, side: 0 },
      { toward: 0, side: 2 },
      { toward: 1, side: -1.5 },
    ]) {
      const r = land(m)
      expect(r.along).toBeCloseTo(DEFAULT_PLAN.goalDistance, 6)
      expect(r.left).toBeCloseTo(0, 9)
    }
  })
  it('往目標開要的轉速比較低、往後退比較高；往左開底盤要往右偏', () => {
    const still = wheelForGoal(rx, DEFAULT_PLAN)!
    expect(land({ toward: 1.5, side: 0 }).s.wheel).toBeLessThan(still)
    expect(land({ toward: -1.5, side: 0 }).s.wheel).toBeGreaterThan(still)
    const left = land({ toward: 0, side: 2 }).s
    expect(left.yaw).toBeLessThan(0)
    expect(left.wheel).toBeGreaterThan(still)
  })
  it('候選軌跡帶機器人速度：對地的軌跡打到目標中心', () => {
    const m = { toward: 1, side: 1 }
    const opts = trajectoryOptions(DEFAULT_FLYWHEEL, DEFAULT_PLAN, wheelLimit(ff.freeSpeed, 0), undefined, m)
    expect(opts.length).toBeGreaterThan(3)
    for (const o of opts) {
      expect(launchRange(o.fieldExit, o.fieldAngle, DEFAULT_PLAN.height, DEFAULT_PLAN.goalHeight)).toBeCloseTo(DEFAULT_PLAN.goalDistance, 6)
      expect(o.yaw).toBeLessThan(0)
    }
  })
  it('開很快、能打進的仰角範圍很窄時，改每 0.1° 找，還是有好幾條可以選', () => {
    const plan = { ...DEFAULT_PLAN, ...HUB_2026, goalDistance: 3.5 }
    const m = { toward: 3.5, side: 3.5 }
    // 每 5° 只找得到幾條
    expect(trajectoryOptions(DEFAULT_FLYWHEEL, plan, wheelLimit(ff.freeSpeed, 0), TRAJECTORY_ANGLES, m).length).toBeLessThan(5)
    const opts = trajectoryOptions(DEFAULT_FLYWHEEL, plan, wheelLimit(ff.freeSpeed, 0), undefined, m)
    expect(opts.length).toBe(6)
    for (let i = 1; i < opts.length; i++) expect(opts[i].angle).toBeGreaterThan(opts[i - 1].angle)
    for (const o of opts) expect(launchRange(o.fieldExit, o.fieldAngle, plan.height, plan.goalHeight)).toBeCloseTo(plan.goalDistance, 6)
    // 頭尾是能打進的最低、最高仰角：再低 0.1°、再高 0.1° 都打不進
    const rx = exitRadius(DEFAULT_FLYWHEEL)
    const deg = Math.PI / 1800
    expect(solveMovingShot(rx, plan, opts[0].angle - deg, m)).toBeNull()
    expect(solveMovingShot(rx, plan, opts[5].angle + deg, m)).toBeNull()
    // 站著射每 5° 就夠多，不會改
    expect(trajectoryOptions(DEFAULT_FLYWHEEL, plan, wheelLimit(ff.freeSpeed, 0)).map((o) => o.angle)).toEqual(trajectoryOptions(DEFAULT_FLYWHEEL, plan, wheelLimit(ff.freeSpeed, 0), TRAJECTORY_ANGLES).map((o) => o.angle))
  })
  it('轉速上限：只從上限內的仰角挑；上限填太高也只算到空載的 90%', () => {
    expect(wheelLimit(ff.freeSpeed, 0)).toBeCloseTo(ff.freeSpeed * 0.9, 9)
    expect(wheelLimit(ff.freeSpeed, 1e6)).toBeCloseTo(ff.freeSpeed * 0.9, 9)
    expect(wheelLimit(ff.freeSpeed, 40)).toBeCloseTo(40 * TAU, 9)
    const plan = { ...DEFAULT_PLAN, ...HUB_2026, goalDistance: 3.5 }
    const m = { toward: 3.5, side: 3.5 }
    const free = trajectoryOptions(DEFAULT_FLYWHEEL, plan, wheelLimit(ff.freeSpeed, 0), undefined, m)
    // 上限設在中間：挑出來的都在上限內，而且還是有好幾條
    const cap = (free[0].wheel + free[free.length - 1].wheel) / 2
    const opts = trajectoryOptions(DEFAULT_FLYWHEEL, plan, cap, undefined, m)
    expect(opts.length).toBeGreaterThan(2)
    for (const o of opts) {
      expect(o.reachable).toBe(true)
      expect(o.wheel).toBeLessThanOrEqual(cap)
    }
    // 上限低到一條都不行：還是列出來，全部標成超過上限
    const none = trajectoryOptions(DEFAULT_FLYWHEEL, plan, 1, undefined, m)
    expect(none.length).toBeGreaterThan(0)
    expect(none.every((o) => !o.reachable)).toBe(true)
  })
  it('邊開邊射要的轉速超過上限：只給到上限，標出來', () => {
    const plan = { ...DEFAULT_PLAN, shots: 4, interval: 0.5 }
    const motion = { toward: -1.5, side: 0 }
    const free = moveAims(DEFAULT_FLYWHEEL, plan, { motion, compensate: true })
    // 往後退，越來越遠，要的轉速越來越高
    const cap = (free[0].target + free[3].target) / 2
    const aims = moveAims(DEFAULT_FLYWHEEL, plan, { motion, compensate: true, maxWheel: cap })
    expect(aims[0].capped).toBe(false)
    expect(aims[0].target).toBe(free[0].target)
    expect(aims[3].capped).toBe(true)
    expect(aims[3].target).toBe(cap)
    for (const a of aims) expect(a.target).toBeLessThanOrEqual(cap)
  })
  it('範圍不到 1° 也找得到（3 m、往目標 5、側向 5 m/s 只有 45.3°～45.8°）', () => {
    const plan = { ...DEFAULT_PLAN, ...HUB_2026, goalDistance: 3 }
    const m = { toward: 5, side: 5 }
    const opts = trajectoryOptions(DEFAULT_FLYWHEEL, plan, wheelLimit(ff.freeSpeed, 0), undefined, m)
    expect(opts.length).toBeGreaterThan(2)
    for (const o of opts) {
      expect((o.angle * 180) / Math.PI).toBeGreaterThan(45)
      expect((o.angle * 180) / Math.PI).toBeLessThan(46)
    }
  })
  it('修正意見：範圍太窄時，一次改一個參數，找最近、範圍有 3° 以上的值', () => {
    const plan = { ...DEFAULT_PLAN, ...HUB_2026, goalDistance: 3 }
    const m = { toward: 5, side: 5 }
    const lim = wheelLimit(ff.freeSpeed, 0)
    const rx = exitRadius(DEFAULT_FLYWHEEL)
    expect(moveWindow(rx, plan, m, lim, Math.PI / 1800)!.width).toBeLessThan(NARROW_WINDOW)
    const fixes = moveFixes(DEFAULT_FLYWHEEL, plan, m, lim, lim)
    const by = (p: string) => fixes.find((x) => x.param === p)!
    // 開慢一點：往目標方向的速度變小，範圍有 3° 以上；再快 0.1 m/s 就不夠
    const t = by('toward')
    expect(t.value).toBeLessThan(5)
    expect(t.window.width).toBeGreaterThanOrEqual(NARROW_WINDOW - 1e-9)
    expect(moveWindow(rx, plan, { ...m, toward: t.value + 0.1 }, lim)!.width).toBeLessThan(NARROW_WINDOW)
    expect(by('side').value).toBeLessThan(5)
    // 離遠一點
    const d = by('distance')
    expect(d.value).toBeGreaterThan(3)
    expect(moveWindow(rx, { ...plan, goalDistance: d.value }, m, lim)!.width).toBeGreaterThanOrEqual(NARROW_WINDOW - 1e-9)
    // 轉速上限已經是馬達的上限，不會叫你提高
    expect(fixes.some((x) => x.param === 'limit')).toBe(false)
  })
  it('修正意見：轉速上限卡住時，建議提高到剛好夠的 rps', () => {
    const plan = { ...DEFAULT_PLAN, ...HUB_2026, goalDistance: 3.5 }
    const m = { toward: 0, side: 1.5 }
    const motorMax = wheelLimit(ff.freeSpeed, 0)
    const fix = moveFixes(DEFAULT_FLYWHEEL, plan, m, 20 * TAU, motorMax).find((x) => x.param === 'limit')!
    expect(fix.value).toBeGreaterThan(20 * TAU)
    const rx = exitRadius(DEFAULT_FLYWHEEL)
    expect(moveWindow(rx, plan, m, fix.value - TAU)?.width ?? 0).toBeLessThan(NARROW_WINDOW)
  })
  it('第一發時機器人在目標正前方，之後照速度移動', () => {
    const p0 = movePose(DEFAULT_PLAN, { toward: 1, side: 2 }, DEFAULT_PLAN.firstShot)
    expect(p0.distance).toBeCloseTo(DEFAULT_PLAN.goalDistance, 12)
    expect(p0.motion.toward).toBeCloseTo(1, 12)
    expect(p0.motion.side).toBeCloseTo(2, 12)
    const p1 = movePose(DEFAULT_PLAN, { toward: 1, side: 2 }, DEFAULT_PLAN.firstShot + 1)
    expect(p1.distance).toBeCloseTo(Math.hypot(DEFAULT_PLAN.goalDistance - 1, 2), 12)
    // 速度大小不變，只是換到新的方向來看
    expect(Math.hypot(p1.motion.toward, p1.motion.side)).toBeCloseTo(Math.hypot(1, 2), 12)
  })
  it('每一發換目標轉速：模擬的目標跟著換', () => {
    const plan = { ...DEFAULT_PLAN, shots: 3, interval: 0.5 }
    const targets = [40 * TAU, 45 * TAU, 50 * TAU]
    const res = simulateFlywheel(DEFAULT_FLYWHEEL, theory, IDEAL, plan, targets)
    expect(res.shotTargets).toEqual(targets)
    const at = (t: number) => res.ref[Math.round(t / 0.001)]
    expect(at(plan.firstShot - 0.1)).toBe(targets[0])
    expect(at(plan.firstShot + 0.1)).toBe(targets[1])
    expect(at(plan.firstShot + 0.6)).toBe(targets[2])
  })
  it('側向開：有補償會進，沒補償球往開的方向偏', () => {
    const plan = { ...DEFAULT_PLAN, shots: 1, goalWidth: 0.6 }
    const g = { ...theory, kS: 0, kP: 2 / TAU }
    const one = (compensate: boolean) => {
      const setup = { motion: { toward: 0, side: 2 }, compensate }
      const aims = moveAims(DEFAULT_FLYWHEEL, plan, setup)
      const res = simulateFlywheel(DEFAULT_FLYWHEEL, g, IDEAL, plan, aims.map((a) => a.target))
      return moveOutcomes(res, DEFAULT_FLYWHEEL, plan, aims)[0]
    }
    const on = one(true)
    const off = one(false)
    expect(on.hit).toBe(true)
    expect(Math.hypot(on.landX, on.landY)).toBeLessThan(0.1)
    expect(off.hit).toBe(false)
    // 往左開、沒補償：球偏左（偏右的距離是負的）
    expect(off.side).toBeLessThan(-0.3)
    expect(off.landY).toBeGreaterThan(0.3)
  })
  it('太近射不進的時候算不出來', () => {
    expect(solveMovingShot(rx, { ...DEFAULT_PLAN, goalDistance: 0.3 }, pitch, { toward: 1, side: 0 })).toBeNull()
    expect(GRAVITY).toBeCloseTo(9.81, 9)
  })
})

describe('砲台角度（決策 130）', () => {
  it('正上方 0°、水平朝目標 90°：仰角 50° 是 40°', () => {
    expect(turretDeg((50 * Math.PI) / 180)).toBeCloseTo(40, 10)
    expect(turretDeg(Math.PI / 2)).toBeCloseTo(0, 10)
    expect(turretDeg(0)).toBe(90)
    expect(angleFromTurret(40)).toBeCloseTo((50 * Math.PI) / 180, 12)
    expect(angleFromTurret(turretDeg(0.3))).toBeCloseTo(0.3, 12)
  })
})

describe('砲台位置和目標距離的量法', () => {
  const r = DEFAULT_FLYWHEEL.wheelRadius
  const geo = { ...DEFAULT_PLAN, barrel: 0.3, distanceFrom: 'center' as const, pivotAhead: -0.2 }

  it('出射點 = 轉軸 + 沿射出方向的 barrel', () => {
    const a = DEFAULT_PLAN.angle
    expect(releaseHeight(geo)).toBeCloseTo(0.5 + 0.3 * Math.sin(a), 12)
    expect(releaseAhead(geo)).toBeCloseTo(-0.2 + 0.3 * Math.cos(a), 12)
    const rel = releasePlan(geo)
    expect(rel.goalDistance).toBeCloseTo(DEFAULT_PLAN.goalDistance - releaseAhead(geo), 12)
    // 換過再換一次不會變
    expect(releasePlan(rel)).toEqual(rel)
  })

  it('從砲台轉軸量時，pivotAhead 不算', () => {
    expect(releaseAhead({ ...DEFAULT_PLAN, pivotAhead: 0.5 })).toBe(0)
  })

  it('預設（從轉軸量、barrel = 0）跟原本一樣', () => {
    expect(releasePlan(DEFAULT_PLAN)).toEqual(DEFAULT_PLAN)
  })

  it('轉速照出射點算，落點從量距離那一點算', () => {
    const w = wheelForGoal(r, geo)!
    expect(w).toBeCloseTo(wheelForGoal(r, releasePlan(geo))!, 9)
    expect(rangeAtWheel(w, r, geo)).toBeCloseTo(geo.goalDistance, 9)
    // 轉軸在機器人中心前面 0.5 m：從中心量 4.6 m = 從轉軸量 4.1 m
    const ahead = { ...DEFAULT_PLAN, distanceFrom: 'center' as const, pivotAhead: 0.5 }
    expect(wheelForGoal(r, ahead)).toBeCloseTo(wheelForGoal(r, { ...DEFAULT_PLAN, goalDistance: 4.1 })!, 9)
  })

  it('候選軌跡每一條都從那個砲台角度的出射點打到目標中心', () => {
    for (const o of trajectoryOptions(DEFAULT_FLYWHEEL, geo, Infinity)) {
      const d = launchRange(o.exit, o.angle, releaseHeight(geo, o.angle), geo.goalHeight) + releaseAhead(geo, o.angle)
      expect(d).toBeCloseTo(geo.goalDistance, 6)
    }
  })

  it('邊移動邊射沒在動時跟站著射一樣', () => {
    const s = solveMovingShot(exitRadius(DEFAULT_FLYWHEEL), geo, geo.angle, STILL)!
    expect(s.wheel).toBeCloseTo(wheelForGoal(exitRadius(DEFAULT_FLYWHEEL), geo)!, 6)
  })
})

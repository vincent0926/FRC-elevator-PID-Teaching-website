import { describe, expect, it } from 'vitest'
import { runDataChecks } from '../../core/analysis/checks'
import { diagnose, estimateRobotGains, oscillationBehindRefusal, type IssueKey } from '../../core/analysis/diagnose'
import { computeFeedforward, kPFromVoltsPerCm } from '../../core/feedforward'
import { alignSeries, suggestMapping } from '../../core/log/fieldMap'
import { extractSeries, scanWpilog } from '../../core/log/reader'
import { makeSampleLog } from '../../core/log/sampleLog'
import type { Move } from '../../core/physics/simulate'
import { DEFAULT_MECHANISM, type ElevatorMechanism, type ParameterSet } from '../../schema/parameterSet'
import { SAMPLE_FRICTION, SCENARIOS, type ScenarioBuild } from './sampleScenarios'

/**
 * Phase 2 完成標準：用模擬器故意設錯參數，診斷找到的第一優先問題要對。
 * 單一參數錯誤（前饋四個參數）加上參數正確、振盪，正確率要 ≥ 90%。
 * kP、kD 的判斷要先有「前饋補不到的東西」才看得出來，用固定情境驗證（上面的 SCENARIOS）。
 */

function theoryOf(m: ElevatorMechanism) {
  const ff = computeFeedforward(m)
  const theory: ParameterSet = {
    schemaVersion: 1,
    source: 'theory',
    createdAt: '2026-01-01T00:00:00Z',
    mechanism: m,
    feedforward: { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA },
    feedback: { kP: kPFromVoltsPerCm(0.5), kI: 0, kD: 0 },
    motionMagic: { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration },
  }
  return { ff, theory }
}

/** robot：機器人上真正跑的參數（預設 = b.gains）；b.gains 是使用者選的參數組 */
async function run(m: ElevatorMechanism, b: ScenarioBuild, opts: { moves?: Move[]; seed?: number; duration?: number } = {}, robot = b.gains) {
  const ff = computeFeedforward(m)
  const bytes = makeSampleLog({ mechanism: m, ff, ...b, gains: robot, ...opts })
  const scan = await scanWpilog([bytes])
  const map = suggestMapping(scan.entries)
  const series = await extractSeries([bytes], Object.values(map).flatMap((r) => (r.entry ? [r.entry] : [])))
  const log = alignSeries(series, map)
  const checks = runDataChecks(log, { statorCurrentLimit: m.statorCurrentLimit })
  if (!checks.ok) {
    const refusal = oscillationBehindRefusal(log, b.gains)
    return { checks, d: null, est: null, refusedBy: refusal?.key ?? null, refusal }
  }
  // 前饋欄位推得回來；kP、kD 推不準時用「使用者選的參數組」，這裡用機器人上真正的值
  const est = estimateRobotGains(log, b.gains)
  const d = diagnose(log, checks, est?.gains ?? b.gains, b.motionMagic, { statorCurrentLimit: m.statorCurrentLimit, controlPeriod: b.controlPeriod })
  return { checks, d, est, refusedBy: null, refusal: null }
}

// 步驟 0 擋下時，如果看得出是振盪，也算找對
const primaryOf = (r: Awaited<ReturnType<typeof run>>): IssueKey | null | 'refused' => (r.d ? (r.d.primary?.key ?? null) : (r.refusedBy ?? 'refused'))

describe('診斷：練習用情境', () => {
  const m = DEFAULT_MECHANISM
  const { ff, theory } = theoryOf(m)
  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s', async (_, sc) => {
    const r = await run(m, sc.build(theory, ff))
    expect(primaryOf(r)).toBe(sc.expect)
  })

  it('kD 放大雜訊：建議降 kD，不是降 kP', async () => {
    const r = await run(m, SCENARIOS.find((s) => s.id === 'noisyKd')!.build(theory, ff))
    // kD 放大的雜訊常常頂到電流限制，步驟 0 就擋下；擋下時也要指出是 kD
    const issue = r.d?.primary ?? r.refusal
    const c = issue?.change
    expect(c?.kind === 'gain' && c.param).toBe('kD')
    if (c?.kind === 'gain') expect(c.to).toBeLessThan(c.from * 0.5)
  })

  it('kD 放大雜訊，但日誌推不出 kD（用理論值 kD = 0 當參數組）：仍然指出是 kD，不叫你降 kP', async () => {
    const b = SCENARIOS.find((s) => s.id === 'noisyKd')!.build(theory, ff)
    const r = await run(m, { ...b, gains: { ...b.gains, kD: 0 } }, {}, { ...b.gains })
    const issue = r.d?.primary ?? r.refusal
    expect(issue?.summary).toContain('kD')
    expect(issue?.change?.kind === 'gain' && issue.change.param === 'kP').toBe(false)
  })

  it('摩擦不對稱：照建議改 kG 之後就沒有問題了（不需要 Slot 1）', async () => {
    const b = SCENARIOS.find((s) => s.id === 'asymFriction')!.build(theory, ff)
    const r = await run(m, b)
    const c = r.d!.primary!.change!
    if (c.kind !== 'gain' || c.param !== 'kG') throw new Error('應該先改 kG')
    // 最佳 kG = 真 kG + (往上摩擦 − 往下摩擦) / 2
    expect(c.to).toBeCloseTo(ff.kG + 0.15, 1)
    expect(r.d!.notes.some((n) => n.includes('Slot 1'))).toBe(true)
    const r2 = await run(m, { ...b, gains: { ...b.gains, kG: c.to } })
    expect(r2.d!.primary).toBeNull()
  })

  it('從日誌推回的前饋參數跟機器人上一樣', async () => {
    const b = SCENARIOS.find((s) => s.id === 'lowKg')!.build(theory, ff)
    const r = await run(m, b)
    expect(r.est!.gains.kG).toBeCloseTo(b.gains.kG, 2)
    expect(r.est!.gains.kV).toBeCloseTo(b.gains.kV, 1)
    expect(r.est!.gains.kS).toBeCloseTo(SAMPLE_FRICTION, 1)
  })

  it('建議值會往真實機構靠近', async () => {
    for (const id of ['lowKg', 'highKv', 'noKs', 'lowKa']) {
      const b = SCENARIOS.find((s) => s.id === id)!.build(theory, ff)
      const r = await run(m, b)
      const c = r.d!.primary!.change!
      if (c.kind !== 'gain') throw new Error('應該是改參數')
      const truth = c.param === 'kS' ? SAMPLE_FRICTION : (ff as unknown as Record<string, number>)[c.param]
      // 改完之後離真實值的距離，至少縮小到原本的 30%
      expect(Math.abs(c.to - truth)).toBeLessThan(0.3 * Math.abs(c.from - truth))
    }
  })
})

// ---------- 隨機情境：嚴重程度、移動方式、機構都不固定 ----------

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

const MECHS: ElevatorMechanism[] = [
  DEFAULT_MECHANISM,
  { ...DEFAULT_MECHANISM, name: '單級重電梯', rig: 'continuous', stages: [{ mass: 9, speedRatio: 1 }], payloadMass: 2, gearRatio: 9, travel: 1.0 },
  { ...DEFAULT_MECHANISM, name: '三級串級', stages: [{ mass: 5, speedRatio: 1 }, { mass: 3.5, speedRatio: 2 }, { mass: 2.5, speedRatio: 3 }], gearRatio: 12, drumRadius: 0.022, travel: 0.9 },
]

type Family = { expect: IssueKey | null; make(p: ParameterSet, r: () => number): ScenarioBuild }
const between = (r: () => number, a: number, b: number) => a + (b - a) * r()
const pm = (r: () => number, lo: [number, number], hi: [number, number]) => (r() < 0.5 ? between(r, ...lo) : between(r, ...hi))
const g0 = (p: ParameterSet) => ({ ...p.feedforward, ...p.feedback, kS: SAMPLE_FRICTION })

const FAMILIES: Family[] = [
  { expect: null, make: (p) => ({ gains: g0(p), motionMagic: p.motionMagic }) },
  { expect: 'kG', make: (p, r) => ({ gains: { ...g0(p), kG: p.feedforward.kG * pm(r, [0.5, 0.75], [1.25, 1.5]) }, motionMagic: p.motionMagic }) },
  { expect: 'kS', make: (p, r) => ({ gains: { ...g0(p), kS: r() < 0.5 ? 0 : between(r, 0.35, 0.5) }, motionMagic: p.motionMagic }) },
  { expect: 'kV', make: (p, r) => ({ gains: { ...g0(p), kV: p.feedforward.kV * pm(r, [0.7, 0.85], [1.15, 1.35]) }, motionMagic: p.motionMagic }) },
  { expect: 'kA', make: (p, r) => ({ gains: { ...g0(p), kA: p.feedforward.kA * pm(r, [0.1, 0.4], [2, 2.6]) }, motionMagic: p.motionMagic }) },
  // 振盪開始的 kP 大約跟 (kA + kV·τ)/τ² 成正比（τ = 20 ms）：慣性越大、反電動勢阻尼越大，越不容易抖
  { expect: 'oscillation', make: (p, r) => ({ gains: { ...g0(p), kP: between(r, 1.8, 2.6) * ((p.feedforward.kA + p.feedforward.kV * 0.02) / 0.02 ** 2) }, motionMagic: p.motionMagic, controlPeriod: 0.02 }) },
]

function randomMoves(r: () => number, travel: number): { moves: Move[]; duration: number } {
  const moves: Move[] = []
  let t = 1
  let prev = 0
  for (let k = 0; k < 5; k++) {
    let goal = between(r, 0.05, 0.9) * travel
    // 上下交替，確保兩個方向都有
    if ((k % 2 === 0) !== goal > prev) goal = k % 2 === 0 ? Math.min(0.95 * travel, prev + between(r, 0.2, 0.6) * travel) : Math.max(0.03 * travel, prev - between(r, 0.2, 0.6) * travel)
    moves.push({ time: t, goal })
    prev = goal
    t += between(r, 2, 2.8)
  }
  return { moves, duration: t + 0.5 }
}

describe('診斷：隨機單一參數錯誤', () => {
  it('第一優先問題的正確率 ≥ 90%', async () => {
    const r = rng(9427)
    const results: { family: string; mech: string; got: string; want: string; meaningful: boolean; ok: boolean }[] = []
    for (let rep = 0; rep < 12; rep++) {
      for (const fam of FAMILIES) {
        const mech = MECHS[Math.floor(r() * MECHS.length)]
        const { ff, theory } = theoryOf(mech)
        void ff
        // 照單元一建議的錄法：加速段至少 0.15 s，50 Hz 日誌才抓得到（步驟 0 會檢查）
        const mm = theory.motionMagic
        const b = fam.make({ ...theory, motionMagic: { ...mm, acceleration: Math.min(mm.acceleration, mm.cruiseVelocity / 0.15) } }, r)
        const mv = randomMoves(r, mech.travel)
        const res = await run(mech, b, { ...mv, seed: Math.floor(r() * 1e9) })
        if (!res.est) console.log('推不回參數', fam.expect, mech.name)
        // 誤差造成的電壓影響太小（低於規則門檻），沒被報出來也算合理；報成別的參數才算錯
        const t0 = g0(theory)
        const mmUsed = b.motionMagic
        const effect: Record<string, number> = {
          kG: Math.abs(b.gains.kG - t0.kG),
          kS: Math.abs(b.gains.kS - t0.kS),
          kV: Math.abs(b.gains.kV - t0.kV) * mmUsed.cruiseVelocity,
          kA: Math.abs(b.gains.kA - t0.kA) * mmUsed.acceleration,
        }
        const minEffect: Record<string, number> = { kG: 0.08, kS: 0.06, kV: 0.15, kA: 0.2 }
        const meaningful = fam.expect === null || fam.expect === 'oscillation' || effect[fam.expect] >= minEffect[fam.expect]
        const got = String(primaryOf(res))
        results.push({ family: String(fam.expect), mech: mech.name, got, want: String(fam.expect), meaningful, ok: got === String(fam.expect) || (!meaningful && got === 'null') })
      }
    }
    const main = results.filter((x) => x.meaningful)
    const accMain = main.filter((x) => x.got === x.want).length / main.length
    const accAll = results.filter((x) => x.ok).length / results.length
    const wrong = results.filter((x) => !x.ok || (x.meaningful && x.got !== x.want))
    console.log(`影響夠大的錯誤 ${main.length} 筆，正確率 ${(accMain * 100).toFixed(0)}%；全部 ${results.length} 筆（小誤差沒報也算對）${(accAll * 100).toFixed(0)}%`)
    if (wrong.length) console.log('錯的：', wrong)
    expect(accMain).toBeGreaterThanOrEqual(0.9)
    expect(accAll).toBeGreaterThanOrEqual(0.9)
  }, 120000)
})

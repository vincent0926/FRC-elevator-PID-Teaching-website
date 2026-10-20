import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FLYWHEEL, DEFAULT_PLAN, exitRadius, solveMovingShot } from '../src/core/flywheel/flywheel'
import { moveShotJava } from '../src/core/codegen/flywheel'

/** 1F 邊移動邊射產生的 ShootOnTheMove.java 要跟網站算的一樣（決策 129） */

const TAU = 2 * Math.PI

const PLANS = [
  { name: '從砲台轉軸量', plan: { ...DEFAULT_PLAN, angle: (45.3 * Math.PI) / 180, goalDistance: 3 } },
  // 轉軸在機器人中心後面 0.2 m、出射點離轉軸 0.3 m：Java 要自己扣掉出射點的偏移
  { name: '從機器人中心量、有轉軸到出射點的距離', plan: { ...DEFAULT_PLAN, angle: (45.3 * Math.PI) / 180, goalDistance: 3, barrel: 0.3, distanceFrom: 'center' as const, pivotAhead: -0.2 } },
]

describe.each(PLANS)('邊移動邊射的 Java 和網站一致（$name）', ({ plan }) => {
  const java = moveShotJava(DEFAULT_FLYWHEEL, plan, 90 * TAU, 0.04)

  // 有 javac 才跑：編譯產生的程式，結果要跟網站的 solveMovingShot 一樣
  let hasJava = true
  try {
    execFileSync('javac', ['-version'], { stdio: 'ignore' })
  } catch {
    hasJava = false
  }
  it.skipIf(!hasJava)('Java 算出來的轉速、偏角跟網站一樣', () => {
    const cases: [number, number, number][] = [
      [3, 0, 0],
      [3, 2, 1],
      [5, -1.5, -2],
      [4.6, 1, 3],
      [0.5, 0, 0],
      [3, 5, 5],
    ]
    const dir = mkdtempSync(join(tmpdir(), 'sotm-'))
    try {
      const main = `public class Main { public static void main(String[] a) { double[][] c = ${JSON.stringify(cases).replace(/\[/g, '{').replace(/\]/g, '}')}; for (double[] x : c) { ShootOnTheMove.Shot s = ShootOnTheMove.solve(x[0], x[1], x[2]); System.out.println(s == null ? "null" : s.rps() + " " + s.yaw()); } } }`
      writeFileSync(join(dir, 'ShootOnTheMove.java'), java)
      writeFileSync(join(dir, 'Main.java'), main)
      execFileSync('javac', ['-d', dir, join(dir, 'ShootOnTheMove.java'), join(dir, 'Main.java')], { stdio: 'pipe' })
      const out = execFileSync('java', ['-cp', dir, 'Main'], { encoding: 'utf8' }).trim().split('\n')
      const rx = exitRadius(DEFAULT_FLYWHEEL)
      let solved = 0
      cases.forEach(([d, toward, side], i) => {
        const ts = solveMovingShot(rx, { ...plan, goalDistance: d }, plan.angle, { toward, side })
        const ok = ts !== null && ts.wheel <= 90 * TAU
        if (!ok) return expect(out[i]).toBe('null')
        solved++
        const [rps, yaw] = out[i].split(' ').map(Number)
        expect(rps).toBeCloseTo(ts.wheel / TAU, 3)
        expect(yaw).toBeCloseTo(ts.yaw, 6)
      })
      expect(solved).toBeGreaterThanOrEqual(3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30000)
})

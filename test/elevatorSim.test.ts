import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeFeedforward } from '../src/core/feedforward'
import { plantFromMechanism, stepRK4, type PlantState } from '../src/core/physics/elevator'
import { DEFAULT_MECHANISM, type ElevatorMechanism } from '../src/schema/parameterSet'

/**
 * Phase 0 完成標準：物理引擎與 WPILib ElevatorSim 的位置誤差 < 1%。
 * 參考資料由 test/fixtures/elevatorsim/GenerateReference.java 用 WPILib 2026.2.2 產生，
 * 兩邊吃同一串開迴路電壓（每 1 ms 固定）。ElevatorSim 只有單一質量，所以用單級電梯比較。
 */

const REFERENCE: ElevatorMechanism = {
  ...DEFAULT_MECHANISM,
  motor: 'krakenX60',
  motorCount: 2,
  gearRatio: 5,
  drumRadius: 0.0191,
  rig: 'cascade',
  stages: [{ mass: 8, speedRatio: 1 }],
  payloadMass: 0,
  counterweightForce: 0,
  travel: 1.5,
}

const rows = readFileSync(new URL('./fixtures/elevatorsim/kraken2-g5-8kg.csv', import.meta.url), 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.split(',').map(Number))

describe('與 WPILib ElevatorSim 比較', () => {
  const plant = plantFromMechanism(REFERENCE, computeFeedforward(REFERENCE), { realistic: false })
  let s: PlantState = { pos: rows[0][2], vel: rows[0][3] }
  let maxPosErr = 0
  let maxVelErr = 0
  let lo = Infinity
  let hi = -Infinity
  let peakVel = 0
  for (let i = 0; i < rows.length; i++) {
    const [, volts, pos, vel] = rows[i]
    maxPosErr = Math.max(maxPosErr, Math.abs(s.pos - pos))
    maxVelErr = Math.max(maxVelErr, Math.abs(s.vel - vel))
    lo = Math.min(lo, pos)
    hi = Math.max(hi, pos)
    peakVel = Math.max(peakVel, Math.abs(vel))
    s = stepRK4(plant, s, volts, 0.001)
  }

  it('參考資料有實際移動', () => {
    expect(rows.length).toBe(2501)
    expect(hi - lo).toBeGreaterThan(0.2)
  })

  it('位置誤差 < 移動範圍的 1%', () => {
    expect(maxPosErr / (hi - lo)).toBeLessThan(0.01)
  })

  it('速度誤差 < 峰值速度的 1%', () => {
    expect(maxVelErr / peakVel).toBeLessThan(0.01)
  })
})

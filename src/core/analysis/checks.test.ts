import { describe, expect, it } from 'vitest'
import { runDataChecks } from './checks'
import { computeFeedforward } from '../feedforward'
import { plantFromMechanism } from '../physics/elevator'
import { simulate } from '../physics/simulate'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import type { AlignedLog } from '../log/fieldMap'

const ff = computeFeedforward(DEFAULT_MECHANISM)

/** 用模擬器產生一份「日誌」，降到 50 Hz */
function simLog(opts: { cruise?: number; accel?: number; moves?: { time: number; goal: number }[] } = {}): AlignedLog {
  const plant = plantFromMechanism(DEFAULT_MECHANISM, ff, { realistic: true })
  const r = simulate({
    plant,
    gains: { kS: 0.15, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP: 50, kI: 0, kD: 0 },
    motionMagic: { cruiseVelocity: opts.cruise ?? ff.cruiseVelocity, acceleration: opts.accel ?? ff.acceleration },
    controlPeriod: 0.001,
    initialPosition: 0,
    moves: opts.moves ?? [{ time: 0.5, goal: 0.9 }, { time: 3, goal: 0.1 }],
    duration: 6,
  })
  const idx: number[] = []
  for (let i = 0; i < r.t.length; i += 20) idx.push(i)
  const pick = (a: Float64Array) => Float64Array.from(idx.map((i) => a[i]))
  return {
    t: pick(r.t),
    cols: {
      position: pick(r.pos),
      velocity: pick(r.vel),
      reference: pick(r.refPos),
      referenceSlope: pick(r.refVel),
      appliedVolts: pick(r.voltage),
      statorCurrent: pick(r.statorCurrent),
      supplyVoltage: pick(r.supplyVoltage),
    },
  }
}

describe('runDataChecks', () => {
  it('正常的上下來回資料通過', () => {
    const rep = runDataChecks(simLog(), { statorCurrentLimit: DEFAULT_MECHANISM.statorCurrentLimit })
    const bad = rep.items.filter((i) => i.status === 'fail')
    expect(bad).toEqual([])
    expect(rep.ok).toBe(true)
  })

  it('要求的速度超過馬達能力：電壓飽和或電流限制', () => {
    const rep = runDataChecks(simLog({ cruise: ff.maxVelocity * 3, accel: ff.maxAccelUp * 4 }), { statorCurrentLimit: DEFAULT_MECHANISM.statorCurrentLimit })
    const phys = rep.items.filter((i) => (i.key === 'saturation' || i.key === 'currentLimit') && i.status !== 'pass')
    expect(phys.length).toBeGreaterThan(0)
  })

  it('只往上移動時警告激勵不對稱', () => {
    const rep = runDataChecks(simLog({ moves: [{ time: 0.5, goal: 0.9 }] }), { statorCurrentLimit: 60 })
    expect(rep.items.find((i) => i.key === 'excitation')!.status).toBe('warn')
  })

  it('沒有移動時拒絕分析', () => {
    const rep = runDataChecks(simLog({ moves: [] }), { statorCurrentLimit: 60 })
    expect(rep.items.find((i) => i.key === 'excitation')!.status).toBe('fail')
    expect(rep.ok).toBe(false)
  })

  it('電池不足時警告', () => {
    const log = simLog()
    log.cols.supplyVoltage = log.cols.supplyVoltage!.map((v) => v - 1)
    const rep = runDataChecks(log, { statorCurrentLimit: 60 })
    expect(rep.items.find((i) => i.key === 'battery')!.status).toBe('warn')
  })

  it('掉資料時警告', () => {
    const log = simLog()
    const t = Float64Array.from(log.t)
    for (let i = 100; i < t.length; i++) t[i] += 0.5
    const rep = runDataChecks({ ...log, t }, { statorCurrentLimit: 60 })
    expect(rep.items.find((i) => i.key === 'dropout')!.status).not.toBe('pass')
  })
})

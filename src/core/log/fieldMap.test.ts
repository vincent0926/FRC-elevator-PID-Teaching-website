import { describe, expect, it } from 'vitest'
import { alignSeries, missingRequired, suggestMapping } from './fieldMap'
import type { Series, WpilogEntryInfo } from './reader'

const e = (name: string, type = 'double'): WpilogEntryInfo => ({ name, type, metadata: '', count: 10, firstTimestamp: 0, lastTimestamp: 1 })

describe('suggestMapping', () => {
  it('robot-example 的欄位名稱全部精準命中', () => {
    const entries = [
      e('/Elevator/PositionMeters'),
      e('/Elevator/VelocityMetersPerSec'),
      e('/Elevator/ClosedLoopReferenceMeters'),
      e('/Elevator/ClosedLoopReferenceSlopeMetersPerSec'),
      e('/Elevator/AppliedVolts'),
      e('/Elevator/StatorCurrentAmps'),
      e('/Elevator/SupplyVoltage'),
      e('/Elevator/ClosedLoopOutputVolts'),
      e('/Elevator/ClosedLoopFeedForwardVolts'),
      e('/SystemStats/BatteryVoltage'),
      e('/DriverStation/Enabled', 'boolean'),
      e('/Drive/Pose', 'struct:Pose2d'),
    ]
    const m = suggestMapping(entries)
    expect(m.position.entry).toBe('/Elevator/PositionMeters')
    expect(m.velocity.entry).toBe('/Elevator/VelocityMetersPerSec')
    expect(m.reference.entry).toBe('/Elevator/ClosedLoopReferenceMeters')
    expect(m.referenceSlope.entry).toBe('/Elevator/ClosedLoopReferenceSlopeMetersPerSec')
    expect(m.appliedVolts.entry).toBe('/Elevator/AppliedVolts')
    expect(m.statorCurrent.entry).toBe('/Elevator/StatorCurrentAmps')
    expect(m.supplyVoltage.entry).toBe('/SystemStats/BatteryVoltage')
    expect(m.closedLoopOutput.entry).toBe('/Elevator/ClosedLoopOutputVolts')
    expect(m.feedforwardOutput.entry).toBe('/Elevator/ClosedLoopFeedForwardVolts')
    expect(m.enabled.entry).toBe('/DriverStation/Enabled')
    expect(missingRequired(m)).toHaveLength(0)
  })

  it('保留之前存的對應', () => {
    const entries = [e('/Lift/Height'), e('/Lift/Pos2')]
    const m = suggestMapping(entries, { position: { entry: '/Lift/Pos2', scale: 0.12 } })
    expect(m.position).toEqual({ entry: '/Lift/Pos2', scale: 0.12 })
  })

  it('缺必要欄位時回報', () => {
    const m = suggestMapping([e('/Foo/Bar')])
    expect(missingRequired(m).map((r) => r.key)).toContain('position')
  })
})

describe('alignSeries', () => {
  it('以位置時間為基準，其他欄位零階保持並乘倍率', () => {
    const s = (name: string, t: number[], v: number[]): Series => ({ name, type: 'double', t: Float64Array.from(t), v: Float64Array.from(v) })
    const series = new Map<string, Series>([
      ['/p', s('/p', [0, 1, 2, 3], [0, 1, 2, 3])],
      ['/v', s('/v', [0.5, 2.5], [10, 20])],
    ])
    const map = suggestMapping([])
    map.position = { entry: '/p', scale: 1 }
    map.appliedVolts = { entry: '/v', scale: 2 }
    const a = alignSeries(series, map)
    expect(Array.from(a.t)).toEqual([0, 1, 2, 3])
    const v = Array.from(a.cols.appliedVolts!)
    expect(Number.isNaN(v[0])).toBe(true) // 第一筆之前沒有值
    expect(v.slice(1)).toEqual([20, 20, 40])
  })
})

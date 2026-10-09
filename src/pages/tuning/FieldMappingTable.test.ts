import { describe, expect, it } from 'vitest'
import { entryLabel } from './FieldMappingTable'

describe('欄位選單的顯示名稱', () => {
  it('最後一段放前面，前綴相同的兩個欄位被截斷也分得出來', () => {
    expect(entryLabel({ name: '/Elevator/ClosedLoopReferenceMeters', count: 551 })).toBe('ClosedLoopReferenceMeters（/Elevator，551 筆）')
    expect(entryLabel({ name: '/Elevator/ClosedLoopReferenceSlopeMetersPerSec', count: 551 }).startsWith('ClosedLoopReferenceSlope')).toBe(true)
  })
  it('沒有路徑的名稱照原樣', () => {
    expect(entryLabel({ name: 'Voltage', count: 3 })).toBe('Voltage（3 筆）')
    expect(entryLabel({ name: '/Voltage', count: 3 })).toBe('/Voltage（3 筆）')
  })
})

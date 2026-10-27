import { describe, expect, it } from 'vitest'
import { buildTheory } from '../../app/elevatorStore'
import { computeFeedforward } from '../../core/feedforward'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { readZip } from '../../core/codegen/zip'
import { revSubsystemFiles, revSubsystemZip, setIntConstant } from './revSubsystemExport'

const m = { ...DEFAULT_MECHANISM, travel: 1.5, statorCurrentLimit: 55 }
const ps = buildTheory(m, computeFeedforward(m), 0.5)
const byName = (p = ps) => Object.fromEntries(revSubsystemFiles(p).entries.map((e) => [e.path.split('/').pop()!, String(e.content)]))

describe('REV 版下載完整子系統（電梯）', () => {
  it('包含子系統檔案，而且沒有 Phoenix 的東西', () => {
    const files = byName()
    for (const f of ['Elevator.java', 'ElevatorIO.java', 'ElevatorIOSparkMax.java', 'ElevatorRevConfig.java', 'README.md']) expect(files[f]).toBeDefined()
    for (const [name, text] of Object.entries(files)) {
      if (name === 'README.md') continue
      expect(text, name).not.toContain('com.ctre')
      expect(text, name).not.toContain('ElevatorGains')
    }
  })

  it('常數換成這台電梯的值，電流限制是整數', () => {
    const files = byName()
    expect(files['ElevatorIOSparkMax.java']).toContain('SMART_CURRENT_LIMIT = 55;')
    expect(files['ElevatorIOSparkMax.java']).toContain('MAX_METERS = 1.48;')
    expect(files['Elevator.java']).toContain('SYSID_MAX_METERS = 1.32;')
    expect(files['ElevatorRevConfig.java']).toContain('GEAR_RATIO = 5.0')
  })

  it('README 說清楚沒測過、沒有回授與前饋欄位', () => {
    const readme = byName()['README.md']
    expect(readme).toContain('沒有在真機上測過')
    expect(readme).toContain('ClosedLoopFeedForwardVolts')
  })

  it('打包成可讀的 ZIP', () => {
    const files = readZip(revSubsystemZip(ps))
    expect(files).toHaveLength(5)
    expect(files.find((f) => f.name.endsWith('ElevatorIOSparkMax.java'))!.data).toContain('public class ElevatorIOSparkMax')
  })

  it('setIntConstant 找不到就丟錯', () => {
    expect(() => setIntConstant('int A = 1;', 'B', 2)).toThrow()
    expect(setIntConstant('int A = 1;', 'A', 59.6)).toBe('int A = 60;')
  })
})

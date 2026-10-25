import { describe, expect, it } from 'vitest'
import { computeArmFeedforward } from '../../core/arm/feedforward'
import { readZip } from '../../core/codegen/zip'
import { DEFAULT_ARM, type ArmParameterSet } from '../../schema/armParameterSet'
import { armRevSubsystemFiles, armRevSubsystemZip } from './armRevSubsystemExport'

const ff = computeArmFeedforward(DEFAULT_ARM)
const ps: ArmParameterSet = {
  schemaVersion: 1,
  source: 'theory',
  createdAt: '2026-10-25T00:00:00.000Z',
  mechanism: { ...DEFAULT_ARM, statorCurrentLimit: 45 },
  feedforward: { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA },
  feedback: { kP: 20, kI: 0, kD: 0.5 },
  motionMagic: { cruiseVelocity: 3, acceleration: 10 },
}
const byName = (p = ps) => Object.fromEntries(armRevSubsystemFiles(p).entries.map((e) => [e.path.split('/').pop()!, String(e.content)]))

describe('REV 版下載完整子系統（手臂）', () => {
  it('包含子系統檔案，Arm.java 改讀 ArmRevConfig，沒有 Phoenix 的東西', () => {
    const files = byName()
    for (const f of ['Arm.java', 'ArmIO.java', 'ArmIOSparkMax.java', 'ArmRevConfig.java', 'README.md']) expect(files[f]).toBeDefined()
    expect(files['Arm.java']).toContain('ArmRevConfig.MIN_ANGLE_DEG')
    for (const [name, text] of Object.entries(files)) {
      if (name === 'README.md') continue
      expect(text, name).not.toContain('com.ctre')
      expect(text, name).not.toContain('ArmGains')
    }
  })

  it('Arm.java 用到的範圍常數 ArmRevConfig 都有', () => {
    const files = byName()
    expect(files['ArmRevConfig.java']).toContain('MIN_ANGLE_DEG')
    expect(files['ArmRevConfig.java']).toContain('MAX_ANGLE_DEG')
  })

  it('電流限制是整數、README 沒測過', () => {
    const files = byName()
    expect(files['ArmIOSparkMax.java']).toContain('SMART_CURRENT_LIMIT = 45;')
    expect(files['README.md']).toContain('沒有在真機上測過')
  })

  it('選 CANcoder 時 README 提醒 SPARK 讀不到', () => {
    const cc = { ...ps, mechanism: { ...ps.mechanism, encoder: 'cancoder' as const } }
    expect(byName(cc)['README.md']).toContain('CANcoder')
    expect(byName()['README.md']).not.toContain('你在網站選了 CANcoder')
  })

  it('打包成可讀的 ZIP', () => {
    expect(readZip(armRevSubsystemZip(ps))).toHaveLength(5)
  })
})

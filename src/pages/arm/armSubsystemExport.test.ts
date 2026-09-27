import { describe, expect, it } from 'vitest'
import { computeArmFeedforward } from '../../core/arm/feedforward'
import { readZip } from '../../core/codegen/zip'
import { DEFAULT_ARM, DEG } from '../../schema/armParameterSet'
import { armSubsystemFiles, armSubsystemZip } from './armSubsystemExport'
import { buildArmTheory } from './armStore'

const arm = { ...DEFAULT_ARM, minAngle: -30 * DEG, maxAngle: 90 * DEG, statorCurrentLimit: 45 }
const ps = buildArmTheory(arm, computeArmFeedforward(arm), 0.3)
const byName = (p = ps) => Object.fromEntries(armSubsystemFiles(p).entries.map((e) => [e.path.split('/').pop()!, String(e.content)]))

describe('手臂完整子系統下載', () => {
  it('包含全部檔案', () => {
    const names = Object.keys(byName())
    for (const f of ['Arm.java', 'ArmIO.java', 'ArmIOTalonFX.java', 'ArmGains.java', 'ArmGainsLoader.java', 'LoggedTunableNumber.java', 'arm-gains.json', 'README.md']) {
      expect(names).toContain(f)
    }
  })

  it('常數換成這支手臂的值：電流限制、開機角度、SysId 範圍', () => {
    const f = byName()
    expect(f['ArmIOTalonFX.java']).toContain('STATOR_CURRENT_LIMIT = 45.0;')
    expect(f['ArmIOTalonFX.java']).toContain('BOOT_ANGLE_DEG = -30.0;')
    // 範圍 120°：−30 + 12 = −18、−30 + 105.6 = 75.6
    expect(f['Arm.java']).toContain('SYSID_MIN_DEG = -18.0;')
    expect(f['Arm.java']).toContain('SYSID_MAX_DEG = 75.6;')
    expect(f['ArmGains.java']).toContain('Arm_Cosine')
  })

  it('CANcoder 的 README 提醒量磁鐵偏移，內建編碼器提醒開機角度', () => {
    expect(byName()['README.md']).toContain('BOOT_ANGLE_DEG')
    const cc = { ...ps, mechanism: { ...arm, encoder: 'cancoder' as const } }
    expect(byName(cc)['README.md']).toContain('MAGNET_OFFSET_ROT')
  })

  it('打包成可讀的 ZIP', () => {
    const files = readZip(armSubsystemZip(ps))
    expect(files).toHaveLength(8)
    expect(files.find((f) => f.name.endsWith('Arm.java'))!.data).toContain('public class Arm')
  })
})

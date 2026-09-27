import { describe, expect, it } from 'vitest'
import { buildTheory } from '../../app/store'
import { computeFeedforward } from '../../core/feedforward'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { readZip } from '../../core/codegen/zip'
import { setConstant, subsystemFiles, subsystemZip } from './subsystemExport'

const m = { ...DEFAULT_MECHANISM, travel: 1.5, statorCurrentLimit: 55 }
const ps = buildTheory(m, computeFeedforward(m), 0.5)

describe('下載完整子系統', () => {
  it('包含子系統全部檔案', () => {
    const names = subsystemFiles(ps).entries.map((e) => e.path)
    for (const f of ['Elevator.java', 'ElevatorIO.java', 'ElevatorIOTalonFX.java', 'ElevatorGains.java', 'ElevatorGainsLoader.java', 'LoggedTunableNumber.java', 'elevator-gains.json', 'README.md']) {
      expect(names.some((n) => n.endsWith(f))).toBe(true)
    }
  })

  it('常數換成這台電梯的值：電流限制、軟體限位、SysId 範圍', () => {
    const files = Object.fromEntries(subsystemFiles(ps).entries.map((e) => [e.path.split('/').pop()!, String(e.content)]))
    expect(files['ElevatorIOTalonFX.java']).toContain('STATOR_CURRENT_LIMIT = 55.0;')
    expect(files['ElevatorIOTalonFX.java']).toContain('MAX_METERS = 1.48;')
    expect(files['Elevator.java']).toContain('SYSID_MAX_METERS = 1.32;')
    expect(files['Elevator.java']).toContain('homeCommand')
    expect(files['ElevatorGains.java']).toContain('GEAR_RATIO = 5.0')
  })

  it('最上層座標（controlTop）時，軟體限位用最上層高度', () => {
    const top = buildTheory({ ...m, controlTop: true }, computeFeedforward({ ...m, controlTop: true }), 0.5)
    const io = String(subsystemFiles(top).entries.find((e) => e.path.endsWith('ElevatorIOTalonFX.java'))!.content)
    // 行程 1.5 m × 速度比 2 − 2 cm × 2
    expect(io).toContain('MAX_METERS = 2.96;')
  })

  it('打包成可讀的 ZIP', () => {
    const files = readZip(subsystemZip(ps))
    expect(files).toHaveLength(8)
    expect(files.find((f) => f.name.endsWith('Elevator.java'))!.data).toContain('public class Elevator')
  })

  it('範例程式常數改名時要報錯，不能默默輸出沒改到的檔案', () => {
    expect(() => setConstant('double X = 1.0;', 'NOT_THERE', 2)).toThrow()
  })
})

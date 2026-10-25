import { makeZip, type ZipEntry } from '../../core/codegen/zip'
import { revElevatorJava } from '../../core/codegen/rev'
import type { ParameterSet } from '../../schema/parameterSet'
import { setConstant } from './subsystemExport'
import elevatorJava from '../../../robot-example/src/main/java/frc/robot/subsystems/elevator/Elevator.java?raw'
import ioJava from '../../../robot-example/src/main/java/frc/robot/subsystems/elevator/ElevatorIO.java?raw'
import ioSparkJava from '../../../robot-example/src/main/java/frc/robot/subsystems/elevator/ElevatorIOSparkMax.java?raw'

/**
 * REV SPARK 版的「下載完整子系統」：跟 Phoenix 版一樣直接打包 robot-example，常數換成這台電梯的數字。
 * Elevator.java、ElevatorIO.java 兩版共用，只有 IO 實作（ElevatorIOSparkMax）和參數檔（ElevatorRevConfig）不同。
 * 沒有在真機上測過（決策 144）。
 */

const JAVA_DIR = 'src/main/java/frc/robot'
const EL = `${JAVA_DIR}/subsystems/elevator`

/** `int NAME = 數字;` 換成整數 */
export function setIntConstant(src: string, name: string, value: number): string {
  const re = new RegExp(`(\\b${name}\\s*=\\s*)-?\\d+(\\s*;)`)
  if (!re.test(src)) throw new Error(`範例程式裡找不到整數常數 ${name}`)
  return src.replace(re, `$1${Math.round(value)}$2`)
}

const r3 = (v: number) => Math.round(v * 1000) / 1000

export interface RevSubsystemFiles {
  entries: ZipEntry[]
  maxMeters: number
}

export function revSubsystemFiles(ps: ParameterSet, now = new Date()): RevSubsystemFiles {
  const m = ps.mechanism
  const kTop = m.stages[m.stages.length - 1]?.speedRatio ?? 1
  const coord = m.controlTop ? kTop : 1
  const travel = m.travel * coord
  const maxMeters = Math.max(0.05, travel - 0.02 * coord)

  let io = ioSparkJava
  io = setIntConstant(io, 'SMART_CURRENT_LIMIT', m.statorCurrentLimit)
  io = setConstant(io, 'MIN_METERS', 0)
  io = setConstant(io, 'MAX_METERS', maxMeters)

  let elevator = elevatorJava
  elevator = setConstant(elevator, 'SYSID_MIN_METERS', travel * 0.1)
  elevator = setConstant(elevator, 'SYSID_MAX_METERS', travel * 0.88)

  const readme = `# 電梯子系統：REV SPARK 版（由電梯調參工作站產生）

產生時間：${now.toISOString()}
參數來源：${ps.note ?? ps.source}

把 \`src/\` 整個複製到機器人專案（WPILib 2026、REVLib 2026、AdvantageKit）。

> **這份沒有在真機上測過。** 第一次上機用很低的速度、很小的行程，確認方向和單位再放大。
> REVLib 版本不同方法名稱可能不同，以你們專案的版本為準；編譯不過就照錯誤訊息改。

## 已經填好的
- ElevatorRevConfig.java：kS、kV、kA、kG、kP、kI、kD、MAXMotion 巡航速度與加速度、齒比 ${m.gearRatio}、每圈 ${r3(2 * Math.PI * m.drumRadius * coord)} m
- ElevatorIOSparkMax.java：電流限制 ${Math.round(m.statorCurrentLimit)} A、軟體限位 0 – ${r3(maxMeters)} m、Brake
- Elevator.java：跟隨誤差／失速保護、歸零（homeCommand）、SysId（${r3(travel * 0.1)} – ${r3(travel * 0.88)} m 之間自動停）。跟 Phoenix 版是同一份

## 一定要自己改（程式裡標了 TODO）
- CAN ID
- 馬達方向（inverted）和跟隨方向（follow 的第二個參數）：照網站 4F 單元零第 2 步確認
- P、I、D 的單位：程式假設 SPARK 的 PID 輸出是工作週期（所以網站的 V 增益除以 12），上機前確認
- 上機前做完單元零；程式的保護不能取代 Driver Station 的 Disable 與急停

## 跟 Phoenix 版不一樣的地方
- SPARK 不回報 P、I、D 與前饋各是多少伏特：日誌裡 \`ClosedLoopOutputVolts\`、\`ClosedLoopFeedForwardVolts\` 一律是 0，網站 2F 靠這兩欄的診斷規則用不了
- 摩擦不對稱時，往下的增益（ElevatorRevConfig 的 DOWN_*）沒有自動套用
- 沒有 JSON 覆寫參數和 LoggedTunableNumber 即時調參；要改參數就重新產生 ElevatorRevConfig.java 再 commit

## 按鍵綁定範例（RobotContainer）
\`\`\`java
controller.a().onTrue(elevator.moveTo(0.1));
controller.y().onTrue(elevator.moveTo(${r3(travel * 0.75)}));
controller.back().onTrue(elevator.homeCommand());
// 測試分支才綁：
controller.povUp().whileTrue(elevator.sysIdQuasistatic(SysIdRoutine.Direction.kForward));
\`\`\`
`

  const entries: ZipEntry[] = [
    { path: 'README.md', content: readme },
    { path: `${EL}/Elevator.java`, content: elevator },
    { path: `${EL}/ElevatorIO.java`, content: ioJava },
    { path: `${EL}/ElevatorIOSparkMax.java`, content: io },
    { path: `${EL}/ElevatorRevConfig.java`, content: revElevatorJava(ps, now) },
  ]
  return { entries, maxMeters }
}

export function revSubsystemZip(ps: ParameterSet, now = new Date()): Uint8Array {
  return makeZip(revSubsystemFiles(ps, now).entries, now)
}

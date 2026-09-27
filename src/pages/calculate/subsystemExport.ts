import { phoenix6_2026, toRobotConfig } from '../../core/codegen'
import { makeZip, type ZipEntry } from '../../core/codegen/zip'
import type { ParameterSet } from '../../schema/parameterSet'
import elevatorJava from '../../../robot-example/src/main/java/frc/robot/subsystems/elevator/Elevator.java?raw'
import gainsLoaderJava from '../../../robot-example/src/main/java/frc/robot/subsystems/elevator/ElevatorGainsLoader.java?raw'
import ioJava from '../../../robot-example/src/main/java/frc/robot/subsystems/elevator/ElevatorIO.java?raw'
import ioTalonJava from '../../../robot-example/src/main/java/frc/robot/subsystems/elevator/ElevatorIOTalonFX.java?raw'
import tunableJava from '../../../robot-example/src/main/java/frc/robot/util/LoggedTunableNumber.java?raw'

/**
 * 「下載完整子系統」：把 robot-example 的程式直接打包，常數換成這台電梯的數字。
 * 範例程式是唯一來源（網站不另外維護一份 Java），改範例會自動反映在下載裡。
 * 參數檔（ElevatorGains.java、elevator-gains.json）照 codegen 範本產生。
 */

const JAVA_DIR = 'src/main/java/frc/robot'
const EL = `${JAVA_DIR}/subsystems/elevator`

/** 把 `NAME = 數字;` 換成新的值；找不到就丟錯（範例程式改名時測試會抓到） */
export function setConstant(src: string, name: string, value: number): string {
  const re = new RegExp(`(\\b${name}\\s*=\\s*)-?[\\d.]+(\\s*;)`)
  if (!re.test(src)) throw new Error(`範例程式裡找不到常數 ${name}`)
  return src.replace(re, `$1${javaNumber(value)}$2`)
}

const javaNumber = (v: number) => {
  const r = Math.round(v * 1000) / 1000
  return Number.isInteger(r) ? r.toFixed(1) : String(r)
}

export interface SubsystemFiles {
  entries: ZipEntry[]
  /** 程式座標（公尺）的行程上限，README 用 */
  maxMeters: number
}

export function subsystemFiles(ps: ParameterSet, now = new Date()): SubsystemFiles {
  const m = ps.mechanism
  // 程式裡的位置座標：一般是鼓輪線位移；controlTop 時是最上層高度
  const kTop = m.stages[m.stages.length - 1]?.speedRatio ?? 1
  const coord = m.controlTop ? kTop : 1
  const travel = m.travel * coord
  // 軟體上限留 2 cm（最上層座標留 2 cm × 速度比）
  const maxMeters = Math.max(0.05, travel - 0.02 * coord)

  let io = ioTalonJava
  io = setConstant(io, 'STATOR_CURRENT_LIMIT', m.statorCurrentLimit)
  io = setConstant(io, 'MIN_METERS', 0)
  io = setConstant(io, 'MAX_METERS', maxMeters)

  let elevator = elevatorJava
  elevator = setConstant(elevator, 'SYSID_MIN_METERS', travel * 0.1)
  elevator = setConstant(elevator, 'SYSID_MAX_METERS', travel * 0.88)

  const readme = `# 電梯子系統（由電梯調參工作站產生）

產生時間：${now.toISOString()}
參數來源：${ps.note ?? ps.source}

把 \`src/\` 整個複製到機器人專案（WPILib 2026、Phoenix 6、AdvantageKit）。

## 已經填好的
- ElevatorGains.java：Slot 0${ps.slotByDirection ? '、Slot 1（往下）' : ''}、Motion Magic、齒比 ${m.gearRatio}、每圈 ${(2 * Math.PI * m.drumRadius * coord).toFixed(5)} m
- ElevatorIOTalonFX.java：Stator 電流限制 ${m.statorCurrentLimit} A、Supply 40 A、軟體限位 0 – ${javaNumber(maxMeters)} m、輸出上限 ±12 V、Brake
- Elevator.java：跟隨誤差／失速保護、歸零（homeCommand）、SysId（${javaNumber(travel * 0.1)} – ${javaNumber(travel * 0.88)} m 之間自動停）
- deploy/elevator-gains.json：不重新編譯時覆寫參數用

## 一定要自己改（程式裡標了 TODO）
- CAN ID、CAN bus 名稱
- 馬達方向（Inverted）和跟隨方向（MotorAlignmentValue）：照網站 4F 單元零第 2 步確認
- 上機前做完單元零；程式的保護不能取代 Driver Station 的 Disable 與急停

## 按鍵綁定範例（RobotContainer）
\`\`\`java
controller.a().onTrue(elevator.moveTo(0.1));
controller.y().onTrue(elevator.moveTo(${javaNumber(travel * 0.75)}));
controller.back().onTrue(elevator.homeCommand());
// 測試分支才綁：
controller.povUp().whileTrue(elevator.sysIdQuasistatic(SysIdRoutine.Direction.kForward));
\`\`\`

## 為什麼 PID 在 TalonFX 上跑
閉迴路在 TalonFX 上每 1 ms 算一次；放在 roboRIO 上通常 20 ms 一次，還要再加上 CAN 傳輸延遲。
同樣的 kP 在 roboRIO 上比較容易振盪（網站 3F 情境「控制週期」）。
`

  const entries: ZipEntry[] = [
    { path: 'README.md', content: readme },
    { path: `${EL}/Elevator.java`, content: elevator },
    { path: `${EL}/ElevatorIO.java`, content: ioJava },
    { path: `${EL}/ElevatorIOTalonFX.java`, content: io },
    { path: `${EL}/ElevatorGains.java`, content: phoenix6_2026.render(ps, now) },
    { path: `${EL}/ElevatorGainsLoader.java`, content: gainsLoaderJava },
    { path: `${JAVA_DIR}/util/LoggedTunableNumber.java`, content: tunableJava },
    { path: 'src/main/deploy/elevator-gains.json', content: JSON.stringify(toRobotConfig(ps, now), null, 2) + '\n' },
  ]
  return { entries, maxMeters }
}

export function subsystemZip(ps: ParameterSet, now = new Date()): Uint8Array {
  return makeZip(subsystemFiles(ps, now).entries, now)
}

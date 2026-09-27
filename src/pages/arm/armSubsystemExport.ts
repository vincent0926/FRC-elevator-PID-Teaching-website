import { renderArmGains, toArmRobotConfig } from '../../core/codegen/arm'
import { makeZip, type ZipEntry } from '../../core/codegen/zip'
import type { ArmParameterSet } from '../../schema/armParameterSet'
import { setConstant } from '../calculate/subsystemExport'
import armJava from '../../../robot-example/src/main/java/frc/robot/subsystems/arm/Arm.java?raw'
import gainsLoaderJava from '../../../robot-example/src/main/java/frc/robot/subsystems/arm/ArmGainsLoader.java?raw'
import ioJava from '../../../robot-example/src/main/java/frc/robot/subsystems/arm/ArmIO.java?raw'
import ioTalonJava from '../../../robot-example/src/main/java/frc/robot/subsystems/arm/ArmIOTalonFX.java?raw'
import tunableJava from '../../../robot-example/src/main/java/frc/robot/util/LoggedTunableNumber.java?raw'

/**
 * 手臂的「下載完整子系統」：跟電梯一樣直接打包 robot-example，常數換成這支手臂的數字。
 * ArmGains.java、arm-gains.json 照 codegen 範本產生。
 */

const JAVA_DIR = 'src/main/java/frc/robot'
const ARM = `${JAVA_DIR}/subsystems/arm`
const R2D = 180 / Math.PI
const r1 = (v: number) => Math.round(v * 10) / 10

export interface ArmSubsystemFiles {
  entries: ZipEntry[]
  /** SysId 自動停的角度（度） */
  sysIdMinDeg: number
  sysIdMaxDeg: number
}

export function armSubsystemFiles(ps: ArmParameterSet, now = new Date()): ArmSubsystemFiles {
  const m = ps.mechanism
  const minDeg = m.minAngle * R2D
  const maxDeg = m.maxAngle * R2D
  const range = maxDeg - minDeg
  const sysIdMinDeg = r1(minDeg + range * 0.1)
  const sysIdMaxDeg = r1(minDeg + range * 0.88)
  const cancoder = m.encoder === 'cancoder'

  let io = ioTalonJava
  io = setConstant(io, 'STATOR_CURRENT_LIMIT', m.statorCurrentLimit)
  io = setConstant(io, 'BOOT_ANGLE_DEG', r1(minDeg))

  let arm = armJava
  arm = setConstant(arm, 'SYSID_MIN_DEG', sysIdMinDeg)
  arm = setConstant(arm, 'SYSID_MAX_DEG', sysIdMaxDeg)

  const mid = r1(Math.min(maxDeg - 10, Math.max(minDeg + 10, 45)))
  const readme = `# 手臂子系統（由手臂調參工作站產生）

產生時間：${now.toISOString()}
參數來源：${ps.note ?? ps.source}

把 \`src/\` 整個複製到機器人專案（WPILib 2026、Phoenix 6、AdvantageKit）。

## 已經填好的
- ArmGains.java：Slot 0（GravityType = Arm_Cosine）、Motion Magic、齒比 ${m.gearRatio}、角度範圍 ${r1(minDeg)}° – ${r1(maxDeg)}°
- 角度感測器：${
    cancoder
      ? `CANcoder（RemoteCANcoder，CANcoder : 手臂 = ${m.cancoderToArmRatio} : 1）`
      : `TalonFX 內建編碼器；開機時手臂要靠在 ${r1(minDeg)}°（BOOT_ANGLE_DEG）`
  }
- ArmIOTalonFX.java：Stator 電流限制 ${m.statorCurrentLimit} A、Supply 40 A、軟體限位（範圍兩端各內縮 3°）、輸出上限 ±12 V、Brake
- Arm.java：跟隨誤差／失速保護${cancoder ? '、CANcoder 斷線就停' : ''}、SysId（${sysIdMinDeg}° – ${sysIdMaxDeg}° 之間自動停）
- deploy/arm-gains.json：不重新編譯時覆寫參數用

## 一定要自己改（程式裡標了 TODO）
- CAN ID、CAN bus 名稱
- 馬達方向（Inverted）：正電壓要讓手臂往上抬（照網站 4F 單元零）
${
  cancoder
    ? '- CANcoder 的 MAGNET_OFFSET_ROT：手臂擺水平，讀 Absolute Position，offset = −讀數；SensorDirection 要讓手臂往上時讀數變大\n'
    : '- 開機前把手臂靠在下方硬擋（BOOT_ANGLE_DEG）；開機位置不對，Arm_Cosine 的 cos θ 會整個錯（3F 情境「編碼器零點不在水平」）\n'
}- 上機前做完單元零；程式的保護不能取代 Driver Station 的 Disable 與急停
- 手臂斷電或保護觸發時會因重力往下掉，測試時人不可以站在手臂的掃過範圍

## 按鍵綁定範例（RobotContainer）
\`\`\`java
controller.a().onTrue(arm.moveToDegrees(0.0));
controller.y().onTrue(arm.moveToDegrees(${mid}));
// 測試分支才綁：
controller.povUp().whileTrue(arm.sysIdQuasistatic(SysIdRoutine.Direction.kForward));
\`\`\`

## 為什麼 GravityType 要設 Arm_Cosine
手臂的重力力矩跟 cos θ 成正比：水平最大、直立是 0、過了直立變成反方向。
Elevator_Static 會在每個角度都補一樣多，手臂抬高後就補過頭（網站 1F 關卡 4、3F 情境「把手臂當電梯」）。
`

  const entries: ZipEntry[] = [
    { path: 'README.md', content: readme },
    { path: `${ARM}/Arm.java`, content: arm },
    { path: `${ARM}/ArmIO.java`, content: ioJava },
    { path: `${ARM}/ArmIOTalonFX.java`, content: io },
    { path: `${ARM}/ArmGains.java`, content: renderArmGains(ps, now) },
    { path: `${ARM}/ArmGainsLoader.java`, content: gainsLoaderJava },
    { path: `${JAVA_DIR}/util/LoggedTunableNumber.java`, content: tunableJava },
    { path: 'src/main/deploy/arm-gains.json', content: JSON.stringify(toArmRobotConfig(ps, now), null, 2) + '\n' },
  ]
  return { entries, sysIdMinDeg, sysIdMaxDeg }
}

export function armSubsystemZip(ps: ArmParameterSet, now = new Date()): Uint8Array {
  return makeZip(armSubsystemFiles(ps, now).entries, now)
}

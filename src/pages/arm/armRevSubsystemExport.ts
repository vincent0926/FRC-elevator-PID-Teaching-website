import { makeZip, type ZipEntry } from '../../core/codegen/zip'
import { revArmJava } from '../../core/codegen/rev'
import type { ArmParameterSet } from '../../schema/armParameterSet'
import { setConstant } from '../calculate/subsystemExport'
import { setIntConstant } from '../calculate/revSubsystemExport'
import armJava from '../../../robot-example/src/main/java/frc/robot/subsystems/arm/Arm.java?raw'
import ioJava from '../../../robot-example/src/main/java/frc/robot/subsystems/arm/ArmIO.java?raw'
import ioSparkJava from '../../../robot-example/src/main/java/frc/robot/subsystems/arm/ArmIOSparkMax.java?raw'

/**
 * REV SPARK 版的手臂「下載完整子系統」：Arm.java、ArmIO.java 兩版共用（Arm.java 的 ArmGains 換成 ArmRevConfig），
 * 只有 IO 實作（ArmIOSparkMax）和參數檔（ArmRevConfig）不同。只支援內建編碼器。沒有在真機上測過（決策 144）。
 */

const JAVA_DIR = 'src/main/java/frc/robot'
const ARM = `${JAVA_DIR}/subsystems/arm`
const R2D = 180 / Math.PI
const r1 = (v: number) => Math.round(v * 10) / 10

export interface ArmRevSubsystemFiles {
  entries: ZipEntry[]
  sysIdMinDeg: number
  sysIdMaxDeg: number
}

export function armRevSubsystemFiles(ps: ArmParameterSet, now = new Date()): ArmRevSubsystemFiles {
  const m = ps.mechanism
  const minDeg = m.minAngle * R2D
  const maxDeg = m.maxAngle * R2D
  const range = maxDeg - minDeg
  const sysIdMinDeg = r1(minDeg + range * 0.1)
  const sysIdMaxDeg = r1(minDeg + range * 0.88)
  const cancoder = m.encoder === 'cancoder'

  let io = ioSparkJava
  io = setIntConstant(io, 'SMART_CURRENT_LIMIT', m.statorCurrentLimit)
  io = setConstant(io, 'BOOT_ANGLE_DEG', r1(minDeg))

  let arm = armJava
  arm = setConstant(arm, 'SYSID_MIN_DEG', sysIdMinDeg)
  arm = setConstant(arm, 'SYSID_MAX_DEG', sysIdMaxDeg)
  // REV 版沒有 ArmGains（Phoenix 的型別）：範圍常數改讀 ArmRevConfig
  arm = arm.replaceAll('ArmGains', 'ArmRevConfig')

  const mid = r1(Math.min(maxDeg - 10, Math.max(minDeg + 10, 45)))
  const readme = `# 手臂子系統：REV SPARK 版（由手臂調參工作站產生）

產生時間：${now.toISOString()}
參數來源：${ps.note ?? ps.source}

把 \`src/\` 整個複製到機器人專案（WPILib 2026、REVLib 2026、AdvantageKit）。

> **這份沒有在真機上測過。** 第一次上機用很低的速度、很小的行程，確認方向和單位再放大。
> REVLib 版本不同方法名稱可能不同，以你們專案的版本為準；編譯不過就照錯誤訊息改。

## 已經填好的
- ArmRevConfig.java：kS、kV、kA、kCos（重力 kG·cos θ）、kP、kI、kD、MAXMotion 巡航速度與加速度、齒比 ${m.gearRatio}、角度範圍 ${r1(minDeg)}° – ${r1(maxDeg)}°
- ArmIOSparkMax.java：電流限制 ${Math.round(m.statorCurrentLimit)} A、軟體限位（範圍兩端各內縮 3°）、Brake；開機時手臂要靠在 ${r1(minDeg)}°（BOOT_ANGLE_DEG）
- Arm.java：跟隨誤差／失速保護、SysId（${sysIdMinDeg}° – ${sysIdMaxDeg}° 之間自動停）。跟 Phoenix 版是同一份

${cancoder ? '> 你在網站選了 CANcoder：SPARK 讀不到它，這份只用內建編碼器。要用絕對編碼器請改接 REV Through Bore Encoder，並自己確認零點和換算。\n\n' : ''}## 一定要自己改（程式裡標了 TODO）
- CAN ID
- 馬達方向（inverted）：正電壓要讓手臂往上抬（照網站 4F 單元零）
- 開機前把手臂靠在下方硬擋（BOOT_ANGLE_DEG）；開機位置不對，kCos 的 cos θ 會整個錯（3F 情境「編碼器零點不在水平」）
- P、I、D 的單位：程式假設 SPARK 的 PID 輸出是工作週期（所以網站的 V 增益除以 12），上機前確認
- 上機前做完單元零；程式的保護不能取代 Driver Station 的 Disable 與急停
- 手臂斷電或保護觸發時會因重力往下掉，測試時人不可以站在手臂的掃過範圍

## 跟 Phoenix 版不一樣的地方
- SPARK 不回報 P、I、D 與前饋各是多少伏特：日誌裡 \`ClosedLoopOutputVolts\`、\`ClosedLoopFeedForwardVolts\` 一律是 0，網站 2F 靠這兩欄的診斷規則用不了
- 沒有 JSON 覆寫參數和 LoggedTunableNumber 即時調參；要改參數就重新產生 ArmRevConfig.java 再 commit

## 按鍵綁定範例（RobotContainer）
\`\`\`java
controller.a().onTrue(arm.moveToDegrees(0.0));
controller.y().onTrue(arm.moveToDegrees(${mid}));
// 測試分支才綁：
controller.povUp().whileTrue(arm.sysIdQuasistatic(SysIdRoutine.Direction.kForward));
\`\`\`
`

  const entries: ZipEntry[] = [
    { path: 'README.md', content: readme },
    { path: `${ARM}/Arm.java`, content: arm },
    { path: `${ARM}/ArmIO.java`, content: ioJava },
    { path: `${ARM}/ArmIOSparkMax.java`, content: io },
    { path: `${ARM}/ArmRevConfig.java`, content: revArmJava(ps, now) },
  ]
  return { entries, sysIdMinDeg, sysIdMaxDeg }
}

export function armRevSubsystemZip(ps: ArmParameterSet, now = new Date()): Uint8Array {
  return makeZip(armRevSubsystemFiles(ps, now).entries, now)
}

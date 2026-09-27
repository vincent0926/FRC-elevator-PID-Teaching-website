import type { ArmParameterSet } from '../../schema/armParameterSet'
import type { ArmRobotConfig } from '../../schema/robotConfig'
import { convertArm, GENERATOR, jd } from './index'

/**
 * 手臂的輸出：ArmGains.java 與 arm-gains.json。
 * 位置單位是「手臂轉幾圈」，0 = 水平（Phoenix 6 Arm_Cosine 就是用這個位置算 cos）。
 *
 * 角度感測器兩種：
 * - TalonFX 內建編碼器：SensorToMechanismRatio = 齒比；開機時手臂要靠在已知角度，程式把位置設成那個角度。
 * - CANcoder：RemoteCANcoder，SensorToMechanismRatio = CANcoder 對手臂的比例，
 *   RotorToSensorRatio = 齒比 ÷ 那個比例；MagnetOffset 讓水平讀成 0，開機不用歸零。
 */

const SOURCE_LABEL: Record<ArmParameterSet['source'], string> = {
  theory: '理論值',
  tuning: '調參建議值',
  custom: '自訂',
  measured: '實測值',
}

export function toArmRobotConfig(ps: ArmParameterSet, now = new Date()): ArmRobotConfig {
  const c = convertArm(ps)
  const m = ps.mechanism
  return {
    schemaVersion: 1,
    generator: GENERATOR,
    generatedAt: now.toISOString(),
    source: ps.source,
    mechanism: 'arm',
    units: 'phoenix6-rotations',
    gearRatio: m.gearRatio,
    encoder: m.encoder,
    cancoderToArmRatio: m.cancoderToArmRatio,
    slot0: c.slot0,
    motionMagic: { cruiseVelocity: c.cruiseVelocity, acceleration: c.acceleration },
  }
}

const deg = (rad: number) => jd(Math.round((rad * 180) / Math.PI * 1000) / 1000)

export function renderArmGains(ps: ArmParameterSet, now = new Date()): string {
  const c = convertArm(ps)
  const m = ps.mechanism
  const g = c.slot0
  const cancoder = m.encoder === 'cancoder'
  return `package frc.robot.subsystems.arm;

import com.ctre.phoenix6.configs.MotionMagicConfigs;
import com.ctre.phoenix6.configs.Slot0Configs;
import com.ctre.phoenix6.signals.GravityTypeValue;
import com.ctre.phoenix6.signals.StaticFeedforwardSignValue;

/**
 * 由手臂調參工作站產生：${SOURCE_LABEL[ps.source]}，${now.toISOString()}。
 * 單位：Phoenix 6 轉數制，位置是「手臂轉幾圈」，0 = 水平、往上為正（Arm_Cosine 用這個位置算 cos）。
 * 這個檔案進版本控制，是參數的最終依據；網頁上改的數字要重新產生並 commit 才算數。
 */
public final class ArmGains {
  private ArmGains() {}

  /** 馬達圈數 : 手臂 1 圈 */
  public static final double GEAR_RATIO = ${jd(m.gearRatio)};
  /** 角度感測器：${cancoder ? 'CANcoder（絕對編碼器，開機不用歸零）' : 'TalonFX 內建編碼器（開機時手臂要靠在已知角度）'} */
  public static final boolean USE_CANCODER = ${cancoder};
  /** CANcoder 轉幾圈 : 手臂 1 圈（裝在轉軸上是 1）；沒用 CANcoder 時不影響 */
  public static final double CANCODER_TO_ARM_RATIO = ${jd(m.cancoderToArmRatio)};
  /** 可以動的角度範圍（度，0 = 水平），軟體限位用 */
  public static final double MIN_ANGLE_DEG = ${deg(m.minAngle)};
  public static final double MAX_ANGLE_DEG = ${deg(m.maxAngle)};

  /** Motion Magic 巡航速度（手臂 rps）＝ ${jd((ps.motionMagic.cruiseVelocity * 180) / Math.PI)} °/s */
  public static final double CRUISE_VELOCITY = ${jd(c.cruiseVelocity)};
  /** Motion Magic 加速度（手臂 rps/s）＝ ${jd((ps.motionMagic.acceleration * 180) / Math.PI)} °/s² */
  public static final double ACCELERATION = ${jd(c.acceleration)};

  public static Slot0Configs slot0() {
    return new Slot0Configs()
        .withKS(${jd(g.kS)})
        .withKG(${jd(g.kG)})
        .withKV(${jd(g.kV)})
        .withKA(${jd(g.kA)})
        .withKP(${jd(g.kP)})
        .withKI(${jd(g.kI)})
        .withKD(${jd(g.kD)})
        .withGravityType(GravityTypeValue.Arm_Cosine)
        .withStaticFeedforwardSign(StaticFeedforwardSignValue.UseVelocitySign);
  }

  public static MotionMagicConfigs motionMagic() {
    return new MotionMagicConfigs()
        .withMotionMagicCruiseVelocity(CRUISE_VELOCITY)
        .withMotionMagicAcceleration(ACCELERATION);
  }
}
`
}

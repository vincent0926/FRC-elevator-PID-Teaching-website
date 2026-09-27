package frc.robot.subsystems.arm;

import com.ctre.phoenix6.configs.MotionMagicConfigs;
import com.ctre.phoenix6.configs.Slot0Configs;
import com.ctre.phoenix6.signals.GravityTypeValue;
import com.ctre.phoenix6.signals.StaticFeedforwardSignValue;

/**
 * 由手臂調參工作站產生：理論值，2026-09-27T00:00:00.000Z。
 * 單位：Phoenix 6 轉數制，位置是「手臂轉幾圈」，0 = 水平、往上為正（Arm_Cosine 用這個位置算 cos）。
 * 這個檔案進版本控制，是參數的最終依據；網頁上改的數字要重新產生並 commit 才算數。
 */
public final class ArmGains {
  private ArmGains() {}

  /** 馬達圈數 : 手臂 1 圈 */
  public static final double GEAR_RATIO = 60.0;
  /** 角度感測器：TalonFX 內建編碼器（開機時手臂要靠在已知角度） */
  public static final boolean USE_CANCODER = false;
  /** CANcoder 轉幾圈 : 手臂 1 圈（裝在轉軸上是 1）；沒用 CANcoder 時不影響 */
  public static final double CANCODER_TO_ARM_RATIO = 1.0;
  /** 可以動的角度範圍（度，0 = 水平），軟體限位用 */
  public static final double MIN_ANGLE_DEG = -20.0;
  public static final double MAX_ANGLE_DEG = 110.0;

  /** Motion Magic 巡航速度（手臂 rps）＝ 395.985 °/s */
  public static final double CRUISE_VELOCITY = 1.09996;
  /** Motion Magic 加速度（手臂 rps/s）＝ 2664.24 °/s² */
  public static final double ACCELERATION = 7.40066;

  public static Slot0Configs slot0() {
    return new Slot0Configs()
        .withKS(0.0)
        .withKG(0.49811)
        .withKV(7.16066)
        .withKA(0.148882)
        .withKP(108.0)
        .withKI(0.0)
        .withKD(0.0)
        .withGravityType(GravityTypeValue.Arm_Cosine)
        .withStaticFeedforwardSign(StaticFeedforwardSignValue.UseVelocitySign);
  }

  public static MotionMagicConfigs motionMagic() {
    return new MotionMagicConfigs()
        .withMotionMagicCruiseVelocity(CRUISE_VELOCITY)
        .withMotionMagicAcceleration(ACCELERATION);
  }
}

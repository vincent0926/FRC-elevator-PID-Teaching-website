package frc.robot.subsystems.arm;

import com.revrobotics.spark.FeedbackSensor;
import com.revrobotics.spark.config.SparkMaxConfig;

/**
 * 由手臂調參工作站產生（REV SPARK，REVLib 2026）：理論值，2026-09-27T00:00:00.000Z。
 * 位置單位是「手臂轉幾圈」，0 = 水平、往上為正；kCos 用這個位置算 cos。
 * 這個檔案進版本控制，是參數的最終依據；網頁上改的數字要重新產生並 commit 才算數。
 */
public final class ArmRevConfig {
  private ArmRevConfig() {}

  /** 馬達圈數 : 手臂 1 圈 */
  public static final double GEAR_RATIO = 60.0;
  /** 可以動的角度範圍（度，0 = 水平），軟體限位和子系統限制目標用 */
  public static final double MIN_ANGLE_DEG = -20.0;
  public static final double MAX_ANGLE_DEG = 110.0;
  /** SPARK 的 P、I、D 輸出是工作週期（-1～1），增益用這個電壓換算；前饋本來就是伏特 */
  public static final double NOMINAL_VOLTS = 12.0;

  /** MAXMotion 巡航速度（手臂 rps）＝ 395.985 °/s */
  public static final double CRUISE_VELOCITY = 1.09996;
  /** MAXMotion 加速度（手臂 rps/s）＝ 2664.24 °/s² */
  public static final double ACCELERATION = 7.40066;

  public static SparkMaxConfig config() {
    SparkMaxConfig config = new SparkMaxConfig();
    // 位置 = 手臂轉幾圈，速度 = 手臂 rps
    config.encoder
        .positionConversionFactor(1.0 / GEAR_RATIO)
        .velocityConversionFactor(1.0 / GEAR_RATIO / 60.0);
    config.closedLoop
        .feedbackSensor(FeedbackSensor.kPrimaryEncoder)
        .p(108.0 / NOMINAL_VOLTS)
        .i(0.0 / NOMINAL_VOLTS)
        .d(0.0 / NOMINAL_VOLTS);
    // 手臂用 kCos，不是 kG；kCosRatio = 1：上面的換算係數讓感測器讀到的就是手臂轉幾圈
    config.closedLoop.feedForward
        .kS(0.0)
        .kV(7.16066)
        .kA(0.148882)
        .kCos(0.49811)
        .kCosRatio(1.0);
    config.closedLoop.maxMotion
        .cruiseVelocity(CRUISE_VELOCITY)
        .maxAcceleration(ACCELERATION)
        .allowedProfileError(Math.toRadians(1.0) / (2 * Math.PI)); // 到位誤差 1°
    return config;
  }

  // 用內建編碼器：開機時手臂要靠在已知角度，程式再把位置設成那個角度（encoder.setPosition）。
  // 使用：controller.setSetpoint(angleRad / (2 * Math.PI), ControlType.kMAXMotionPositionControl);
}

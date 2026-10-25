package frc.robot.subsystems.elevator;

import com.revrobotics.spark.FeedbackSensor;
import com.revrobotics.spark.config.SparkMaxConfig;

/**
 * 由電梯調參工作站產生（REV SPARK，REVLib 2026）：理論值，2026-09-27T00:00:00.000Z。
 * 位置單位是「鼓輪轉幾圈」，速度是 rps：靠下面的 encoder 換算係數，SPARK 的數字就跟網站的轉數制一樣。
 * 這個檔案進版本控制，是參數的最終依據；網頁上改的數字要重新產生並 commit 才算數。
 */
public final class ElevatorRevConfig {
  private ElevatorRevConfig() {}

  public static final double GEAR_RATIO = 5.0;
  /** 機構座標 1 圈的公尺數（鼓輪線位移） */
  public static final double METERS_PER_ROTATION = 0.120009;
  /** SPARK 的 P、I、D 輸出是工作週期（-1～1），增益用這個電壓換算；前饋（kS、kV、kA、kG）本來就是伏特 */
  public static final double NOMINAL_VOLTS = 12.0;

  /** MAXMotion 巡航速度（rps）＝ 1.58265 m/s */
  public static final double CRUISE_VELOCITY = 13.1878;
  /** MAXMotion 加速度（rps/s）＝ 13.0261 m/s² */
  public static final double ACCELERATION = 108.543;

  public static SparkMaxConfig config() {
    SparkMaxConfig config = new SparkMaxConfig();
    // 位置 = 鼓輪轉幾圈，速度 = 鼓輪 rps（SPARK 內建速度是馬達 RPM）
    config.encoder
        .positionConversionFactor(1.0 / GEAR_RATIO)
        .velocityConversionFactor(1.0 / GEAR_RATIO / 60.0);
    config.closedLoop
        .feedbackSensor(FeedbackSensor.kPrimaryEncoder)
        .p(6.00044 / NOMINAL_VOLTS)
        .i(0.0 / NOMINAL_VOLTS)
        .d(0.0 / NOMINAL_VOLTS);
    config.closedLoop.feedForward
        .kS(0.0)
        .kV(0.596721)
        .kA(0.0100868)
        .kG(0.507408);
    config.closedLoop.maxMotion
        .cruiseVelocity(CRUISE_VELOCITY)
        .maxAcceleration(ACCELERATION)
        .allowedProfileError(0.002 / METERS_PER_ROTATION); // 到位誤差 2 mm
    return config;
  }

  // 使用：motor.configure(ElevatorRevConfig.config(), ResetMode.kResetSafeParameters, PersistMode.kNoPersistParameters);
  //         controller.setSetpoint(meters / METERS_PER_ROTATION, ControlType.kMAXMotionPositionControl);
}

package frc.robot.subsystems.arm;

import com.revrobotics.PersistMode;
import com.revrobotics.REVLibError;
import com.revrobotics.RelativeEncoder;
import com.revrobotics.ResetMode;
import com.revrobotics.spark.SparkBase.ControlType;
import com.revrobotics.spark.SparkClosedLoopController;
import com.revrobotics.spark.SparkLowLevel.MotorType;
import com.revrobotics.spark.SparkMax;
import com.revrobotics.spark.config.SparkBaseConfig.IdleMode;
import com.revrobotics.spark.config.SparkMaxConfig;

/**
 * SPARK MAX 實作（REVLib 2026，MAXMotion 位置控制 + kCos 重力前饋，閉迴路在 SPARK 上執行）。
 *
 * <p>只支援內建編碼器：開機時手臂要靠在 {@link #BOOT_ANGLE_DEG}（通常是下方硬擋），程式把位置設成那個角度，
 * kCos 才會用對 cos θ（0 = 水平）。要用絕對編碼器請改接 REV Through Bore Encoder，
 * 並把 feedbackSensor 改成 kAbsoluteEncoder（零點和換算要自己確認）。
 * 參數的最終依據是 {@link ArmRevConfig}（由網站產生後 commit）。
 *
 * <p>跟 TalonFX 版不一樣的地方（上機前要知道）：
 * <ul>
 *   <li>SPARK 不回報 P、I、D 與前饋各是多少伏特，所以 {@code closedLoopOutputVolts}、
 *       {@code closedLoopFeedForwardVolts} 一律是 0；網站 2F 靠這兩欄判斷「前饋準不準」的規則在 REV 的日誌上用不了。
 *   <li>這份沒有在真機上測過：第一次上機用很低的速度、很小的行程，確認方向和單位再放大。
 *   <li>手臂斷電或保護觸發時會因重力往下掉，測試時人不可以站在手臂掃過的範圍。
 * </ul>
 */
public class ArmIOSparkMax implements ArmIO {
  // TODO 依實際接線與機構修改
  private static final int MOTOR_ID = 30;
  private static final int SMART_CURRENT_LIMIT = 60;
  /** 開機時手臂所在的角度（度，0 = 水平），要靠在這個角度再開機 */
  private static final double BOOT_ANGLE_DEG = -20.0;
  /** 軟體限位離範圍兩端內縮多少度 */
  private static final double SOFT_LIMIT_MARGIN_DEG = 3.0;

  private final SparkMax motor = new SparkMax(MOTOR_ID, MotorType.kBrushless);
  private final RelativeEncoder encoder = motor.getEncoder();
  private final SparkClosedLoopController controller = motor.getClosedLoopController();
  private final SparkMaxConfig config = ArmRevConfig.config();
  private boolean connected = true;

  public ArmIOSparkMax() {
    config.idleMode(IdleMode.kBrake).smartCurrentLimit(SMART_CURRENT_LIMIT).inverted(false); // TODO 單元零：確認正電壓往上抬
    config.softLimit
        .forwardSoftLimit((ArmRevConfig.MAX_ANGLE_DEG - SOFT_LIMIT_MARGIN_DEG) / 360.0)
        .forwardSoftLimitEnabled(true)
        .reverseSoftLimit((ArmRevConfig.MIN_ANGLE_DEG + SOFT_LIMIT_MARGIN_DEG) / 360.0)
        .reverseSoftLimitEnabled(true);
    for (int i = 0; i < 3; i++) {
      if (motor.configure(config, ResetMode.kResetSafeParameters, PersistMode.kNoPersistParameters) == REVLibError.kOk) break;
      if (i == 2) {
        connected = false;
        System.err.println("[Arm] SPARK " + MOTOR_ID + " 設定失敗，檢查 CAN");
      }
    }
    // 開機位置當成 BOOT_ANGLE_DEG（手臂要靠在那裡再開機）
    encoder.setPosition(BOOT_ANGLE_DEG / 360.0);
  }

  @Override
  public void updateInputs(ArmIOInputs inputs) {
    double r = 2.0 * Math.PI; // 手臂 1 圈 = 2π rad
    double bus = motor.getBusVoltage();
    inputs.connected = connected && bus > 0.0;
    inputs.encoderConnected = true;
    inputs.positionRad = encoder.getPosition() * r;
    inputs.velocityRadPerSec = encoder.getVelocity() * r;
    inputs.closedLoopReferenceRad = controller.getMAXMotionSetpointPosition() * r;
    // SPARK 沒有回報參考速度：用 0，網站的跟隨誤差判斷只看位置
    inputs.closedLoopReferenceSlopeRadPerSec = 0.0;
    inputs.appliedVolts = motor.getAppliedOutput() * bus;
    inputs.statorCurrentAmps = motor.getOutputCurrent();
    inputs.supplyVoltage = bus;
    // SPARK 不回報回授與前饋各是多少伏特
    inputs.closedLoopOutputVolts = 0.0;
    inputs.closedLoopFeedForwardVolts = 0.0;
  }

  @Override
  public void setAngle(double rad) {
    controller.setSetpoint(rad / (2.0 * Math.PI), ControlType.kMAXMotionPositionControl);
  }

  @Override
  public void setVoltage(double volts) {
    motor.setVoltage(volts);
  }

  @Override
  public void stop() {
    motor.stopMotor();
  }

  @Override
  public void resetAngle(double rad) {
    encoder.setPosition(rad / (2.0 * Math.PI));
  }
}

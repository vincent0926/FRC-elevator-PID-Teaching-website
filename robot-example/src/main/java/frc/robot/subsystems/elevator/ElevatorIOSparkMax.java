package frc.robot.subsystems.elevator;

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
 * SPARK MAX 實作（REVLib 2026，MAXMotion 位置控制，閉迴路在 SPARK 上執行）。
 *
 * <p>encoder 的換算係數讓位置是「鼓輪轉幾圈」、速度是 rps，{@link ElevatorRevConfig#METERS_PER_ROTATION} 負責換成公尺。
 * 參數的最終依據是 {@link ElevatorRevConfig}（由網站產生後 commit）。
 *
 * <p>跟 TalonFX 版不一樣的地方（上機前要知道）：
 * <ul>
 *   <li>SPARK 不回報 P、I、D 與前饋各是多少伏特，所以 {@code closedLoopOutputVolts}、
 *       {@code closedLoopFeedForwardVolts} 一律是 0；網站 2F 靠這兩欄判斷「前饋準不準」的規則在 REV 的日誌上用不了。
 *   <li>摩擦不對稱時，往下的增益（{@code ElevatorRevConfig.DOWN_*}）沒有自動套用。
 *   <li>這份沒有在真機上測過：第一次上機用很低的速度、很小的行程，確認方向和單位再放大。
 * </ul>
 */
public class ElevatorIOSparkMax implements ElevatorIO {
  // TODO 依實際接線與機構修改
  private static final int LEADER_ID = 20;
  private static final int FOLLOWER_ID = 21;
  /** SPARK 的 smart current limit（A）：整個電流範圍都有作用，比 TalonFX 的 stator limit 保守一點 */
  private static final int SMART_CURRENT_LIMIT = 60;
  private static final double MIN_METERS = 0.0;
  private static final double MAX_METERS = 1.2;

  private final SparkMax leader = new SparkMax(LEADER_ID, MotorType.kBrushless);
  private final SparkMax follower = new SparkMax(FOLLOWER_ID, MotorType.kBrushless);
  private final RelativeEncoder encoder = leader.getEncoder();
  private final SparkClosedLoopController controller = leader.getClosedLoopController();
  private final SparkMaxConfig config = ElevatorRevConfig.config();
  private boolean connected = true;

  public ElevatorIOSparkMax() {
    config.idleMode(IdleMode.kBrake).smartCurrentLimit(SMART_CURRENT_LIMIT).inverted(false); // TODO 單元零：確認正電壓往上
    config.softLimit
        .forwardSoftLimit(MAX_METERS / ElevatorRevConfig.METERS_PER_ROTATION)
        .forwardSoftLimitEnabled(true)
        .reverseSoftLimit(MIN_METERS / ElevatorRevConfig.METERS_PER_ROTATION)
        .reverseSoftLimitEnabled(true);
    apply(leader, config);

    // 跟隨者不需要閉迴路設定，只要煞車和電流限制
    SparkMaxConfig followerConfig = new SparkMaxConfig();
    followerConfig.idleMode(IdleMode.kBrake).smartCurrentLimit(SMART_CURRENT_LIMIT);
    followerConfig.follow(leader, false); // TODO 依機構確認跟隨方向（兩顆方向相反就改 true）
    apply(follower, followerConfig);
  }

  private void apply(SparkMax motor, SparkMaxConfig cfg) {
    for (int i = 0; i < 3; i++) {
      if (motor.configure(cfg, ResetMode.kResetSafeParameters, PersistMode.kNoPersistParameters) == REVLibError.kOk) return;
    }
    connected = false;
    System.err.println("[Elevator] SPARK " + motor.getDeviceId() + " 設定失敗，檢查 CAN");
  }

  @Override
  public void updateInputs(ElevatorIOInputs inputs) {
    double m = ElevatorRevConfig.METERS_PER_ROTATION;
    double bus = leader.getBusVoltage();
    inputs.connected = connected && bus > 0.0;
    inputs.positionMeters = encoder.getPosition() * m;
    inputs.velocityMetersPerSec = encoder.getVelocity() * m;
    inputs.closedLoopReferenceMeters = controller.getMAXMotionSetpointPosition() * m;
    // SPARK 沒有回報參考速度：用 0，網站的跟隨誤差判斷只看位置
    inputs.closedLoopReferenceSlopeMetersPerSec = 0.0;
    inputs.appliedVolts = leader.getAppliedOutput() * bus;
    inputs.statorCurrentAmps = leader.getOutputCurrent();
    inputs.supplyVoltage = bus;
    // SPARK 不回報回授與前饋各是多少伏特
    inputs.closedLoopOutputVolts = 0.0;
    inputs.closedLoopFeedForwardVolts = 0.0;
  }

  @Override
  public void setPosition(double meters) {
    controller.setSetpoint(meters / ElevatorRevConfig.METERS_PER_ROTATION, ControlType.kMAXMotionPositionControl);
  }

  @Override
  public void setVoltage(double volts) {
    leader.setVoltage(volts);
  }

  @Override
  public void stop() {
    leader.stopMotor();
  }

  @Override
  public void resetPosition(double meters) {
    encoder.setPosition(meters / ElevatorRevConfig.METERS_PER_ROTATION);
  }

  @Override
  public boolean setSoftLimitsEnabled(boolean enabled) {
    config.softLimit.forwardSoftLimitEnabled(enabled).reverseSoftLimitEnabled(enabled);
    // 只改限位，不重設其他參數；CAN 忙的時候可能寫不進去，重試幾次，還是失敗就回報讓子系統停下來
    for (int i = 0; i < 3; i++) {
      if (leader.configure(config, ResetMode.kNoResetSafeParameters, PersistMode.kNoPersistParameters) == REVLibError.kOk) return true;
    }
    return false;
  }
}

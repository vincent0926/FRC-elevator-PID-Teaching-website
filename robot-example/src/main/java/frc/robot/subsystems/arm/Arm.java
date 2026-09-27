package frc.robot.subsystems.arm;

import static edu.wpi.first.units.Units.Second;
import static edu.wpi.first.units.Units.Seconds;
import static edu.wpi.first.units.Units.Volts;

import edu.wpi.first.wpilibj.Alert;
import edu.wpi.first.wpilibj.Alert.AlertType;
import edu.wpi.first.wpilibj.DriverStation;
import edu.wpi.first.wpilibj.Timer;
import edu.wpi.first.wpilibj2.command.Command;
import edu.wpi.first.wpilibj2.command.SubsystemBase;
import edu.wpi.first.wpilibj2.command.sysid.SysIdRoutine;
import org.littletonrobotics.junction.Logger;

/**
 * 手臂子系統。角度一律是弧度，0 = 水平、往上為正。
 * 跟隨誤差過大或失速（有電流、沒速度）持續一段時間就停止，直到 Disable 後重新 Enable。
 *
 * <p>這只是程式保護，不能取代 Driver Station 的 Disable 與急停。
 * 手臂停掉（Neutral）時會因為重力往下掉，Brake 模式只能讓它掉得慢一點，測試時人要離開手臂的掃過範圍。
 */
public class Arm extends SubsystemBase {
  private static final double MAX_FOLLOWING_ERROR_RAD = Math.toRadians(10.0);
  private static final double STALL_CURRENT_AMPS = 50.0;
  private static final double STALL_VELOCITY_RAD_PER_SEC = Math.toRadians(3.0);
  private static final double FAULT_TIME_SEC = 0.3;
  // TODO 依角度範圍修改：SysId 測試到這兩個角度就自動停（留足夠的煞車距離）
  private static final double SYSID_MIN_DEG = -7.0;
  private static final double SYSID_MAX_DEG = 94.4;

  private final ArmIO io;
  private final ArmIOInputsAutoLogged inputs = new ArmIOInputsAutoLogged();
  private final Alert disconnected = new Alert("手臂馬達沒有連線", AlertType.kError);
  private final Alert encoderDisconnected = new Alert("手臂 CANcoder 沒有連線：角度不可信，手臂停止", AlertType.kError);
  private final Alert tripped = new Alert("手臂保護觸發：已停止，Disable 後重新 Enable 才會解除", AlertType.kError);

  private double goalRad = 0.0;
  private double faultSince = Double.NaN;
  private boolean safetyStopped = false;
  /** 開迴路動作中（SysId）：沒有軌跡可以比，跳過跟隨誤差保護 */
  private boolean openLoopActive = false;
  private final SysIdRoutine sysId;

  public Arm(ArmIO io) {
    this.io = io;
    // 單元二：手臂角度範圍小，步階電壓和 ramp 比預設小；每個測試最多 4 秒
    sysId =
        new SysIdRoutine(
            new SysIdRoutine.Config(
                Volts.per(Second).of(0.5),
                Volts.of(2.5),
                Seconds.of(4.0),
                state -> Logger.recordOutput("Arm/SysIdState", state.toString())),
            new SysIdRoutine.Mechanism(
                voltage -> {
                  if (!safetyStopped) io.setVoltage(voltage.in(Volts));
                },
                null, // 用 AdvantageKit 記錄，不用 SysId 自己的 log
                this));
  }

  @Override
  public void periodic() {
    io.updateInputs(inputs);
    Logger.processInputs("Arm", inputs);
    disconnected.set(!inputs.connected);
    encoderDisconnected.set(!inputs.encoderConnected);

    if (DriverStation.isDisabled()) {
      safetyStopped = false;
      faultSince = Double.NaN;
      goalRad = inputs.positionRad;
    }
    if (!inputs.encoderConnected) safetyStopped = true;

    boolean followingBad = !openLoopActive && Math.abs(inputs.closedLoopReferenceRad - inputs.positionRad) > MAX_FOLLOWING_ERROR_RAD;
    boolean stalled = Math.abs(inputs.statorCurrentAmps) > STALL_CURRENT_AMPS && Math.abs(inputs.velocityRadPerSec) < STALL_VELOCITY_RAD_PER_SEC;
    if (DriverStation.isEnabled() && (followingBad || stalled)) {
      if (Double.isNaN(faultSince)) faultSince = Timer.getFPGATimestamp();
      if (Timer.getFPGATimestamp() - faultSince > FAULT_TIME_SEC) safetyStopped = true;
    } else {
      faultSince = Double.NaN;
    }
    tripped.set(safetyStopped);
    if (safetyStopped) io.stop();

    Logger.recordOutput("Arm/GoalRad", goalRad);
    Logger.recordOutput("Arm/GoalDeg", Math.toDegrees(goalRad));
    Logger.recordOutput("Arm/PositionDeg", Math.toDegrees(inputs.positionRad));
    Logger.recordOutput("Arm/SafetyStopped", safetyStopped);
  }

  /** 目標角度（rad），會限制在 ArmGains 的範圍內。 */
  public void setGoal(double rad) {
    goalRad = Math.max(Math.toRadians(ArmGains.MIN_ANGLE_DEG), Math.min(Math.toRadians(ArmGains.MAX_ANGLE_DEG), rad));
    if (!safetyStopped) io.setAngle(goalRad);
  }

  public double getAngleRad() {
    return inputs.positionRad;
  }

  public boolean atGoal(double toleranceRad) {
    return Math.abs(goalRad - inputs.positionRad) < toleranceRad;
  }

  /** 轉到指定角度（度），到位（±1°）後結束。 */
  public Command moveToDegrees(double degrees) {
    return runOnce(() -> setGoal(Math.toRadians(degrees)))
        .andThen(run(() -> {}).until(() -> atGoal(Math.toRadians(1.0))))
        .withName("Arm.moveTo");
  }

  /**
   * 錄調參日誌用的測試動作（單元一）：往上、往下、停在不同角度都要有，kG（cos θ）和 kS 才分得開。
   * 一定要有停在水平附近的點，kG 在那裡最明顯。每次到位後停 2 秒。
   * 第一次請先把 Motion Magic 速度與加速度降到 25%。
   */
  public Command tuningRoutine() {
    double lo = ArmGains.MIN_ANGLE_DEG + 10.0;
    double hi = Math.min(ArmGains.MAX_ANGLE_DEG - 10.0, 80.0);
    double[] degrees = {0.0, hi, 0.0, (lo + hi) / 2.0, lo, 0.0};
    Command c = runOnce(() -> {});
    for (double d : degrees) {
      c = c.andThen(moveToDegrees(d).withTimeout(4.0)).andThen(run(() -> {}).withTimeout(2.0));
    }
    return c.withName("Arm.tuningRoutine");
  }

  /**
   * SysId 準靜態測試（單元二）：電壓每秒加 0.5 V，量 kS、kG、kV。
   * 手臂的 kG 會隨角度變（cos θ），分析時要選 Arm 模式。接近角度範圍兩端會自動停。
   * 綁在 whileTrue，放開按鈕就停。
   */
  public Command sysIdQuasistatic(SysIdRoutine.Direction direction) {
    return sysIdCommand(sysId.quasistatic(direction), direction);
  }

  /** SysId 動態測試（單元二）：直接給 2.5 V，量 kA。 */
  public Command sysIdDynamic(SysIdRoutine.Direction direction) {
    return sysIdCommand(sysId.dynamic(direction), direction);
  }

  private Command sysIdCommand(Command test, SysIdRoutine.Direction direction) {
    boolean up = direction == SysIdRoutine.Direction.kForward;
    return test.until(() -> up ? inputs.positionRad > Math.toRadians(SYSID_MAX_DEG) : inputs.positionRad < Math.toRadians(SYSID_MIN_DEG))
        .beforeStarting(() -> openLoopActive = true)
        .finallyDo(
            () -> {
              openLoopActive = false;
              io.stop();
            })
        .withName("Arm.sysId");
  }
}

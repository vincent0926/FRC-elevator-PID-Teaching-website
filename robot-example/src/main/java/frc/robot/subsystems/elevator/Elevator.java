package frc.robot.subsystems.elevator;

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
 * 電梯子系統。除了移動之外，負責單元零第 4 步的保護：
 * 跟隨誤差過大或失速（有電流、沒速度）持續一段時間就停止，直到 Disable 後重新 Enable。
 *
 * <p>這只是程式保護，不能取代 Driver Station 的 Disable 與急停。
 */
public class Elevator extends SubsystemBase {
  private static final double MAX_FOLLOWING_ERROR_METERS = 0.10;
  private static final double STALL_CURRENT_AMPS = 50.0;
  private static final double STALL_VELOCITY = 0.02;
  private static final double FAULT_TIME_SEC = 0.3;
  // TODO 依行程修改：SysId 測試到這兩個高度就自動停（留足夠的煞車距離）
  private static final double SYSID_MIN_METERS = 0.10;
  private static final double SYSID_MAX_METERS = 1.05;
  // 歸零：用很小的電壓往下碰擋，電流升高而且停住就是到底了
  private static final double HOMING_VOLTS = -1.0;
  private static final double HOMING_STALL_AMPS = 20.0;
  private static final double HOMING_TIMEOUT_SEC = 3.0;

  private final ElevatorIO io;
  private final ElevatorIOInputsAutoLogged inputs = new ElevatorIOInputsAutoLogged();
  private final Alert disconnected = new Alert("電梯馬達沒有連線", AlertType.kError);
  private final Alert tripped = new Alert("電梯保護觸發：已停止，Disable 後重新 Enable 才會解除", AlertType.kError);
  private final Alert softLimitsLost = new Alert("軟體限位沒有恢復：電梯停止，會一直重試到成功", AlertType.kError);
  private final Alert homingWrongWay = new Alert("歸零時電梯往上跑：馬達方向設反了，先做單元零第 2 步", AlertType.kError);

  private double goalMeters = 0.0;
  private double faultSince = Double.NaN;
  private boolean safetyStopped = false;
  /** 開迴路動作中（SysId、歸零）：沒有軌跡可以比，跳過跟隨誤差保護 */
  private boolean openLoopActive = false;
  /** 歸零後軟體限位沒寫回去：一直停住並重試，成功才解除 */
  private boolean softLimitsDisabled = false;
  private final SysIdRoutine sysId;

  public Elevator(ElevatorIO io) {
    this.io = io;
    // 單元二：電梯行程短，步階電壓和 ramp 都比預設小；每個測試最多 5 秒
    sysId =
        new SysIdRoutine(
            new SysIdRoutine.Config(
                Volts.per(Second).of(0.5),
                Volts.of(3.0),
                Seconds.of(5.0),
                state -> Logger.recordOutput("Elevator/SysIdState", state.toString())),
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
    Logger.processInputs("Elevator", inputs);
    disconnected.set(!inputs.connected);

    if (DriverStation.isDisabled()) {
      safetyStopped = false;
      faultSince = Double.NaN;
      goalMeters = inputs.positionMeters;
    }
    if (softLimitsDisabled && !openLoopActive) softLimitsDisabled = !io.setSoftLimitsEnabled(true);
    softLimitsLost.set(softLimitsDisabled && !openLoopActive);
    if (softLimitsDisabled && !openLoopActive) safetyStopped = true;

    // SysId 用開迴路電壓，沒有軌跡可以比，只檢查失速
    boolean followingBad = !openLoopActive && Math.abs(inputs.closedLoopReferenceMeters - inputs.positionMeters) > MAX_FOLLOWING_ERROR_METERS;
    boolean stalled = Math.abs(inputs.statorCurrentAmps) > STALL_CURRENT_AMPS && Math.abs(inputs.velocityMetersPerSec) < STALL_VELOCITY;
    if (DriverStation.isEnabled() && (followingBad || stalled)) {
      if (Double.isNaN(faultSince)) faultSince = Timer.getFPGATimestamp();
      if (Timer.getFPGATimestamp() - faultSince > FAULT_TIME_SEC) safetyStopped = true;
    } else {
      faultSince = Double.NaN;
    }
    tripped.set(safetyStopped);
    if (safetyStopped) io.stop();

    Logger.recordOutput("Elevator/GoalMeters", goalMeters);
    Logger.recordOutput("Elevator/SafetyStopped", safetyStopped);
  }

  public void setGoal(double meters) {
    goalMeters = meters;
    if (!safetyStopped) io.setPosition(meters);
  }

  public double getPositionMeters() {
    return inputs.positionMeters;
  }

  private boolean homingStalled() {
    return Math.abs(inputs.statorCurrentAmps) > HOMING_STALL_AMPS && Math.abs(inputs.velocityMetersPerSec) < 0.01;
  }

  /** 歸零時往上跑超過 5 cm/s：方向設反了 */
  private boolean movingUp() {
    return inputs.velocityMetersPerSec > 0.05;
  }

  public boolean atGoal(double toleranceMeters) {
    return Math.abs(goalMeters - inputs.positionMeters) < toleranceMeters;
  }

  /** 移到指定高度，到位（±1 cm）後結束。 */
  public Command moveTo(double meters) {
    return runOnce(() -> setGoal(meters)).andThen(run(() -> {}).until(() -> atGoal(0.01))).withName("Elevator.moveTo");
  }

  /**
   * 錄調參日誌用的測試動作（單元一）：上、下、停都要有，kG 和 kS 才分得開。
   * 每次到位後停 2 秒。第一次請先把 Motion Magic 速度與加速度降到 25%。
   */
  public Command tuningRoutine(double travelMeters) {
    double[] fractions = {0.2, 0.75, 0.2, 0.5, 0.05};
    Command c = runOnce(() -> {});
    for (double f : fractions) {
      c = c.andThen(moveTo(f * travelMeters).withTimeout(4.0)).andThen(run(() -> {}).withTimeout(2.0));
    }
    return c.withName("Elevator.tuningRoutine");
  }

  /**
   * 歸零（單元零第 3 步）：開機時的位置不一定是 0。
   * 關掉軟體限位、用 −1 V 慢慢往下，電流超過 20 A 而且速度接近 0 就是碰到硬擋，把位置設成 0。
   * 3 秒內沒碰到就放棄、不改位置（Dashboard 會看到這個指令被中斷）。
   *
   * <p>一定要先做完單元零第 2 步（確認正電壓往上）。方向設反時電梯會往上跑，
   * 這裡偵測到往上的速度就立刻停、不改位置；保護觸發時也一樣。
   */
  public Command homeCommand() {
    return run(() -> {
          if (!safetyStopped) io.setVoltage(HOMING_VOLTS);
        })
        .until(() -> safetyStopped || movingUp() || homingStalled())
        .beforeStarting(
            () -> {
              openLoopActive = true;
              homingWrongWay.set(false);
              softLimitsDisabled = true;
              io.setSoftLimitsEnabled(false);
            })
        .finallyDo(
            interrupted -> {
              io.stop();
              homingWrongWay.set(movingUp());
              // 只有真的碰到底才把位置設成 0
              if (!interrupted && !safetyStopped && !movingUp() && homingStalled()) {
                io.resetPosition(0.0);
                goalMeters = 0.0;
              }
              softLimitsDisabled = !io.setSoftLimitsEnabled(true);
              openLoopActive = false;
            })
        .withTimeout(HOMING_TIMEOUT_SEC)
        .withName("Elevator.home");
  }

  /**
   * SysId 準靜態測試（單元二）：電壓每秒加 0.5 V，量 kS、kG、kV。
   * 往上的測試從靠近底部開始、往下的從靠近頂部開始；接近行程兩端會自動停。
   * 綁在 whileTrue，放開按鈕就停。
   */
  public Command sysIdQuasistatic(SysIdRoutine.Direction direction) {
    return sysIdCommand(sysId.quasistatic(direction), direction);
  }

  /** SysId 動態測試（單元二）：直接給 3 V，量 kA。 */
  public Command sysIdDynamic(SysIdRoutine.Direction direction) {
    return sysIdCommand(sysId.dynamic(direction), direction);
  }

  private Command sysIdCommand(Command test, SysIdRoutine.Direction direction) {
    boolean up = direction == SysIdRoutine.Direction.kForward;
    return test.until(() -> up ? inputs.positionMeters > SYSID_MAX_METERS : inputs.positionMeters < SYSID_MIN_METERS)
        .beforeStarting(() -> openLoopActive = true)
        .finallyDo(
            () -> {
              openLoopActive = false;
              io.stop();
            })
        .withName("Elevator.sysId");
  }
}

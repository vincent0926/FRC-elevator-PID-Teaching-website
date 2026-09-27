/**
 * 4F 教學用的程式片段，摘自 robot-example/（改了範例程式要一起改這裡）。
 */

export const INPUTS_SNIPPET = `// ElevatorIO.java：@AutoLog 會產生 ElevatorIOInputsAutoLogged
@AutoLog
class ElevatorIOInputs {
  public double positionMeters = 0.0;
  public double velocityMetersPerSec = 0.0;
  public double closedLoopReferenceMeters = 0.0;
  public double closedLoopReferenceSlopeMetersPerSec = 0.0;
  public double appliedVolts = 0.0;
  public double statorCurrentAmps = 0.0;
  public double closedLoopOutputVolts = 0.0;      // P + I + D
  public double closedLoopFeedForwardVolts = 0.0; // 總輸出 − 回授
}

// Elevator.java periodic()：這一行才會真的寫進日誌
io.updateInputs(inputs);
Logger.processInputs("Elevator", inputs);   // → /Elevator/PositionMeters …`

export const UPDATE_INPUTS_SNIPPET = `// ElevatorIOTalonFX.java updateInputs()
double m = ElevatorGains.METERS_PER_ROTATION;       // 轉 → 公尺，只在這裡換
inputs.positionMeters = position.getValueAsDouble() * m;
inputs.closedLoopReferenceMeters = reference.getValueAsDouble() * m;
double feedback = pOut.getValueAsDouble() + iOut.getValueAsDouble() + dOut.getValueAsDouble();
inputs.closedLoopOutputVolts = feedback;
inputs.closedLoopFeedForwardVolts = closedLoopOutput.getValueAsDouble() - feedback;`

export const FREQUENCY_SNIPPET = `// 位置、速度 100 Hz，其他配合 AdvantageKit 的 50 Hz 迴圈
BaseStatusSignal.setUpdateFrequencyForAll(100.0, position, velocity);
BaseStatusSignal.setUpdateFrequencyForAll(50.0, reference, referenceSlope,
    closedLoopOutput, pOut, iOut, dOut, appliedVolts, statorCurrent, supplyVoltage);
leader.optimizeBusUtilization();   // 沒列到的訊號降頻，省 CAN 頻寬`

export const TUNABLE_SNIPPET = `// ElevatorIOTalonFX.java：預設值是開機時載入的參數
kP = new LoggedTunableNumber("Elevator/kP", slot0.kP);
// …kS、kG、kV、kA、kI、kD 同樣寫法

// updateInputs() 最後：Dashboard 改了才重新套用 Slot 0
LoggedTunableNumber.ifChanged(hashCode(),
    v -> leader.getConfigurator().apply(slot0.withKS(v[0]).withKG(v[1]) /* … */),
    kS, kG, kV, kA, kP, kI, kD);`

export const ROUTINE_SNIPPET = `// Elevator.java：上、下、停都有，每次到位停 2 秒
public Command tuningRoutine(double travelMeters) {
  double[] fractions = {0.2, 0.75, 0.2, 0.5, 0.05};
  …
}

// RobotContainer.java（測試時才綁）
controller.y().onTrue(elevator.tuningRoutine(1.2));`

export const SYSID_ROUTINE_SNIPPET = `// Elevator.java 建構子
sysId = new SysIdRoutine(
    new SysIdRoutine.Config(
        Volts.per(Second).of(0.5),   // 準靜態：每秒加 0.5 V（預設 1 V/s 對電梯太快）
        Volts.of(3.0),               // 動態：直接給 3 V（預設 7 V 會撞頂）
        Seconds.of(5.0),             // 每個測試最多 5 秒
        state -> Logger.recordOutput("Elevator/SysIdState", state.toString())),
    new SysIdRoutine.Mechanism(
        voltage -> io.setVoltage(voltage.in(Volts)),
        null,                        // 用 AdvantageKit 記錄
        this));

// 接近行程兩端自動停
public Command sysIdQuasistatic(SysIdRoutine.Direction direction) {
  return sysId.quasistatic(direction)
      .until(() -> up ? inputs.positionMeters > SYSID_MAX_METERS
                      : inputs.positionMeters < SYSID_MIN_METERS) …
}`

export const SYSID_BINDINGS_SNIPPET = `// RobotContainer.java：只在測試分支綁定，比賽程式拿掉
// whileTrue：放開按鈕就停
controller.povUp().whileTrue(elevator.sysIdQuasistatic(SysIdRoutine.Direction.kForward));
controller.povDown().whileTrue(elevator.sysIdQuasistatic(SysIdRoutine.Direction.kReverse));
controller.povRight().whileTrue(elevator.sysIdDynamic(SysIdRoutine.Direction.kForward));
controller.povLeft().whileTrue(elevator.sysIdDynamic(SysIdRoutine.Direction.kReverse));`

export const SIGNAL_LOGGER_SNIPPET = `// 想要更高頻的資料：改用 Phoenix 6 SignalLogger（記在 roboRIO 的 .hoot 檔）
SignalLogger.start();     // 測試前
// Config 的最後一個參數改成：
state -> SignalLogger.writeString("state", state.toString())
SignalLogger.stop();      // 測試後
// 用 Tuner X 把 .hoot 轉成 .wpilog，SysId 單位會是「轉」，不是公尺`

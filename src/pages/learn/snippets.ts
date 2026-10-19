import { t } from '../../core/lang'
/**
 * 4F 教學用的程式片段，摘自 robot-example/（改了範例程式要一起改這裡）。
 */

export const INPUTS_SNIPPET = `// ${t('ElevatorIO.java：@AutoLog 會產生 ElevatorIOInputsAutoLogged', 'ElevatorIO.java: @AutoLog generates ElevatorIOInputsAutoLogged')}
@AutoLog
class ElevatorIOInputs {
  public double positionMeters = 0.0;
  public double velocityMetersPerSec = 0.0;
  public double closedLoopReferenceMeters = 0.0;
  public double closedLoopReferenceSlopeMetersPerSec = 0.0;
  public double appliedVolts = 0.0;
  public double statorCurrentAmps = 0.0;
  public double closedLoopOutputVolts = 0.0;      // P + I + D
  public double closedLoopFeedForwardVolts = 0.0; // ${t('總輸出 − 回授', 'total output − feedback')}
}

// ${t('Elevator.java periodic()：這一行才會真的寫進日誌', 'Elevator.java periodic(): this line is what actually writes to the log')}
io.updateInputs(inputs);
Logger.processInputs("Elevator", inputs);   // → /Elevator/PositionMeters …`

export const UPDATE_INPUTS_SNIPPET = `// ElevatorIOTalonFX.java updateInputs()
double m = ElevatorGains.METERS_PER_ROTATION;       // ${t('轉 → 公尺，只在這裡換', 'rotations → meters, converted only here')}
inputs.positionMeters = position.getValueAsDouble() * m;
inputs.closedLoopReferenceMeters = reference.getValueAsDouble() * m;
double feedback = pOut.getValueAsDouble() + iOut.getValueAsDouble() + dOut.getValueAsDouble();
inputs.closedLoopOutputVolts = feedback;
inputs.closedLoopFeedForwardVolts = closedLoopOutput.getValueAsDouble() - feedback;`

export const FREQUENCY_SNIPPET = `// ${t('位置、速度 100 Hz，其他配合 AdvantageKit 的 50 Hz 迴圈', 'Position and velocity at 100 Hz, the rest matching AdvantageKit’s 50 Hz loop')}
BaseStatusSignal.setUpdateFrequencyForAll(100.0, position, velocity);
BaseStatusSignal.setUpdateFrequencyForAll(50.0, reference, referenceSlope,
    closedLoopOutput, pOut, iOut, dOut, appliedVolts, statorCurrent, supplyVoltage);
leader.optimizeBusUtilization();   // ${t('沒列到的訊號降頻，省 CAN 頻寬', 'unlisted signals slow down, saving CAN bandwidth')}`

export const TUNABLE_SNIPPET = `// ${t('ElevatorIOTalonFX.java：預設值是開機時載入的參數', 'ElevatorIOTalonFX.java: defaults are the gains loaded at boot')}
kP = new LoggedTunableNumber("Elevator/kP", slot0.kP);
// ${t('…kS、kG、kV、kA、kI、kD 同樣寫法', '…same for kS, kG, kV, kA, kI, kD')}

// ${t('updateInputs() 最後：Dashboard 改了才重新套用 Slot 0', 'end of updateInputs(): reapply Slot 0 only when the dashboard changed')}
LoggedTunableNumber.ifChanged(hashCode(),
    v -> leader.getConfigurator().apply(slot0.withKS(v[0]).withKG(v[1]) /* … */),
    kS, kG, kV, kA, kP, kI, kD);`

export const ROUTINE_SNIPPET = `// ${t('Elevator.java：上、下、停都有，每次到位停 2 秒', 'Elevator.java: up, down and holding, pausing 2 s at each arrival')}
public Command tuningRoutine(double travelMeters) {
  double[] fractions = {0.2, 0.75, 0.2, 0.5, 0.05};
  …
}

// ${t('RobotContainer.java（測試時才綁）', 'RobotContainer.java (bind only for testing)')}
controller.y().onTrue(elevator.tuningRoutine(1.2));`

export const SYSID_ROUTINE_SNIPPET = `// ${t('Elevator.java 建構子', 'Elevator.java constructor')}
sysId = new SysIdRoutine(
    new SysIdRoutine.Config(
        Volts.per(Second).of(0.5),   // ${t('準靜態：每秒加 0.5 V（預設 1 V/s 對電梯太快）', 'quasistatic: +0.5 V per second (the 1 V/s default is too fast for an elevator)')}
        Volts.of(3.0),               // ${t('動態：直接給 3 V（預設 7 V 會撞頂）', 'dynamic: 3 V straight away (the 7 V default hits the top)')}
        Seconds.of(5.0),             // ${t('每個測試最多 5 秒', 'at most 5 s per test')}
        state -> Logger.recordOutput("Elevator/SysIdState", state.toString())),
    new SysIdRoutine.Mechanism(
        voltage -> io.setVoltage(voltage.in(Volts)),
        null,                        // ${t('用 AdvantageKit 記錄', 'logged with AdvantageKit')}
        this));

// ${t('接近行程兩端自動停', 'stop automatically near either end of travel')}
public Command sysIdQuasistatic(SysIdRoutine.Direction direction) {
  return sysId.quasistatic(direction)
      .until(() -> up ? inputs.positionMeters > SYSID_MAX_METERS
                      : inputs.positionMeters < SYSID_MIN_METERS) …
}`

export const SYSID_BINDINGS_SNIPPET = `// ${t('RobotContainer.java：只在測試分支綁定，比賽程式拿掉', 'RobotContainer.java: bind only in a test branch, remove for competition')}
// ${t('whileTrue：放開按鈕就停', 'whileTrue: stops when the button is released')}
controller.povUp().whileTrue(elevator.sysIdQuasistatic(SysIdRoutine.Direction.kForward));
controller.povDown().whileTrue(elevator.sysIdQuasistatic(SysIdRoutine.Direction.kReverse));
controller.povRight().whileTrue(elevator.sysIdDynamic(SysIdRoutine.Direction.kForward));
controller.povLeft().whileTrue(elevator.sysIdDynamic(SysIdRoutine.Direction.kReverse));`

export const SIGNAL_LOGGER_SNIPPET = `// ${t('想要更高頻的資料：改用 Phoenix 6 SignalLogger（記在 roboRIO 的 .hoot 檔）', 'For higher-rate data: use Phoenix 6 SignalLogger instead (.hoot files on the roboRIO)')}
SignalLogger.start();     // ${t('測試前', 'before the test')}
// ${t('Config 的最後一個參數改成：', 'change Config’s last argument to:')}
state -> SignalLogger.writeString("state", state.toString())
SignalLogger.stop();      // ${t('測試後', 'after the test')}
// ${t('用 Tuner X 把 .hoot 轉成 .wpilog，SysId 單位會是「轉」，不是公尺', 'convert .hoot to .wpilog with Tuner X; SysId units will be rotations, not meters')}`

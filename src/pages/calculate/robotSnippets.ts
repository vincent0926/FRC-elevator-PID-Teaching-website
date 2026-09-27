/** 1F 輸出區塊用的程式片段 */

export const ROBORIO_SNIPPET = `// 在 roboRIO 上算軌跡和前饋（每 20 ms 一次），例如 SPARK MAX 或 roboRIO 端 PID
private final TrapezoidProfile profile =
    new TrapezoidProfile(new TrapezoidProfile.Constraints(MAX_VEL, MAX_ACCEL)); // m/s、m/s²
private final ElevatorFeedforward feedforward = new ElevatorFeedforward(kS, kG, kV, kA);
private final PIDController pid = new PIDController(kP, 0, kD); // kP 比 TalonFX 上的小
private TrapezoidProfile.State setpoint = new TrapezoidProfile.State();

public void periodic() {
  TrapezoidProfile.State next = profile.calculate(0.02, setpoint, new TrapezoidProfile.State(goal, 0));
  // 前饋用「參考」速度（這一步到下一步），跟 Phoenix 6 一樣不看量到的速度
  double volts = feedforward.calculateWithVelocities(setpoint.velocity, next.velocity)
      + pid.calculate(positionMeters, next.position);
  setpoint = next;
  io.setVoltage(volts);
}`

package frc.robot.subsystems.elevator;

import com.ctre.phoenix6.BaseStatusSignal;
import com.ctre.phoenix6.StatusCode;
import com.ctre.phoenix6.StatusSignal;
import com.ctre.phoenix6.configs.Slot0Configs;
import com.ctre.phoenix6.configs.TalonFXConfiguration;
import com.ctre.phoenix6.controls.Follower;
import com.ctre.phoenix6.controls.MotionMagicVoltage;
import com.ctre.phoenix6.controls.NeutralOut;
import com.ctre.phoenix6.controls.VoltageOut;
import com.ctre.phoenix6.hardware.TalonFX;
import com.ctre.phoenix6.signals.InvertedValue;
import com.ctre.phoenix6.signals.MotorAlignmentValue;
import com.ctre.phoenix6.signals.NeutralModeValue;
import edu.wpi.first.units.measure.Angle;
import edu.wpi.first.units.measure.AngularVelocity;
import edu.wpi.first.units.measure.Current;
import edu.wpi.first.units.measure.Voltage;
import frc.robot.util.LoggedTunableNumber;

/**
 * TalonFX 實作（Phoenix 6，MotionMagicVoltage，閉迴路在 TalonFX 上 1 kHz 執行）。
 *
 * <p>SensorToMechanismRatio = 齒比，所以「機構 1 圈 = 鼓輪 1 圈 = ElevatorGains.METERS_PER_ROTATION 公尺」。
 * 參數的最終依據是 {@link ElevatorGains}（由網站產生後 commit）；deploy 裡的 JSON 只用來覆寫，
 * 缺欄位時用 ElevatorGains 的值並發出警告，不會讀成 0。
 */
public class ElevatorIOTalonFX implements ElevatorIO {
  // TODO 依實際接線與機構修改
  private static final int LEADER_ID = 20;
  private static final int FOLLOWER_ID = 21;
  private static final String CAN_BUS = "rio";
  private static final double STATOR_CURRENT_LIMIT = 60.0;
  private static final double MIN_METERS = 0.0;
  private static final double MAX_METERS = 1.2;

  private final TalonFX leader = new TalonFX(LEADER_ID, CAN_BUS);
  private final TalonFX follower = new TalonFX(FOLLOWER_ID, CAN_BUS);

  private final StatusSignal<Angle> position = leader.getPosition();
  private final StatusSignal<AngularVelocity> velocity = leader.getVelocity();
  private final StatusSignal<Double> reference = leader.getClosedLoopReference();
  private final StatusSignal<Double> referenceSlope = leader.getClosedLoopReferenceSlope();
  private final StatusSignal<Double> closedLoopOutput = leader.getClosedLoopOutput();
  private final StatusSignal<Double> pOut = leader.getClosedLoopProportionalOutput();
  private final StatusSignal<Double> iOut = leader.getClosedLoopIntegratedOutput();
  private final StatusSignal<Double> dOut = leader.getClosedLoopDerivativeOutput();
  private final StatusSignal<Voltage> appliedVolts = leader.getMotorVoltage();
  private final StatusSignal<Current> statorCurrent = leader.getStatorCurrent();
  private final StatusSignal<Voltage> supplyVoltage = leader.getSupplyVoltage();

  private final MotionMagicVoltage motionMagic = new MotionMagicVoltage(0.0);
  private final VoltageOut voltageOut = new VoltageOut(0.0);
  private final NeutralOut neutral = new NeutralOut();
  private final boolean hasDownSlot;

  // 單元一：Slot 0 的參數可以在 AdvantageScope / Elastic 即時改（Phoenix 6 轉數制）。
  // 預設值是開機時載入的參數（ElevatorGains 或 JSON）。Slot 1 不做即時調整，避免兩邊搞混。
  private final Slot0Configs slot0;
  private final LoggedTunableNumber kS, kG, kV, kA, kP, kI, kD;

  public ElevatorIOTalonFX() {
    ElevatorGainsLoader.Loaded gains = ElevatorGainsLoader.load();
    hasDownSlot = gains.slot1() != null;
    slot0 = gains.slot0();
    kS = new LoggedTunableNumber("Elevator/kS", slot0.kS);
    kG = new LoggedTunableNumber("Elevator/kG", slot0.kG);
    kV = new LoggedTunableNumber("Elevator/kV", slot0.kV);
    kA = new LoggedTunableNumber("Elevator/kA", slot0.kA);
    kP = new LoggedTunableNumber("Elevator/kP", slot0.kP);
    kI = new LoggedTunableNumber("Elevator/kI", slot0.kI);
    kD = new LoggedTunableNumber("Elevator/kD", slot0.kD);
    // 先記住開機時的值，之後有改才套用
    LoggedTunableNumber.ifChanged(hashCode(), v -> {}, kS, kG, kV, kA, kP, kI, kD);

    TalonFXConfiguration config = new TalonFXConfiguration();
    config.MotorOutput.NeutralMode = NeutralModeValue.Brake;
    config.MotorOutput.Inverted = InvertedValue.CounterClockwise_Positive; // TODO 單元零：確認正電壓往上
    config.Feedback.SensorToMechanismRatio = ElevatorGains.GEAR_RATIO;
    config.Slot0 = gains.slot0();
    if (hasDownSlot) config.Slot1 = gains.slot1();
    config.MotionMagic = gains.motionMagic();

    // 單元零第 4 步：限制
    config.CurrentLimits.StatorCurrentLimit = STATOR_CURRENT_LIMIT;
    config.CurrentLimits.StatorCurrentLimitEnable = true;
    config.SoftwareLimitSwitch.ForwardSoftLimitThreshold = MAX_METERS / ElevatorGains.METERS_PER_ROTATION;
    config.SoftwareLimitSwitch.ForwardSoftLimitEnable = true;
    config.SoftwareLimitSwitch.ReverseSoftLimitThreshold = MIN_METERS / ElevatorGains.METERS_PER_ROTATION;
    config.SoftwareLimitSwitch.ReverseSoftLimitEnable = true;
    apply(leader, config);

    // 跟隨者不需要自己的閉迴路設定，只要煞車模式和電流限制
    TalonFXConfiguration followerConfig = new TalonFXConfiguration();
    followerConfig.MotorOutput.NeutralMode = NeutralModeValue.Brake;
    followerConfig.CurrentLimits = config.CurrentLimits;
    apply(follower, followerConfig);
    // TODO 依機構確認跟隨方向（Phoenix 6 2026 以 MotorAlignmentValue 表示；舊版是 boolean opposeMasterDirection）
    follower.setControl(new Follower(LEADER_ID, MotorAlignmentValue.Aligned));

    // 位置與速度給高一點，網站做微分時比較準；其他配合 AdvantageKit 50 Hz
    BaseStatusSignal.setUpdateFrequencyForAll(100.0, position, velocity);
    BaseStatusSignal.setUpdateFrequencyForAll(
        50.0, reference, referenceSlope, closedLoopOutput, pOut, iOut, dOut, appliedVolts, statorCurrent, supplyVoltage);
    leader.optimizeBusUtilization();
    follower.optimizeBusUtilization();
  }

  private static void apply(TalonFX motor, TalonFXConfiguration config) {
    for (int i = 0; i < 5; i++) {
      if (motor.getConfigurator().apply(config, 0.25) == StatusCode.OK) return;
    }
    System.err.println("[Elevator] TalonFX " + motor.getDeviceID() + " 設定失敗，檢查 CAN");
  }

  @Override
  public void updateInputs(ElevatorIOInputs inputs) {
    StatusCode status =
        BaseStatusSignal.refreshAll(
            position, velocity, reference, referenceSlope, closedLoopOutput, pOut, iOut, dOut, appliedVolts, statorCurrent, supplyVoltage);
    double m = ElevatorGains.METERS_PER_ROTATION;
    inputs.connected = status.isOK();
    inputs.positionMeters = position.getValueAsDouble() * m;
    inputs.velocityMetersPerSec = velocity.getValueAsDouble() * m;
    inputs.closedLoopReferenceMeters = reference.getValueAsDouble() * m;
    inputs.closedLoopReferenceSlopeMetersPerSec = referenceSlope.getValueAsDouble() * m;
    inputs.appliedVolts = appliedVolts.getValueAsDouble();
    inputs.statorCurrentAmps = statorCurrent.getValueAsDouble();
    inputs.supplyVoltage = supplyVoltage.getValueAsDouble();
    // MotionMagicVoltage 時閉迴路輸出單位是伏特
    double feedback = pOut.getValueAsDouble() + iOut.getValueAsDouble() + dOut.getValueAsDouble();
    inputs.closedLoopOutputVolts = feedback;
    inputs.closedLoopFeedForwardVolts = closedLoopOutput.getValueAsDouble() - feedback;

    // Dashboard 改了參數就重新套用 Slot 0（只在有變動時送 CAN 設定）
    LoggedTunableNumber.ifChanged(
        hashCode(),
        v -> leader.getConfigurator().apply(slot0.withKS(v[0]).withKG(v[1]).withKV(v[2]).withKA(v[3]).withKP(v[4]).withKI(v[5]).withKD(v[6])),
        kS, kG, kV, kA, kP, kI, kD);
  }

  @Override
  public void setPosition(double meters) {
    double current = position.getValueAsDouble() * ElevatorGains.METERS_PER_ROTATION;
    // 摩擦不對稱時：往上 Slot 0、往下 Slot 1
    int slot = hasDownSlot && meters < current ? 1 : 0;
    leader.setControl(motionMagic.withPosition(meters / ElevatorGains.METERS_PER_ROTATION).withSlot(slot));
  }

  @Override
  public void setVoltage(double volts) {
    leader.setControl(voltageOut.withOutput(volts));
  }

  @Override
  public void stop() {
    leader.setControl(neutral);
  }

  @Override
  public void resetPosition(double meters) {
    leader.setPosition(meters / ElevatorGains.METERS_PER_ROTATION);
  }
}

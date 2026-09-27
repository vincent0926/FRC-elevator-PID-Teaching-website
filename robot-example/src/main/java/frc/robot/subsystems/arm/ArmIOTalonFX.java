package frc.robot.subsystems.arm;

import com.ctre.phoenix6.BaseStatusSignal;
import com.ctre.phoenix6.StatusCode;
import com.ctre.phoenix6.StatusSignal;
import com.ctre.phoenix6.configs.CANcoderConfiguration;
import com.ctre.phoenix6.configs.Slot0Configs;
import com.ctre.phoenix6.configs.TalonFXConfiguration;
import com.ctre.phoenix6.controls.MotionMagicVoltage;
import com.ctre.phoenix6.controls.NeutralOut;
import com.ctre.phoenix6.controls.VoltageOut;
import com.ctre.phoenix6.hardware.CANcoder;
import com.ctre.phoenix6.hardware.TalonFX;
import com.ctre.phoenix6.signals.FeedbackSensorSourceValue;
import com.ctre.phoenix6.signals.InvertedValue;
import com.ctre.phoenix6.signals.NeutralModeValue;
import com.ctre.phoenix6.signals.SensorDirectionValue;
import edu.wpi.first.units.measure.Angle;
import edu.wpi.first.units.measure.AngularVelocity;
import edu.wpi.first.units.measure.Current;
import edu.wpi.first.units.measure.Voltage;
import frc.robot.util.LoggedTunableNumber;

/**
 * TalonFX 實作（Phoenix 6，MotionMagicVoltage + Arm_Cosine，閉迴路在 TalonFX 上 1 kHz 執行）。
 *
 * <p>位置單位是「手臂轉幾圈」，0 = 水平。Arm_Cosine 直接拿這個位置算 cos，
 * 所以<b>水平一定要讀成 0</b>，不然 kG 的補償角度整個偏掉（網站 3F 情境「編碼器零點不在水平」）。
 *
 * <ul>
 *   <li>內建編碼器：SensorToMechanismRatio = 齒比。開機時手臂要靠在 {@link #BOOT_ANGLE_DEG}（通常是下方硬擋），
 *       程式把位置設成這個角度。
 *   <li>CANcoder：RemoteCANcoder，開機就知道角度。{@link #MAGNET_OFFSET_ROT} 要自己量：手臂擺水平，
 *       讀 CANcoder 的 Absolute Position（先把 offset 設 0），offset = −讀數。
 * </ul>
 *
 * <p>參數的最終依據是 {@link ArmGains}（由網站產生後 commit）；deploy 裡的 JSON 只用來覆寫。
 */
public class ArmIOTalonFX implements ArmIO {
  // TODO 依實際接線與機構修改
  private static final int MOTOR_ID = 30;
  private static final int CANCODER_ID = 31;
  private static final String CAN_BUS = "rio";
  private static final double STATOR_CURRENT_LIMIT = 60.0;
  private static final double SUPPLY_CURRENT_LIMIT = 40.0;
  /** 輸出上限（V）。第一次上機可以先設小一點；比「kG + kS」小就撐不住水平的手臂 */
  private static final double PEAK_FORWARD_VOLTAGE = 12.0;
  private static final double PEAK_REVERSE_VOLTAGE = -12.0;
  /** 內建編碼器：開機時手臂靠在這個角度（度，0 = 水平） */
  private static final double BOOT_ANGLE_DEG = -20.0;
  /** CANcoder：讓水平讀成 0 的磁鐵偏移（圈）。TODO 上機量 */
  private static final double MAGNET_OFFSET_ROT = 0.0;
  /** 軟體限位往內縮一點（度），留煞車距離 */
  private static final double SOFT_LIMIT_MARGIN_DEG = 3.0;

  private final TalonFX motor = new TalonFX(MOTOR_ID, CAN_BUS);
  private final CANcoder cancoder = ArmGains.USE_CANCODER ? new CANcoder(CANCODER_ID, CAN_BUS) : null;

  private final StatusSignal<Angle> position = motor.getPosition();
  private final StatusSignal<AngularVelocity> velocity = motor.getVelocity();
  private final StatusSignal<Double> reference = motor.getClosedLoopReference();
  private final StatusSignal<Double> referenceSlope = motor.getClosedLoopReferenceSlope();
  private final StatusSignal<Double> closedLoopOutput = motor.getClosedLoopOutput();
  private final StatusSignal<Double> pOut = motor.getClosedLoopProportionalOutput();
  private final StatusSignal<Double> iOut = motor.getClosedLoopIntegratedOutput();
  private final StatusSignal<Double> dOut = motor.getClosedLoopDerivativeOutput();
  private final StatusSignal<Voltage> appliedVolts = motor.getMotorVoltage();
  private final StatusSignal<Current> statorCurrent = motor.getStatorCurrent();
  private final StatusSignal<Voltage> supplyVoltage = motor.getSupplyVoltage();
  private final StatusSignal<Angle> cancoderPosition = cancoder != null ? cancoder.getAbsolutePosition() : null;

  private final MotionMagicVoltage motionMagic = new MotionMagicVoltage(0.0);
  private final VoltageOut voltageOut = new VoltageOut(0.0);
  private final NeutralOut neutral = new NeutralOut();

  // 單元一：Slot 0 的參數可以在 AdvantageScope / Elastic 即時改（Phoenix 6 轉數制）
  private final Slot0Configs slot0;
  private final LoggedTunableNumber kS, kG, kV, kA, kP, kI, kD;

  public ArmIOTalonFX() {
    ArmGainsLoader.Loaded gains = ArmGainsLoader.load();
    slot0 = gains.slot0();
    kS = new LoggedTunableNumber("Arm/kS", slot0.kS);
    kG = new LoggedTunableNumber("Arm/kG", slot0.kG);
    kV = new LoggedTunableNumber("Arm/kV", slot0.kV);
    kA = new LoggedTunableNumber("Arm/kA", slot0.kA);
    kP = new LoggedTunableNumber("Arm/kP", slot0.kP);
    kI = new LoggedTunableNumber("Arm/kI", slot0.kI);
    kD = new LoggedTunableNumber("Arm/kD", slot0.kD);
    LoggedTunableNumber.ifChanged(hashCode(), v -> {}, kS, kG, kV, kA, kP, kI, kD);

    TalonFXConfiguration config = new TalonFXConfiguration();
    config.MotorOutput.NeutralMode = NeutralModeValue.Brake;
    config.MotorOutput.Inverted = InvertedValue.CounterClockwise_Positive; // TODO 單元零：確認正電壓往上抬
    if (ArmGains.USE_CANCODER) {
      CANcoderConfiguration cc = new CANcoderConfiguration();
      cc.MagnetSensor.MagnetOffset = MAGNET_OFFSET_ROT;
      cc.MagnetSensor.SensorDirection = SensorDirectionValue.CounterClockwise_Positive; // TODO 確認手臂往上時讀數變大
      for (int i = 0; i < 5; i++) {
        if (cancoder.getConfigurator().apply(cc, 0.25) == StatusCode.OK) break;
      }
      // RemoteCANcoder 不需要 Phoenix Pro；有 Pro 可以改 FusedCANcoder（馬達編碼器補高頻，比較平順）
      config.Feedback.FeedbackRemoteSensorID = CANCODER_ID;
      config.Feedback.FeedbackSensorSource = FeedbackSensorSourceValue.RemoteCANcoder;
      config.Feedback.SensorToMechanismRatio = ArmGains.CANCODER_TO_ARM_RATIO;
      config.Feedback.RotorToSensorRatio = ArmGains.GEAR_RATIO / ArmGains.CANCODER_TO_ARM_RATIO;
    } else {
      config.Feedback.SensorToMechanismRatio = ArmGains.GEAR_RATIO;
    }
    config.Slot0 = gains.slot0();
    config.MotionMagic = gains.motionMagic();

    // 單元零第 4 步：限制
    config.CurrentLimits.StatorCurrentLimit = STATOR_CURRENT_LIMIT;
    config.CurrentLimits.StatorCurrentLimitEnable = true;
    config.CurrentLimits.SupplyCurrentLimit = SUPPLY_CURRENT_LIMIT;
    config.CurrentLimits.SupplyCurrentLimitEnable = true;
    config.Voltage.PeakForwardVoltage = PEAK_FORWARD_VOLTAGE;
    config.Voltage.PeakReverseVoltage = PEAK_REVERSE_VOLTAGE;
    config.SoftwareLimitSwitch.ForwardSoftLimitThreshold = (ArmGains.MAX_ANGLE_DEG - SOFT_LIMIT_MARGIN_DEG) / 360.0;
    config.SoftwareLimitSwitch.ForwardSoftLimitEnable = true;
    config.SoftwareLimitSwitch.ReverseSoftLimitThreshold = (ArmGains.MIN_ANGLE_DEG + SOFT_LIMIT_MARGIN_DEG) / 360.0;
    config.SoftwareLimitSwitch.ReverseSoftLimitEnable = true;
    for (int i = 0; i < 5; i++) {
      if (motor.getConfigurator().apply(config, 0.25) == StatusCode.OK) break;
      if (i == 4) System.err.println("[Arm] TalonFX " + MOTOR_ID + " 設定失敗，檢查 CAN");
    }
    // 內建編碼器：開機位置當成 BOOT_ANGLE_DEG（手臂要靠在那裡再開機）
    if (!ArmGains.USE_CANCODER) motor.setPosition(BOOT_ANGLE_DEG / 360.0);

    BaseStatusSignal.setUpdateFrequencyForAll(100.0, position, velocity);
    BaseStatusSignal.setUpdateFrequencyForAll(
        50.0, reference, referenceSlope, closedLoopOutput, pOut, iOut, dOut, appliedVolts, statorCurrent, supplyVoltage);
    if (cancoderPosition != null) cancoderPosition.setUpdateFrequency(50.0);
    motor.optimizeBusUtilization();
  }

  @Override
  public void updateInputs(ArmIOInputs inputs) {
    StatusCode status =
        BaseStatusSignal.refreshAll(
            position, velocity, reference, referenceSlope, closedLoopOutput, pOut, iOut, dOut, appliedVolts, statorCurrent, supplyVoltage);
    double r = 2.0 * Math.PI; // 手臂 1 圈 = 2π rad
    inputs.connected = status.isOK();
    inputs.encoderConnected = cancoderPosition == null || BaseStatusSignal.refreshAll(cancoderPosition).isOK();
    inputs.positionRad = position.getValueAsDouble() * r;
    inputs.velocityRadPerSec = velocity.getValueAsDouble() * r;
    inputs.closedLoopReferenceRad = reference.getValueAsDouble() * r;
    inputs.closedLoopReferenceSlopeRadPerSec = referenceSlope.getValueAsDouble() * r;
    inputs.appliedVolts = appliedVolts.getValueAsDouble();
    inputs.statorCurrentAmps = statorCurrent.getValueAsDouble();
    inputs.supplyVoltage = supplyVoltage.getValueAsDouble();
    double feedback = pOut.getValueAsDouble() + iOut.getValueAsDouble() + dOut.getValueAsDouble();
    inputs.closedLoopOutputVolts = feedback;
    inputs.closedLoopFeedForwardVolts = closedLoopOutput.getValueAsDouble() - feedback;

    LoggedTunableNumber.ifChanged(
        hashCode(),
        v -> motor.getConfigurator().apply(slot0.withKS(v[0]).withKG(v[1]).withKV(v[2]).withKA(v[3]).withKP(v[4]).withKI(v[5]).withKD(v[6])),
        kS, kG, kV, kA, kP, kI, kD);
  }

  @Override
  public void setAngle(double rad) {
    motor.setControl(motionMagic.withPosition(rad / (2.0 * Math.PI)));
  }

  @Override
  public void setVoltage(double volts) {
    motor.setControl(voltageOut.withOutput(volts));
  }

  @Override
  public void stop() {
    motor.setControl(neutral);
  }

  @Override
  public void resetAngle(double rad) {
    if (!ArmGains.USE_CANCODER) motor.setPosition(rad / (2.0 * Math.PI));
  }
}

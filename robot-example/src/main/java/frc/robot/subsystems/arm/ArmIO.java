package frc.robot.subsystems.arm;

import org.littletonrobotics.junction.AutoLog;

/**
 * 手臂硬體介面（隊上 IO 架構）。
 *
 * <p>角度一律是弧度，0 = 水平、往上為正。欄位名稱就是日誌裡的名稱：
 * AdvantageKit 會記成 /Arm/PositionRad 等，網站的欄位對應會自動認得。
 */
public interface ArmIO {
  @AutoLog
  class ArmIOInputs {
    public boolean connected = false;
    /** 用 CANcoder 時，CANcoder 有沒有連線（沒用時一直是 true） */
    public boolean encoderConnected = true;
    public double positionRad = 0.0;
    public double velocityRadPerSec = 0.0;
    /** Motion Magic 目前的參考角度（不是最終目標），調參分析用 */
    public double closedLoopReferenceRad = 0.0;
    public double closedLoopReferenceSlopeRadPerSec = 0.0;
    public double appliedVolts = 0.0;
    public double statorCurrentAmps = 0.0;
    public double supplyVoltage = 0.0;
    /** 回授輸出 P + I + D（V）。網站看它偏哪一邊來判斷前饋準不準 */
    public double closedLoopOutputVolts = 0.0;
    /** 前饋輸出 kS + kG·cos θ + kV + kA（V）＝ 閉迴路總輸出 − 回授 */
    public double closedLoopFeedForwardVolts = 0.0;
  }

  default void updateInputs(ArmIOInputs inputs) {}

  /** Motion Magic 轉到指定角度（rad，0 = 水平）。 */
  default void setAngle(double rad) {}

  /** 開迴路電壓（方向測試、SysId 用，請用很小的電壓）。 */
  default void setVoltage(double volts) {}

  default void stop() {}

  /** 把目前角度設成指定值（只有內建編碼器需要；CANcoder 是絕對角度，不用設）。 */
  default void resetAngle(double rad) {}
}

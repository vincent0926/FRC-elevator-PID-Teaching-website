package frc.robot.subsystems.elevator;

import org.littletonrobotics.junction.AutoLog;

/**
 * 電梯硬體介面（隊上 IO 架構）。
 *
 * <p>所有長度單位都是公尺，座標為「鼓輪線位移」（第一級）。欄位名稱就是日誌裡的名稱：
 * AdvantageKit 會記成 /Elevator/PositionMeters 等，網站的欄位對應會自動認得。
 */
public interface ElevatorIO {
  @AutoLog
  class ElevatorIOInputs {
    public boolean connected = false;
    public double positionMeters = 0.0;
    public double velocityMetersPerSec = 0.0;
    /** Motion Magic 目前的參考位置（不是最終目標），調參分析用 */
    public double closedLoopReferenceMeters = 0.0;
    public double closedLoopReferenceSlopeMetersPerSec = 0.0;
    public double appliedVolts = 0.0;
    public double statorCurrentAmps = 0.0;
    public double supplyVoltage = 0.0;
    /** 回授輸出 P + I + D（V）。網站看它偏哪一邊來判斷前饋準不準 */
    public double closedLoopOutputVolts = 0.0;
    /** 前饋輸出 kS + kG + kV + kA（V）＝ 閉迴路總輸出 − 回授 */
    public double closedLoopFeedForwardVolts = 0.0;
  }

  default void updateInputs(ElevatorIOInputs inputs) {}

  /** Motion Magic 移動到指定高度（m）。 */
  default void setPosition(double meters) {}

  /** 開迴路電壓（歸零、方向測試用，請用很小的電壓）。 */
  default void setVoltage(double volts) {}

  default void stop() {}

  /** 把目前位置設成指定高度（歸零用）。 */
  default void resetPosition(double meters) {}

  /** 暫時開關軟體限位（歸零時要關掉，不然開機位置不對時會被擋住）。 */
  default void setSoftLimitsEnabled(boolean enabled) {}
}

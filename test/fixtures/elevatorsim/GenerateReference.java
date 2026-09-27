import edu.wpi.first.math.system.plant.DCMotor;
import edu.wpi.first.wpilibj.simulation.ElevatorSim;
import java.io.PrintWriter;
import java.util.Locale;

/**
 * Phase 0 驗收用：用 WPILib 官方 ElevatorSim 產生參考資料，網站的物理引擎要跟它的位置誤差 < 1%。
 *
 * <p>ElevatorSim 只能表示單一質量，所以參考機構用單級電梯（速度比 1，m_G = m_A）。
 * 輸入是開迴路電壓序列（每 1 ms 固定），不經過 RobotController（不需要 HAL），
 * 所以只要 wpimath、wpilibj、wpiutil、wpiunits 與 EJML 的 jar 就能跑：
 *
 * <pre>
 *   javac -cp "jars/*" GenerateReference.java
 *   java  -cp "jars/*;." GenerateReference > kraken2-g5-8kg.csv     （Linux/macOS 用 : 分隔）
 * </pre>
 *
 * 參數要跟 test/elevatorSim.test.ts 的 REFERENCE 一致。
 */
public class GenerateReference {
  static final int MOTORS = 2;
  static final double GEARING = 5.0;
  static final double MASS_KG = 8.0;
  static final double DRUM_RADIUS_M = 0.0191;
  static final double MIN_M = 0.0;
  static final double MAX_M = 1.5;
  static final double START_M = 0.2;
  static final double DT = 0.001;
  static final double DURATION = 2.5;

  /** 開迴路電壓序列（V）：往上、滑行、往下、滑行、往上、斷電下滑 */
  static double volts(double t) {
    if (t < 0.3) return 6.0;
    if (t < 0.8) return 0.25;
    if (t < 1.1) return -4.0;
    if (t < 1.6) return 0.25;
    if (t < 2.0) return 3.0;
    return 0.0;
  }

  public static void main(String[] args) {
    ElevatorSim sim =
        new ElevatorSim(DCMotor.getKrakenX60(MOTORS), GEARING, MASS_KG, DRUM_RADIUS_M, MIN_M, MAX_M, true, START_M);
    PrintWriter out = new PrintWriter(System.out);
    out.println("t,volts,position,velocity");
    int steps = (int) Math.round(DURATION / DT);
    for (int i = 0; i <= steps; i++) {
      double t = i * DT;
      double v = volts(t);
      out.println(String.format(Locale.ROOT, "%.3f,%.4f,%.9f,%.9f", t, v, sim.getPositionMeters(), sim.getVelocityMetersPerSecond()));
      sim.setInput(v);
      sim.update(DT);
    }
    out.flush();
  }
}

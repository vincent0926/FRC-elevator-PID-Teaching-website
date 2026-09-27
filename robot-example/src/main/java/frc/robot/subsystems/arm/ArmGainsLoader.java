package frc.robot.subsystems.arm;

import com.ctre.phoenix6.configs.MotionMagicConfigs;
import com.ctre.phoenix6.configs.Slot0Configs;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.wpi.first.wpilibj.Alert;
import edu.wpi.first.wpilibj.Alert.AlertType;
import edu.wpi.first.wpilibj.Filesystem;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.function.DoubleConsumer;

/**
 * 讀 deploy/arm-gains.json（網站手臂 1F「下載 JSON 設定檔」產生）。
 *
 * <p>規則跟電梯一樣：程式碼裡的 {@link ArmGains} 是預設值，也是最終依據。JSON 有的欄位覆寫它，
 * 缺的欄位保留預設值並在 Dashboard 警告——絕對不默默讀成 0。
 * 齒比或角度感測器跟程式碼不同時忽略整個檔案（機構改了要重新產生 Java）。
 */
public final class ArmGainsLoader {
  private ArmGainsLoader() {}

  public record Loaded(Slot0Configs slot0, MotionMagicConfigs motionMagic) {}

  private static final Alert missingFields = new Alert("", AlertType.kWarning);
  private static final Alert badFile = new Alert("", AlertType.kError);

  public static Loaded load() {
    Loaded fallback = new Loaded(ArmGains.slot0(), ArmGains.motionMagic());
    File file = new File(Filesystem.getDeployDirectory(), "arm-gains.json");
    if (!file.exists()) return fallback;

    try {
      JsonNode root = new ObjectMapper().readTree(file);
      if (root.path("schemaVersion").asInt(-1) != 1) return reject("schemaVersion 不是 1", fallback);
      if (!"arm".equals(root.path("mechanism").asText())) return reject("不是手臂的設定檔", fallback);
      if (!"phoenix6-rotations".equals(root.path("units").asText())) return reject("單位不是 phoenix6-rotations", fallback);
      double ratio = root.path("gearRatio").asDouble(Double.NaN);
      if (Double.isNaN(ratio) || Math.abs(ratio - ArmGains.GEAR_RATIO) > 1e-6) {
        return reject("齒比 " + ratio + " 跟程式碼的 " + ArmGains.GEAR_RATIO + " 不同（機構改了？重新產生 Java）", fallback);
      }
      boolean cancoder = "cancoder".equals(root.path("encoder").asText());
      if (cancoder != ArmGains.USE_CANCODER) return reject("角度感測器跟程式碼不同（重新產生 Java）", fallback);
      if (cancoder) {
        double ccRatio = root.path("cancoderToArmRatio").asDouble(Double.NaN);
        if (Double.isNaN(ccRatio) || Math.abs(ccRatio - ArmGains.CANCODER_TO_ARM_RATIO) > 1e-6) {
          return reject("CANcoder 比例 " + ccRatio + " 跟程式碼的 " + ArmGains.CANCODER_TO_ARM_RATIO + " 不同（重新產生 Java）", fallback);
        }
      }

      List<String> missing = new ArrayList<>();
      Slot0Configs s0 = ArmGains.slot0();
      JsonNode j0 = root.path("slot0");
      read(j0, "kS", v -> s0.kS = v, "slot0", missing);
      read(j0, "kG", v -> s0.kG = v, "slot0", missing);
      read(j0, "kV", v -> s0.kV = v, "slot0", missing);
      read(j0, "kA", v -> s0.kA = v, "slot0", missing);
      read(j0, "kP", v -> s0.kP = v, "slot0", missing);
      read(j0, "kI", v -> s0.kI = v, "slot0", missing);
      read(j0, "kD", v -> s0.kD = v, "slot0", missing);

      MotionMagicConfigs mm = ArmGains.motionMagic();
      JsonNode jm = root.path("motionMagic");
      read(jm, "cruiseVelocity", v -> mm.MotionMagicCruiseVelocity = v, "motionMagic", missing);
      read(jm, "acceleration", v -> mm.MotionMagicAcceleration = v, "motionMagic", missing);

      if (!missing.isEmpty()) {
        missingFields.setText("arm-gains.json 缺少 " + String.join("、", missing) + "，這些欄位用程式碼裡的預設值");
        missingFields.set(true);
      }
      return new Loaded(s0, mm);
    } catch (Exception e) {
      return reject("讀取失敗（" + e.getMessage() + "）", fallback);
    }
  }

  private static Loaded reject(String why, Loaded fallback) {
    badFile.setText("arm-gains.json " + why + "，忽略整個檔案，使用程式碼裡的參數");
    badFile.set(true);
    return fallback;
  }

  private static void read(JsonNode node, String key, DoubleConsumer set, String group, List<String> missing) {
    JsonNode v = node.get(key);
    if (v == null || !v.isNumber() || !Double.isFinite(v.asDouble())) {
      missing.add(group + "." + key);
      return;
    }
    set.accept(v.asDouble());
  }
}

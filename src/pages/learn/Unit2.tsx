import { useStore } from '../../app/store'
import { QuizSet, type QuizDef } from '../../components/Quiz'
import { SIGNAL_LOGGER_SNIPPET, SYSID_BINDINGS_SNIPPET, SYSID_ROUTINE_SNIPPET } from './snippets'
import { SysIdCompare } from './SysIdCompare'
import { Workflow } from '../../components/Workflow'
import { t } from '../../core/lang'

/** 4F 單元二：用 SysId 量測參數（選用）。 */

const QUIZZES: QuizDef[] = [
  {
    question: t('準靜態測試為什麼可以量 kS、kG、kV，卻量不到 kA？', 'Why can the quasistatic test measure kS, kG and kV but not kA?'),
    options: [t('因為電壓太小', 'Because the voltage is too small'), t('因為電壓加得很慢，加速度幾乎是 0，kA·a 那一項不見了', 'Because the voltage ramps very slowly, acceleration is almost 0, so the kA·a term disappears'), t('因為準靜態只記錄位置', 'Because quasistatic only records position')],
    answer: 1,
    explain: t('電壓 = kS·sgn(v) + kG + kV·v + kA·a。準靜態時 a ≈ 0，剩下的三項用速度就能拆開；kA 要靠動態測試的「加速過程」。', 'Voltage = kS·sgn(v) + kG + kV·v + kA·a. In quasistatic a ≈ 0, so the other three terms can be separated using velocity; kA needs the “accelerating” part of the dynamic test.'),
    hints: [t('先寫出電壓等於哪幾項相加。', 'First write out which terms add up to the voltage.'), t('「準靜態」代表電壓每秒只加 0.5 V，速度變化很慢。', '“Quasistatic” means the voltage only rises 0.5 V per second, so velocity changes very slowly.'), t('速度變化很慢 → 加速度 ≈ 0 → 哪一項消失？', 'Velocity changes very slowly → acceleration ≈ 0 → which term disappears?')],
  },
  {
    question: t('SysId 量到的 kV 比理論值大 30%，kG 小了大約 23%，kA 差不多。最可能是什麼？', 'SysId measures kV 30% above theory, kG about 23% below, and kA about the same. What’s most likely?'),
    options: [t('質量填錯', 'Wrong mass'), t('齒比或鼓輪半徑填錯', 'Wrong gear ratio or drum radius'), t('摩擦太大', 'Too much friction')],
    answer: 1,
    explain: t('kV ∝ G/r、kG ∝ r/G：齒比或半徑錯了，kV 和 kG 會反方向偏、而且乘起來剛好抵消（1.3 × 0.77 ≈ 1）。質量錯的話 kV 不會變。', 'kV ∝ G/r and kG ∝ r/G: with a wrong gear ratio or radius, kV and kG are off in opposite directions and multiply out to about 1 (1.3 × 0.77 ≈ 1). A wrong mass wouldn’t change kV.'),
    hints: [t('回想 1F 的公式：kG = m·g·r/G…、kV = G/(r·Kv)。', 'Recall the 1F formulas: kG = m·g·r/G…, kV = G/(r·Kv).'), t('哪個機構資料同時出現在 kG 和 kV，而且一個在分子一個在分母？', 'Which mechanism data appears in both kG and kV, in the numerator of one and the denominator of the other?'), t('齒比 G 和半徑 r。', 'Gear ratio G and radius r.')],
  },
  {
    question: t('跑「動態往上」時，電梯衝得很快，眼看要撞到頂。你應該？', 'During “dynamic up”, the elevator is moving fast and about to hit the top. What should you do?'),
    options: [t('等測試自己結束', 'Wait for the test to end on its own'), t('馬上放開按鈕（或按 Disable），這段資料少一點沒關係', 'Let go of the button right away (or press Disable); a bit less data is fine'), t('按「動態往下」把它拉回來', 'Press “dynamic down” to pull it back')],
    answer: 1,
    explain: t('綁 whileTrue 就是為了放開即停；Driver Station 的 Disable 是最後保險。撞到限位的資料本來就不能用，寧可短一點。', 'Binding to whileTrue is exactly so letting go stops it; Driver Station Disable is the last line of defense. Data that hit a limit is unusable anyway, so shorter is better.'),
    hints: [t('安全永遠比資料完整重要。', 'Safety always beats complete data.'), t('範例程式把 SysId 指令綁在 whileTrue。', 'The example code binds the SysId commands with whileTrue.'), t('放開按鈕會怎樣？', 'What happens when you let go of the button?')],
  },
]

export function Unit2() {
  const { lessonsDone, markLesson } = useStore()
  return (
    <div className="body">
      {t(
        <>
        <div className="goal lgoal">學習目標：知道 SysId 四個測試在量什麼、在程式裡加上 SysIdRoutine、安全地跑完測試，並把結果跟理論值比，找出機構資料哪裡填錯。</div>
        <p className="small">
          SysId 是<b>系統鑑別（System Identification）</b>：用真的機器錄下電壓和運動，反推出這台電梯實際的 kS、kG、kV、kA。
          理論值只是初始值，不能取代鑑別；鑑別出來的機構參數再拿去做閉迴路調參，最後上機驗證。
        </p>
        <Workflow active={2} />
        <p className="small">
          電梯行程短，動態測試很容易撞到上下限，要照第 4 步的安全設定跑。行程實在太短跑不了 SysId 時，2F 的日誌（靜止保持段量 kG、往上往下量 kS、等速段量 kV）也是一種鑑別，
          只是比較粗。量到的跟理論差很多，通常是質量、齒比或半徑填錯（第 7 步）。
        </p>
  
        <h3>1. SysId 在做什麼</h3>
        <div className="formula">電壓 = kS·sgn(v) + kG + kV·v + kA·a</div>
        <table className="tbl">
          <thead>
            <tr>
              <th>測試</th>
              <th>怎麼給電壓</th>
              <th>量什麼</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>準靜態（Quasistatic）往上 / 往下</td>
              <td>從 0 慢慢加（範例 0.5 V/s）</td>
              <td>加速度 ≈ 0，拆出 kS、kG、kV：往上往下的差是 2·kS，平均是 kG，斜率是 kV</td>
            </tr>
            <tr>
              <td>動態（Dynamic）往上 / 往下</td>
              <td>一次給固定電壓（範例 3 V）</td>
              <td>從靜止加速的過程量 kA</td>
            </tr>
          </tbody>
        </table>
        <p className="small">
          量到的值跟理論不一樣很正常：理論沒算摩擦（kS 只能靠量）、齒輪箱效率、線材和螺絲的重量、拖鏈在不同高度的重量變化。差太多才要回頭檢查。
          每個參數是「模型」「模型給起點再鑑別」「一定要量」「閉迴路調參」還是「自己設的限制」，整理在 1F 最下面的對照表。
        </p>
  
        <h3>2. 在程式裡加入 SysIdRoutine</h3>
        <p className="small">
          範例程式的 <code>Elevator.java</code> 已經寫好四個測試指令。步階電壓和 ramp 都比 WPILib 預設小很多，接近行程兩端會自動停；
          SysId 期間跳過「跟隨誤差過大」的保護（開迴路沒有軌跡可以比），失速保護照常。
        </p>
        <pre className="code">{SYSID_ROUTINE_SNIPPET}</pre>
        <p className="small">按鍵綁定用 <code>whileTrue</code>：按住才跑，放開就停。只放在測試用的分支，比賽程式拿掉。</p>
        <pre className="code">{SYSID_BINDINGS_SNIPPET}</pre>
  
        <h3>3. 記錄方式</h3>
        <ul className="small ul">
          <li>
            <b>AdvantageKit（範例的做法）</b>：測試狀態記在 <code>/Elevator/SysIdState</code>，位置、速度、電壓就是單元一的欄位。單位是公尺，50 Hz。電梯的 kS、kG、kV 夠用。
          </li>
          <li>
            <b>Phoenix 6 SignalLogger</b>：TalonFX 訊號直接高頻記錄，kA 比較準。記下來的是 .hoot 檔，要用 Tuner X 轉成 .wpilog；位置單位是「轉」，比較時要選對單位。
          </li>
        </ul>
        <pre className="code">{SIGNAL_LOGGER_SNIPPET}</pre>
  
        <h3>4. 安全設定</h3>
        <ul className="small ul">
          <li>先做完單元零。一個人專門顧 Disable（Enter）和急停（空白鍵）。</li>
          <li>步階電壓 3 V 以下、ramp 0.5 V/s、每個測試 5 秒 timeout。電梯很輕的話，動態測試電壓再降到 2 V。</li>
          <li>軟體上下限保持開啟（Phoenix 6 的 soft limit 對 VoltageOut 一樣有效）；<code>SYSID_MIN_METERS</code>、<code>SYSID_MAX_METERS</code> 要留煞車距離。</li>
          <li>撞到限位、或被保護停下來的那一段資料不要用。</li>
        </ul>
  
        <h3>5. 執行測試</h3>
        <ol className="small ul">
          <li>電池充飽（12.5 V 以上）。整組測試盡量用同一顆電池。</li>
          <li>把電梯移到靠近底部 → 按住「準靜態往上」，快到頂或 5 秒到了就放開。</li>
          <li>把電梯移到靠近頂部 → 按住「準靜態往下」。</li>
          <li>回到底部 → 「動態往上」；到頂部 → 「動態往下」。動態很快，眼睛盯著電梯，隨時放開。</li>
          <li>每個測試之間 Disable 一下，確認電梯停住、沒有人靠近再繼續。</li>
          <li>四個都跑完再拿日誌；任何一個不順，重跑那一個就好。</li>
        </ol>
  
        <h3>6. 分析結果</h3>
        <ol className="small ul">
          <li>打開 WPILib 的 SysId 工具，Load 日誌檔（.wpilog）。</li>
          <li>選測試狀態欄位 <code>/Elevator/SysIdState</code>，位置選 <code>/Elevator/PositionMeters</code>、速度選 <code>VelocityMetersPerSec</code>、電壓選 <code>AppliedVolts</code>，單位選 Meters。</li>
          <li>機構類型選 <b>Elevator</b>（才會把 kG 分出來），按 Load。</li>
          <li>看擬合圖：資料點要貼著線。準靜態圖頭尾有一段翹起來，通常是撞到限位或剛起步，可以用 Test Duration 裁掉。</li>
          <li>讀出 kS、kG、kV、kA（右邊 Feedforward），填到下面跟理論值比。回授（kP、kD）的建議電梯先不用，網站的調參建議比較準。</li>
        </ol>
  
        <h3>7. 跟理論值比</h3>
        <p className="small">
          填進 SysId 的結果，網站會跟 1F 的理論值並排，並從「哪幾個一起偏、往哪邊偏」推測是哪個機構資料填錯。修好 1F 的資料之後理論值會跟著變，再比一次。
        </p>
        <SysIdCompare />
  
        <h3>8. 為什麼會跟理論值不一樣</h3>
        <ul className="small ul">
          <li><b>質量估計</b>：CAD 或目測的質量常常少算螺絲、線材、護板、遊戲物件 → kG、kA 偏大。</li>
          <li><b>摩擦</b>：理論沒算，量到的 kS 跟滑軌、鏈條鬆緊有關；摩擦不對稱會讓 kG 也偏一點。</li>
          <li><b>齒輪箱效率</b>：理論假設 100%，實際 80–95%，kG 會比理論大。</li>
          <li><b>電池電壓</b>：測試時電池低，壓降讓同樣的指令給不到那麼多電壓，量到的 kV、kG 偏大。錄之前電池 12.5 V 以上。</li>
          <li><b>座標</b>：SysId 用的位置欄位如果是最上層高度，kV、kA 會差一個速度比（單元三第 1 點）。</li>
        </ul>
  
        <h3>9. 回模擬驗證</h3>
        <ol className="small ul">
          <li>上面的比較工具按「用 SysId 前饋到 3F 模擬」：拿 SysId 的 kS、kG、kV、kA 當自訂參數。</li>
          <li>另外錄一段一般的閉迴路日誌（單元一的 tuningRoutine），在 2F 匯入。</li>
          <li>到 3F 下面的「模型校正」用這份日誌校正，存成「已校正模型」。校正出來的倍率跟 SysId 和理論的比例應該差不多。</li>
          <li>用已校正模型跑 SysId 參數：指標都綠了再上機。模擬還是近似模型，上機後照 2F 的建議微調。</li>
        </ol>
  
        </>,
        <>
          <div className="goal lgoal">Goal: know what SysId’s four tests measure, add a SysIdRoutine to the code, run the tests safely, and compare the results with theory to find which mechanism data was entered wrong.</div>
          <p className="small">
          SysId is <b>system identification</b>: record voltage and motion on the real robot and work back to this elevator’s actual kS, kG, kV and kA.{' '}
          Theory values are only a starting point and can’t replace identification; take the identified mechanism parameters into closed-loop tuning, then verify on the robot.
          </p>
          <Workflow active={2} />
          <p className="small">
          An elevator’s travel is short, so dynamic tests easily hit the limits; run with the safety settings in step 4. If the travel is really too short for SysId, 2F logs (kG from holding, kS from up vs. down, kV from constant velocity) are also a form of identification,{' '}
          just rougher. If the measured values differ a lot from theory, usually the mass, gear ratio or radius was entered wrong (step 7).
          </p>

          <h3>1. What SysId does</h3>
          <div className="formula">voltage = kS·sgn(v) + kG + kV·v + kA·a</div>
          <table className="tbl">
          <thead>
          <tr>
          <th>Test</th>
          <th>How voltage is applied</th>
          <th>What it measures</th>
          </tr>
          </thead>
          <tbody>
          <tr>
          <td>Quasistatic up / down</td>
          <td>Ramp slowly from 0 (0.5 V/s in the example)</td>
          <td>Acceleration ≈ 0, separating kS, kG, kV: the up/down difference is 2·kS, the average is kG, the slope is kV</td>
          </tr>
          <tr>
          <td>Dynamic up / down</td>
          <td>A fixed voltage all at once (3 V in the example)</td>
          <td>kA from accelerating from rest</td>
          </tr>
          </tbody>
          </table>
          <p className="small">
          Measured values differing from theory is normal: theory leaves out friction (kS can only be measured), gearbox efficiency, the weight of wiring and screws, and how the drag chain’s weight changes with height. Only go back and check when it’s off by a lot.{' '}
          Whether each gain is “model”, “model start then identify”, “must measure”, “closed-loop tuning” or “a limit you set” is summarized in the table at the bottom of 1F.
          </p>

          <h3>2. Add a SysIdRoutine to the code</h3>
          <p className="small">
          The example code’s <code>Elevator.java</code> already has the four test commands. The step voltage and ramp are much smaller than WPILib’s defaults, and it stops automatically near either end of travel;{' '}
          during SysId the “excessive following error” protection is skipped (open loop has no profile to compare against), while stall protection stays on.
          </p>
          <pre className="code">{SYSID_ROUTINE_SNIPPET}</pre>
          <p className="small">Bind the buttons with <code>whileTrue</code>: it only runs while held and stops when released. Put it only in a test branch and remove it from competition code.</p>
          <pre className="code">{SYSID_BINDINGS_SNIPPET}</pre>

          <h3>3. How to log</h3>
          <ul className="small ul">
          <li>
          <b>AdvantageKit (the example’s approach)</b>: the test state is logged at <code>/Elevator/SysIdState</code>, and position, velocity and voltage are the unit 1 fields. Units are meters at 50 Hz. Good enough for an elevator’s kS, kG and kV.
          </li>
          <li>
          <b>Phoenix 6 SignalLogger</b>: logs TalonFX signals directly at high rate, so kA is more accurate. It writes .hoot files that Tuner X converts to .wpilog; position is in rotations, so pick the right units when comparing.
          </li>
          </ul>
          <pre className="code">{SIGNAL_LOGGER_SNIPPET}</pre>

          <h3>4. Safety settings</h3>
          <ul className="small ul">
          <li>Finish unit 0 first. One person does nothing but watch Disable (Enter) and E-stop (space bar).</li>
          <li>Step voltage 3 V or less, ramp 0.5 V/s, 5 s timeout per test. For a very light elevator, lower the dynamic test voltage to 2 V.</li>
          <li>Keep the soft limits on (Phoenix 6 soft limits work with VoltageOut too); leave braking distance in <code>SYSID_MIN_METERS</code> and <code>SYSID_MAX_METERS</code>.</li>
          <li>Don’t use data from sections that hit a limit or were stopped by a protection.</li>
          </ul>

          <h3>5. Run the tests</h3>
          <ol className="small ul">
          <li>Fully charged battery (12.5 V or more). Use the same battery for the whole set if you can.</li>
          <li>Move the elevator near the bottom → hold “quasistatic up”, and let go when it’s near the top or 5 s is up.</li>
          <li>Move the elevator near the top → hold “quasistatic down”.</li>
          <li>Back at the bottom → “dynamic up”; at the top → “dynamic down”. Dynamic is fast: keep your eyes on the elevator and be ready to let go.</li>
          <li>Disable between tests and make sure the elevator has stopped and nobody is near before continuing.</li>
          <li>Get the log after all four; if one didn’t go smoothly, just rerun that one.</li>
          </ol>

          <h3>6. Analyze the results</h3>
          <ol className="small ul">
          <li>Open the WPILib SysId tool and Load the log file (.wpilog).</li>
          <li>Pick the test state field <code>/Elevator/SysIdState</code>, position <code>/Elevator/PositionMeters</code>, velocity <code>VelocityMetersPerSec</code>, voltage <code>AppliedVolts</code>, and units Meters.</li>
          <li>Choose mechanism type <b>Elevator</b> (so kG is separated out) and press Load.</li>
          <li>Look at the fit plots: the data points should hug the line. If the quasistatic plot curls up at the start or end, it usually hit a limit or was just starting; trim it with Test Duration.</li>
          <li>Read kS, kG, kV and kA (Feedforward on the right) and enter them below to compare with theory. Skip SysId’s feedback (kP, kD) suggestions for an elevator; the site’s tuning advice is more accurate.</li>
          </ol>

          <h3>7. Compare with theory</h3>
          <p className="small">
          Enter the SysId results and the site lines them up next to the 1F theory values, inferring from “which ones are off together, and in which direction” which mechanism data was entered wrong. After fixing the 1F data the theory values update; compare again.
          </p>
          <SysIdCompare />

          <h3>8. Why it differs from theory</h3>
          <ul className="small ul">
          <li><b>Mass estimates</b>: CAD or eyeballed masses often miss screws, wiring, panels and game pieces → kG and kA come out high.</li>
          <li><b>Friction</b>: not in the theory; the measured kS depends on the slides and chain tension, and asymmetric friction also shifts kG a little.</li>
          <li><b>Gearbox efficiency</b>: theory assumes 100%, reality is 80–95%, so kG is larger than theory.</li>
          <li><b>Battery voltage</b>: with a low battery during the test, sag means the same command delivers less voltage, so kV and kG measure high. Record above 12.5 V.</li>
          <li><b>Coordinates</b>: if SysId’s position field is the top stage height, kV and kA differ by a speed ratio (unit 3, point 1).</li>
          </ul>

          <h3>9. Verify back in the sim</h3>
          <ol className="small ul">
          <li>In the comparison tool above, press “Use SysId feedforward in the 3F sim” to make the SysId kS, kG, kV and kA your custom gains.</li>
          <li>Record a separate ordinary closed-loop log (unit 1’s tuningRoutine) and import it in 2F.</li>
          <li>Use it in “Model calibration” at the bottom of 3F and save as “Calibrated model”. The calibrated ratios should roughly match the ratio between SysId and theory.</li>
          <li>Run the SysId gains on the calibrated model: go to the robot only when all metrics are green. The sim is still an approximation; fine-tune on the robot following 2F’s advice.</li>
          </ol>

          </>,
      )}
      <h3>{t('檢核', 'Check')}</h3>
      <QuizSet quizzes={QUIZZES} done={lessonsDone['unit2']} onDone={() => markLesson('unit2')} />
    </div>
  )
}

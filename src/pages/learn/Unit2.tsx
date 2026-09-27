import { useStore } from '../../app/store'
import { QuizSet, type QuizDef } from '../../components/Quiz'
import { SIGNAL_LOGGER_SNIPPET, SYSID_BINDINGS_SNIPPET, SYSID_ROUTINE_SNIPPET } from './snippets'
import { SysIdCompare } from './SysIdCompare'

/** 4F 單元二：用 SysId 量測參數（選用）。 */

const QUIZZES: QuizDef[] = [
  {
    question: '準靜態測試為什麼可以量 kS、kG、kV，卻量不到 kA？',
    options: ['因為電壓太小', '因為電壓加得很慢，加速度幾乎是 0，kA·a 那一項不見了', '因為準靜態只記錄位置'],
    answer: 1,
    explain: '電壓 = kS·sgn(v) + kG + kV·v + kA·a。準靜態時 a ≈ 0，剩下的三項用速度就能拆開；kA 要靠動態測試的「加速過程」。',
    hints: ['先寫出電壓等於哪幾項相加。', '「準靜態」代表電壓每秒只加 0.5 V，速度變化很慢。', '速度變化很慢 → 加速度 ≈ 0 → 哪一項消失？'],
  },
  {
    question: 'SysId 量到的 kV 比理論值大 30%，kG 小了大約 23%，kA 差不多。最可能是什麼？',
    options: ['質量填錯', '齒比或鼓輪半徑填錯', '摩擦太大'],
    answer: 1,
    explain: 'kV ∝ G/r、kG ∝ r/G：齒比或半徑錯了，kV 和 kG 會反方向偏、而且乘起來剛好抵消（1.3 × 0.77 ≈ 1）。質量錯的話 kV 不會變。',
    hints: ['回想 1F 的公式：kG = m·g·r/G…、kV = G/(r·Kv)。', '哪個機構資料同時出現在 kG 和 kV，而且一個在分子一個在分母？', '齒比 G 和半徑 r。'],
  },
  {
    question: '跑「動態往上」時，電梯衝得很快，眼看要撞到頂。你應該？',
    options: ['等測試自己結束', '馬上放開按鈕（或按 Disable），這段資料少一點沒關係', '按「動態往下」把它拉回來'],
    answer: 1,
    explain: '綁 whileTrue 就是為了放開即停；Driver Station 的 Disable 是最後保險。撞到限位的資料本來就不能用，寧可短一點。',
    hints: ['安全永遠比資料完整重要。', '範例程式把 SysId 指令綁在 whileTrue。', '放開按鈕會怎樣？'],
  },
]

export function Unit2() {
  const { lessonsDone, markLesson } = useStore()
  return (
    <div className="body">
      <div className="goal lgoal">學習目標：知道 SysId 四個測試在量什麼、在程式裡加上 SysIdRoutine、安全地跑完測試，並把結果跟理論值比，找出機構資料哪裡填錯。</div>
      <p className="small">
        電梯行程短，動態測試很容易撞到上下限，所以 SysId 是<b>選用</b>。多數時候「理論值 + 上機錄日誌 + 調參建議」就夠了。
        SysId 最有用的地方是<b>檢查 1F 的機構資料</b>：量到的跟理論差很多，通常是質量、齒比或半徑填錯。
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
        每個參數是「算得準」「算個起點要量來修正」「一定要量」還是「自己決定」，整理在 1F 最下面的對照表。
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

      <h3>檢核</h3>
      <QuizSet quizzes={QUIZZES} done={lessonsDone['unit2']} onDone={() => markLesson('unit2')} />
    </div>
  )
}

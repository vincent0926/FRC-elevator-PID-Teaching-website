import { useStore } from '../../app/store'
import { QuizSet, type QuizDef } from '../../components/Quiz'
import { SAMPLE_KEYS } from '../../core/log/sampleLog'
import { FREQUENCY_SNIPPET, INPUTS_SNIPPET, ROUTINE_SNIPPET, TUNABLE_SNIPPET, UPDATE_INPUTS_SNIPPET } from './snippets'

/** 4F 單元一：用 AdvantageKit 錄日誌。 */

const LOG_FIELDS: [string, string, string, string][] = [
  [SAMPLE_KEYS.position, '位置（m，鼓輪線位移）', 'getPosition() × 每圈公尺數', '必要'],
  [SAMPLE_KEYS.velocity, '速度（m/s）', 'getVelocity() × 每圈公尺數', '必要'],
  [SAMPLE_KEYS.reference, 'Motion Magic 目前的參考位置（不是最終目標）', 'getClosedLoopReference()', '必要'],
  [SAMPLE_KEYS.referenceSlope, '參考速度；參考加速度由網站微分（軌跡沒有雜訊）', 'getClosedLoopReferenceSlope()', '建議'],
  [SAMPLE_KEYS.appliedVolts, '輸出電壓', 'getMotorVoltage()', '必要'],
  [SAMPLE_KEYS.statorCurrent, 'Stator 電流（看有沒有頂到電流限制）', 'getStatorCurrent()', '建議'],
  [SAMPLE_KEYS.closedLoopOutput, '回授輸出 P + I + D', 'ClosedLoopProportional + Integrated + DerivativeOutput', '最重要'],
  [SAMPLE_KEYS.feedforwardOutput, '前饋輸出', 'getClosedLoopOutput() − 回授', '建議'],
  [SAMPLE_KEYS.supplyVoltage, 'TalonFX 供電電壓', 'getSupplyVoltage()', '選用'],
  [SAMPLE_KEYS.battery, '電池電壓', 'AdvantageKit 自動記錄', '自動'],
  [SAMPLE_KEYS.enabled, '是否 Enable', 'AdvantageKit 自動記錄', '自動'],
]

const MISTAKES: [string, string, string][] = [
  ['欄位是空的', '忘了 Logger.processInputs()，或 updateInputs() 沒填那個欄位', '在 AdvantageScope 左邊欄位樹找 /Elevator，點開看有沒有數字'],
  ['位置只有零點幾', '記的是「轉」不是公尺（忘了乘每圈公尺數）', '用捲尺量一次，跟日誌比；網站欄位對應也可以設倍率'],
  ['往上時位置變小', '馬達方向或 encoder 方向反了', '回單元零第 2 步，改 Inverted'],
  ['一段資料突然平掉', '撞到軟體上下限或機械硬擋', '測試高度留在行程 5%–95% 之間'],
  ['kG、kV 估得偏大', '電池沒電，電壓掉下去', '錄之前電池 12.5 V 以上，網站步驟 0 會檢查'],
  ['看不出是哪個參數的影響', '一次改了兩個參數', '一次只改一個，日誌檔名寫改了什麼'],
  ['回授輸出一直是 0', '記到的是 Slot 1 或用了 VoltageOut 開迴路', '確認測試時是 MotionMagicVoltage 閉迴路'],
]

const QUIZZES: QuizDef[] = [
  {
    question: '你只錄了電梯一路往上移動的資料，沒有往下、也沒有停住。調參建議會？',
    options: ['可以正常分析所有參數', '分不開 kS 和 kG，要補錄往下和停住的資料', '只要資料夠長就沒問題'],
    answer: 1,
    explain: '往上時 kS 和 kG 同號、加在一起，要有往下（kS 反號）和停住（只剩 kG）才分得開。',
    hints: ['往上時摩擦力和重力都朝下。', '往下時摩擦力方向會反過來，重力不會。', '要有不同方向的資料才能把兩個加在一起的量拆開。'],
  },
  {
    question: '日誌裡少了哪個欄位，調參建議就完全沒辦法判斷前饋準不準？',
    options: ['Stator 電流', '回授輸出（閉迴路 P + I + D）', '電池電壓'],
    answer: 1,
    explain: '前饋準的時候回授輸出接近 0；回授一直偏同一邊，就代表前饋少補了什麼。少了它就只能猜。',
    hints: ['前饋準不準，要看「PID 有沒有在硬撐」。', '哪個欄位記的是 PID 自己出了多少力？', 'P + I + D 的總和。'],
  },
  {
    question: '你用 LoggedTunableNumber 在 AdvantageScope 把 kG 從 0.45 改成 0.52，電梯停得很準。接下來要做什麼？',
    options: ['不用做什麼，下次開機還是 0.52', '回網站把 kG 改成 0.52，重新產生 ElevatorGains.java 並 commit', '把 TUNING_MODE 關掉就會存起來'],
    answer: 1,
    explain: 'Dashboard 上改的只在這次開機有效。程式碼才是參數的最終依據，要回網站產生檔案並 commit。',
    hints: ['重開機之後 LoggedTunableNumber 的預設值從哪裡來？', '預設值是開機時載入的 ElevatorGains 或 JSON。', '要讓新數字留下來，就要改那個檔案。'],
  },
]

export function Unit1() {
  const { lessonsDone, markLesson, go } = useStore()
  return (
    <div className="body">
      <div className="goal lgoal">學習目標：知道調參要記錄哪些欄位、每個欄位從 TalonFX 哪裡來，能錄一段「有用」的測試、先在 AdvantageScope 檢查，再匯入網站。</div>

      <h3>1. 為什麼要錄日誌</h3>
      <p className="small">
        電梯一次移動不到一秒，眼睛和即時圖表都跟不上。日誌把每一筆位置、電壓、回授輸出都存下來，事後可以放慢、放大、跟上一次比。
        調參建議要看「整段移動」：停住時回授偏哪邊（kG）、往上往下差多少（kS）、等速段落後多少（kV），這些只有日誌看得到。
        網站不連機器人，實機資料一律用匯入日誌的方式。
      </p>

      <h3>2. 要記錄的欄位</h3>
      <p className="small">
        照隊上的 IO 架構：硬體讀值寫進 <code>ElevatorIOInputs</code>，再由 <code>Logger.processInputs</code> 記進日誌。範例程式
        （<code>robot-example/</code>）已經全部記了；自己寫的話名稱不同沒關係，匯入時可以手動對應。
      </p>
      <pre className="code">{INPUTS_SNIPPET}</pre>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>日誌欄位</th>
              <th>內容</th>
              <th>Phoenix 6 StatusSignal</th>
              <th>必要性</th>
            </tr>
          </thead>
          <tbody>
            {LOG_FIELDS.map(([k, d, sig, r]) => (
              <tr key={k}>
                <td>
                  <code>{k}</code>
                </td>
                <td>{d}</td>
                <td className="small">
                  <code>{sig}</code>
                </td>
                <td>{r}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small">
        單位換算只做一次：TalonFX 給的是「轉」，在 <code>updateInputs()</code> 乘上 <code>METERS_PER_ROTATION</code> 變公尺。
        最重要的是回授輸出：前饋準的時候它接近 0，偏哪一邊就知道前饋少補了什麼。
      </p>
      <pre className="code">{UPDATE_INPUTS_SNIPPET}</pre>

      <h3>3. 記錄頻率</h3>
      <ul className="small ul">
        <li>AdvantageKit 跟著機器人主迴圈，預設 50 Hz（每 20 ms 一筆）。看 kG、kS、kV 夠用。</li>
        <li>加速段通常只有 0.1–0.2 秒，50 Hz 只有 5–10 筆，估 kA 會不準（網站會把 kA 的信心降低）。</li>
        <li>
          要看清楚加速段：用 Phoenix 6 的 <code>SignalLogger</code>（TalonFX 訊號直接記在 roboRIO，頻率可以到 1 kHz，再用 Tuner X 轉成 .wpilog），
          或 AdvantageKit 的高頻執行緒（跟 swerve 里程計同一招）。
        </li>
        <li>StatusSignal 的更新頻率至少要跟記錄頻率一樣，不然會記到重複的舊值：</li>
      </ul>
      <pre className="code">{FREQUENCY_SNIPPET}</pre>

      <h3>4. LoggedTunableNumber：不用重新部署就能改參數</h3>
      <p className="small">
        每改一次 kG 就重新部署要一分鐘。<code>LoggedTunableNumber</code> 把數字放在 NetworkTables 的 <code>/Tuning/Elevator/kP</code> 這類位置，
        在 AdvantageScope 或 Elastic 裡改，範例程式偵測到數值變了會馬上重新套用 Slot 0。改動也會記進日誌，事後看得到哪一段用哪個值。
      </p>
      <pre className="code">{TUNABLE_SNIPPET}</pre>
      <ul className="small ul">
        <li>AdvantageScope：連上機器人（NetworkTables），在左邊欄位樹找到 <code>/Tuning/Elevator</code>，打開 Tuning 模式後直接改數字。</li>
        <li>Elastic：把 <code>/Tuning/Elevator/kG</code> 拖進版面，用可編輯的 Number 元件。</li>
        <li>單位是 Phoenix 6 轉數制（跟 1F 參數卡的灰字一樣），不是網站的 SI。</li>
        <li>
          <b>改的數字重開機就沒了。</b>調好之後回網站產生 <code>ElevatorGains.java</code> 並 commit，程式碼才是最終依據。比賽前把 <code>TUNING_MODE</code> 改成 false。
        </li>
      </ul>

      <h3>5. 錄一段有用的測試</h3>
      <ol className="small ul">
        <li>先做完單元零（Motion Magic 從 25% 開始）。</li>
        <li>在幾個高度之間來回：20% → 75% → 20% → 50% → 5% 的行程，每次到位後停 2 秒。範例程式的 <code>tuningRoutine()</code> 就是這個動作。</li>
        <li>往上、往下、停住都要有：kG、kS 要靠三種資料才分得開。</li>
        <li>一次測試只改一個參數，把改了什麼寫在日誌檔名或隊上的調參紀錄。</li>
        <li>電池 12.5 V 以上再錄；電池沒電時量到的 kG、kV 會偏大。</li>
      </ol>
      <pre className="code">{ROUTINE_SNIPPET}</pre>

      <h3>6. 取得日誌檔</h3>
      <ul className="small ul">
        <li>
          AdvantageKit 在實機上把 .wpilog 寫到 roboRIO 的 USB 隨身碟（<code>/U/logs</code>），沒插隨身碟時寫到 <code>/home/lvuser/logs</code>。
          建議插隨身碟，roboRIO 內部空間很小。
        </li>
        <li>AdvantageScope：File → Download Logs，連上機器人選檔案下載。也可以直接拔隨身碟。</li>
        <li>檔名是時間；下載後改成看得懂的名字，例如 <code>0927_kG0.52_第3次.wpilog</code>。</li>
      </ul>

      <h3>7. 先在 AdvantageScope 檢查</h3>
      <ol className="small ul">
        <li>打開日誌，把 <code>/Elevator/PositionMeters</code> 和 <code>ClosedLoopReferenceMeters</code> 拖進同一張 Line Graph：兩條線應該幾乎重疊。</li>
        <li>看數值範圍：位置應該在 0 到行程之間（公尺），不是零點幾的「轉」。</li>
        <li>看時間軸：Enable 的那段有連續資料，沒有好幾秒的空白（中斷通常是 CAN 或 roboRIO 過載）。</li>
        <li>把 <code>ClosedLoopOutputVolts</code> 也拉進來：停住時接近 0 表示 kG 準，一直偏正就是 kG 不夠。</li>
        <li>電池電壓整段都在 11 V 以上。</li>
      </ol>

      <h3>8. 匯入網站</h3>
      <p className="small">
        到 2F 調參建議選日誌檔。第一次要確認欄位對應（範例程式的名稱會自動認出來），設好會記在這台電腦，下次自動套用。
        接著選「測試時機器人上跑的是哪一組參數」，資料檢查全部沒有 ✕ 才能分析。沒有機器人也可以在 2F 產生範例日誌練習。
      </p>
      <button className="btn small" type="button" onClick={() => go('tune')}>
        到 2F 匯入日誌
      </button>

      <h3>9. 常見錯誤</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>看到的現象</th>
              <th>通常的原因</th>
              <th>怎麼確認、怎麼修</th>
            </tr>
          </thead>
          <tbody>
            {MISTAKES.map(([a, b, c]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>{b}</td>
                <td>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>檢核</h3>
      <QuizSet quizzes={QUIZZES} done={lessonsDone['unit1']} onDone={() => markLesson('unit1')} />
    </div>
  )
}

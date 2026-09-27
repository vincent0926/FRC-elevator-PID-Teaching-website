import { useState } from 'react'
import { useStore } from '../../app/store'
import { Quiz, type QuizDef } from '../../components/Quiz'
import { twoPointKsKg } from '../../core/twoPoint'
import { ArmMechanismSchema } from '../../schema/armParameterSet'
import { ArmUnit4 } from './ArmUnit4'
import { useArm } from './armStore'
import { UnsavedNote } from './UnsavedNote'

/**
 * 手臂 4F 實機資料教學：單元零（上機前準備，必修）、兩點法量 kS／kG、
 * 單元一錄日誌、單元二 SysId、單元三常見的坑、單元四期末檢核。
 * 網站本身不能當急停，急停一律用 Driver Station。
 */

const UNIT0: { title: string; items: string[] }[] = [
  {
    title: '開始前檢查',
    items: [
      '機器人架好，手臂轉一整圈掃過的範圍裡沒有人、沒有東西',
      '電池 12.5 V 以上',
      '一個人專門顧 Disable（Enter）和急停（空白鍵），不做其他事',
      '記住：Disable 或保護觸發後手臂會因為重力往下掉，Brake 只能讓它掉慢一點',
    ],
  },
  {
    title: '確認方向和零點',
    items: [
      '用 5% 以下電壓、0.5 秒以內的短脈衝，確認正電壓讓手臂往上抬、角度讀數變大',
      '把手臂擺水平（用水平儀），程式讀到的角度要是 0°；擺直立要是 90°',
      '差很多：內建編碼器檢查開機角度（BOOT_ANGLE_DEG）；CANcoder 檢查磁鐵偏移、方向和齒比',
    ],
  },
  {
    title: '設限制',
    items: ['軟體上下限設在硬擋內側（範例程式各內縮 3°）', 'Stator 電流限制', '跟隨誤差過大或失速時自動停止；用 CANcoder 時斷線也要停'],
  },
  {
    title: '第一次閉迴路測試',
    items: ['先轉到水平附近停住，看撐不撐得住', 'Motion Magic 速度與加速度從 25% 開始，每一階沒問題再加', '任何一階怪怪的就 Disable，先看日誌再繼續'],
  },
]
const UNIT0_COUNT = UNIT0.length

const f = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—')

const INPUTS_SNIPPET = `@AutoLog
class ArmIOInputs {
  public double positionRad;                        // 0 = 水平、往上為正
  public double velocityRadPerSec;
  public double closedLoopReferenceRad;             // Motion Magic 的參考角度
  public double closedLoopReferenceSlopeRadPerSec;
  public double appliedVolts;
  public double statorCurrentAmps;
  public double supplyVoltage;
  public double closedLoopOutputVolts;              // 回授 P + I + D
  public double closedLoopFeedForwardVolts;         // 前饋 kS + kG·cos θ + kV·ω + kA·α
}`

const ROUTINE_SNIPPET = `// 測試分支才綁：錄調參日誌用的動作（停在水平 → 抬高 → 回水平 → 中間 → 收起）
controller.x().onTrue(arm.tuningRoutine());
// SysId（單元二）
controller.povUp().whileTrue(arm.sysIdQuasistatic(SysIdRoutine.Direction.kForward));
controller.povDown().whileTrue(arm.sysIdQuasistatic(SysIdRoutine.Direction.kReverse));
controller.povRight().whileTrue(arm.sysIdDynamic(SysIdRoutine.Direction.kForward));
controller.povLeft().whileTrue(arm.sysIdDynamic(SysIdRoutine.Direction.kReverse));`

const QUIZ1: QuizDef = {
  question: '錄手臂的調參日誌，為什麼一定要有「停在水平附近」的片段？',
  options: ['水平時手臂最安全', '水平時 cos θ = 1，重力最大，kG 錯多少最看得出來', '水平時摩擦最小', 'SysId 規定要從水平開始'],
  answer: 1,
  explain: 'kG·cos θ 在水平時最大、直立時是 0。只在高角度停住的日誌，kG 就算錯很多，回授也只要補一點點，看不出來。',
  hints: ['重力項是 kG 乘上什麼？', 'cos θ 什麼時候最大？', '在 cos θ = 1 的地方，kG 的誤差全部都會出現在回授上。'],
}
const QUIZ2: QuizDef = {
  question: '用 SysId 量手臂，分析時的機構類型要選什麼？',
  options: ['Simple（沒有重力）', 'Elevator（重力是常數）', 'Arm（重力跟著 cos θ 變）', '都可以，結果一樣'],
  answer: 2,
  explain: '選 Arm，SysId 才會把重力項當成 kG·cos θ 去擬合。選 Elevator 會把不同角度的重力混成一個平均值，kG、kS 都會錯。',
  hints: ['手臂的重力力矩跟角度有沒有關係？', '哪個模型的重力項會隨位置變？', '跟 Phoenix 6 的 GravityType 一樣：Arm。'],
}
const QUIZ3: QuizDef = {
  question: '手臂停在 60° 時回授一直在往下壓，停在水平時卻差不多是 0。最可能的原因？',
  options: ['kG 太大', 'kS 太小', 'GravityType 設成 Elevator_Static（常數 kG）', 'kP 太大'],
  answer: 2,
  explain: '常數 kG 在水平時剛好（cos 0° = 1），60° 時真的重力只剩一半，常數 kG 就多補了一半，回授只好往下壓。kG 太大的話水平時也會偏。',
  hints: ['水平時沒事，代表 kG 的大小大概是對的。', '60° 時真正需要的是 kG × cos 60° = 0.5 kG。', '什麼設定會讓每個角度都補一樣多？'],
}
const QUIZ_UNIT3: QuizDef = {
  question: '用內建編碼器的手臂，某天開機時手臂不在下方硬擋、而是被人抬到 30°。會發生什麼事？',
  options: ['沒影響，編碼器會自己知道角度', '程式以為在下方硬擋，整個角度差 30° 以上：cos θ 算錯、軟體限位也錯位', '只有 kP 會變', '馬達會自動歸零'],
  answer: 1,
  explain: '內建編碼器只知道「開機後轉了多少」，開機位置被當成 BOOT_ANGLE_DEG。位置錯了，Arm_Cosine 的 cos θ、軟體限位、目標角度全部跟著錯。這是 CANcoder（絕對編碼器）最大的好處。',
  hints: ['內建編碼器是絕對還是相對的？', '開機時程式把位置設成多少？', '3F 情境「編碼器零點不在水平」就是這個。'],
}

export function ArmLearnPage() {
  const { lessonsDone, markLesson } = useStore()
  const { arm, setArm, ff, unit0, setUnit0 } = useArm()
  const done0 = UNIT0.filter((_, i) => unit0[i]).length
  const unlocked = done0 === UNIT0_COUNT
  const toUnit0 = () => document.getElementById('arm-unit0')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <section aria-labelledby="t-arm-learn">
      <div className="head">
        <div>
          <h1 id="t-arm-learn">手臂・實機資料教學</h1>
          <p className="lead">調參建議需要好的實機資料，而資料要安全地錄。內容隨時可以先讀；要讓手臂動起來之前，一定要先完成單元零。</p>
        </div>
      </div>
      <UnsavedNote />

      <div className="warn" style={{ marginTop: 0, marginBottom: 14 }}>
        <b>網站不能當急停。</b>急停一律用 Driver Station：Enter 是 Disable，空白鍵是 E-Stop。手臂斷電會往下掉，人不要站在它掃過的範圍。
      </div>

      <details className="unit" open id="arm-unit0">
        <summary>
          <h2 style={{ margin: 0 }}>單元零：上機前的準備</h2>
          <span className={'tag ' + (unlocked ? 'done' : 'must')}>
            必修，{done0} / {UNIT0_COUNT}
          </span>
        </summary>
        <div className="body">
          <p className="small muted">每次上機都要做一遍。每一項全部確認後才打勾。</p>
          <ul className="checklist">
            {UNIT0.map((u, i) => (
              <li key={u.title}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!unit0[i]}
                    onChange={(e) => {
                      const next = Array.from({ length: UNIT0_COUNT }, (_, k) => !!unit0[k])
                      next[i] = e.target.checked
                      setUnit0(next)
                    }}
                  />
                  <span>
                    <b>
                      {i + 1}．{u.title}
                    </b>
                    <ul>
                      {u.items.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {unlocked && (
            <div className="row" style={{ marginTop: 10 }}>
              <span className="ok" style={{ marginTop: 0 }}>
                單元零完成，可以照下面的單元上機操作。
              </span>
              <button className="btn small" type="button" onClick={() => setUnit0([])}>
                下次上機前清除勾選
              </button>
            </div>
          )}
        </div>
      </details>

      <details className="unit">
        <summary>
          <h2 style={{ margin: 0 }}>量 kS、kG（兩點法，在水平量）</h2>
          <span className="tag">{arm.measuredKs ? `已填 kS ${arm.measuredKs} V` : 'kS 一定要量'}</span>
        </summary>
        {!unlocked && <LockNote onGo={toUnit0} />}
        <ArmTwoPoint kGTheory={ff.kG} onSaveKs={(kS) => setArm(ArmMechanismSchema.parse({ ...arm, measuredKs: Math.round(kS * 1000) / 1000 }))} />
      </details>

      <details className="unit">
        <summary>
          <h2 style={{ margin: 0 }}>單元一：用 AdvantageKit 錄手臂日誌</h2>
          <span className={'tag' + (lessonsDone['arm-unit1'] ? ' done' : '')}>{lessonsDone['arm-unit1'] ? '已完成' : '可以先讀'}</span>
        </summary>
        {!unlocked && <LockNote onGo={toUnit0} />}
        <div className="body">
          <div className="goal lgoal">學習目標：知道手臂的日誌要記哪些欄位、用什麼單位，錄什麼動作才分得出 kG 和 kS。</div>
          <p>範例程式（1F「下載完整子系統」）的 ArmIO 已經照這個格式記錄，2F 匯入時會自動對應。角度一律是弧度、0 = 水平。</p>
          <pre className="code">{INPUTS_SNIPPET}</pre>
          <h3>要錄什麼動作</h3>
          <ul className="small">
            <li>
              <b>停在水平附近</b>：cos θ = 1，kG 的誤差最明顯。
            </li>
            <li>
              <b>往上、往下都要有</b>：摩擦擋住兩個方向，kS 和 kG 才分得開。
            </li>
            <li>
              <b>停在不同角度</b>（水平、抬高、中間）：才看得出偏差是不是跟著 cos θ 變，還是 GravityType 設錯。
            </li>
            <li>第一次先把 Motion Magic 降到 25%，確定沒問題再用正式速度錄。</li>
          </ul>
          <pre className="code">{ROUTINE_SNIPPET}</pre>
          <Quiz quiz={QUIZ1} done={lessonsDone['arm-unit1']} onCorrect={() => markLesson('arm-unit1')} />
        </div>
      </details>

      <details className="unit">
        <summary>
          <h2 style={{ margin: 0 }}>單元二：用 SysId 量手臂</h2>
          <span className={'tag' + (lessonsDone['arm-unit2'] ? ' done' : '')}>{lessonsDone['arm-unit2'] ? '已完成' : '選用'}</span>
        </summary>
        {!unlocked && <LockNote onGo={toUnit0} />}
        <div className="body">
          <div className="goal lgoal">學習目標：安全地跑手臂的 SysId，知道分析時要選 Arm、結果怎麼跟 1F 的理論值比。</div>
          <ol className="small">
            <li>範例程式的 SysId 電壓比電梯小（ramp 0.5 V/s、動態 2.5 V），接近角度範圍兩端（SYSID_MIN_DEG、SYSID_MAX_DEG）會自動停。</li>
            <li>四個測試（準靜態、動態 × 往上、往下）都綁在 whileTrue，放開按鈕就停；每個測試之間讓手臂回到收起的位置。</li>
            <li>
              日誌用 AdvantageScope 匯出給 SysId，或直接開 .wpilog：位置選 /Arm/PositionRad、速度選 /Arm/VelocityRadPerSec，單位選 radians。
            </li>
            <li>
              <b>分析類型選 Arm。</b>選 Elevator 或 Simple，重力會被當成常數，kG、kS 都會錯。
            </li>
            <li>SysId 的 kS、kG、kV、kA 單位是 V、V、V/(rad/s)、V/(rad/s²)，可以直接跟 1F 參數卡的 SI 值比；寫進 Phoenix 6 前要換成轉數制（1F 的 Java 輸出會幫你換）。</li>
          </ol>
          <p className="small">
            跟理論值差很多時：kG 差 → 重心、負載質量量錯；kV 差 → 齒比、馬達型號填錯；kA 差 → 轉動慣量（長度、質量分布）估錯。準靜態測試轉過直立時重力會變號，範圍最好停在直立之前。
          </p>
          <Quiz quiz={QUIZ2} done={lessonsDone['arm-unit2']} onCorrect={() => markLesson('arm-unit2')} />
        </div>
      </details>

      <details className="unit">
        <summary>
          <h2 style={{ margin: 0 }}>單元三：手臂常見的坑</h2>
          <span className={'tag' + (lessonsDone['arm-unit3'] && lessonsDone['arm-unit3b'] ? ' done' : '')}>{lessonsDone['arm-unit3'] && lessonsDone['arm-unit3b'] ? '已完成' : '可以先讀'}</span>
        </summary>
        <div className="body">
          <div className="goal lgoal">學習目標：認出手臂特有的錯誤，看到日誌能想到是哪一個。</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>坑</th>
                <th>日誌上看到</th>
                <th>怎麼修</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GravityType 設 Elevator_Static</td>
                <td className="small">水平時沒事，抬越高回授越往下壓；前饋在每個角度都一樣高</td>
                <td className="small">改 Arm_Cosine，kG 不用動</td>
              </tr>
              <tr>
                <td>零點不在水平</td>
                <td className="small">kG 看起來在某些角度太大、某些角度太小；角度讀數跟水平儀對不上</td>
                <td className="small">內建編碼器：開機角度（BOOT_ANGLE_DEG）；CANcoder：磁鐵偏移</td>
              </tr>
              <tr>
                <td>用 kI 補 kG</td>
                <td className="small">停住時慢慢爬到目標，大動作後衝過頭（積分飽和）</td>
                <td className="small">kI 設回 0，先把 kG 修對</td>
              </tr>
              <tr>
                <td>夾到遊戲物件後變重</td>
                <td className="small">空手時很準，夾東西後停在目標下面</td>
                <td className="small">1F 填負載算 kG；差很多時分兩組參數（空手、有物件）或靠 kP 補</td>
              </tr>
              <tr>
                <td>CANcoder 比例填錯</td>
                <td className="small">角度跟實際不成比例，轉越多差越多</td>
                <td className="small">SensorToMechanismRatio = CANcoder : 手臂，RotorToSensorRatio = 齒比 ÷ 那個比例</td>
              </tr>
              <tr>
                <td>內建編碼器開機位置不對</td>
                <td className="small">整段日誌角度都偏同一個量</td>
                <td className="small">開機前把手臂靠在硬擋；或改用 CANcoder</td>
              </tr>
            </tbody>
          </table>
          <Quiz quiz={QUIZ3} done={lessonsDone['arm-unit3']} onCorrect={() => markLesson('arm-unit3')} />
          <Quiz quiz={QUIZ_UNIT3} done={lessonsDone['arm-unit3b']} onCorrect={() => markLesson('arm-unit3b')} />
        </div>
      </details>

      <details className="unit">
        <summary>
          <h2 style={{ margin: 0 }}>單元四：期末檢核（沒看過的手臂日誌）</h2>
          <span className={'tag' + (lessonsDone['arm-unit4'] ? ' done' : '')}>{lessonsDone['arm-unit4'] ? '已通過' : '讀完 2F 與單元一到三再做'}</span>
        </summary>
        <ArmUnit4 />
      </details>
    </section>
  )
}

function ArmTwoPoint({ kGTheory, onSaveKs }: { kGTheory: number; onSaveKs: (kS: number) => void }) {
  const [up, setUp] = useState('')
  const [down, setDown] = useState('')
  const [saved, setSaved] = useState(false)
  const r = up !== '' && down !== '' ? twoPointKsKg(Number(up), Number(down)) : null
  const ok = r && !('error' in r) ? r : null
  const diff = ok ? (ok.kG - kGTheory) / Math.abs(kGTheory || 1) : 0
  return (
    <div className="body">
      <div className="goal lgoal">學習目標：在水平用兩個電壓量出 kS 和 kG，知道理論的 kG 差多少。</div>
      <p>
        跟電梯一樣：摩擦擋住兩個方向，往上抬和往下掉需要的電壓不一樣。差別是手臂<b>一定要在水平量</b>：那裡 cos θ = 1，量到的就是 kG 本身；在其他角度量到的是 kG·cos θ。
      </p>
      <div className="formula">{`水平時剛好開始往上抬：V_up   = kG + kS
水平時剛好開始往下掉：V_down = kG − kS
→ kG = (V_up + V_down) / 2　　kS = (V_up − V_down) / 2`}</div>
      <ol className="small">
        <li>先完成單元零，人離開手臂掃過的範圍，有人手放在 Disable 上。</li>
        <li>用 Phoenix Tuner X 的 VoltageOut（或程式的 setVoltage）從 0 V 開始，每次加 0.02–0.05 V。手臂會先往下垂到硬擋，先把它扶到水平再開始（或從下方硬擋開始慢慢加，記下「剛好抬離硬擋、到水平」時的電壓）。</li>
        <li>水平時剛好開始往上抬，記下 V_up；再慢慢減，剛好開始往下掉，記下 V_down。</li>
        <li>量 2–3 次取平均；有夾遊戲物件的手臂，空手和夾著各量一次。</li>
      </ol>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <label className="f">
          剛好往上抬的電壓 V_up
          <span className="inp">
            <input type="number" inputMode="decimal" step={0.01} value={up} onChange={(e) => (setUp(e.target.value), setSaved(false))} />
            <em>V</em>
          </span>
        </label>
        <label className="f">
          剛好往下掉的電壓 V_down
          <span className="inp">
            <input type="number" inputMode="decimal" step={0.01} value={down} onChange={(e) => (setDown(e.target.value), setSaved(false))} />
            <em>V</em>
          </span>
        </label>
      </div>
      {r && 'error' in r && <div className="warn">{r.error.replace('往上爬', '往上抬').replace('往下滑', '往下掉')}</div>}
      {ok && (
        <>
          <div className="formula" style={{ marginTop: 10 }}>{`kG = ${f(ok.kG)} V（水平時）　kS = ${f(ok.kS)} V
1F 理論 kG = ${f(kGTheory)} V（差 ${diff >= 0 ? '+' : ''}${f(diff * 100, 0)}%）`}</div>
          {Math.abs(diff) > 0.2 && <div className="note">差超過 20%：檢查 1F 的手臂質量、重心距離、負載，還有量的時候是不是真的在水平。</div>}
          {ok.kS > 1 && <div className="note">kS 超過 1 V：摩擦很大，檢查轉軸、軸承、齒輪、鏈條鬆緊。</div>}
          {ok.kS <= 6 && (
            <button
              className="btn"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() => {
                onSaveKs(ok.kS)
                setSaved(true)
              }}
            >
              把 kS = {f(ok.kS)} V 填進 1F 機構資料
            </button>
          )}
          {saved && <div className="ok">已填進 1F，參數卡的 kS 和最高速度都會用這個值。</div>}
        </>
      )}
    </div>
  )
}

function LockNote({ onGo }: { onGo: () => void }) {
  return (
    <div className="note lock-note">
      <b>先讀沒關係，上機前一定要完成單元零。</b>這個單元的操作會讓手臂動起來。
      <button className="linkbtn" type="button" onClick={onGo}>
        到單元零
      </button>
    </div>
  )
}

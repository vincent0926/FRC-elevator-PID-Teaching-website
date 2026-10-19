import { useState } from 'react'
import { useStore } from '../../app/store'
import { Quiz, type QuizDef } from '../../components/Quiz'
import { twoPointKsKg } from '../../core/twoPoint'
import { ArmMechanismSchema } from '../../schema/armParameterSet'
import { ArmUnit4 } from './ArmUnit4'
import { useArm } from './armStore'
import { UnsavedNote } from './UnsavedNote'
import { HelpLink } from '../../components/HelpLink'
import { GUIDE_ANCHOR } from '../guide/guideContent'
import { t } from '../../core/lang'

/**
 * 手臂 4F 實機資料教學：單元零（上機前準備，必修）、兩點法量 kS／kG、
 * 單元一錄日誌、單元二 SysId、單元三常見的坑、單元四期末檢核。
 * 網站本身不能當急停，急停一律用 Driver Station。
 */

const UNIT0: { title: string; items: string[] }[] = t(
  [
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
  ],
  [
    {
      title: 'Before you start',
      items: [
        'Robot is up on blocks, with nobody and nothing in the full circle the arm can sweep',
        'Battery above 12.5 V',
        'One person does nothing but watch Disable (Enter) and E-stop (space bar)',
        'Remember: after Disable or a protection trip, gravity drops the arm; Brake only slows the fall',
      ],
    },
    {
      title: 'Check direction and zero',
      items: [
        'With short pulses under 5% voltage and under 0.5 s, confirm positive voltage raises the arm and increases the angle reading',
        'Put the arm level (use a level): the code should read 0°; vertical should read 90°',
        'Far off: for the built-in encoder check the boot angle (BOOT_ANGLE_DEG); for a CANcoder check the magnet offset, direction and ratio',
      ],
    },
    {
      title: 'Set limits',
      items: ['Soft limits inside the hard stops (3° inside each in the example code)', 'Stator current limit', 'Stop automatically on excessive following error or a stall; with a CANcoder, stop on disconnect too'],
    },
    {
      title: 'First closed-loop test',
      items: ['First move near horizontal and hold, to see whether it holds', 'Start Motion Magic velocity and acceleration at 25%, stepping up only when each stage is fine', 'If any stage looks odd, disable and check the log before continuing'],
    },
  ],
)
const UNIT0_COUNT = UNIT0.length

const f = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—')

const INPUTS_SNIPPET = `@AutoLog
class ArmIOInputs {
  public double positionRad;                        // ${t('0 = 水平、往上為正', '0 = horizontal, up is positive')}
  public double velocityRadPerSec;
  public double closedLoopReferenceRad;             // ${t('Motion Magic 的參考角度', 'Motion Magic reference angle')}
  public double closedLoopReferenceSlopeRadPerSec;
  public double appliedVolts;
  public double statorCurrentAmps;
  public double supplyVoltage;
  public double closedLoopOutputVolts;              // ${t('回授 P + I + D', 'feedback P + I + D')}
  public double closedLoopFeedForwardVolts;         // ${t('前饋 kS + kG·cos θ + kV·ω + kA·α', 'feedforward kS + kG·cos θ + kV·ω + kA·α')}
}`

const ROUTINE_SNIPPET = `// ${t('測試分支才綁：錄調參日誌用的動作（停在水平 → 抬高 → 回水平 → 中間 → 收起）', 'Bind only in a test branch: the motion for a tuning log (hold at horizontal → raise → back to horizontal → middle → stow)')}
controller.x().onTrue(arm.tuningRoutine());
// ${t('SysId（單元二）', 'SysId (unit 2)')}
controller.povUp().whileTrue(arm.sysIdQuasistatic(SysIdRoutine.Direction.kForward));
controller.povDown().whileTrue(arm.sysIdQuasistatic(SysIdRoutine.Direction.kReverse));
controller.povRight().whileTrue(arm.sysIdDynamic(SysIdRoutine.Direction.kForward));
controller.povLeft().whileTrue(arm.sysIdDynamic(SysIdRoutine.Direction.kReverse));`

const QUIZ1: QuizDef = {
  question: t('錄手臂的調參日誌，為什麼一定要有「停在水平附近」的片段？', 'When recording an arm tuning log, why must it include a section “stopped near horizontal”?'),
  options: [t('水平時手臂最安全', 'Horizontal is the safest spot for the arm'), t('水平時 cos θ = 1，重力最大，kG 錯多少最看得出來', 'At horizontal cos θ = 1, gravity is largest, so any kG error shows most clearly'), t('水平時摩擦最小', 'Friction is lowest at horizontal'), t('SysId 規定要從水平開始', 'SysId requires starting at horizontal')],
  answer: 1,
  explain: t('kG·cos θ 在水平時最大、直立時是 0。只在高角度停住的日誌，kG 就算錯很多，回授也只要補一點點，看不出來。', 'kG·cos θ is largest at horizontal and 0 when vertical. In a log that only stops at high angles, even a very wrong kG needs only a little feedback, so you can’t see it.'),
  hints: [t('重力項是 kG 乘上什麼？', 'What is the gravity term kG multiplied by?'), t('cos θ 什麼時候最大？', 'When is cos θ largest?'), t('在 cos θ = 1 的地方，kG 的誤差全部都會出現在回授上。', 'Where cos θ = 1, all of kG’s error shows up in the feedback.')],
}
const QUIZ2: QuizDef = {
  question: t('用 SysId 量手臂，分析時的機構類型要選什麼？', 'When measuring an arm with SysId, which mechanism type do you pick for analysis?'),
  options: [t('Simple（沒有重力）', 'Simple (no gravity)'), t('Elevator（重力是常數）', 'Elevator (constant gravity)'), t('Arm（重力跟著 cos θ 變）', 'Arm (gravity follows cos θ)'), t('都可以，結果一樣', 'Any; the result is the same')],
  answer: 2,
  explain: t('選 Arm，SysId 才會把重力項當成 kG·cos θ 去擬合。選 Elevator 會把不同角度的重力混成一個平均值，kG、kS 都會錯。', 'Pick Arm so SysId fits the gravity term as kG·cos θ. Picking Elevator averages gravity at different angles into one number, so kG and kS both come out wrong.'),
  hints: [t('手臂的重力力矩跟角度有沒有關係？', 'Does an arm’s gravity torque depend on angle?'), t('哪個模型的重力項會隨位置變？', 'Which model’s gravity term changes with position?'), t('跟 Phoenix 6 的 GravityType 一樣：Arm。', 'Same as Phoenix 6 GravityType: Arm.')],
}
const QUIZ3: QuizDef = {
  question: t('手臂停在 60° 時回授一直在往下壓，停在水平時卻差不多是 0。最可能的原因？', 'Stopped at 60° the feedback keeps pushing down, but stopped at horizontal it’s about 0. Most likely cause?'),
  options: [t('kG 太大', 'kG too big'), t('kS 太小', 'kS too small'), t('GravityType 設成 Elevator_Static（常數 kG）', 'GravityType set to Elevator_Static (constant kG)'), t('kP 太大', 'kP too big')],
  answer: 2,
  explain: t('常數 kG 在水平時剛好（cos 0° = 1），60° 時真的重力只剩一半，常數 kG 就多補了一半，回授只好往下壓。kG 太大的話水平時也會偏。', 'A constant kG is right at horizontal (cos 0° = 1); at 60° real gravity is only half, so constant kG over-compensates by half and feedback has to push down. If kG were too big it would be off at horizontal too.'),
  hints: [t('水平時沒事，代表 kG 的大小大概是對的。', 'Fine at horizontal means kG’s size is about right.'), t('60° 時真正需要的是 kG × cos 60° = 0.5 kG。', 'At 60° what’s really needed is kG × cos 60° = 0.5 kG.'), t('什麼設定會讓每個角度都補一樣多？', 'Which setting gives the same amount at every angle?')],
}
const QUIZ_UNIT3: QuizDef = {
  question: t('用內建編碼器的手臂，某天開機時手臂不在下方硬擋、而是被人抬到 30°。會發生什麼事？', 'An arm uses the built-in encoder. One day it boots not against the lower hard stop but held up at 30° by someone. What happens?'),
  options: [t('沒影響，編碼器會自己知道角度', 'No effect; the encoder knows the angle on its own'), t('程式以為在下方硬擋，整個角度差 30° 以上：cos θ 算錯、軟體限位也錯位', 'The code thinks it’s at the lower hard stop, so every angle is off by 30°+: cos θ is wrong and the soft limits are misplaced'), t('只有 kP 會變', 'Only kP changes'), t('馬達會自動歸零', 'The motor zeroes itself automatically')],
  answer: 1,
  explain: t('內建編碼器只知道「開機後轉了多少」，開機位置被當成 BOOT_ANGLE_DEG。位置錯了，Arm_Cosine 的 cos θ、軟體限位、目標角度全部跟著錯。這是 CANcoder（絕對編碼器）最大的好處。', 'The built-in encoder only knows “how far it turned since boot”, and the boot position is taken as BOOT_ANGLE_DEG. With the position wrong, Arm_Cosine’s cos θ, the soft limits and the target angles are all wrong. This is the biggest advantage of a CANcoder (absolute encoder).'),
  hints: [t('內建編碼器是絕對還是相對的？', 'Is the built-in encoder absolute or relative?'), t('開機時程式把位置設成多少？', 'What does the code set the position to at boot?'), t('3F 情境「編碼器零點不在水平」就是這個。', 'The 3F scenario “Encoder zero not at horizontal” is exactly this.')],
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
          <h1 id="t-arm-learn">{t('手臂・實機資料教學', 'Arm · Real-robot lessons')}</h1>
          <p className="lead">
            {t('內容隨時可以先讀；要讓手臂動起來之前，一定要先完成單元零。', 'You can read ahead any time; before making the arm move, you must finish unit 0.')}{' '}
            <HelpLink section={GUIDE_ANCHOR.learn} />
          </p>
        </div>
      </div>
      <UnsavedNote />

      <div className="warn" style={{ marginTop: 0, marginBottom: 14 }}>
        {t(
          <>
          <b>網站不能當急停。</b>急停一律用 Driver Station：Enter 是 Disable，空白鍵是 E-Stop。手臂斷電會往下掉，人不要站在它掃過的範圍。
          </>,
          <>
            <b>The site is not an e-stop.</b> Always use the Driver Station: Enter is Disable, the space bar is E-Stop. The arm drops when power is cut, so nobody stands where it sweeps.
          </>,
        )}
      </div>

      <details className="unit" open id="arm-unit0">
        <summary>
          <h2 style={{ margin: 0 }}>{t('單元零：上機前的準備', 'Unit 0: prep before the robot')}</h2>
          <span className={'tag ' + (unlocked ? 'done' : 'must')}>
            {t(`必修，${done0} / ${UNIT0_COUNT}`, `Required, ${done0} / ${UNIT0_COUNT}`)}
          </span>
        </summary>
        <div className="body">
          <p className="small muted">{t('每次上機都要做一遍。每一項全部確認後才打勾。', 'Do this every time you test on the robot. Check an item only after confirming all of it.')}</p>
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
                      {i + 1}{t('．', '. ')}{u.title}
                    </b>
                    <ul>
                      {u.items.map((it) => (
                        <li key={it}>{it}</li>
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
                {t(
                  <>
                  單元零完成，可以照下面的單元上機操作。
                  </>,
                  <>
                    Unit 0 done; you can follow the units below on the robot.
                  </>,
                )}
              </span>
              <button className="btn small" type="button" onClick={() => setUnit0([])}>
                {t('下次上機前清除勾選', 'Clear checks before next time')}
              </button>
            </div>
          )}
        </div>
      </details>

      <details className="unit" id="measure-ks">
        <summary>
          <h2 style={{ margin: 0 }}>{t('量 kS、kG（兩點法，在水平量）', 'Measure kS, kG (two-point method, at horizontal)')}</h2>
          <span className="tag">{arm.measuredKs ? t(`已填 kS ${arm.measuredKs} V`, `kS ${arm.measuredKs} V entered`) : t('kS 一定要量', 'kS must be measured')}</span>
        </summary>
        {!unlocked && <LockNote onGo={toUnit0} />}
        <ArmTwoPoint kGTheory={ff.kG} onSaveKs={(kS) => setArm(ArmMechanismSchema.parse({ ...arm, measuredKs: Math.round(kS * 1000) / 1000 }))} />
      </details>

      <details className="unit" id="unit1">
        <summary>
          <h2 style={{ margin: 0 }}>{t('單元一：用 AdvantageKit 錄手臂日誌', 'Unit 1: record arm logs with AdvantageKit')}</h2>
          <span className={'tag' + (lessonsDone['arm-unit1'] ? ' done' : '')}>{lessonsDone['arm-unit1'] ? t('已完成', 'Done') : t('可以先讀', 'Read ahead')}</span>
        </summary>
        {!unlocked && <LockNote onGo={toUnit0} />}
        <div className="body">
          <div className="goal lgoal">{t('學習目標：知道手臂的日誌要記哪些欄位、用什麼單位，錄什麼動作才分得出 kG 和 kS。', 'Goal: know which fields an arm log needs and in what units, and what motion to record so kG and kS can be separated.')}</div>
          <p>{t('範例程式（robot-example 的 ArmIO） 已經照這個格式記錄，2F 匯入時會自動對應。角度一律是弧度、0 = 水平。', 'The example code (ArmIO in robot-example) already logs in this format, and 2F maps it automatically on import. Angles are always radians with 0 = horizontal.')}</p>
          <pre className="code">{INPUTS_SNIPPET}</pre>
          <h3>{t('要錄什麼動作', 'What motion to record')}</h3>
          <ul className="small">
            {t(
              <>
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
              </>,
              <>
                <li>
                <b>Stop near horizontal</b>: cos θ = 1, where kG’s error is most visible.
                </li>
                <li>
                <b>Include both up and down</b>: friction resists both directions, which is what separates kS from kG.
                </li>
                <li>
                <b>Stop at different angles</b> (horizontal, raised, middle): to see whether the offset follows cos θ, or the GravityType is wrong.
                </li>
                <li>The first time, drop Motion Magic to 25%, and only record at full speed once that’s fine.</li>
              </>,
            )}
          </ul>
          <pre className="code">{ROUTINE_SNIPPET}</pre>
          <Quiz quiz={QUIZ1} done={lessonsDone['arm-unit1']} onCorrect={() => markLesson('arm-unit1')} />
        </div>
      </details>

      <details className="unit" id="unit2">
        <summary>
          <h2 style={{ margin: 0 }}>{t('單元二：用 SysId 量手臂', 'Unit 2: measure the arm with SysId')}</h2>
          <span className={'tag' + (lessonsDone['arm-unit2'] ? ' done' : '')}>{lessonsDone['arm-unit2'] ? t('已完成', 'Done') : t('選用', 'Optional')}</span>
        </summary>
        {!unlocked && <LockNote onGo={toUnit0} />}
        <div className="body">
          <div className="goal lgoal">{t('學習目標：安全地跑手臂的 SysId，知道分析時要選 Arm、結果怎麼跟 1F 的理論值比。', 'Goal: run an arm SysId safely, know to pick Arm in the analysis, and compare the results with the 1F theory values.')}</div>
          <ol className="small">
            {t(
              <>
              <li>範例程式的 SysId 電壓比電梯小（ramp 0.5 V/s、動態 2.5 V），接近角度範圍兩端（SYSID_MIN_DEG、SYSID_MAX_DEG）會自動停。</li>
              <li>四個測試（準靜態、動態 × 往上、往下）都綁在 whileTrue，放開按鈕就停；每個測試之間讓手臂回到收起的位置。</li>
              <li>
                日誌用 AdvantageScope 匯出給 SysId，或直接開 .wpilog：位置選 /Arm/PositionRad、速度選 /Arm/VelocityRadPerSec，單位選 radians。
              </li>
              <li>
                <b>分析類型選 Arm。</b>選 Elevator 或 Simple，重力會被當成常數，kG、kS 都會錯。
              </li>
              <li>SysId 的 kS、kG、kV、kA 單位是 V、V、V/(rad/s)、V/(rad/s²)，可以直接跟 1F 參數卡的 SI 值比；寫進 Phoenix 6 前要換成轉數制。</li>
              </>,
              <>
                <li>The example code’s SysId voltages are smaller than the elevator’s (ramp 0.5 V/s, dynamic 2.5 V), and it stops automatically near either end of the angle range (SYSID_MIN_DEG, SYSID_MAX_DEG).</li>
                <li>All four tests (quasistatic, dynamic × up, down) are bound with whileTrue and stop when the button is released; return the arm to stowed between tests.</li>
                <li>
                Export the log for SysId with AdvantageScope, or open the .wpilog directly: position /Arm/PositionRad, velocity /Arm/VelocityRadPerSec, units radians.
                </li>
                <li>
                <b>Pick Arm as the analysis type.</b> With Elevator or Simple, gravity is treated as constant and kG and kS both come out wrong.
                </li>
                <li>SysId’s kS, kG, kV, kA are in V, V, V/(rad/s), V/(rad/s²), directly comparable with the SI values on the 1F parameter card; convert to rotations before putting them in Phoenix 6.</li>
              </>,
            )}
          </ol>
          <p className="small">
            {t(
              <>
              跟理論值差很多時：kG 差 → 重心、負載質量量錯；kV 差 → 齒比、馬達型號填錯；kA 差 → 轉動慣量（長度、質量分布）估錯。準靜態測試轉過直立時重力會變號，範圍最好停在直立之前。
              </>,
              <>
                When far off from theory: kG off → center of mass or load mass mismeasured; kV off → gear ratio or motor model entered wrong; kA off → moment of inertia (length, mass distribution) misestimated. Gravity flips sign when the quasistatic test passes vertical, so keep the range below vertical if you can.
              </>,
            )}
          </p>
          <Quiz quiz={QUIZ2} done={lessonsDone['arm-unit2']} onCorrect={() => markLesson('arm-unit2')} />
        </div>
      </details>

      <details className="unit" id="unit3">
        <summary>
          <h2 style={{ margin: 0 }}>{t('單元三：手臂常見的坑', 'Unit 3: common arm pitfalls')}</h2>
          <span className={'tag' + (lessonsDone['arm-unit3'] && lessonsDone['arm-unit3b'] ? ' done' : '')}>{lessonsDone['arm-unit3'] && lessonsDone['arm-unit3b'] ? t('已完成', 'Done') : t('可以先讀', 'Read ahead')}</span>
        </summary>
        <div className="body">
          <div className="goal lgoal">{t('學習目標：認出手臂特有的錯誤，看到日誌能想到是哪一個。', 'Goal: recognize mistakes specific to arms, and think of the right one when you see a log.')}</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('坑', 'Pitfall')}</th>
                <th>{t('日誌上看到', 'What the log shows')}</th>
                <th>{t('怎麼修', 'How to fix')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('GravityType 設 Elevator_Static', 'GravityType set to Elevator_Static')}</td>
                <td className="small">{t('水平時沒事，抬越高回授越往下壓；前饋在每個角度都一樣高', 'Fine at horizontal, feedback pushes down more the higher it goes; feedforward is the same height at every angle')}</td>
                <td className="small">{t('改 Arm_Cosine，kG 不用動', 'Change to Arm_Cosine; leave kG alone')}</td>
              </tr>
              <tr>
                <td>{t('零點不在水平', 'Zero not at horizontal')}</td>
                <td className="small">{t('kG 看起來在某些角度太大、某些角度太小；角度讀數跟水平儀對不上', 'kG looks too big at some angles and too small at others; the angle reading doesn’t match a level')}</td>
                <td className="small">{t('內建編碼器：開機角度（BOOT_ANGLE_DEG）；CANcoder：磁鐵偏移', 'Built-in encoder: boot angle (BOOT_ANGLE_DEG); CANcoder: magnet offset')}</td>
              </tr>
              <tr>
                <td>{t('用 kI 補 kG', 'kI covering for kG')}</td>
                <td className="small">{t('停住時慢慢爬到目標，大動作後衝過頭（積分飽和）', 'Creeps slowly to the target when stopped, overshoots after big moves (integral windup)')}</td>
                <td className="small">{t('kI 設回 0，先把 kG 修對', 'Set kI back to 0 and fix kG first')}</td>
              </tr>
              <tr>
                <td>{t('夾到遊戲物件後變重', 'Heavier after grabbing a game piece')}</td>
                <td className="small">{t('空手時很準，夾東西後停在目標下面', 'Accurate empty, stops below the target when holding something')}</td>
                <td className="small">{t('1F 填負載算 kG；差很多時分兩組參數（空手、有物件）或靠 kP 補', 'Enter the load in 1F to compute kG; if very different, use two gain sets (empty, holding) or let kP make it up')}</td>
              </tr>
              <tr>
                <td>{t('CANcoder 比例填錯', 'CANcoder ratio entered wrong')}</td>
                <td className="small">{t('角度跟實際不成比例，轉越多差越多', 'The angle isn’t proportional to reality; the more it turns, the bigger the error')}</td>
                <td className="small">{t('SensorToMechanismRatio = CANcoder : 手臂，RotorToSensorRatio = 齒比 ÷ 那個比例', 'SensorToMechanismRatio = CANcoder : arm, RotorToSensorRatio = gear ratio ÷ that ratio')}</td>
              </tr>
              <tr>
                <td>{t('內建編碼器開機位置不對', 'Built-in encoder booted at the wrong position')}</td>
                <td className="small">{t('整段日誌角度都偏同一個量', 'The angle is off by the same amount through the whole log')}</td>
                <td className="small">{t('開機前把手臂靠在硬擋；或改用 CANcoder', 'Rest the arm against the hard stop before booting, or switch to a CANcoder')}</td>
              </tr>
            </tbody>
          </table>
          <Quiz quiz={QUIZ3} done={lessonsDone['arm-unit3']} onCorrect={() => markLesson('arm-unit3')} />
          <Quiz quiz={QUIZ_UNIT3} done={lessonsDone['arm-unit3b']} onCorrect={() => markLesson('arm-unit3b')} />
        </div>
      </details>

      <details className="unit" id="unit4">
        <summary>
          <h2 style={{ margin: 0 }}>{t('單元四：期末檢核（沒看過的手臂日誌）', 'Unit 4: final check (arm logs you haven’t seen)')}</h2>
          <span className={'tag' + (lessonsDone['arm-unit4'] ? ' done' : '')}>{lessonsDone['arm-unit4'] ? t('已通過', 'Passed') : t('讀完 2F 與單元一到三再做', 'Do after 2F and units 1–3')}</span>
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
      <div className="goal lgoal">{t('學習目標：在水平用兩個電壓量出 kS 和 kG，知道理論的 kG 差多少。', 'Goal: measure kS and kG at horizontal with two voltages, and know how far theory’s kG is off.')}</div>
      {t(
        <>
        <p>
          跟電梯一樣：摩擦擋住兩個方向，往上抬和往下掉需要的電壓不一樣。差別是手臂<b>一定要在水平量</b>：那裡 cos θ = 1，量到的就是 kG 本身；在其他角度量到的是 kG·cos θ。
        </p>
        </>,
        <>
          <p>
          Same as the elevator: friction resists both directions, so raising and dropping need different voltages. The difference is that an arm <b>must be measured at horizontal</b>: there cos θ = 1, so you measure kG itself; at other angles you get kG·cos θ.
          </p>
        </>,
      )}
      <div className="formula">
        {t(
          `水平時剛好開始往上抬：V_up   = kG + kS
水平時剛好開始往下掉：V_down = kG − kS
→ kG = (V_up + V_down) / 2　　kS = (V_up − V_down) / 2`,
          `just starts rising at horizontal:  V_up   = kG + kS
just starts dropping at horizontal: V_down = kG − kS
→ kG = (V_up + V_down) / 2    kS = (V_up − V_down) / 2`,
        )}
      </div>
      <ol className="small">
        {t(
          <>
          <li>先完成單元零，人離開手臂掃過的範圍，有人手放在 Disable 上。</li>
          <li>用 Phoenix Tuner X 的 VoltageOut（或程式的 setVoltage）從 0 V 開始，每次加 0.02–0.05 V。手臂會先往下垂到硬擋，先把它扶到水平再開始（或從下方硬擋開始慢慢加，記下「剛好抬離硬擋、到水平」時的電壓）。</li>
          <li>水平時剛好開始往上抬，記下 V_up；再慢慢減，剛好開始往下掉，記下 V_down。</li>
          <li>量 2–3 次取平均；有夾遊戲物件的手臂，空手和夾著各量一次。</li>
          </>,
          <>
            <li>Finish unit 0 first, everyone out of the arm’s sweep, with someone’s hand on Disable.</li>
            <li>With Phoenix Tuner X VoltageOut (or setVoltage in code), start at 0 V and add 0.02–0.05 V at a time. The arm will first droop onto the hard stop, so hold it level before starting (or start from the lower hard stop and slowly increase, noting the voltage when it “just lifts off the stop and reaches horizontal”).</li>
            <li>When it just starts rising at horizontal, write down V_up; then lower slowly and when it just starts dropping, write down V_down.</li>
            <li>Measure 2–3 times and average; for an arm that holds game pieces, measure once empty and once holding.</li>
          </>,
        )}
      </ol>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <label className="f">
          {t('剛好往上抬的電壓 V_up', 'Voltage to just rise V_up')}
          <span className="inp">
            <input type="number" inputMode="decimal" step={0.01} value={up} onChange={(e) => (setUp(e.target.value), setSaved(false))} />
            <em>V</em>
          </span>
        </label>
        <label className="f">
          {t('剛好往下掉的電壓 V_down', 'Voltage to just drop V_down')}
          <span className="inp">
            <input type="number" inputMode="decimal" step={0.01} value={down} onChange={(e) => (setDown(e.target.value), setSaved(false))} />
            <em>V</em>
          </span>
        </label>
      </div>
      {r && 'error' in r && <div className="warn">{t(r.error.replace('往上爬', '往上抬').replace('往下滑', '往下掉'), r.error.replace('climbing', 'rising').replace('sliding', 'dropping'))}</div>}
      {ok && (
        <>
          <div className="formula" style={{ marginTop: 10 }}>
            {t(
              `kG = ${f(ok.kG)} V（水平時）　kS = ${f(ok.kS)} V
1F 理論 kG = ${f(kGTheory)} V（差 ${diff >= 0 ? '+' : ''}${f(diff * 100, 0)}%）`,
              `kG = ${f(ok.kG)} V (horizontal)    kS = ${f(ok.kS)} V
1F theory kG = ${f(kGTheory)} V (off by ${diff >= 0 ? '+' : ''}${f(diff * 100, 0)}%)`,
            )}
          </div>
          {Math.abs(diff) > 0.2 && <div className="note">{t('差超過 20%：檢查 1F 的手臂質量、重心距離、負載，還有量的時候是不是真的在水平。', 'More than 20% off: check the arm mass, center-of-mass distance and load in 1F, and whether it was really horizontal when measured.')}</div>}
          {ok.kS > 1 && <div className="note">{t('kS 超過 1 V：摩擦很大，檢查轉軸、軸承、齒輪、鏈條鬆緊。', 'kS is over 1 V: that’s a lot of friction; check the pivot, bearings, gears and chain tension.')}</div>}
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
              {t(`把 kS = ${f(ok.kS)} V 填進 1F 機構資料`, `Enter kS = ${f(ok.kS)} V in the 1F mechanism data`)}
            </button>
          )}
          {saved && <div className="ok">{t('已填進 1F，參數卡的 kS 和最高速度都會用這個值。', 'Entered in 1F; the parameter card’s kS and top speed now use this value.')}</div>}
        </>
      )}
    </div>
  )
}

function LockNote({ onGo }: { onGo: () => void }) {
  return (
    <div className="note lock-note">
      {t(
        <>
        <b>先讀沒關係，上機前一定要完成單元零。</b>這個單元的操作會讓手臂動起來。
        </>,
        <>
          <b>Reading ahead is fine, but finish unit 0 before going to the robot.</b> This unit’s steps make the arm move.{' '}
        </>,
      )}
      <button className="linkbtn" type="button" onClick={onGo}>
        {t('到單元零', 'Go to unit 0')}
      </button>
    </div>
  )
}

import { useMemo, type ReactNode } from 'react'
import { useStore } from '../../app/store'
import { QuizSet, type QuizDef } from '../../components/Quiz'
import { computeFeedforward } from '../../core/feedforward'
import { t } from '../../core/lang'

/** 4F 單元三：常見的坑。每一個都寫症狀、原因、怎麼確認、怎麼修，能在 3F 看到的就放按鈕直接載入情境。 */

function Pit({ title, symptom, cause, check, fix, scenario, children }: { title: string; symptom: string; cause: ReactNode; check: string; fix: ReactNode; scenario?: { id: string; label: string }; children?: ReactNode }) {
  const { openScenario } = useStore()
  return (
    <div className="pit">
      <h3>{title}</h3>
      <dl>
        <dt>{t('症狀', 'Symptom')}</dt>
        <dd>{symptom}</dd>
        <dt>{t('原因', 'Cause')}</dt>
        <dd>{cause}</dd>
        <dt>{t('怎麼確認', 'How to confirm')}</dt>
        <dd>{check}</dd>
        <dt>{t('怎麼修', 'How to fix')}</dt>
        <dd>{fix}</dd>
      </dl>
      {children}
      {scenario && (
        <button className="btn small" type="button" onClick={() => openScenario(scenario.id)}>
          {t('到 3F 看：', 'See it in 3F: ')}{scenario.label}
        </button>
      )}
    </div>
  )
}

const QUIZZES: QuizDef[] = [
  {
    question: t('兩級串級式電梯，程式的位置用「最上層高度」，但 1F 算參數時用的是鼓輪線位移。SysId 量到的 kV 會是網站理論值的幾倍？', 'A two-stage cascade elevator’s code uses the “top stage height” for position, but 1F calculated the gains with drum rope displacement. What multiple of the site’s theory value will SysId measure for kV?'),
    options: [t('2 倍', '2×'), t('一樣', 'Same'), t('一半', 'Half')],
    answer: 2,
    explain: t('最上層跑 2 倍快，同樣的電壓對應的「最上層速度」是 2 倍，所以每 1 m/s 要的伏特只有一半。kA 也是一半，kG 不變。', 'The top stage moves 2× as fast, so the same voltage corresponds to 2× the “top stage speed”, meaning half the volts per 1 m/s. kA is also halved; kG doesn’t change.'),
    hints: [t('kV 的單位是 V/(m/s)。', 'kV is in V/(m/s).'), t('最上層的 1 m/s 只等於鼓輪的 0.5 m/s。', '1 m/s at the top stage is only 0.5 m/s at the drum.'), t('同樣的伏特除以比較大的速度……', 'The same volts divided by a bigger speed…')],
  },
  {
    question: t('同樣的 kP，放在 TalonFX 上很穩，改到 roboRIO（50 Hz）上開始抖。最主要的原因是？', 'The same kP is steady on the TalonFX but starts jittering when moved to the roboRIO (50 Hz). What’s the main reason?'),
    options: [t('roboRIO 算錯了', 'The roboRIO calculates wrong'), t('控制週期變長、延遲變大，控制器看到的是舊的位置', 'The control period is longer and the delay bigger, so the controller sees an old position'), t('roboRIO 的電壓比較低', 'The roboRIO’s voltage is lower')],
    answer: 1,
    explain: t('20 ms 才更新一次，加上 CAN 延遲，控制器等於一直在修正「過去」的誤差，kP 大時就推過頭。', 'Updating only every 20 ms, plus CAN delay, the controller keeps correcting “past” error, so with a big kP it overshoots.'),
    hints: [t('兩邊算的公式是一樣的。', 'Both sides use the same formula.'), t('差別在多久算一次。', 'The difference is how often it computes.'), t('看到的位置越舊，越容易推過頭。', 'The older the position it sees, the easier it overshoots.')],
  },
  {
    question: t('比賽中電梯夾著 2 kg 的遊戲物件時會停得比較低，沒夾時很準。最好的處理方式是？', 'In a match the elevator stops lower when holding a 2 kg game piece, and is accurate without one. What’s the best fix?'),
    options: [t('加 kI', 'Add kI'), t('把 kP 加到很大', 'Raise kP a lot'), t('夾東西和沒夾東西各用一組 kG（例如用不同 Slot，或程式判斷有沒有夾）', 'Use a separate kG with and without the piece (e.g. different Slots, or check in code whether something is held)')],
    answer: 2,
    explain: t('差多少 kG 是算得出來的，直接補前饋最準。kI 容易積分飽和，kP 太大會抖。', 'How much kG differs can be calculated, so compensating it in feedforward is most accurate. kI winds up easily and too much kP jitters.'),
    hints: [t('停得比較低，是 kG 不夠。', 'Stopping lower means kG is too small.'), t('夾不夾東西，kG 差一個固定的量。', 'Holding or not changes kG by a fixed amount.'), t('能算出來的量，就用前饋補。', 'If you can calculate it, compensate with feedforward.')],
  },
]

export function Unit3() {
  const { mechanism, theory, lessonsDone, markLesson } = useStore()
  const kTop = mechanism.stages[mechanism.stages.length - 1].speedRatio
  const payload = useMemo(() => {
    const piece = mechanism.payloadMass > 0 ? mechanism.payloadMass : 2
    const without = computeFeedforward({ ...mechanism, payloadMass: 0 })
    const withPiece = computeFeedforward({ ...mechanism, payloadMass: piece })
    const dKg = withPiece.kG - without.kG
    return { piece, without: without.kG, with: withPiece.kG, dKg, err: dKg / Math.max(theory.feedback.kP, 1e-6) }
  }, [mechanism, theory.feedback.kP])

  return (
    <div className="body">
      {t(
        <>
        <div className="goal lgoal">學習目標：認得出最常見的四個坑，知道怎麼確認、怎麼修，不要把它們誤當成「PID 沒調好」。</div>
  
        <Pit
          title="1. 位置單位：最上層高度還是鼓輪線位移？"
          symptom="捲尺量的高度跟程式讀到的差 2 倍（或 1/速度比）；SysId 量到的 kV、kA 剛好是理論值的一半；軟體限位擋在奇怪的地方。"
          cause={
            <>
              串級式電梯最上層跑得比鼓輪快（這台是 × {kTop}）。程式的位置可以定成鼓輪線位移（第一級），也可以定成最上層高度，但轉換係數要跟著換：
              鼓輪線位移每圈 2πr，最上層高度每圈 2πr × {kTop}。網站的參數預設用鼓輪線位移。
            </>
          }
          check="單元零第 2 步：讓電梯走一段，用捲尺量最上層升了多少，跟程式的位置比。"
          fix={
            <>
              選一種座標，全部照它：1F 機構資料最下面的「程式裡的位置用最上層高度」勾選、ElevatorGains 的 METERS_PER_ROTATION、軟體限位、日誌欄位對應的倍率都要一致。網站輸出的程式會照這個勾選換算。
            </>
          }
        />
  
        <Pit
          title="2. 高 kP：roboRIO 50 Hz vs 馬達控制器 1 kHz"
          symptom="同一組參數在 TalonFX 上很穩，改成 roboRIO 算 PID 後到位一直抖；或是別隊的 kP 抄過來就振盪。"
          cause="roboRIO 主迴圈 20 ms 才算一次，再加上 CAN 延遲，控制器修正的是「舊的」誤差。延遲越大，kP 能用的上限越小。"
          check="2F 日誌：到位後電壓、位置有規律地來回（振盪）。3F 把控制器位置切成 roboRIO 比較。"
          fix="閉迴路放在馬達控制器上（Phoenix 6 的 MotionMagicVoltage）；一定要在 roboRIO 算的話，kP 設小、前饋做準。"
          scenario={{ id: 'controlPeriod', label: '控制週期：TalonFX 對 roboRIO' }}
        />
  
        <Pit
          title="3. 電壓補償與 FOC：kV 為什麼對不上"
          symptom="電池滿的時候很準、比賽後段電梯變慢或停得比較低；換成 FOC 之後 kV、kG 好像都差一點。"
          cause={
            <>
              <b>電壓補償</b>：參數都是「伏特」。Phoenix 6 的 MotionMagicVoltage 本來就用伏特；但 SPARK MAX 的閉迴路輸出是佔空比，沒開電壓補償時，電池低了同樣的指令給的電壓就變少。
              用 Phoenix 6 的 DutyCycle 控制模式也一樣。<br />
              <b>FOC</b>：Kraken、Falcon 開 FOC 後空轉轉速和扭矩常數都不一樣（空轉稍慢、扭矩較大），所以 kV、kG、kA 都要用 FOC 的馬達資料算。
            </>
          }
          check="1F 的馬達型號有沒有選對「FOC」版本；SPARK MAX 有沒有呼叫 voltageCompensation(12)；日誌裡電池電壓低的時段誤差是不是比較大。"
          fix="用 Voltage 的控制模式（MotionMagicVoltage）或開電壓補償；1F 選跟程式一致的馬達（FOC 或非 FOC）。"
          scenario={{ id: 'sparkNoComp', label: 'SPARK MAX 沒開電壓補償' }}
        />
  
        <Pit
          title="4. 夾遊戲物件：kG 變了"
          symptom="沒夾東西時停得很準，夾了之後停得比較低（或反過來）；調好的參數換一種遊戲物件就不準。"
          cause="遊戲物件掛在最上層，重力要乘最上層的速度比。kG 是常數，只能對其中一種情況準。"
          check="2F 分別錄「有夾」和「沒夾」的日誌，看靜止保持時回授輸出差多少。"
          fix={
            <>
              差多少 kG 是算得出來的：兩組 kG（用 Slot 或程式判斷有沒有夾）最準；只差一點點的話，確認 kP 補得起來就好。到 3F 的穩健性測試，把質量變化設大一點看還過不過。
            </>
          }
        >
          <div className="formula" style={{ margin: '4px 0 10px' }}>{`你的電梯夾 ${payload.piece} kg（最上層，× ${kTop}）：
kG 沒夾 ${payload.without.toFixed(3)} V → 有夾 ${payload.with.toFixed(3)} V，差 ${payload.dKg.toFixed(3)} V
只靠 kP ${theory.feedback.kP.toFixed(0)} V/m 補的話，會停低 ${(payload.err * 100).toFixed(1)} cm`}</div>
        </Pit>
  
        <h3>檢核</h3>
        </>,
        <>
          <div className="goal lgoal">Goal: recognize the four most common pitfalls, know how to confirm and fix them, and not mistake them for “PID isn’t tuned”.</div>

          <Pit
          title="1. Position units: top stage height or drum rope displacement?"
          symptom="The height measured with a tape differs from what the code reads by 2× (or 1/speed ratio); SysId’s kV and kA are exactly half of theory; the soft limits stop in odd places."
          cause={
          <>
          In a cascade the top stage moves faster than the drum (× {kTop} on this one). Position in code can be defined as drum rope displacement (first stage) or as top stage height, but the conversion factor has to change with it:{' '}
          drum rope displacement is 2πr per rotation, top stage height is 2πr × {kTop} per rotation. The site’s gains default to drum rope displacement.
          </>
          }
          check="Unit 0 step 2: move the elevator a bit, measure how far the top stage rose with a tape, and compare with the code’s position."
          fix={
          <>
          Pick one coordinate and use it everywhere: the “Position in code is the top stage height” checkbox at the bottom of the 1F mechanism data, METERS_PER_ROTATION in ElevatorGains, the soft limits and the log field mapping scale must all agree. The code the site outputs follows this checkbox.
          </>
          }
          />

          <Pit
          title="2. High kP: roboRIO 50 Hz vs motor controller 1 kHz"
          symptom="The same gains are steady on the TalonFX but jitter at arrival once PID runs on the roboRIO; or another team’s copied kP oscillates."
          cause="The roboRIO main loop only computes every 20 ms, plus CAN delay, so the controller corrects “old” error. The bigger the delay, the lower the usable kP."
          check="2F log: after arrival, voltage and position swing back and forth regularly (oscillation). In 3F, switch the controller location to roboRIO to compare."
          fix="Run the closed loop on the motor controller (Phoenix 6 MotionMagicVoltage); if it must run on the roboRIO, keep kP small and get feedforward accurate."
          scenario={{ id: 'controlPeriod', label: 'Control period: TalonFX vs roboRIO' }}
          />

          <Pit
          title="3. Voltage compensation and FOC: why kV doesn’t match"
          symptom="Accurate on a full battery, but late in the match the elevator gets slower or stops lower; after switching to FOC, kV and kG both seem a bit off."
          cause={
          <>
          <b>Voltage compensation</b>: all gains are in volts. Phoenix 6 MotionMagicVoltage works in volts already, but SPARK MAX closed-loop output is duty cycle, and without voltage compensation the same command gives less voltage on a low battery.{' '}
          The same goes for Phoenix 6 DutyCycle control modes.<br />
          <b>FOC</b>: with FOC on, a Kraken or Falcon has a different free speed and torque constant (slightly slower free speed, more torque), so kV, kG and kA all need the FOC motor data.
          </>
          }
          check="Did you pick the “FOC” version of the motor in 1F; does the SPARK MAX call voltageCompensation(12); is the error bigger in the parts of the log where battery voltage is low?"
          fix="Use a voltage control mode (MotionMagicVoltage) or turn on voltage compensation; in 1F pick the motor that matches the code (FOC or non-FOC)."
          scenario={{ id: 'sparkNoComp', label: 'SPARK MAX without voltage compensation' }}
          />

          <Pit
          title="4. Holding a game piece: kG changes"
          symptom="Accurate without a piece, but stops lower holding one (or the other way round); tuned gains go off with a different game piece."
          cause="The game piece hangs on the top stage, so its gravity is multiplied by the top stage’s speed ratio. kG is a constant and can only be right for one case."
          check="In 2F, record separate logs “holding” and “not holding”, and compare the feedback output while holding still."
          fix={
          <>
          The kG difference can be calculated: two kG values (via Slots or a code check for whether something is held) are most accurate; if the difference is small, just make sure kP can cover it. In the 3F robustness test, set a bigger mass variation and see whether it still passes.
          </>
          }
          >
          <div className="formula" style={{ margin: '4px 0 10px' }}>{`Your elevator holding ${payload.piece} kg (top stage, × ${kTop}):
kG without ${payload.without.toFixed(3)} V → with ${payload.with.toFixed(3)} V, difference ${payload.dKg.toFixed(3)} V
Relying on kP ${theory.feedback.kP.toFixed(0)} V/m alone, it stops ${(payload.err * 100).toFixed(1)} cm low`}</div>
          </Pit>

          <h3>Check</h3>
        </>,
      )}
      <QuizSet quizzes={QUIZZES} done={lessonsDone['unit3']} onDone={() => markLesson('unit3')} />
    </div>
  )
}

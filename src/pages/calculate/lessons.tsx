import { useMemo, type ReactNode } from 'react'
import { Chart, type ChartSeries } from '../../components/Chart'
import { ApproxNote } from '../../components/ApproxNote'
import { Exercise } from '../../components/Exercise'
import type { QuizDef } from '../../components/Quiz'
import { PROFILE_SAFETY_FACTOR, type FeedforwardResult } from '../../core/feedforward'
import { motorModel } from '../../core/motors'
import { plantFromMechanism } from '../../core/physics/elevator'
import type { AntiWindup, Slot0Gains } from '../../core/controller/slot0'
import { simulate } from '../../core/physics/simulate'
import { trapezoidTime } from '../../core/ratioSweep'
import type { ElevatorMechanism } from '../../schema/parameterSet'
import { t } from '../../core/lang'

/**
 * 五個教學關卡（pages/lessons 那一頁，從 1F 拆出來）。每關有學習目標、用目前機構代入的數字、一題檢核題。
 * 數字跟著左邊表單即時變，讓隊員看到「自己的電梯」而不是課本例子。
 */

export interface LessonCtx {
  m: ElevatorMechanism
  ff: FeedforwardResult
  kP: number
  /** 這一關已經完成（練習直接顯示答案） */
  done?: boolean
}

export interface Lesson {
  id: string
  title: string
  sub: string
  goal: string
  Body: (p: LessonCtx) => ReactNode
  quiz: QuizDef
}

const f = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function Physics({ m, ff, done }: LessonCtx) {
  const kTop = m.stages[m.stages.length - 1].speedRatio
  const torquePerMotor = (ff.netGravityForce * m.drumRadius) / m.gearRatio / m.motorCount
  return (
    <>
      {t(
        <>
        <p>
          電梯要動，馬達要克服三種力：<b>重力</b>（一直往下拉，停著也要撐）、<b>慣性</b>（加速、減速時才需要）、<b>摩擦</b>（方向跟移動相反，大小差不多固定）。
        </p>
        <p>串級式電梯的上層跑得比鼓輪快：鼓輪拉 1 公分，第 i 級升高 kᵢ 公分（kᵢ 是速度比）。那「換算到鼓輪上」要算多少質量？</p>
        </>,
        <>
          <p>
          To move an elevator, the motors have to overcome three forces: <b>gravity</b> (always pulling down, even when stopped), <b>inertia</b> (only while speeding up or slowing down) and <b>friction</b> (opposite to the motion, roughly constant in size).
          </p>
          <p>In a cascade the upper stages move faster than the drum: pull the drum 1 cm and stage i rises kᵢ cm (kᵢ is the speed ratio). So how much mass is that “as seen by the drum”?</p>
        </>,
      )}
      <Exercise
        solvedAlready={done}
        prompt={
          <>
            {t(
              <>
              練習用的電梯：第 1 級 5 kg（速度比 1）、第 2 級 3 kg（速度比 2），最上層夾著 2 kg 的遊戲物件。
              撐住重力要當成多少 kg（m_G）？加速時要推動多少 kg（m_A）？
              </>,
              <>
                Practice elevator: stage 1 is 5 kg (speed ratio 1), stage 2 is 3 kg (speed ratio 2), and the top holds a 2 kg game piece.{' '}
                How many kg do you hold against gravity (m_G)? How many kg do you push when accelerating (m_A)?
              </>,
            )}
          </>
        }
        fields={[
          {
            label: t('重力等效質量 m_G', 'Gravity equivalent mass m_G'),
            answer: 15,
            unit: 'kg',
            mistakes: [
              { value: 10, msg: t('你直接把質量相加了。上層升得比鼓輪快，要乘速度比。', 'You added the masses directly. The upper stage rises faster than the drum, so multiply by the speed ratio.') },
              { value: 25, msg: t('你乘了速度比的平方。重力只乘一次：鼓輪拉 1 cm，第 i 級升高 kᵢ cm，重力做的功是 mᵢ·g·kᵢ。', 'You multiplied by the speed ratio squared. Gravity only gets it once: pull the drum 1 cm, stage i rises kᵢ cm, and the work against gravity is mᵢ·g·kᵢ.') },
              { value: 13, msg: t('遊戲物件掛在最上層，也要乘最上層的速度比 2。', 'The game piece hangs on the top stage, so it also gets multiplied by the top stage’s speed ratio of 2.') },
            ],
          },
          {
            label: t('慣性等效質量 m_A', 'Inertia equivalent mass m_A'),
            answer: 25,
            unit: 'kg',
            mistakes: [
              { value: 10, msg: t('你直接把質量相加了。上層跑得比較快，動能比較大。', 'You added the masses directly. The upper stage moves faster, so it has more kinetic energy.') },
              { value: 15, msg: t('慣性要乘速度比的平方：動能 ½·mᵢ·(kᵢ·v)² 裡有 kᵢ²。', 'Inertia uses the speed ratio squared: kinetic energy ½·mᵢ·(kᵢ·v)² contains kᵢ².') },
              { value: 19, msg: t('遊戲物件在最上層，也要乘 2² = 4。', 'The game piece is on the top stage, so it also gets 2² = 4.') },
              { value: 21, msg: t('遊戲物件要乘速度比的平方 4，不是 2。', 'The game piece gets the speed ratio squared, 4, not 2.') },
            ],
          },
        ]}
      >
      {t(
        <>
        <p>
          串級式電梯的上層跑得比鼓輪快。第 i 級的速度是鼓輪線速度的 kᵢ 倍，所以把每一級「換算」到鼓輪上：
        </p>
        </>,
        <>
          <p>
          In a cascade the upper stages move faster than the drum. Stage i moves at kᵢ times the drum’s rope speed, so “convert” each stage to the drum:
          </p>
        </>,
      )}
      <div className="formula">
        {t(
          `重力等效質量 m_G = Σ mᵢ · kᵢ     （速度比一次方）
慣性等效質量 m_A = Σ mᵢ · kᵢ²    （速度比平方）`,
          `gravity equivalent mass m_G = Σ mᵢ · kᵢ     (speed ratio to the 1st power)
inertia equivalent mass m_A = Σ mᵢ · kᵢ²    (speed ratio squared)`,
        )}
      </div>
      {t(
        <>
        <p>
          為什麼次方不一樣？鼓輪拉 1 公分，第 i 級升高 kᵢ 公分，重力做的功是 mᵢ·g·kᵢ，所以重力乘一次 kᵢ；
          第 i 級的速度是 kᵢ 倍，動能 ½·mᵢ·(kᵢ·v)² 裡有 kᵢ²，所以慣性乘兩次。直接把質量相加，kG 和 kA 都會算錯。
        </p>
        </>,
        <>
          <p>
          Why the different powers? Pull the drum 1 cm and stage i rises kᵢ cm, so the work against gravity is mᵢ·g·kᵢ: gravity gets kᵢ once.{' '}
          Stage i moves at kᵢ times the speed, and kinetic energy ½·mᵢ·(kᵢ·v)² contains kᵢ², so inertia gets it twice. Just adding the masses gets both kG and kA wrong.
          </p>
        </>,
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl" style={{ margin: '8px 0 12px' }}>
        <thead>
          <tr>
            <th>{t('項目', 'Item')}</th>
            <th className="num">{t('質量', 'Mass')}</th>
            <th className="num">{t('速度比 k', 'Speed ratio k')}</th>
            <th className="num">m·k</th>
            <th className="num">m·k²</th>
          </tr>
        </thead>
        <tbody>
          {m.stages.map((s, i) => (
            <tr key={i}>
              <td>{t(`第 ${i + 1} 級`, `Stage ${i + 1}`)}</td>
              <td className="num">{f(s.mass, 1)} kg</td>
              <td className="num">{f(s.speedRatio, 1)}</td>
              <td className="num">{f(s.mass * s.speedRatio, 1)}</td>
              <td className="num">{f(s.mass * s.speedRatio ** 2, 1)}</td>
            </tr>
          ))}
          <tr>
            <td>{t('負載（掛在最上層）', 'Payload (on the top stage)')}</td>
            <td className="num">{f(m.payloadMass, 1)} kg</td>
            <td className="num">{f(kTop, 1)}</td>
            <td className="num">{f(m.payloadMass * kTop, 1)}</td>
            <td className="num">{f(m.payloadMass * kTop ** 2, 1)}</td>
          </tr>
          <tr>
            <th colSpan={3}>{t('合計', 'Total')}</th>
            <th className="num">m_G = {f(ff.mass.gravity, 1)} kg</th>
            <th className="num">m_A = {f(ff.mass.inertia, 1)} kg</th>
          </tr>
        </tbody>
      </table>
      </div>
      {t(
        <>
        <p>
          重力在鼓輪上是 m_G·g − 配重 = <b>{f(ff.netGravityForce, 1)} N</b>。經過半徑 {f(m.drumRadius * 1000, 1)} mm 的鼓輪和 {f(m.gearRatio, 2)}:1 的齒比，
          分給 {m.motorCount} 顆馬達，每顆只要出 <b>{f(torquePerMotor, 3)} N·m</b> 就能撐住。
        </p>
        </>,
        <>
          <p>
          At the drum, gravity is m_G·g − counterweight = <b>{f(ff.netGravityForce, 1)} N</b>. Through the {f(m.drumRadius * 1000, 1)} mm drum radius and the {f(m.gearRatio, 2)}:1 gear ratio,{' '}
          split across {m.motorCount} motors, each one only needs <b>{f(torquePerMotor, 3)} N·m</b> to hold it.
          </p>
        </>,
      )}
      <div className="formula">
        {t(
          `馬達扭矩 = 力 × 半徑 ÷ 齒比 ÷ 馬達數
         = ${f(ff.netGravityForce, 1)} × ${f(m.drumRadius, 4)} ÷ ${f(m.gearRatio, 2)} ÷ ${m.motorCount} = ${f(torquePerMotor, 3)} N·m`,
          `motor torque = force × radius ÷ gear ratio ÷ motor count
             = ${f(ff.netGravityForce, 1)} × ${f(m.drumRadius, 4)} ÷ ${f(m.gearRatio, 2)} ÷ ${m.motorCount} = ${f(torquePerMotor, 3)} N·m`,
        )}
      </div>
      </Exercise>
    </>
  )
}

function Motor({ m }: LessonCtx) {
  const mm = motorModel(m.motor)
  return (
    <>
      <p>{t('直流馬達的電壓分成兩部分：一部分推電流通過繞組（電流產生扭矩），另一部分抵銷「反電動勢」（馬達轉越快越大）。', 'A DC motor’s voltage splits in two: part pushes current through the windings (current makes torque), and part cancels the back-EMF (which grows the faster the motor spins).')}</p>
      <div className="formula">
        {t(
          `V = I · R + ω / Kv        電壓 = 推電流 + 抵銷反電動勢
τ = kT · I                扭矩只跟電流有關`,
          `V = I · R + ω / Kv        voltage = pushing current + cancelling back-EMF
τ = kT · I                torque depends only on current`,
        )}
      </div>
      <p>{t('這三個常數可以從馬達規格表的四個數字（堵轉扭矩、堵轉電流、空轉轉速、空轉電流）算出來：', 'These three constants come from four numbers on the motor spec sheet (stall torque, stall current, free speed, free current):')}</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl" style={{ margin: '8px 0 12px' }}>
        <tbody>
          <tr>
            <td>{t(`${mm.label} 繞組電阻 R = 12 V ÷ 堵轉電流 ${mm.stallCurrent} A`, `${mm.label} winding resistance R = 12 V ÷ stall current ${mm.stallCurrent} A`)}</td>
            <td className="num">{f(mm.R * 1000, 1)} mΩ</td>
          </tr>
          <tr>
            <td>{t(`扭矩常數 kT = 堵轉扭矩 ${mm.stallTorque} N·m ÷ 堵轉電流`, `Torque constant kT = stall torque ${mm.stallTorque} N·m ÷ stall current`)}</td>
            <td className="num">{f(mm.kT, 5)} N·m/A</td>
          </tr>
          <tr>
            <td>{t('轉速常數 Kv = 空轉角速度 ÷（12 V − R × 空轉電流）', 'Speed constant Kv = free angular speed ÷ (12 V − R × free current)')}</td>
            <td className="num">{f(mm.Kv, 2)} rad/s/V</td>
          </tr>
        </tbody>
      </table>
      </div>
      {t(
        <>
        <p>
          重點：<b>轉得越快，反電動勢吃掉的電壓越多</b>，剩下能推電流、產生扭矩的電壓越少。所以電梯跑得越快，能用來加速的力越小，最高速度也有上限。
        </p>
        </>,
        <>
          <p>
          Key point: <b>the faster it spins, the more voltage the back-EMF eats</b>, leaving less to push current and make torque. So the faster the elevator moves, the less force is left for accelerating, and the top speed has a limit.
          </p>
        </>,
      )}
    </>
  )
}

function Derive({ m, ff }: LessonCtx) {
  const mm = motorModel(m.motor)
  // 扣掉反電動勢後，每 1 V 對應的力（N/V）
  const newtonsPerVolt = (m.motorCount * mm.kT * m.gearRatio) / (mm.R * m.drumRadius)
  return (
    <>
      <p>{t('把第 1、2 關串起來。前饋就是「照物理算，要讓電梯這樣動需要多少伏特」：', 'Put lessons 1 and 2 together. Feedforward is “by the physics, how many volts does it take to make the elevator move like this”:')}</p>
      <div className="formula">
        {t(
          `kG：撐住重力的電流 × R
    = (m_G·g − 配重) · r / G · R / (n · kT)
    = ${f(ff.netGravityForce, 1)} × ${f(m.drumRadius, 4)} / ${f(m.gearRatio, 2)} × ${f(mm.R, 5)} / (${m.motorCount} × ${f(mm.kT, 5)})
    = ${f(ff.kG)} V

kV：每 1 m/s 要抵銷的反電動勢
    = G / (r · Kv) = ${f(m.gearRatio, 2)} / (${f(m.drumRadius, 4)} × ${f(mm.Kv, 2)}) = ${f(ff.kV)} V/(m/s)

kA：每 1 m/s² 推動慣性要的電壓
    = m_A · r · R / (G · n · kT) = ${f(ff.kA, 4)} V/(m/s²)`,
          `kG: current to hold gravity × R
    = (m_G·g − counterweight) · r / G · R / (n · kT)
    = ${f(ff.netGravityForce, 1)} × ${f(m.drumRadius, 4)} / ${f(m.gearRatio, 2)} × ${f(mm.R, 5)} / (${m.motorCount} × ${f(mm.kT, 5)})
    = ${f(ff.kG)} V

kV: back-EMF to cancel per 1 m/s
    = G / (r · Kv) = ${f(m.gearRatio, 2)} / (${f(m.drumRadius, 4)} × ${f(mm.Kv, 2)}) = ${f(ff.kV)} V/(m/s)

kA: voltage to push the inertia per 1 m/s²
    = m_A · r · R / (G · n · kT) = ${f(ff.kA, 4)} V/(m/s²)`,
        )}
      </div>
      {t(
        <>
        <p>
          控制器每個週期輸出 <code>kS·sgn(v) + kG + kV·v + kA·a</code>，其中 v、a 是 Motion Magic 軌跡的<b>參考</b>速度和加速度，不是量到的值。
          kS 是摩擦，理論上算不出來，先填 0，上機後由調參建議量出來。
        </p>
        </>,
        <>
          <p>
          Every loop the controller outputs <code>kS·sgn(v) + kG + kV·v + kA·a</code>, where v and a are the Motion Magic profile’s <b>reference</b> velocity and acceleration, not measured values.{' '}
          kS is friction, which theory can’t calculate; start it at 0 and measure it on the robot with the tuning advice.
          </p>
        </>,
      )}
      <div className="note">
        <b>{t('為什麼參數的單位都是伏特？', 'Why are all the gains in volts?')}</b>
        {t(
          '控制輸入 u 以電壓 [V] 表示。這裡不是說「電壓是力」，而是將馬達控制輸入統一表示成電壓，使電氣模型與機械模型可以直接連接：扣掉反電動勢之後剩下的電壓推動電流，電流產生扭矩，扭矩經過齒輪和鼓輪變成力。',
          ' The control input u is expressed in volts [V]. That doesn’t mean “voltage is force”; the motor input is just written as a voltage so the electrical and mechanical models connect directly: the voltage left after back-EMF pushes current, current makes torque, and torque becomes force through the gears and drum.',
        )}
        <div className="formula" style={{ margin: '8px 0 4px' }}>
          {t(
            `力 F = (u − kV·v) × n·kT·G / (R·r)
     = (u − kV·v) × ${f(newtonsPerVolt, 1)} N/V     （你的電梯）
檢查：kG × ${f(newtonsPerVolt, 1)} = ${f(ff.kG * newtonsPerVolt, 1)} N ＝ 重力 − 配重 ${f(ff.netGravityForce, 1)} N`,
            `force F = (u − kV·v) × n·kT·G / (R·r)
        = (u − kV·v) × ${f(newtonsPerVolt, 1)} N/V     (your elevator)
check: kG × ${f(newtonsPerVolt, 1)} = ${f(ff.kG * newtonsPerVolt, 1)} N = gravity − counterweight ${f(ff.netGravityForce, 1)} N`,
          )}
        </div>
        {t('所以 kG、kS 是「要多少伏特才撐得住／推得動」，kV、kA 是「每 1 m/s、每 1 m/s² 要多少伏特」。', 'So kG and kS are “how many volts to hold it / get it moving”, and kV and kA are “how many volts per 1 m/s and per 1 m/s²”.')}
      </div>
      <ApproxNote
        summary={t('理論值是用簡化的物理算的，上機後 kG、kA 要再量、kS 一定要量（1F 最下面有對照表）。', 'Theory values come from simplified physics. On the robot, re-measure kG and kA, and kS must be measured (see the table at the bottom of 1F).')}
        items={t(
          [
            '質量是你填的數字：CAD 或估計的質量常常少算螺絲、線材、護板。',
            '馬達用規格表的常數（R、kT、Kv），真的馬達熱了會變。',
            '沒有算摩擦（kS）和齒輪箱效率，所以真的 kG 通常比理論大一點。',
            '串級式等效質量假設每一級都照速度比同步移動，沒有繩子、鏈條的伸長和晃動。',
          ],
          [
            'Masses are the numbers you entered: CAD or estimated masses often miss screws, wiring and panels.',
            'The motor uses spec-sheet constants (R, kT, Kv), which change as a real motor heats up.',
            'Friction (kS) and gearbox efficiency aren’t included, so the real kG is usually a bit bigger than theory.',
            'The cascade equivalent mass assumes every stage moves in sync at its speed ratio, with no rope/chain stretch or wobble.',
          ],
        )}
      />
      {t(
        <>
        <p>
          能跑多快？往上等速時 a = 0，電壓要扛重力、摩擦和反電動勢：V = kG + kS + kV·v，所以最高速度 v = (V − kG − kS) ÷ kV。
        </p>
        </>,
        <>
          <p>
          How fast can it go? Going up at constant speed a = 0, so the voltage has to cover gravity, friction and back-EMF: V = kG + kS + kV·v, so the top speed is v = (V − kG − kS) ÷ kV.
          </p>
        </>,
      )}
      {ff.frictionIncluded ? (
        t(
          <>
          <p>
            用你量到的 kS：({f(m.calcVoltage, 1)} − {f(ff.kG)} − {f(ff.kS)}) ÷ {f(ff.kV)} = <b>{f(ff.maxVelocity, 2)} m/s</b>（不扣摩擦會算成{' '}
            {f(ff.maxVelocityNoFriction, 2)} m/s，高估 {f(((ff.maxVelocityNoFriction - ff.maxVelocity) / ff.maxVelocity) * 100, 0)}%）。
          </p>
          </>,
          <>
            <p>
            Using your measured kS: ({f(m.calcVoltage, 1)} − {f(ff.kG)} − {f(ff.kS)}) ÷ {f(ff.kV)} = <b>{f(ff.maxVelocity, 2)} m/s</b> (without friction it would come out as{' '}
            {f(ff.maxVelocityNoFriction, 2)} m/s, {f(((ff.maxVelocityNoFriction - ff.maxVelocity) / ff.maxVelocity) * 100, 0)}% too high).
            </p>
          </>,
        )
      ) : (
        t(
          <>
          <p>
            kS 還沒量，先當 0：({f(m.calcVoltage, 1)} − {f(ff.kG)}) ÷ {f(ff.kV)} = <b>{f(ff.maxVelocity, 2)} m/s</b>。這是<b>不含摩擦的理論上限</b>，
            實際一定比較低；量到 kS 後填在機構資料最下面，這裡和 Motion Magic 建議值會一起更新。
          </p>
          </>,
          <>
            <p>
            kS isn’t measured yet, so it’s 0 for now: ({f(m.calcVoltage, 1)} − {f(ff.kG)}) ÷ {f(ff.kV)} = <b>{f(ff.maxVelocity, 2)} m/s</b>. This is the <b>friction-free theoretical limit</b>;{' '}
            the real one is always lower. Once you measure kS, enter it at the bottom of the mechanism data and this and the Motion Magic suggestion update together.
            </p>
          </>,
        )
      )}
      <p>{t(`Motion Magic 先用上限的 ${PROFILE_SAFETY_FACTOR * 100}%，留電壓給 PID 修正、電池變低也還夠用。`, `Motion Magic starts at ${PROFILE_SAFETY_FACTOR * 100}% of the limit, leaving voltage for PID corrections and enough headroom for a low battery.`)}</p>
    </>
  )
}

function WhyPid({ m, ff, kP }: LessonCtx) {
  const data = useMemo(() => {
    const plant = plantFromMechanism(m, ff, { realistic: false })
    const start = m.travel / 2
    const base = { kS: 0, kG: ff.kG * 0.8, kV: ff.kV, kA: ff.kA, kI: 0, kD: 0 }
    const run = (kPv: number) =>
      simulate({
        plant,
        gains: { ...base, kP: kPv },
        motionMagic: { cruiseVelocity: 1, acceleration: 1 },
        controlPeriod: 0.001,
        initialPosition: start,
        moves: [],
        duration: 1.5,
      })
    const a = run(0)
    const b = run(kP)
    const step = 5
    const n = Math.ceil(a.t.length / step)
    const tt = new Float64Array(n)
    const pa = new Float64Array(n)
    const pb = new Float64Array(n)
    const ref = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      tt[i] = a.t[i * step]
      pa[i] = (a.pos[i * step] - start) * 100
      pb[i] = (b.pos[i * step] - start) * 100
      ref[i] = 0
    }
    const series: ChartSeries[] = [
      { label: t('目標', 'Target'), color: '--steel', dash: true, values: ref },
      { label: t('只有前饋', 'Feedforward only'), color: '--amber', values: pa },
      { label: t(`前饋 + kP ${f(kP, 0)}`, `Feedforward + kP ${f(kP, 0)}`), color: '--blue', values: pb },
    ]
    return { t: tt, series, err: (b.pos[b.pos.length - 1] - start) * 100 }
  }, [m, ff, kP])

  return (
    <>
      {t(
        <>
        <p>
          前饋是<b>預測</b>：質量量錯、摩擦沒算、電池沒電，預測就會偏。PID 看的是<b>誤差</b>，負責把預測不準的部分修回來。
        </p>
        <p>下圖假設 kG 算小了 20%，電梯停在行程中間。只有前饋時一路往下掉；加上 kP 後會停住，但停在比目標低一點的地方：</p>
        </>,
        <>
          <p>
          Feedforward is a <b>prediction</b>: a mismeasured mass, uncounted friction or a drained battery throws it off. PID looks at the <b>error</b> and pulls back whatever the prediction got wrong.
          </p>
          <p>The chart below assumes kG came out 20% too small, with the elevator stopped mid-travel. With feedforward only it keeps sliding down; with kP it stops, but a little below the target:</p>
        </>,
      )}
      <Chart x={data.t} series={data.series} height={200} yLabel={t('相對目標（cm）', 'Relative to target (cm)')} />
      {t(
        <>
        <p style={{ marginTop: 10 }}>
          最後差 <b>{f(data.err, 2)} cm</b>：kP 要有誤差才會出力，缺的 0.2·kG 伏特要靠誤差 × kP 補上。這就是為什麼<b>不要一直加 kP 或用 kI 硬補</b>，
          而是把 kG 調準。kI 配 Motion Magic 還容易積分飽和，所以預設 0。
        </p>
        </>,
        <>
          <p style={{ marginTop: 10 }}>
          It ends up <b>{f(data.err, 2)} cm</b> off: kP only pushes when there’s error, so the missing 0.2·kG volts has to come from error × kP. That’s why you <b>don’t keep raising kP or force it with kI</b>{' '}
          but fix kG instead. kI with Motion Magic also winds up easily, so it defaults to 0.
          </p>
        </>,
      )}
      <PidVsFf m={m} ff={ff} kP={kP} />
      <KiCompare m={m} ff={ff} kP={kP} />
    </>
  )
}

export interface CompareCase {
  label: string
  color: string
  gains: Slot0Gains
  batteryVoltage?: number
  antiWindup?: AntiWindup
}

/** 同一台電梯（真實模型、摩擦 0.15 V）跑同一個移動，比較不同參數：給教學關卡畫圖用 */
export function compareMoves(m: ElevatorMechanism, ff: FeedforwardResult, cases: CompareCase[]) {
  const low = m.travel * 0.1
  const high = m.travel * 0.75
  // 模擬到軌跡走完再多 1.5 s，讓每一組都有時間穩定（行程長、速度慢的電梯也一樣）
  const profileTime = trapezoidTime(high - low, ff.cruiseVelocity, ff.acceleration)
  const duration = 0.3 + (Number.isFinite(profileTime) ? profileTime : 5) + 1.5
  const runs = cases.map((c) =>
    simulate({
      plant: plantFromMechanism(m, ff, { realistic: true, frictionKs: 0.15, batteryVoltage: c.batteryVoltage ?? 12.5 }),
      gains: c.gains,
      motionMagic: { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration },
      controlPeriod: 0.001,
      initialPosition: low,
      moves: [{ time: 0.3, goal: high }],
      duration,
      antiWindup: c.antiWindup,
    }),
  )
  const step = 5
  const n = Math.ceil(runs[0].t.length / step)
  const tt = Float64Array.from({ length: n }, (_, i) => runs[0].t[i * step])
  const series: ChartSeries[] = [
    { label: t('目標（軌跡）', 'Target (profile)'), color: '--steel', dash: true, values: Float64Array.from({ length: n }, (_, i) => runs[0].refPos[i * step]) },
    ...runs.map((r, k) => ({ label: cases[k].label, color: cases[k].color, values: Float64Array.from({ length: n }, (_, i) => r.pos[i * step]) })),
  ]
  return { t: tt, series, metrics: runs.map((r) => r.moves[0]) }
}

function CompareTable({ labels, metrics }: { labels: string[]; metrics: ReturnType<typeof compareMoves>['metrics'] }) {
  const cm = (v: number) => `${(v * 100).toFixed(1)} cm`
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tbl" style={{ margin: '8px 0 12px' }}>
        <thead>
          <tr>
            <th>{t('設定', 'Setup')}</th>
            <th className="num">{t('最大跟隨誤差', 'Max following error')}</th>
            <th className="num">{t('超調', 'Overshoot')}</th>
            <th className="num">{t('最後差多少', 'Final error')}</th>
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l}>
              <td>{l}</td>
              <td className="num">{cm(metrics[i].maxFollowingError)}</td>
              <td className="num">{cm(metrics[i].overshoot)}</td>
              <td className="num">{cm(metrics[i].steadyStateError)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 純 PID vs 前饋 + PID */
export function pidVsFfCases(ff: FeedforwardResult, kP: number): CompareCase[] {
  const noFf = { kS: 0, kG: 0, kV: 0, kA: 0, kI: 0, kD: 0 }
  return [
    { label: t(`只有 PID（kP ${Math.round(kP)}）`, `PID only (kP ${Math.round(kP)})`), color: '--amber', gains: { ...noFf, kP } },
    { label: t(`只有 PID，kP 加到 ${Math.round(kP * 4)}`, `PID only, kP raised to ${Math.round(kP * 4)}`), color: '--violet', gains: { ...noFf, kP: kP * 4 } },
    { label: t(`前饋 + PID（kP ${Math.round(kP)}）`, `Feedforward + PID (kP ${Math.round(kP)})`), color: '--blue', gains: { kS: 0.15, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP, kI: 0, kD: 0 } },
  ]
}

/** kG 少 20% 時：只有 kP、加 kI、加 kI 但電池低（積分飽和）、把 kG 修好 */
export function kiCases(ff: FeedforwardResult, kP: number): CompareCase[] {
  const base = { kS: 0.15, kG: ff.kG * 0.8, kV: ff.kV, kA: ff.kA, kP, kI: 0, kD: 0 }
  return [
    { label: t('kG 少 20%，只有 kP', 'kG 20% low, kP only'), color: '--amber', gains: base },
    { label: t('kG 少 20%，加 kI 300', 'kG 20% low, add kI 300'), color: '--violet', gains: { ...base, kI: 300 } },
    { label: t('kG 少 20%，加 kI 300，電池 9 V', 'kG 20% low, add kI 300, battery 9 V'), color: '--ink', gains: { ...base, kI: 300 }, batteryVoltage: 9 },
    { label: t('同上，加積分防飽和（飽和時停止積分）', 'Same, with anti-windup (stop integrating when saturated)'), color: '--green', gains: { ...base, kI: 300 }, batteryVoltage: 9, antiWindup: { mode: 'clamp' } },
    { label: t('把 kG 修好，只有 kP', 'kG fixed, kP only'), color: '--blue', gains: { ...base, kG: ff.kG } },
  ]
}

function PidVsFf({ m, ff, kP }: LessonCtx) {
  const cases = useMemo(() => pidVsFfCases(ff, kP), [ff, kP])
  const data = useMemo(() => compareMoves(m, ff, cases), [m, ff, cases])
  return (
    <>
      <h3>{t('純 PID vs 前饋 + PID', 'PID only vs feedforward + PID')}</h3>
      <p>
        {t(
          <>
          同一台電梯從行程 10% 移到 75%。只有 PID 時，控制器要先看到誤差才會出力，所以一路落後；停下來時還要靠誤差撐住重力。
          把 kP 加大，落後少一點，但永遠補不完，而且 kP 太大時一有延遲就會抖（3F 情境「kP 太大」）。垂直的機構，重力一直都在，這就是 WPILib 文件一直強調「只靠回授對垂直機構很差」的原因。
          </>,
          <>
            The same elevator moves from 10% to 75% of travel. With PID only, the controller has to see an error before it pushes, so it lags the whole way; once stopped it still needs error to hold up against gravity.{' '}
            Raising kP lags less but never fully catches up, and with kP too big any delay makes it jitter (3F scenario “kP too big”). On a vertical mechanism gravity is always there, which is why the WPILib docs keep stressing that feedback alone is poor for vertical mechanisms.
          </>,
        )}
      </p>
      <Chart x={data.t} series={data.series} height={220} yLabel={t('位置（m）', 'Position (m)')} />
      <CompareTable labels={cases.map((c) => c.label)} metrics={data.metrics} />
    </>
  )
}

function KiCompare({ m, ff, kP }: LessonCtx) {
  const cases = useMemo(() => kiCases(ff, kP), [ff, kP])
  const data = useMemo(() => compareMoves(m, ff, cases), [m, ff, cases])
  return (
    <>
      <h3>{t('為什麼 kI 通常不需要，什麼時候才加', 'Why kI usually isn’t needed, and when to add it')}</h3>
      <p>
        {t(
          <>
          kG 少了 20%。只有 kP 時停得比目標低；加上 kI，平常看起來會慢慢補回去；但只要輸出頂到上限（下圖電池只剩 9 V），誤差一直累積在積分裡，
          追上軌跡時放不掉，就衝過頭（積分飽和，windup）。加上積分防飽和（輸出頂到上限時停止積分）可以壓住超調；但最好的做法還是把 kG 修好，
          只用 kP 就停得準，也不怕電池低。3F 情境「積分防飽和」可以比較四種做法。
          </>,
          <>
            kG is 20% low. With kP only it stops below the target; adding kI normally looks like it slowly makes it up. But as soon as the output hits its limit (the battery is down to 9 V below), the error keeps piling up in the integral,{' '}
            and when it catches up with the profile it can’t let go, so it overshoots (integral windup). Anti-windup (stop integrating while the output is at its limit) keeps the overshoot down, but the best fix is still to correct kG:{' '}
            then kP alone stops accurately, even on a low battery. The 3F scenario “Anti-windup” compares four approaches.
          </>,
        )}
      </p>
      <Chart x={data.t} series={data.series} height={220} yLabel={t('位置（m）', 'Position (m)')} />
      <CompareTable labels={cases.map((c) => c.label)} metrics={data.metrics} />
      <ul className="small">
        {t(
          <>
          <li>
            <b>先不要加 kI</b>：穩態誤差幾乎都是 kG 不準（修 kG）或摩擦卡住（kS）。前饋準了，kP 就夠。
          </li>
          <li>
            <b>什麼時候才考慮</b>：kG、kS 都照 2F 調好，停下來還是穩定差一點點（例如負載一直在變），而且確定不會長時間頂到輸出上限。這時加很小的 kI，
            並限制積分的範圍（roboRIO 的 WPILib PIDController 用 setIZone、setIntegratorRange）。
          </li>
          <li>夾不夾遊戲物件差很多時，與其靠 kI，不如換一組 kG（用 Slot 或程式判斷有沒有夾東西）。</li>
          </>,
          <>
            <li>
            <b>Don’t add kI first</b>: steady-state error is almost always a wrong kG (fix kG) or friction sticking (kS). With good feedforward, kP is enough.
            </li>
            <li>
            <b>When to consider it</b>: kG and kS are both tuned per 2F, it still settles consistently a little off (say the load keeps changing), and you’re sure it won’t sit at the output limit for long. Then add a very small kI{' '}
            and limit the integral range (with WPILib’s PIDController on the roboRIO, use setIZone and setIntegratorRange).
            </li>
            <li>When holding a game piece or not makes a big difference, rather than relying on kI, switch to a different kG (use a Slot, or check in code whether something is held).</li>
          </>,
        )}
      </ul>
    </>
  )
}

function PidStart({ m, ff, kP }: LessonCtx) {
  return (
    <>
      <p>{t('入門版的 kP 從一個直覺問題開始：「電梯差 1 公分時，我願意多給幾伏特？」', 'The beginner kP starts from a gut question: “When the elevator is 1 cm off, how many extra volts am I willing to give?”')}</p>
      <div className="formula">
        {t(
          `kP = (伏特 / 公分) × 100 = ${f(kP, 1)} V/m
差 1 cm → ${f(kP / 100, 2)} V，差 5 cm → ${f(kP / 20, 2)} V`,
          `kP = (volts / cm) × 100 = ${f(kP, 1)} V/m
1 cm off → ${f(kP / 100, 2)} V, 5 cm off → ${f(kP / 20, 2)} V`,
        )}
      </div>
      <ul>
        {t(
          <>
          <li>
            太小：到位很慢、停下來差一點點。太大：到位後抖、甚至振盪。先從 0.3–1 V/cm 開始，上機時一次改一個。
          </li>
          <li>
            kD 先填 0。到位後會來回晃時才加，kD 對應「速度差 1 m/s 給幾伏特」。
          </li>
          <li>kI 填 0。穩態誤差交給 kG；摩擦上下不對稱時用 Slot 切換，不靠 kI。</li>
          <li>
            Motion Magic 巡航速度 {f(ff.cruiseVelocity, 2)} m/s、加速度 {f(ff.acceleration, 1)} m/s²（上限的 {PROFILE_SAFETY_FACTOR * 100}%）。
            第一次上機再從 25% 開始往上加。
          </li>
          </>,
          <>
            <li>
            Too small: slow to arrive and stops a little short. Too big: jitters or even oscillates after arriving. Start at 0.3–1 V/cm and change one thing at a time on the robot.
            </li>
            <li>
            Start kD at 0. Add it only if it swings back and forth after arriving; kD is “volts per 1 m/s of velocity error”.
            </li>
            <li>Set kI to 0. kG handles steady-state error; if friction differs up and down, switch Slots instead of using kI.</li>
            <li>
            Motion Magic cruise velocity {f(ff.cruiseVelocity, 2)} m/s, acceleration {f(ff.acceleration, 1)} m/s² ({PROFILE_SAFETY_FACTOR * 100}% of the limit).{' '}
            The first time on the robot, start from 25% and work up.
            </li>
          </>,
        )}
      </ul>
      <p className="small muted">
        {t(
          <>
          參數卡右邊的灰字是 Phoenix 6 的轉數制數值（SensorToMechanismRatio = {f(m.gearRatio, 2)}，1 圈 = 2πr = {f(2 * Math.PI * m.drumRadius, 4)} m）。kS、kG
          是伏特不用換；kV、kA、kP、kD 乘上 2πr。
          </>,
          <>
            The gray text on the right of the parameter card is the Phoenix 6 rotation-based value (SensorToMechanismRatio = {f(m.gearRatio, 2)}, 1 rotation = 2πr = {f(2 * Math.PI * m.drumRadius, 4)} m). kS and kG{' '}
            are volts and don’t change; multiply kV, kA, kP and kD by 2πr.
          </>,
        )}
      </p>
    </>
  )
}

export const LESSONS: Lesson[] = [
  {
    id: 'physics',
    title: t('電梯的物理', 'Elevator physics'),
    sub: t('重力、慣性、摩擦各要多少力，怎麼透過鼓輪和齒比換算成扭矩', 'How much force gravity, inertia and friction each need, and how the drum and gear ratio turn it into torque'),
    goal: t('能說出電梯要克服的三種力，並算出串級式的重力與慣性等效質量。', 'Name the three forces an elevator has to overcome, and compute a cascade’s gravity and inertia equivalent masses.'),
    Body: Physics,
    quiz: {
      question: t('串級式電梯：第 1 級 6 kg（速度比 1）、第 2 級 4 kg（速度比 2），沒有負載。重力等效質量 m_G 是多少？', 'Cascade elevator: stage 1 is 6 kg (speed ratio 1), stage 2 is 4 kg (speed ratio 2), no payload. What is the gravity equivalent mass m_G?'),
      options: ['10 kg', '14 kg', '22 kg'],
      answer: 1,
      explain: t('m_G = 6×1 + 4×2 = 14 kg。慣性等效質量才用平方：6×1 + 4×4 = 22 kg。', 'm_G = 6×1 + 4×2 = 14 kg. Only the inertia equivalent mass uses the square: 6×1 + 4×4 = 22 kg.'),
      hints: [t('直接相加是 10 kg，但第 2 級跑得比鼓輪快，要換算。', 'Adding them gives 10 kg, but stage 2 moves faster than the drum, so it has to be converted.'), t('重力等效質量用速度比的「一次方」。', 'The gravity equivalent mass uses the speed ratio to the first power.'), '6 × 1 + 4 × 2 = ?'],
    },
  },
  {
    id: 'motor',
    title: t('馬達模型', 'Motor model'),
    sub: t('V = I·R + ω/Kv，τ = kT·I', 'V = I·R + ω/Kv, τ = kT·I'),
    goal: t('知道電壓分成「推電流」和「抵銷反電動勢」兩部分，以及轉速越高能出的扭矩越小。', 'Know that voltage splits into “pushing current” and “cancelling back-EMF”, and that the faster it spins the less torque it can make.'),
    Body: Motor,
    quiz: {
      question: t('馬達已經轉得很快時，同樣給 12 V，能產生的扭矩會？', 'When the motor is already spinning fast, with the same 12 V, the torque it can produce…'),
      options: [t('變大', 'goes up'), t('不變', 'stays the same'), t('變小', 'goes down')],
      answer: 2,
      explain: t('反電動勢 ω/Kv 變大，留給 I·R 的電壓變少，電流變小，扭矩 kT·I 也變小。', 'Back-EMF ω/Kv grows, leaving less voltage for I·R, so the current drops and so does the torque kT·I.'),
      hints: [t('扭矩只跟電流有關：τ = kT · I。', 'Torque depends only on current: τ = kT · I.'), t('V = I·R + ω/Kv。ω 變大時，I 會怎樣？', 'V = I·R + ω/Kv. When ω grows, what happens to I?'), t('V 固定、ω/Kv 變大，I·R 就要變小。', 'With V fixed and ω/Kv growing, I·R has to shrink.')],
    },
  },
  {
    id: 'derive',
    title: t('前饋推導', 'Deriving feedforward'),
    sub: t('kG、kV、kA 的公式，以及等效質量為什麼要加權', 'The formulas for kG, kV, kA, and why the equivalent masses are weighted'),
    goal: t('能從機構資料算出 kG、kV、kA，並說出齒比改變時它們怎麼變。', 'Compute kG, kV and kA from mechanism data, and say how they change when the gear ratio changes.'),
    Body: Derive,
    quiz: {
      question: t('其他都不變，齒比從 5:1 改成 10:1，kG 和 kV 會怎麼變？', 'With everything else the same, the gear ratio goes from 5:1 to 10:1. How do kG and kV change?'),
      options: [t('kG 減半、kV 變兩倍', 'kG halves, kV doubles'), t('kG 變兩倍、kV 減半', 'kG doubles, kV halves'), t('兩個都不變', 'Neither changes')],
      answer: 0,
      explain: t('kG 公式裡 G 在分母（齒比大，撐住同樣重量要的扭矩小），kV 裡 G 在分子（同樣線速度馬達要轉更快）。', 'In kG, G is in the denominator (a bigger ratio needs less torque to hold the same weight); in kV, G is in the numerator (the motor spins faster for the same linear speed).'),
      hints: [t('看公式裡 G 在分子還是分母。', 'Check whether G is in the numerator or denominator.'), t('kG = (m_G·g)·r/G·R/(n·kT)，kV = G/(r·Kv)。', 'kG = (m_G·g)·r/G·R/(n·kT), kV = G/(r·Kv).'), t('kG 裡 G 在分母，kV 裡 G 在分子。', 'kG has G in the denominator, kV in the numerator.')],
    },
  },
  {
    id: 'whyPid',
    title: t('為什麼還需要 PID', 'Why you still need PID'),
    sub: t('前饋負責預測，PID 修正預測不準的部分', 'Feedforward predicts; PID corrects what the prediction gets wrong'),
    goal: t('能解釋前饋與回授的分工，以及為什麼穩態誤差要修 kG 而不是加 kP 或 kI。', 'Explain how feedforward and feedback split the work, and why steady-state error should be fixed with kG rather than more kP or kI.'),
    Body: WhyPid,
    quiz: {
      question: t('只有前饋（kP = 0），kG 比實際需要的小 20%，電梯停在半空時會？', 'With feedforward only (kP = 0) and kG 20% smaller than needed, what happens when the elevator stops mid-air?'),
      options: [t('維持不動', 'It stays put'), t('慢慢往下掉', 'It slowly slides down'), t('往上衝', 'It shoots up')],
      answer: 1,
      explain: t('重力比 kG 大，淨力往下，沒有回授把它拉回來，所以會一直往下掉到底。', 'Gravity is bigger than kG, so the net force is down and there’s no feedback to pull it back: it keeps sliding to the bottom.'),
      hints: [t('停著的時候參考速度和加速度都是 0，前饋只剩 kG。', 'When stopped, the reference velocity and acceleration are 0, so feedforward is just kG.'), t('kG 小了，撐不住重力。', 'kG is too small to hold up gravity.'), t('力往下又沒有 PID 修正……', 'The force is down and there’s no PID to correct it…')],
    },
  },
  {
    id: 'pidStart',
    title: t('PID 起始值', 'Starting PID values'),
    sub: t('從「誤差多少給多少伏特」估 kP', 'Estimate kP from “how many volts for how much error”'),
    goal: t('能把「每公分幾伏特」換成 kP，並知道 kI、kD 起始為什麼是 0。', 'Turn “volts per centimeter” into kP, and know why kI and kD start at 0.'),
    Body: PidStart,
    quiz: {
      question: t('kP = 50 V/m，電梯差目標 2 cm 時，P 項輸出多少伏特？', 'kP = 50 V/m and the elevator is 2 cm from the target. How many volts does the P term output?'),
      options: ['0.5 V', '1 V', '100 V'],
      answer: 1,
      explain: t('50 V/m × 0.02 m = 1 V。', '50 V/m × 0.02 m = 1 V.'),
      hints: [t('kP 的單位是 V/m，誤差要換成公尺。', 'kP is in V/m, so convert the error to meters.'), t('2 cm = 0.02 m。', '2 cm = 0.02 m.'), '50 × 0.02 = ?'],
    },
  },
]

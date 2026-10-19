import type { ReactNode } from 'react'
import type { QuizDef } from '../../components/Quiz'
import { dipFraction, exitRadius, exitSpeed, rangeAtWheel, turretDeg, type FlywheelFeedforward, type FlywheelMechanism, type ShotPlan } from '../../core/flywheel/flywheel'
import { t } from '../../core/lang'

/** 射球飛輪 1F 教學關卡：每關用你的機構算，最後一題檢核題 */

export interface FlywheelLessonCtx {
  m: FlywheelMechanism
  ff: FlywheelFeedforward
  plan: ShotPlan
}

export interface FlywheelLesson {
  id: string
  title: string
  sub: string
  goal: string
  Body: (p: FlywheelLessonCtx) => ReactNode
  quiz: QuizDef
}

const TAU = 2 * Math.PI
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export const FLYWHEEL_LESSONS: FlywheelLesson[] = [
  {
    id: 'fw-kv',
    title: t('1. kV：轉多快就要多少電壓', '1. kV: how many volts for how fast'),
    sub: t('飛輪最重要的參數', 'The most important flywheel gain'),
    goal: t('知道 kV 怎麼算、為什麼飛輪幾乎只靠前饋', 'Know how kV is calculated and why a flywheel runs almost entirely on feedforward'),
    Body: ({ m, ff, plan }) => (
      <>
        {t(
          <>
          <p>
            馬達轉起來會產生反電動勢，轉越快、擋掉的電壓越多。要讓飛輪穩定轉在某個轉速，就要給剛好抵銷反電動勢的電壓，這個比例就是 kV：
          </p>
          <p className="mono">kV = 12 V ÷ 最高轉速 = 齒比 ÷ 馬達 Kv</p>
          <p>
            你的機構：最高約 {f(ff.freeSpeed / TAU, 1)} rps（{m.gearRatio} : 1），所以 kV ≈ <b>{f(ff.kV * TAU, 4)} V/rps</b>。目標 {f(plan.target / TAU, 0)} rps 要 {f(ff.kV * plan.target, 2)} V，再加上抵銷摩擦的 kS。
          </p>
          <p>
            飛輪沒有重力、不用停在某個位置，穩定轉的時候只要這個電壓。kV 對了，不用回授就幾乎到速；回授（kP）只負責補球帶走的轉速。
          </p>
          </>,
          <>
            <p>
            A spinning motor makes back-EMF: the faster it turns, the more voltage it cancels. To hold the flywheel at a speed, you give it just enough voltage to cancel the back-EMF. That ratio is kV:
            </p>
            <p className="mono">kV = 12 V ÷ top speed = gear ratio ÷ motor Kv</p>
            <p>
            Your mechanism: top speed about {f(ff.freeSpeed / TAU, 1)} rps ({m.gearRatio} : 1), so kV ≈ <b>{f(ff.kV * TAU, 4)} V/rps</b>. A target of {f(plan.target / TAU, 0)} rps needs {f(ff.kV * plan.target, 2)} V, plus kS to cancel friction.
            </p>
            <p>
            A flywheel has no gravity and doesn’t hold a position, so at steady speed this voltage is all it needs. With kV right it gets almost to speed without feedback; feedback (kP) only makes up the speed each ball takes away.
            </p>
          </>,
        )}
      </>
    ),
    quiz: {
      question: t('Kraken X60 直接接飛輪（1 : 1），最高轉速約 100 rps。kV 大約多少？', 'A Kraken X60 drives the flywheel directly (1 : 1) with a top speed of about 100 rps. Roughly what is kV?'),
      options: ['0.012 V/rps', '0.12 V/rps', '1.2 V/rps', '12 V/rps'],
      answer: 1,
      explain: t('12 V ÷ 100 rps = 0.12 V/rps。要轉 50 rps 就要大約 6 V（加上 kS）。', '12 V ÷ 100 rps = 0.12 V/rps. Spinning at 50 rps needs about 6 V (plus kS).'),
      hints: [t('kV 是「每 1 rps 要幾伏特」。', 'kV is “volts per 1 rps”.'), t('12 V 時轉最快，所以 kV = 12 ÷ 最高轉速。', 'At 12 V it spins fastest, so kV = 12 ÷ top speed.'), '12 ÷ 100 = ?'],
    },
  },
  {
    id: 'fw-inertia',
    title: t('2. 轉動慣量：射一發掉多少', '2. Moment of inertia: how much one shot costs'),
    sub: t('飛輪重一點、重量放外圈', 'A heavier wheel, with the weight on the rim'),
    goal: t('會估一發大概掉多少轉速，知道怎麼讓它掉少一點', 'Estimate how much speed one shot costs, and know how to make it drop less'),
    Body: ({ m, ff, plan }) => {
      const frac = dipFraction(m, plan.ballMass)
      return (
        <>
          {t(
            <>
            <p>
              轉動慣量 J = 形狀 × 質量 × 半徑²。實心圓盤形狀是 0.5，重量都在外圈的薄環接近 1。你的飛輪 J = {(ff.J * 1e4).toFixed(2)} kg·cm²。
            </p>
            <p>
              球被輪子帶出去時會帶走角動量。球只碰輪子 30 ms，馬達來不及補，所以一發大約掉：
            </p>
            <p className="mono">掉的比例 ≈ 球質量 × 0.5 ÷ (形狀 × 飛輪質量)</p>
            {m.back === 'rollers' ? (
              <p>
                你的機構對面也有滾輪：球被兩邊一起推，帶走的角動量比較多，對面滾輪的慣量也會幫忙撐住，算出來一發約掉 <b>{f(frac * 100, 1)}%</b>，目標 {f(plan.target / TAU, 0)} rps 會掉約 {f((frac * plan.target) / TAU, 1)} rps。上面的式子是只有固定導板時的版本。
              </p>
            ) : (
              <p>
                你的機構：{plan.ballMass} × 0.5 ÷ ({m.shape} × {m.wheelMass}) ≈ <b>{f(frac * 100, 1)}%</b>，目標 {f(plan.target / TAU, 0)} rps 會掉約 {f((frac * plan.target) / TAU, 1)} rps。跟轉速、半徑都無關。
              </p>
            )}
            <p>想掉少一點：飛輪重一點，或把重量放到外圈。代價是到速比較慢，要更多電流。</p>
            </>,
            <>
              <p>
              Moment of inertia J = shape × mass × radius². A solid disk has shape 0.5; a thin ring with all its weight on the rim is close to 1. Your flywheel’s J = {(ff.J * 1e4).toFixed(2)} kg·cm².
              </p>
              <p>
              When the wheel throws a ball out, the ball carries away angular momentum. The ball only touches the wheel for about 30 ms, too short for the motor to make it up, so each shot drops roughly:
              </p>
              <p className="mono">drop fraction ≈ ball mass × 0.5 ÷ (shape × flywheel mass)</p>
              {m.back === 'rollers' ? (
              <p>
              Your mechanism also has rollers on the other side: the ball is pushed from both sides and carries away more angular momentum, but the rollers’ inertia also helps hold speed. That works out to about <b>{f(frac * 100, 1)}%</b> per shot, so a target of {f(plan.target / TAU, 0)} rps drops about {f((frac * plan.target) / TAU, 1)} rps. The formula above is the version for a fixed hood only.
              </p>
              ) : (
              <p>
              Your mechanism: {plan.ballMass} × 0.5 ÷ ({m.shape} × {m.wheelMass}) ≈ <b>{f(frac * 100, 1)}%</b>, so a target of {f(plan.target / TAU, 0)} rps drops about {f((frac * plan.target) / TAU, 1)} rps. It doesn’t depend on speed or radius.
              </p>
              )}
              <p>To drop less: make the flywheel heavier or move the weight to the rim. The cost is slower spin-up and more current.</p>
            </>,
          )}
        </>
      )
    },
    quiz: {
      question: t('飛輪質量一樣，哪一種射一發掉的轉速最少？', 'For the same flywheel mass, which one loses the least speed per shot?'),
      options: [t('實心圓盤', 'Solid disk'), t('重量都在外圈的薄環', 'Thin ring with the weight on the rim'), t('一樣，只跟質量有關', 'Same, it only depends on mass'), t('一樣，只跟轉速有關', 'Same, it only depends on speed')],
      answer: 1,
      explain: t('同樣質量，重量越靠外圈，轉動慣量越大（形狀係數接近 1），同樣被球帶走的角動量，掉的轉速比較少。', 'For the same mass, the farther out the weight is, the bigger the moment of inertia (shape factor close to 1), so the same angular momentum taken by the ball costs less speed.'),
      hints: [t('看轉動慣量 J = 形狀 × 質量 × 半徑²。', 'Look at moment of inertia J = shape × mass × radius².'), t('形狀係數：實心圓盤 0.5、薄環接近 1。', 'Shape factor: solid disk 0.5, thin ring close to 1.'), t('J 越大，掉得越少。', 'The bigger J, the smaller the drop.')],
    },
  },
  {
    id: 'fw-range',
    title: t('3. 轉速 → 球速 → 落點', '3. Wheel speed → ball speed → landing point'),
    sub: t('為什麼掉速球就射不準', 'Why a speed drop makes shots miss'),
    goal: t('會從轉速算球速和射程，知道轉速差一點落點差多少', 'Compute ball speed and range from wheel speed, and know how far the landing point moves when the speed is a little off'),
    Body: ({ m, plan }) => {
      const v = exitSpeed(plan.target, exitRadius(m))
      const r = rangeAtWheel(plan.target, exitRadius(m), plan)
      const r95 = rangeAtWheel(plan.target * 0.95, exitRadius(m), plan)
      return (
        <>
          {t(
            <>
            <p>
              輪緣速度 = 轉速 × 2π × 半徑。單邊飛輪（另一邊是固定的導板）球大約只拿到一半：
            </p>
            <p className="mono">球速 ≈ 0.5 × 轉速 [rps] × 2π × 半徑</p>
            <p>
              對面也有滾輪的話，球兩邊都被推，球速 ≈ 0.5 ×（大輪輪緣速度 + 對面輪緣速度）。
            </p>
            <p>
              你的機構：
              {m.back === 'rollers'
                ? `0.5 × ${f(plan.target / TAU, 0)} rps × 2π × (${f(m.wheelRadius, 4)} + ${f(m.backRatio, 2)} × ${f(m.backRadius, 4)}) m`
                : `${f(plan.target / TAU, 0)} rps × 2π × ${f(m.wheelRadius, 4)} m × 0.5`}{' '}
              ≈ <b>{f(v, 2)} m/s</b>。砲台角度 {f(turretDeg(plan.angle), 0)}°、離地 {f(plan.height, 2)} m 射出，不計空氣阻力，往下掉經過目標高度 {f(plan.goalHeight, 2)} m 的地方離出射點 <b>{Number.isFinite(r) ? `${f(r, 2)} m` : '（打不到那麼高）'}</b>（目標在 {f(plan.goalDistance, 2)} m）。
            </p>
            <p>
              轉速少 5%，落點變成 {Number.isFinite(r95) ? `${f(r95, 2)} m，近了 ${f((r - r95) * 100, 0)} cm` : '打不到目標高度'}。射程大約跟球速的平方成正比（目標比出射點高的時候差得更多），所以轉速差一點，落點差一截。這就是為什麼要等轉速回來才射下一發。
            </p>
            <p className="small muted">0.5 和不計空氣阻力都是近似，實際的比例要上機量（射幾發量落點）。</p>
            </>,
            <>
              <p>
              Surface speed = wheel speed × 2π × radius. With a single flywheel (a fixed hood on the other side) the ball only gets about half of it:
              </p>
              <p className="mono">ball speed ≈ 0.5 × wheel speed [rps] × 2π × radius</p>
              <p>
              With rollers on the other side too, the ball is pushed from both sides: ball speed ≈ 0.5 × (main wheel surface speed + opposite surface speed).
              </p>
              <p>
              Your mechanism:{' '}
              {m.back === 'rollers'
              ? `0.5 × ${f(plan.target / TAU, 0)} rps × 2π × (${f(m.wheelRadius, 4)} + ${f(m.backRatio, 2)} × ${f(m.backRadius, 4)}) m`
              : `${f(plan.target / TAU, 0)} rps × 2π × ${f(m.wheelRadius, 4)} m × 0.5`}{' '}
              ≈ <b>{f(v, 2)} m/s</b>. Shot at turret angle {f(turretDeg(plan.angle), 0)}° from {f(plan.height, 2)} m up, ignoring air drag, it falls through the target height of {f(plan.goalHeight, 2)} m at <b>{Number.isFinite(r) ? `${f(r, 2)} m` : '(can’t reach that height)'}</b> from the release point (the target is at {f(plan.goalDistance, 2)} m).
              </p>
              <p>
              With 5% less speed the landing point becomes {Number.isFinite(r95) ? `${f(r95, 2)} m, ${f((r - r95) * 100, 0)} cm shorter` : 'unable to reach the target height'}. Range grows roughly with the square of ball speed (even more when the target is higher than the release point), so a small speed error moves the landing point a lot. That’s why you wait for the speed to recover before the next shot.
              </p>
              <p className="small muted">The 0.5 and ignoring air drag are approximations; measure the real ratio on the robot (shoot a few and measure where they land).</p>
            </>,
          )}
        </>
      )
    },
    quiz: {
      question: t('其他條件不變，飛輪轉速掉了 10%，射程大約少多少？', 'With everything else the same, the flywheel speed drops 10%. Roughly how much shorter is the range?'),
      options: ['5%', '10%', '20%', t('不會變', 'Doesn’t change')],
      answer: 2,
      explain: t('球速跟轉速成正比，射程大約跟球速的平方成正比：0.9² ≈ 0.81，少大約 20%。', 'Ball speed is proportional to wheel speed, and range is roughly proportional to the square of ball speed: 0.9² ≈ 0.81, about 20% shorter.'),
      hints: [t('先想球速跟轉速的關係。', 'First think about how ball speed relates to wheel speed.'), t('射程大約跟球速的平方成正比。', 'Range is roughly proportional to the square of ball speed.'), '0.9 × 0.9 = ?'],
    },
  },
]

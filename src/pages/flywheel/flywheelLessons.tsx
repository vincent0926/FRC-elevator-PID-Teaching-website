import type { ReactNode } from 'react'
import type { QuizDef } from '../../components/Quiz'
import { dipFraction, exitRadius, exitSpeed, rangeAtWheel, turretDeg, type FlywheelFeedforward, type FlywheelMechanism, type ShotPlan } from '../../core/flywheel/flywheel'

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
    title: '1. kV：轉多快就要多少電壓',
    sub: '飛輪最重要的參數',
    goal: '知道 kV 怎麼算、為什麼飛輪幾乎只靠前饋',
    Body: ({ m, ff, plan }) => (
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
      </>
    ),
    quiz: {
      question: 'Kraken X60 直接接飛輪（1 : 1），最高轉速約 100 rps。kV 大約多少？',
      options: ['0.012 V/rps', '0.12 V/rps', '1.2 V/rps', '12 V/rps'],
      answer: 1,
      explain: '12 V ÷ 100 rps = 0.12 V/rps。要轉 50 rps 就要大約 6 V（加上 kS）。',
      hints: ['kV 是「每 1 rps 要幾伏特」。', '12 V 時轉最快，所以 kV = 12 ÷ 最高轉速。', '12 ÷ 100 = ?'],
    },
  },
  {
    id: 'fw-inertia',
    title: '2. 轉動慣量：射一發掉多少',
    sub: '飛輪重一點、重量放外圈',
    goal: '會估一發大概掉多少轉速，知道怎麼讓它掉少一點',
    Body: ({ m, ff, plan }) => {
      const frac = dipFraction(m, plan.ballMass)
      return (
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
        </>
      )
    },
    quiz: {
      question: '飛輪質量一樣，哪一種射一發掉的轉速最少？',
      options: ['實心圓盤', '重量都在外圈的薄環', '一樣，只跟質量有關', '一樣，只跟轉速有關'],
      answer: 1,
      explain: '同樣質量，重量越靠外圈，轉動慣量越大（形狀係數接近 1），同樣被球帶走的角動量，掉的轉速比較少。',
      hints: ['看轉動慣量 J = 形狀 × 質量 × 半徑²。', '形狀係數：實心圓盤 0.5、薄環接近 1。', 'J 越大，掉得越少。'],
    },
  },
  {
    id: 'fw-range',
    title: '3. 轉速 → 球速 → 落點',
    sub: '為什麼掉速球就射不準',
    goal: '會從轉速算球速和射程，知道轉速差一點落點差多少',
    Body: ({ m, plan }) => {
      const v = exitSpeed(plan.target, exitRadius(m))
      const r = rangeAtWheel(plan.target, exitRadius(m), plan)
      const r95 = rangeAtWheel(plan.target * 0.95, exitRadius(m), plan)
      return (
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
        </>
      )
    },
    quiz: {
      question: '其他條件不變，飛輪轉速掉了 10%，射程大約少多少？',
      options: ['5%', '10%', '20%', '不會變'],
      answer: 2,
      explain: '球速跟轉速成正比，射程大約跟球速的平方成正比：0.9² ≈ 0.81，少大約 20%。',
      hints: ['先想球速跟轉速的關係。', '射程大約跟球速的平方成正比。', '0.9 × 0.9 = ?'],
    },
  },
]

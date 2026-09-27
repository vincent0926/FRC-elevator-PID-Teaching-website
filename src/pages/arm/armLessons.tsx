import { useMemo, type ReactNode } from 'react'
import { ApproxNote } from '../../components/ApproxNote'
import { Chart, type ChartSeries } from '../../components/Chart'
import { Exercise } from '../../components/Exercise'
import type { QuizDef } from '../../components/Quiz'
import { ARM_PROFILE_SAFETY_FACTOR, type ArmFeedforwardResult } from '../../core/arm/feedforward'
import { plantFromArm } from '../../core/arm/plant'
import type { GravityType } from '../../core/controller/slot0'
import { motorModel } from '../../core/motors'
import { simulate } from '../../core/physics/simulate'
import { DEG, type ArmMechanism } from '../../schema/armParameterSet'

/** 手臂 1F 教學關卡：每關有學習目標、內容（用你的機構算）、檢核題 */

export interface ArmLessonCtx {
  m: ArmMechanism
  ff: ArmFeedforwardResult
  kP: number
  done?: boolean
}

export interface ArmLesson {
  id: string
  title: string
  sub: string
  goal: string
  Body: (p: ArmLessonCtx) => ReactNode
  quiz: QuizDef
}

const f = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—')
const R2D = 180 / Math.PI

function Physics({ m, ff, done }: ArmLessonCtx) {
  return (
    <>
      <p>
        手臂轉動時，重力產生一個想把手臂往下轉的<b>力矩</b>（力 × 力臂）。手臂本身的重量集中在重心，負載在末端，兩個力矩加起來：
      </p>
      <Exercise
        solvedAlready={done}
        prompt={
          <>
            練習手臂：手臂 3 kg、重心離轉軸 0.25 m；末端夾著 1 kg 的東西，離轉軸 0.5 m。手臂<b>水平</b>時，重力對轉軸的力矩是多少？（g = 9.81）
          </>
        }
        fields={[
          {
            label: '水平時的重力力矩',
            answer: 12.26,
            unit: 'N·m',
            tol: 0.02,
            mistakes: [
              { value: 7.36, msg: '只算了手臂本身，負載也有重力，而且力臂最長。' },
              { value: 4.91, msg: '只算了負載。手臂自己的重量也要算（用重心的距離）。' },
              { value: 19.62, msg: '手臂的重量要用重心的距離（0.25 m），不是整支手臂的長度。' },
              { value: 1.25, msg: '這是 kg·m，還要乘上重力加速度 g = 9.81。' },
            ],
          },
        ]}
      >
        <div className="formula">{`τ_g = g × (m_arm × r_cg + m_p × d_p)
    = 9.81 × (3 × 0.25 + 1 × 0.5) = 12.26 N·m（水平時）

你的手臂：9.81 × (${f(m.armMass, 2)} × ${f(m.cgDistance, 3)} + ${f(m.payloadMass, 2)} × ${f(m.payloadDistance, 3)}) = ${f(ff.gravityTorque, 2)} N·m`}</div>
        <p>
          慣性也一樣要看距離，而且是<b>距離的平方</b>：轉動慣量 J = m_arm·(L²/12 + r_cg²) + m_p·d_p²。你的手臂 J = <b>{f(ff.inertia, 3)} kg·m²</b>。
          末端的負載影響特別大：同樣 1 kg，放在 0.6 m 比放在 0.3 m 的慣量大 4 倍。
        </p>
      </Exercise>
    </>
  )
}

function Cosine({ m, ff }: ArmLessonCtx) {
  const angles = [-20, 0, 30, 60, 90, 110].filter((d) => d * DEG >= m.minAngle - 1e-9 && d * DEG <= m.maxAngle + 1e-9)
  return (
    <>
      <p>
        重力永遠往下，但力臂是重心到轉軸的<b>水平</b>距離：手臂水平時最長（cos 0° = 1），越抬越短，直立時重力通過轉軸（cos 90° = 0），過了直立力矩反過來。
      </p>
      <div className="formula">撐住手臂要的電壓 = kG × cos θ（θ = 0° 是水平）</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>角度</th>
              <th className="num">cos θ</th>
              <th className="num">撐住要的電壓</th>
              <th>意思</th>
            </tr>
          </thead>
          <tbody>
            {angles.map((d) => {
              const c = Math.cos(d * DEG)
              return (
                <tr key={d}>
                  <td>{d}°</td>
                  <td className="num">{f(c, 2)}</td>
                  <td className="num">{f(ff.kG * c, 3)} V</td>
                  <td className="small">{d === 0 ? '最吃力' : d === 90 ? '直立，不用出力' : d > 90 ? '過了直立，要往回拉' : d < 0 ? '水平下面，還是往下拉' : '越高越省力'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="small">
        Phoenix 6 把 GravityType 設成 <b>Arm_Cosine</b>，控制器就會自己乘 cos θ。前提是<b>角度 0 一定要是水平</b>：編碼器的 0 設在收起的位置，cos 就算錯了（3F 情境「編碼器零點不在水平」）。
      </p>
    </>
  )
}

function Derive({ m, ff }: ArmLessonCtx) {
  const { R, kT, Kv } = motorModel(m.motor)
  return (
    <>
      <p>
        跟電梯一樣，控制輸入以電壓 [V] 表示。不是說電壓是力矩，而是把馬達的輸入統一寫成電壓，讓電氣模型（V = I·R + ω/Kv）和機械模型（τ = J·α）直接接起來。差別只在「力 × 鼓輪半徑」換成「力矩」：
      </p>
      <div className="formula">{`kG = τ_g / G × R / (n·kT)       水平時撐住手臂的電壓
kV = G / Kv                      每 1 rad/s 要抵的反電動勢
kA = J × R / (G·n·kT)            每 1 rad/s² 要多少電壓

你的手臂（G = ${f(m.gearRatio, 1)}、n = ${m.motorCount}、R = ${f(R, 4)} Ω、kT = ${f(kT, 4)} N·m/A、Kv = ${f(Kv, 1)} rad/s/V）：
kG = ${f(ff.gravityTorque, 2)} / ${f(m.gearRatio, 1)} × ${f(R, 4)} / (${m.motorCount} × ${f(kT, 4)}) = ${f(ff.kG)} V
kV = ${f(m.gearRatio, 1)} / ${f(Kv, 1)} = ${f(ff.kV)} V/(rad/s)
kA = ${f(ff.inertia, 3)} × ${f(R, 4)} / (${f(m.gearRatio, 1)} × ${m.motorCount} × ${f(kT, 4)}) = ${f(ff.kA, 4)} V/(rad/s²)`}</div>
      <ApproxNote
        summary="理論值用簡化的物理算的，上機後 kG、kA 要再量、kS 一定要量。"
        items={[
          '手臂當成均勻的剛體桿子，負載當成末端的一個點；真的夾爪和遊戲物件有大小。',
          '質量、重心是你填的數字：CAD 常常少算螺絲、線材、護板。重心最好實際量。',
          '沒有算摩擦（kS）、齒輪箱效率和背隙；鏈條、皮帶沒有伸長。',
          '馬達用規格表的常數，熱了會變。',
        ]}
      />
      <p>
        最高角速度用最吃力的水平位置算：往上轉時 V = kG + kS + kV·ω，所以 ω = (V − kG − kS) / kV ={' '}
        <b>
          {f(ff.maxVelocity, 2)} rad/s（{f(ff.maxVelocity * R2D, 0)} °/s）
        </b>
        {ff.frictionIncluded ? '（已扣你量到的 kS）' : '。kS 還沒量，這是不含摩擦的理論上限，實際一定比較低'}。Motion Magic 先用上限的 {ARM_PROFILE_SAFETY_FACTOR * 100}%。
      </p>
    </>
  )
}

/** 同一支手臂轉到 80°，控制器用 Arm_Cosine 還是常數 kG */
export function armGravityCompare(m: ArmMechanism, ff: ArmFeedforwardResult, kP: number) {
  const goal = Math.min(m.maxAngle, 80 * DEG)
  const run = (g: GravityType) =>
    simulate({
      plant: plantFromArm(m, ff, { realistic: false }),
      gains: { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP, kI: 0, kD: 0 },
      motionMagic: { cruiseVelocity: Math.max(0.1, ff.cruiseVelocity), acceleration: Math.max(0.1, ff.acceleration) },
      controlPeriod: 0.001,
      initialPosition: Math.max(m.minAngle, 0),
      moves: [{ time: 0.3, goal }],
      duration: 3,
      tolerance: DEG,
      gravityType: g,
    })
  const cos = run('armCosine')
  const con = run('constant')
  const step = 5
  const n = Math.ceil(cos.t.length / step)
  const pick = (a: Float64Array) => Float64Array.from({ length: n }, (_, i) => a[i * step] * R2D)
  const t = Float64Array.from({ length: n }, (_, i) => cos.t[i * step])
  const series: ChartSeries[] = [
    { label: '目標', color: '--steel', dash: true, values: pick(cos.refPos) },
    { label: 'Arm_Cosine（kG·cos θ）', color: '--blue', values: pick(cos.pos) },
    { label: '常數 kG（當成電梯）', color: '--red', values: pick(con.pos) },
  ]
  return { t, series, goal, cos: cos.moves[0], con: con.moves[0] }
}

function WhyCosine({ m, ff, kP }: ArmLessonCtx) {
  const d = useMemo(() => armGravityCompare(m, ff, kP), [m, ff, kP])
  return (
    <>
      <p>
        前饋照物理把電壓先給好，kP 只修一點點誤差。如果控制器不知道要乘 cos θ（把手臂當電梯，給固定的 kG），抬高時 kG 就給太多，多出來的 kG·(1 − cos θ) 只能靠誤差 × kP 抵掉，所以停在目標上面：
      </p>
      <Chart x={d.t} series={d.series} height={200} yLabel="°" />
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>控制器的重力型態</th>
              <th className="num">最大跟隨誤差</th>
              <th className="num">最後差多少</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Arm_Cosine（kG·cos θ）</td>
              <td className="num">{f(d.cos.maxFollowingError * R2D, 2)}°</td>
              <td className="num">{f(d.cos.steadyStateError * R2D, 2)}°</td>
            </tr>
            <tr>
              <td>常數 kG（當成電梯）</td>
              <td className="num">{f(d.con.maxFollowingError * R2D, 2)}°</td>
              <td className="num">{f(d.con.steadyStateError * R2D, 2)}°</td>
            </tr>
          </tbody>
        </table>
      </div>
      {kP > 0 ? (
        <p className="small">
          預估：kG·(1 − cos {f(d.goal * R2D, 0)}°) ÷ kP = {f(ff.kG, 3)} × {f(1 - Math.cos(d.goal), 2)} ÷ {f(kP, 1)} ={' '}
          {f(((ff.kG * (1 - Math.cos(d.goal))) / kP) * R2D, 2)}°，跟模擬差不多。手臂越重（kG 越大）、kP 越小，差越多。
        </p>
      ) : (
        <p className="small">現在 kP 是 0：沒有回授把多出來的 kG 抵掉，常數 kG 的手臂會一直被往上推到撞上限。回 1F 把「誤差 1 度給幾伏特」填大於 0 再看。</p>
      )}
    </>
  )
}

function PidStart({ m, ff, kP }: ArmLessonCtx) {
  return (
    <>
      <p>入門版 kP 從一個直覺問題開始：「手臂差 1 度，我願意多給幾伏特？」</p>
      <div className="formula">{`kP = (伏特 / 度) × (180 / π) = ${f(kP, 1)} V/rad（每度 ${f(kP / R2D, 2)} V）`}</div>
      <ul>
        <li>太小：到位慢、停下來差一點。太大：到位後抖。先從每度 0.2–0.5 V 開始，一次改一個。</li>
        <li>kD 先填 0，到位後會晃再加。kI 填 0：穩態誤差先檢查 kG、零點、負載。</li>
        <li>
          Motion Magic 巡航 {f(ff.cruiseVelocity * R2D, 0)} °/s、加速度 {f(ff.acceleration * R2D, 0)} °/s²（上限的 {ARM_PROFILE_SAFETY_FACTOR * 100}%）。第一次上機再從 25% 開始。
        </li>
        <li>手臂慣量小、齒比大，同樣的 kP 比電梯容易抖；感測器延遲的影響也比較明顯。</li>
      </ul>
      <p className="small muted">角度範圍 {f(m.minAngle * R2D, 0)}°～{f(m.maxAngle * R2D, 0)}°：軟體限位設在這個範圍內側，撞硬擋前就停。</p>
    </>
  )
}

export const ARM_LESSONS: ArmLesson[] = [
  {
    id: 'arm-physics',
    title: '手臂的物理',
    sub: '重力力矩、轉動慣量：距離比質量更重要',
    goal: '能算出手臂水平時的重力力矩和轉動慣量，知道末端負載影響為什麼特別大。',
    Body: Physics,
    quiz: {
      question: '同一個 1 kg 的遊戲物件，從離轉軸 0.3 m 移到 0.6 m，轉動慣量的貢獻變成幾倍？',
      options: ['2 倍', '4 倍', '一樣'],
      answer: 1,
      explain: '慣量是 m·d²：距離 2 倍，慣量 4 倍。重力力矩是 m·g·d，只有 2 倍。',
      hints: ['慣量跟距離的關係不是一次方。', 'J = m × d²。', '(0.6 / 0.3)² = ?'],
    },
  },
  {
    id: 'arm-cosine',
    title: '為什麼是 cos θ',
    sub: '重力的力臂跟角度有關；角度 0 一定要是水平',
    goal: '知道撐住手臂要的電壓是 kG·cos θ，說得出水平、直立、過直立三種情況。',
    Body: Cosine,
    quiz: {
      question: '手臂直立（90°）停住時，重力前饋要給多少？',
      options: ['kG', '0', '−kG'],
      answer: 1,
      explain: '直立時重力通過轉軸，力臂是 0，cos 90° = 0，不用出力。過了直立才要往回拉（變負的）。',
      hints: ['力矩 = 力 × 力臂。', '直立時重心在轉軸正上方，水平距離是多少？', 'cos 90° = ?'],
    },
  },
  {
    id: 'arm-derive',
    title: '前饋推導',
    sub: 'kG、kV、kA 從力矩和轉動慣量來',
    goal: '能從機構資料算出手臂的 kG、kV、kA，說出齒比改變時它們怎麼變。',
    Body: Derive,
    quiz: {
      question: '齒比從 60:1 改成 120:1，kG 和 kV 會怎樣？',
      options: ['kG 變一半、kV 變兩倍', 'kG 變兩倍、kV 變一半', '兩個都不變'],
      answer: 0,
      explain: 'kG ∝ 1/G：齒比大，馬達撐住同樣力矩要的電流變少。kV ∝ G：手臂轉一樣快時馬達轉更快，反電動勢變大。',
      hints: ['看公式裡 G 在分子還是分母。', 'kG = τ/G × R/(n·kT)；kV = G/Kv。', 'G 變兩倍：kG ÷ 2、kV × 2。'],
    },
  },
  {
    id: 'arm-why-cos',
    title: '把手臂當電梯會怎樣',
    sub: 'GravityType = Arm_Cosine 跟常數 kG 的差別（模擬）',
    goal: '看出重力型態設錯時手臂停在哪裡，知道誤差大約是 kG·(1 − cos θ)/kP。',
    Body: WhyCosine,
    quiz: {
      question: '控制器用常數 kG（沒乘 cos），手臂轉到 80° 停住，會停在？',
      options: ['目標下面', '目標上面', '剛好在目標'],
      answer: 1,
      explain: '80° 時真正需要的是 kG·cos 80°，但控制器給了整個 kG，多出來的電壓把手臂往上推，要靠「誤差 × kP」往回抵，所以停在目標上面。',
      hints: ['比較控制器給的和真正需要的重力電壓。', 'kG 跟 kG·cos 80° 哪個大？', '給太多就會被推過頭。'],
    },
  },
  {
    id: 'arm-pid',
    title: 'PID 起始值',
    sub: '每度幾伏特；Motion Magic 用角速度',
    goal: '用「每度幾伏特」訂出起始 kP，知道 kI、kD 什麼時候才加。',
    Body: PidStart,
    quiz: {
      question: 'kP 設成每度 0.5 V，換成 V/rad 大約是多少？',
      options: ['0.5', '28.6', '0.0087'],
      answer: 1,
      explain: '1 rad ≈ 57.3°，所以每 rad 要 0.5 × 57.3 ≈ 28.6 V。',
      hints: ['1 rad 是幾度？', '1 rad = 180/π ≈ 57.3°。', '0.5 × 57.3 = ?'],
    },
  },
]


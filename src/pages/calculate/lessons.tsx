import { useMemo, type ReactNode } from 'react'
import { Chart, type ChartSeries } from '../../components/Chart'
import { ApproxNote } from '../../components/ApproxNote'
import { Exercise } from '../../components/Exercise'
import type { QuizDef } from '../../components/Quiz'
import { PROFILE_SAFETY_FACTOR, type FeedforwardResult } from '../../core/feedforward'
import { motorModel } from '../../core/motors'
import { plantFromMechanism } from '../../core/physics/elevator'
import type { Slot0Gains } from '../../core/controller/slot0'
import { simulate } from '../../core/physics/simulate'
import { trapezoidTime } from '../../core/ratioSweep'
import type { ElevatorMechanism } from '../../schema/parameterSet'

/**
 * 1F 的五個教學關卡。每關有學習目標、用目前機構代入的數字、一題檢核題。
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
      <p>
        電梯要動，馬達要克服三種力：<b>重力</b>（一直往下拉，停著也要撐）、<b>慣性</b>（加速、減速時才需要）、<b>摩擦</b>（方向跟移動相反，大小差不多固定）。
      </p>
      <p>串級式電梯的上層跑得比鼓輪快：鼓輪拉 1 公分，第 i 級升高 kᵢ 公分（kᵢ 是速度比）。那「換算到鼓輪上」要算多少質量？</p>
      <Exercise
        solvedAlready={done}
        prompt={
          <>
            練習用的電梯：第 1 級 5 kg（速度比 1）、第 2 級 3 kg（速度比 2），最上層夾著 2 kg 的遊戲物件。
            撐住重力要當成多少 kg（m_G）？加速時要推動多少 kg（m_A）？
          </>
        }
        fields={[
          {
            label: '重力等效質量 m_G',
            answer: 15,
            unit: 'kg',
            mistakes: [
              { value: 10, msg: '你直接把質量相加了。上層升得比鼓輪快，要乘速度比。' },
              { value: 25, msg: '你乘了速度比的平方。重力只乘一次：鼓輪拉 1 cm，第 i 級升高 kᵢ cm，重力做的功是 mᵢ·g·kᵢ。' },
              { value: 13, msg: '遊戲物件掛在最上層，也要乘最上層的速度比 2。' },
            ],
          },
          {
            label: '慣性等效質量 m_A',
            answer: 25,
            unit: 'kg',
            mistakes: [
              { value: 10, msg: '你直接把質量相加了。上層跑得比較快，動能比較大。' },
              { value: 15, msg: '慣性要乘速度比的平方：動能 ½·mᵢ·(kᵢ·v)² 裡有 kᵢ²。' },
              { value: 19, msg: '遊戲物件在最上層，也要乘 2² = 4。' },
              { value: 21, msg: '遊戲物件要乘速度比的平方 4，不是 2。' },
            ],
          },
        ]}
      >
      <p>
        串級式電梯的上層跑得比鼓輪快。第 i 級的速度是鼓輪線速度的 kᵢ 倍，所以把每一級「換算」到鼓輪上：
      </p>
      <div className="formula">{`重力等效質量 m_G = Σ mᵢ · kᵢ     （速度比一次方）
慣性等效質量 m_A = Σ mᵢ · kᵢ²    （速度比平方）`}</div>
      <p>
        為什麼次方不一樣？鼓輪拉 1 公分，第 i 級升高 kᵢ 公分，重力做的功是 mᵢ·g·kᵢ，所以重力乘一次 kᵢ；
        第 i 級的速度是 kᵢ 倍，動能 ½·mᵢ·(kᵢ·v)² 裡有 kᵢ²，所以慣性乘兩次。直接把質量相加，kG 和 kA 都會算錯。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl" style={{ margin: '8px 0 12px' }}>
        <thead>
          <tr>
            <th>項目</th>
            <th className="num">質量</th>
            <th className="num">速度比 k</th>
            <th className="num">m·k</th>
            <th className="num">m·k²</th>
          </tr>
        </thead>
        <tbody>
          {m.stages.map((s, i) => (
            <tr key={i}>
              <td>第 {i + 1} 級</td>
              <td className="num">{f(s.mass, 1)} kg</td>
              <td className="num">{f(s.speedRatio, 1)}</td>
              <td className="num">{f(s.mass * s.speedRatio, 1)}</td>
              <td className="num">{f(s.mass * s.speedRatio ** 2, 1)}</td>
            </tr>
          ))}
          <tr>
            <td>負載（掛在最上層）</td>
            <td className="num">{f(m.payloadMass, 1)} kg</td>
            <td className="num">{f(kTop, 1)}</td>
            <td className="num">{f(m.payloadMass * kTop, 1)}</td>
            <td className="num">{f(m.payloadMass * kTop ** 2, 1)}</td>
          </tr>
          <tr>
            <th colSpan={3}>合計</th>
            <th className="num">m_G = {f(ff.mass.gravity, 1)} kg</th>
            <th className="num">m_A = {f(ff.mass.inertia, 1)} kg</th>
          </tr>
        </tbody>
      </table>
      </div>
      <p>
        重力在鼓輪上是 m_G·g − 配重 = <b>{f(ff.netGravityForce, 1)} N</b>。經過半徑 {f(m.drumRadius * 1000, 1)} mm 的鼓輪和 {f(m.gearRatio, 2)}:1 的齒比，
        分給 {m.motorCount} 顆馬達，每顆只要出 <b>{f(torquePerMotor, 3)} N·m</b> 就能撐住。
      </p>
      <div className="formula">{`馬達扭矩 = 力 × 半徑 ÷ 齒比 ÷ 馬達數
         = ${f(ff.netGravityForce, 1)} × ${f(m.drumRadius, 4)} ÷ ${f(m.gearRatio, 2)} ÷ ${m.motorCount} = ${f(torquePerMotor, 3)} N·m`}</div>
      </Exercise>
    </>
  )
}

function Motor({ m }: LessonCtx) {
  const mm = motorModel(m.motor)
  return (
    <>
      <p>直流馬達的電壓分成兩部分：一部分推電流通過繞組（電流產生扭矩），另一部分抵銷「反電動勢」（馬達轉越快越大）。</p>
      <div className="formula">{`V = I · R + ω / Kv        電壓 = 推電流 + 抵銷反電動勢
τ = kT · I                扭矩只跟電流有關`}</div>
      <p>這三個常數可以從馬達規格表的四個數字（堵轉扭矩、堵轉電流、空轉轉速、空轉電流）算出來：</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl" style={{ margin: '8px 0 12px' }}>
        <tbody>
          <tr>
            <td>{mm.label} 繞組電阻 R = 12 V ÷ 堵轉電流 {mm.stallCurrent} A</td>
            <td className="num">{f(mm.R * 1000, 1)} mΩ</td>
          </tr>
          <tr>
            <td>扭矩常數 kT = 堵轉扭矩 {mm.stallTorque} N·m ÷ 堵轉電流</td>
            <td className="num">{f(mm.kT, 5)} N·m/A</td>
          </tr>
          <tr>
            <td>轉速常數 Kv = 空轉角速度 ÷（12 V − R × 空轉電流）</td>
            <td className="num">{f(mm.Kv, 2)} rad/s/V</td>
          </tr>
        </tbody>
      </table>
      </div>
      <p>
        重點：<b>轉得越快，反電動勢吃掉的電壓越多</b>，剩下能推電流、產生扭矩的電壓越少。所以電梯跑得越快，能用來加速的力越小，最高速度也有上限。
      </p>
    </>
  )
}

function Derive({ m, ff }: LessonCtx) {
  const mm = motorModel(m.motor)
  // 扣掉反電動勢後，每 1 V 對應的力（N/V）
  const newtonsPerVolt = (m.motorCount * mm.kT * m.gearRatio) / (mm.R * m.drumRadius)
  return (
    <>
      <p>把第 1、2 關串起來。前饋就是「照物理算，要讓電梯這樣動需要多少伏特」：</p>
      <div className="formula">{`kG：撐住重力的電流 × R
    = (m_G·g − 配重) · r / G · R / (n · kT)
    = ${f(ff.netGravityForce, 1)} × ${f(m.drumRadius, 4)} / ${f(m.gearRatio, 2)} × ${f(mm.R, 5)} / (${m.motorCount} × ${f(mm.kT, 5)})
    = ${f(ff.kG)} V

kV：每 1 m/s 要抵銷的反電動勢
    = G / (r · Kv) = ${f(m.gearRatio, 2)} / (${f(m.drumRadius, 4)} × ${f(mm.Kv, 2)}) = ${f(ff.kV)} V/(m/s)

kA：每 1 m/s² 推動慣性要的電壓
    = m_A · r · R / (G · n · kT) = ${f(ff.kA, 4)} V/(m/s²)`}</div>
      <p>
        控制器每個週期輸出 <code>kS·sgn(v) + kG + kV·v + kA·a</code>，其中 v、a 是 Motion Magic 軌跡的<b>參考</b>速度和加速度，不是量到的值。
        kS 是摩擦，理論上算不出來，先填 0，上機後由調參建議量出來。
      </p>
      <div className="note">
        <b>為什麼參數的單位都是伏特？</b>控制輸入 u 以電壓 [V] 表示。這裡不是說「電壓是力」，而是將馬達控制輸入統一表示成電壓，使電氣模型與機械模型可以直接連接：
        扣掉反電動勢之後剩下的電壓推動電流，電流產生扭矩，扭矩經過齒輪和鼓輪變成力。
        <div className="formula" style={{ margin: '8px 0 4px' }}>{`力 F = (u − kV·v) × n·kT·G / (R·r)
     = (u − kV·v) × ${f(newtonsPerVolt, 1)} N/V     （你的電梯）
檢查：kG × ${f(newtonsPerVolt, 1)} = ${f(ff.kG * newtonsPerVolt, 1)} N ＝ 重力 − 配重 ${f(ff.netGravityForce, 1)} N`}</div>
        所以 kG、kS 是「要多少伏特才撐得住／推得動」，kV、kA 是「每 1 m/s、每 1 m/s² 要多少伏特」。
      </div>
      <ApproxNote
        summary="理論值是用簡化的物理算的，上機後 kG、kA 要再量、kS 一定要量（1F 最下面有對照表）。"
        items={[
          '質量是你填的數字：CAD 或估計的質量常常少算螺絲、線材、護板。',
          '馬達用規格表的常數（R、kT、Kv），真的馬達熱了會變。',
          '沒有算摩擦（kS）和齒輪箱效率，所以真的 kG 通常比理論大一點。',
          '串級式等效質量假設每一級都照速度比同步移動，沒有繩子、鏈條的伸長和晃動。',
        ]}
      />
      <p>
        能跑多快？計算電壓 {f(m.calcVoltage, 1)} V 扣掉 kG 後全部拿來抵反電動勢：最高速度 ({f(m.calcVoltage, 1)} − {f(ff.kG)}) ÷ {f(ff.kV)} ={' '}
        <b>{f(ff.maxVelocity, 2)} m/s</b>。Motion Magic 先用上限的 {PROFILE_SAFETY_FACTOR * 100}%，留電壓給 PID 修正。
      </p>
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
    const t = new Float64Array(n)
    const pa = new Float64Array(n)
    const pb = new Float64Array(n)
    const ref = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      t[i] = a.t[i * step]
      pa[i] = (a.pos[i * step] - start) * 100
      pb[i] = (b.pos[i * step] - start) * 100
      ref[i] = 0
    }
    const series: ChartSeries[] = [
      { label: '目標', color: '--steel', dash: true, values: ref },
      { label: '只有前饋', color: '--red', values: pa },
      { label: `前饋 + kP ${f(kP, 0)}`, color: '--blue', values: pb },
    ]
    return { t, series, err: (b.pos[b.pos.length - 1] - start) * 100 }
  }, [m, ff, kP])

  return (
    <>
      <p>
        前饋是<b>預測</b>：質量量錯、摩擦沒算、電池沒電，預測就會偏。PID 看的是<b>誤差</b>，負責把預測不準的部分修回來。
      </p>
      <p>下圖假設 kG 算小了 20%，電梯停在行程中間。只有前饋時一路往下掉；加上 kP 後會停住，但停在比目標低一點的地方：</p>
      <Chart x={data.t} series={data.series} height={200} yLabel="相對目標（cm）" />
      <p style={{ marginTop: 10 }}>
        最後差 <b>{f(data.err, 2)} cm</b>：kP 要有誤差才會出力，缺的 0.2·kG 伏特要靠誤差 × kP 補上。這就是為什麼<b>不要一直加 kP 或用 kI 硬補</b>，
        而是把 kG 調準。kI 配 Motion Magic 還容易積分飽和，所以預設 0。
      </p>
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
    }),
  )
  const step = 5
  const n = Math.ceil(runs[0].t.length / step)
  const t = Float64Array.from({ length: n }, (_, i) => runs[0].t[i * step])
  const series: ChartSeries[] = [
    { label: '目標（軌跡）', color: '--steel', dash: true, values: Float64Array.from({ length: n }, (_, i) => runs[0].refPos[i * step]) },
    ...runs.map((r, k) => ({ label: cases[k].label, color: cases[k].color, values: Float64Array.from({ length: n }, (_, i) => r.pos[i * step]) })),
  ]
  return { t, series, metrics: runs.map((r) => r.moves[0]) }
}

function CompareTable({ labels, metrics }: { labels: string[]; metrics: ReturnType<typeof compareMoves>['metrics'] }) {
  const cm = (v: number) => `${(v * 100).toFixed(1)} cm`
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tbl" style={{ margin: '8px 0 12px' }}>
        <thead>
          <tr>
            <th>設定</th>
            <th className="num">最大跟隨誤差</th>
            <th className="num">超調</th>
            <th className="num">最後差多少</th>
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
    { label: `只有 PID（kP ${Math.round(kP)}）`, color: '--red', gains: { ...noFf, kP } },
    { label: `只有 PID，kP 加到 ${Math.round(kP * 4)}`, color: '--amber', gains: { ...noFf, kP: kP * 4 } },
    { label: `前饋 + PID（kP ${Math.round(kP)}）`, color: '--blue', gains: { kS: 0.15, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP, kI: 0, kD: 0 } },
  ]
}

/** kG 少 20% 時：只有 kP、加 kI、加 kI 但電池低（積分飽和）、把 kG 修好 */
export function kiCases(ff: FeedforwardResult, kP: number): CompareCase[] {
  const base = { kS: 0.15, kG: ff.kG * 0.8, kV: ff.kV, kA: ff.kA, kP, kI: 0, kD: 0 }
  return [
    { label: 'kG 少 20%，只有 kP', color: '--red', gains: base },
    { label: 'kG 少 20%，加 kI 300', color: '--amber', gains: { ...base, kI: 300 } },
    { label: 'kG 少 20%，加 kI 300，電池 9 V', color: '--violet', gains: { ...base, kI: 300 }, batteryVoltage: 9 },
    { label: '把 kG 修好，只有 kP', color: '--blue', gains: { ...base, kG: ff.kG } },
  ]
}

function PidVsFf({ m, ff, kP }: LessonCtx) {
  const cases = useMemo(() => pidVsFfCases(ff, kP), [ff, kP])
  const data = useMemo(() => compareMoves(m, ff, cases), [m, ff, cases])
  return (
    <>
      <h3>純 PID vs 前饋 + PID</h3>
      <p>
        同一台電梯從行程 10% 移到 75%。只有 PID 時，控制器要先看到誤差才會出力，所以一路落後；停下來時還要靠誤差撐住重力。
        把 kP 加大，落後少一點，但永遠補不完，而且 kP 太大時一有延遲就會抖（3F 情境「kP 太大」）。垂直的機構，重力一直都在，這就是 WPILib 文件一直強調「只靠回授對垂直機構很差」的原因。
      </p>
      <Chart x={data.t} series={data.series} height={220} yLabel="位置（m）" />
      <CompareTable labels={cases.map((c) => c.label)} metrics={data.metrics} />
    </>
  )
}

function KiCompare({ m, ff, kP }: LessonCtx) {
  const cases = useMemo(() => kiCases(ff, kP), [ff, kP])
  const data = useMemo(() => compareMoves(m, ff, cases), [m, ff, cases])
  return (
    <>
      <h3>為什麼 kI 通常不需要，什麼時候才加</h3>
      <p>
        kG 少了 20%。只有 kP 時停得比目標低；加上 kI，平常看起來會慢慢補回去；但只要輸出頂到上限（下圖電池只剩 9 V），誤差一直累積在積分裡，
        追上軌跡時放不掉，就衝過頭。把 kG 修好，只用 kP 就停得準，也不怕電池低。
      </p>
      <Chart x={data.t} series={data.series} height={220} yLabel="位置（m）" />
      <CompareTable labels={cases.map((c) => c.label)} metrics={data.metrics} />
      <ul className="small">
        <li>
          <b>先不要加 kI</b>：穩態誤差幾乎都是 kG 不準（修 kG）或摩擦卡住（kS）。前饋準了，kP 就夠。
        </li>
        <li>
          <b>什麼時候才考慮</b>：kG、kS 都照 2F 調好，停下來還是穩定差一點點（例如負載一直在變），而且確定不會長時間頂到輸出上限。這時加很小的 kI，
          並限制積分的範圍（roboRIO 的 WPILib PIDController 用 setIZone、setIntegratorRange）。
        </li>
        <li>夾不夾遊戲物件差很多時，與其靠 kI，不如換一組 kG（用 Slot 或程式判斷有沒有夾東西）。</li>
      </ul>
    </>
  )
}

function PidStart({ m, ff, kP }: LessonCtx) {
  return (
    <>
      <p>入門版的 kP 從一個直覺問題開始：「電梯差 1 公分時，我願意多給幾伏特？」</p>
      <div className="formula">{`kP = (伏特 / 公分) × 100 = ${f(kP, 1)} V/m
差 1 cm → ${f(kP / 100, 2)} V，差 5 cm → ${f(kP / 20, 2)} V`}</div>
      <ul>
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
      </ul>
      <p className="small muted">
        參數卡右邊的灰字是 Phoenix 6 的轉數制數值（SensorToMechanismRatio = {f(m.gearRatio, 2)}，1 圈 = 2πr = {f(2 * Math.PI * m.drumRadius, 4)} m）。kS、kG
        是伏特不用換；kV、kA、kP、kD 乘上 2πr。
      </p>
    </>
  )
}

export const LESSONS: Lesson[] = [
  {
    id: 'physics',
    title: '電梯的物理',
    sub: '重力、慣性、摩擦各要多少力，怎麼透過鼓輪和齒比換算成扭矩',
    goal: '能說出電梯要克服的三種力，並算出串級式的重力與慣性等效質量。',
    Body: Physics,
    quiz: {
      question: '串級式電梯：第 1 級 6 kg（速度比 1）、第 2 級 4 kg（速度比 2），沒有負載。重力等效質量 m_G 是多少？',
      options: ['10 kg', '14 kg', '22 kg'],
      answer: 1,
      explain: 'm_G = 6×1 + 4×2 = 14 kg。慣性等效質量才用平方：6×1 + 4×4 = 22 kg。',
      hints: ['直接相加是 10 kg，但第 2 級跑得比鼓輪快，要換算。', '重力等效質量用速度比的「一次方」。', '6 × 1 + 4 × 2 = ?'],
    },
  },
  {
    id: 'motor',
    title: '馬達模型',
    sub: 'V = I·R + ω/Kv，τ = kT·I',
    goal: '知道電壓分成「推電流」和「抵銷反電動勢」兩部分，以及轉速越高能出的扭矩越小。',
    Body: Motor,
    quiz: {
      question: '馬達已經轉得很快時，同樣給 12 V，能產生的扭矩會？',
      options: ['變大', '不變', '變小'],
      answer: 2,
      explain: '反電動勢 ω/Kv 變大，留給 I·R 的電壓變少，電流變小，扭矩 kT·I 也變小。',
      hints: ['扭矩只跟電流有關：τ = kT · I。', 'V = I·R + ω/Kv。ω 變大時，I 會怎樣？', 'V 固定、ω/Kv 變大，I·R 就要變小。'],
    },
  },
  {
    id: 'derive',
    title: '前饋推導',
    sub: 'kG、kV、kA 的公式，以及等效質量為什麼要加權',
    goal: '能從機構資料算出 kG、kV、kA，並說出齒比改變時它們怎麼變。',
    Body: Derive,
    quiz: {
      question: '其他都不變，齒比從 5:1 改成 10:1，kG 和 kV 會怎麼變？',
      options: ['kG 減半、kV 變兩倍', 'kG 變兩倍、kV 減半', '兩個都不變'],
      answer: 0,
      explain: 'kG 公式裡 G 在分母（齒比大，撐住同樣重量要的扭矩小），kV 裡 G 在分子（同樣線速度馬達要轉更快）。',
      hints: ['看公式裡 G 在分子還是分母。', 'kG = (m_G·g)·r/G·R/(n·kT)，kV = G/(r·Kv)。', 'kG 裡 G 在分母，kV 裡 G 在分子。'],
    },
  },
  {
    id: 'whyPid',
    title: '為什麼還需要 PID',
    sub: '前饋負責預測，PID 修正預測不準的部分',
    goal: '能解釋前饋與回授的分工，以及為什麼穩態誤差要修 kG 而不是加 kP 或 kI。',
    Body: WhyPid,
    quiz: {
      question: '只有前饋（kP = 0），kG 比實際需要的小 20%，電梯停在半空時會？',
      options: ['維持不動', '慢慢往下掉', '往上衝'],
      answer: 1,
      explain: '重力比 kG 大，淨力往下，沒有回授把它拉回來，所以會一直往下掉到底。',
      hints: ['停著的時候參考速度和加速度都是 0，前饋只剩 kG。', 'kG 小了，撐不住重力。', '力往下又沒有 PID 修正……'],
    },
  },
  {
    id: 'pidStart',
    title: 'PID 起始值',
    sub: '從「誤差多少給多少伏特」估 kP',
    goal: '能把「每公分幾伏特」換成 kP，並知道 kI、kD 起始為什麼是 0。',
    Body: PidStart,
    quiz: {
      question: 'kP = 50 V/m，電梯差目標 2 cm 時，P 項輸出多少伏特？',
      options: ['0.5 V', '1 V', '100 V'],
      answer: 1,
      explain: '50 V/m × 0.02 m = 1 V。',
      hints: ['kP 的單位是 V/m，誤差要換成公尺。', '2 cm = 0.02 m。', '50 × 0.02 = ?'],
    },
  },
]

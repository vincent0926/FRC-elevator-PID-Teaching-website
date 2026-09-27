import { useEffect, useMemo, useState } from 'react'
import { useStore, type SimSource } from '../../app/store'
import { Chart, type ChartSeries } from '../../components/Chart'
import { NumberField } from '../../components/NumberField'
import { CONTROL_PERIOD, type ControllerLocation } from '../../core/controller/slot0'
import { plantFromMechanism } from '../../core/physics/elevator'
import type { MoveMetrics, SimInput, SimResult } from '../../core/physics/simulate'
import { trapezoidProfile } from '../../core/profile'
import type { ParameterSet } from '../../schema/parameterSet'
import { runSimulation } from '../../workers/client'
import { ExportPanel } from '../calculate/ExportPanel'
import { MiniShaft } from './MiniShaft'

/**
 * 3F 模擬。三個入口（理論值、調參建議值、自訂）共用這一頁，差別只在參數來源。
 * 受控體永遠是「目前的機構」；真實模型可以故意讓機構跟理論不一樣，看參數錯了會怎樣。
 */

const SOURCES: { id: SimSource; label: string }[] = [
  { id: 'theory', label: '理論值' },
  { id: 'tuning', label: '調參建議值' },
  { id: 'custom', label: '自訂' },
]

const LIMITS = { overshoot: 0.01, settling: 0.5, steadyState: 0.01, following: 0.03, saturation: 0.02 }

const cm = (v: number) => `${(v * 100).toFixed(1)} cm`

interface PlantKnobs {
  realistic: boolean
  frictionKs: number
  batteryVoltage: number
  kGScale: number
  kVScale: number
  kAScale: number
}

const DEFAULT_KNOBS: PlantKnobs = { realistic: false, frictionKs: 0.15, batteryVoltage: 12.5, kGScale: 1, kVScale: 1, kAScale: 1 }

export function SimPage() {
  const { mechanism, ff, theory, custom, setCustom, tuning, simSource, setSimSource } = useStore()
  const [knobs, setKnobs] = useState<PlantKnobs>(DEFAULT_KNOBS)
  const [location, setLocation] = useState<ControllerLocation>('talonfx')
  const [periodOverride, setPeriodOverride] = useState<number | null>(null)
  const [goal, setGoal] = useState(() => Math.round(mechanism.travel * 0.75 * 100) / 100)
  const [compare, setCompare] = useState(false)
  const [result, setResult] = useState<SimResult | null>(null)
  const [otherRaw, setOther] = useState<SimResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sets: Record<SimSource, ParameterSet | null> = { theory, tuning, custom }
  const source: SimSource = sets[simSource] ? simSource : 'theory'
  const ps = sets[source]!
  const otherSource: SimSource | null = source === 'custom' ? 'theory' : custom ? 'custom' : null
  const safeGoal = Math.min(mechanism.travel, Math.max(0, goal))
  const controlPeriod = periodOverride ?? CONTROL_PERIOD[location]

  const buildInput = useMemo(() => {
    const plant = plantFromMechanism(mechanism, ff, {
      realistic: knobs.realistic,
      frictionKs: knobs.frictionKs,
      batteryVoltage: knobs.batteryVoltage,
      kGScale: knobs.kGScale,
      kVScale: knobs.kVScale,
      kAScale: knobs.kAScale,
    })
    const low = Math.min(mechanism.travel * 0.1, safeGoal)
    return (p: ParameterSet): SimInput => {
      const mm = p.motionMagic
      const up = trapezoidProfile(low, safeGoal, mm.cruiseVelocity, mm.acceleration)
      const t2 = 0.5 + up.duration + 1.5
      const down = trapezoidProfile(safeGoal, low, mm.cruiseVelocity, mm.acceleration)
      return {
        plant,
        gains: { ...p.feedforward, ...p.feedback },
        motionMagic: mm,
        controlPeriod,
        initialPosition: low,
        moves: [
          { time: 0.5, goal: safeGoal },
          { time: t2, goal: low },
        ],
        duration: Math.min(30, t2 + down.duration + 1.5),
      }
    }
  }, [mechanism, ff, knobs, safeGoal, controlPeriod])

  useEffect(() => {
    let alive = true
    runSimulation(buildInput(ps), 'main')
      .then((r) => {
        if (!alive) return
        setResult(r)
        setError(null)
      })
      .catch((e: Error) => alive && e.message !== 'stale' && setError(e.message))
    return () => {
      alive = false
    }
  }, [buildInput, ps])

  const otherPs = otherSource ? sets[otherSource] : null
  useEffect(() => {
    if (!compare || !otherPs) return
    let alive = true
    runSimulation(buildInput(otherPs), 'compare')
      .then((r) => alive && setOther(r))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [compare, otherPs, buildInput])

  const other = compare && otherPs ? otherRaw : null
  const charts = useMemo(() => {
    if (!result) return null
    const otherLabel = otherSource ? SOURCES.find((s) => s.id === otherSource)!.label : ''
    const pos: ChartSeries[] = [
      { label: '目標（軌跡）', color: '--steel', dash: true, values: result.refPos },
      { label: '實際位置', color: '--blue', values: result.pos },
    ]
    // 疊圖的時間軸可能不同（巡航速度不同），長度對不上時截短或補 NaN
    if (other) {
      const v = new Float64Array(result.t.length).fill(NaN)
      v.set(other.pos.subarray(0, Math.min(v.length, other.pos.length)))
      pos.push({ label: `${otherLabel}的實際位置`, color: '--violet', values: v })
    }
    const volt: ChartSeries[] = [
      { label: '輸出電壓', color: '--ink-2', values: result.voltage },
      { label: '前饋', color: '--green', values: result.feedforward },
      { label: '回授（P+I+D）', color: '--red', values: result.feedback },
    ]
    const cur: ChartSeries[] = [{ label: '每顆馬達 Stator 電流', color: '--amber', values: result.statorCurrent }]
    return { pos, volt, cur }
  }, [result, other, otherSource])

  const editCustom = (patch: (p: ParameterSet) => ParameterSet) => custom && setCustom(patch(custom))

  return (
    <section aria-labelledby="t-sim">
      <div className="head">
        <div>
          <h1 id="t-sim">模擬</h1>
          <p className="lead">上機前先確認參數不會出事。改一個數字看看會怎樣，不用怕撞壞機構。</p>
        </div>
        <span className="phase">{knobs.realistic ? '真實模型' : '理想模型'}・{location === 'talonfx' ? 'TalonFX 1 kHz' : 'roboRIO 50 Hz'}</span>
      </div>

      <div className="bar">
        <div className="seg" role="group" aria-label="參數來源">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={source === s.id}
              disabled={!sets[s.id] && s.id !== 'custom'}
              title={s.id === 'tuning' && !tuning ? '調參建議在 Phase 2 開放' : undefined}
              onClick={() => {
                if (s.id === 'custom' && !custom) setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString() })
                setSimSource(s.id)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="check">
          目標高度
          <span className="inp" style={{ width: 120 }}>
            <input type="number" step={0.05} min={0} max={mechanism.travel} value={goal} onChange={(e) => setGoal(Number(e.target.value))} />
            <em>m</em>
          </span>
        </label>
        {otherSource && (
          <label className="check">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            疊上{SOURCES.find((s) => s.id === otherSource)!.label}比較
          </label>
        )}
      </div>

      {error && <div className="warn">模擬失敗：{error}</div>}

      <div className="simwrap">
        <MiniShaft result={result} travel={mechanism.travel} goal={safeGoal} />
        <div className="panel stack">
          {charts && result && (
            <>
              <Chart title="位置" x={result.t} series={charts.pos} height={230} yLabel="m" syncKey="sim" />
              <Chart title="電壓（前饋 + 回授）" x={result.t} series={charts.volt} height={170} yLabel="V" syncKey="sim" />
              <Chart title="電流" x={result.t} series={charts.cur} height={140} yLabel="A" syncKey="sim" />
            </>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            在圖上拖曳可以放大時間軸，點兩下還原。
          </p>
        </div>
      </div>

      {result && <MetricsTable moves={result.moves} />}

      <div className="grid2" style={{ marginTop: 20 }}>
        <div className="panel">
          <h2>參數（{SOURCES.find((s) => s.id === source)!.label}）</h2>
          {source === 'custom' && custom ? (
            <>
              <div className="gains">
                {(['kS', 'kG', 'kV', 'kA'] as const).map((k) => (
                  <NumberField
                    key={k}
                    label={k}
                    value={custom.feedforward[k]}
                    onChange={(v) => editCustom((p) => ({ ...p, feedforward: { ...p.feedforward, [k]: v } }))}
                    unit={k === 'kS' || k === 'kG' ? 'V' : k === 'kV' ? 'V/(m/s)' : 'V/(m/s²)'}
                  />
                ))}
                {(['kP', 'kI', 'kD'] as const).map((k) => (
                  <NumberField
                    key={k}
                    label={k}
                    value={custom.feedback[k]}
                    min={0}
                    onChange={(v) => editCustom((p) => ({ ...p, feedback: { ...p.feedback, [k]: v } }))}
                    unit={k === 'kP' ? 'V/m' : k === 'kI' ? 'V/(m·s)' : 'V/(m/s)'}
                  />
                ))}
                <span />
                <NumberField
                  label="巡航速度"
                  value={custom.motionMagic.cruiseVelocity}
                  min={0.01}
                  onChange={(v) => editCustom((p) => ({ ...p, motionMagic: { ...p.motionMagic, cruiseVelocity: v } }))}
                  unit="m/s"
                />
                <NumberField
                  label="加速度"
                  value={custom.motionMagic.acceleration}
                  min={0.01}
                  onChange={(v) => editCustom((p) => ({ ...p, motionMagic: { ...p.motionMagic, acceleration: v } }))}
                  unit="m/s²"
                />
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn small" type="button" onClick={() => setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString() })}>
                  重置為理論值
                </button>
                <span className="small muted">一次只改一個參數，才看得出是誰造成的變化。</span>
              </div>
            </>
          ) : (
            <>
              <GainList ps={ps} />
              <p className="small muted" style={{ marginTop: 10 }}>
                理論值由 1F 的機構資料算出，這裡不能改。想自由調整，切到「自訂」。
              </p>
            </>
          )}
          <details style={{ marginTop: 16 }}>
            <summary className="small" style={{ cursor: 'pointer' }}>
              達標了？輸出這組參數
            </summary>
            <div style={{ marginTop: 12 }}>
              <ExportPanel ps={ps} />
            </div>
          </details>
        </div>

        <div className="panel">
          <h2>受控體（模擬的電梯）</h2>
          <div className="seg" role="group" aria-label="模型">
            <button type="button" aria-pressed={!knobs.realistic} onClick={() => setKnobs({ ...knobs, realistic: false })}>
              理想模型
            </button>
            <button type="button" aria-pressed={knobs.realistic} onClick={() => setKnobs({ ...knobs, realistic: true })}>
              真實模型
            </button>
          </div>
          <p className="small muted" style={{ margin: '8px 0 12px' }}>
            {knobs.realistic
              ? '加入摩擦（含靜摩擦卡住）、Stator 電流限制、電池內阻壓降，比較接近真的機器人。'
              : '沒有摩擦、沒有電流限制，只有重力、慣性和反電動勢。理論值在這裡應該幾乎完美。'}
          </p>
          <div className="fields">
            {knobs.realistic && (
              <>
                <NumberField label="摩擦（等效 kS）" value={knobs.frictionKs} min={0} max={3} onChange={(v) => setKnobs({ ...knobs, frictionKs: v })} unit="V" />
                <NumberField label="電池電壓" value={knobs.batteryVoltage} min={6} max={13.5} onChange={(v) => setKnobs({ ...knobs, batteryVoltage: v })} unit="V" />
              </>
            )}
            <NumberField
              label="實際重力 / 理論"
              value={knobs.kGScale}
              display={100}
              min={0}
              max={300}
              onChange={(v) => setKnobs({ ...knobs, kGScale: v })}
              unit="%"
              hint="例如實際比量的重 20%，填 120"
            />
            <NumberField label="實際 kV / 理論" value={knobs.kVScale} display={100} min={10} max={300} onChange={(v) => setKnobs({ ...knobs, kVScale: v })} unit="%" />
            <NumberField label="實際慣性 / 理論" value={knobs.kAScale} display={100} min={10} max={300} onChange={(v) => setKnobs({ ...knobs, kAScale: v })} unit="%" />
          </div>
          <h3 style={{ marginTop: 18 }}>控制器位置</h3>
          <div className="seg" role="group" aria-label="控制器位置">
            {(['talonfx', 'roborio'] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={location === l && periodOverride === null}
                onClick={() => {
                  setLocation(l)
                  setPeriodOverride(null)
                }}
              >
                {l === 'talonfx' ? 'TalonFX（1 kHz）' : 'roboRIO（50 Hz）'}
              </button>
            ))}
          </div>
          <details style={{ marginTop: 10 }}>
            <summary className="small" style={{ cursor: 'pointer' }}>
              進階：自訂控制週期
            </summary>
            <div className="fields" style={{ marginTop: 8 }}>
              <NumberField
                label="控制週期"
                value={controlPeriod}
                display={1000}
                min={1}
                max={100}
                onChange={(v) => setPeriodOverride(v)}
                unit="ms"
              />
            </div>
          </details>
          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="btn small"
              type="button"
              onClick={() => {
                setKnobs(DEFAULT_KNOBS)
                setLocation('talonfx')
                setPeriodOverride(null)
              }}
            >
              重置受控體
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function GainList({ ps }: { ps: ParameterSet }) {
  const rows: [string, number, string][] = [
    ['kS', ps.feedforward.kS, 'V'],
    ['kG', ps.feedforward.kG, 'V'],
    ['kV', ps.feedforward.kV, 'V/(m/s)'],
    ['kA', ps.feedforward.kA, 'V/(m/s²)'],
    ['kP', ps.feedback.kP, 'V/m'],
    ['kI', ps.feedback.kI, 'V/(m·s)'],
    ['kD', ps.feedback.kD, 'V/(m/s)'],
    ['巡航速度', ps.motionMagic.cruiseVelocity, 'm/s'],
    ['加速度', ps.motionMagic.acceleration, 'm/s²'],
  ]
  return (
    <table className="tbl">
      <tbody>
        {rows.map(([k, v, u]) => (
          <tr key={k}>
            <th>{k}</th>
            <td className="num">{Number(v.toPrecision(4))}</td>
            <td className="muted">{u}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MetricsTable({ moves }: { moves: MoveMetrics[] }) {
  const hints: string[] = []
  for (const m of moves) {
    if (m.saturationFraction > LIMITS.saturation) hints.push('輸出電壓貼到電池電壓：馬達已經全力，調 PID 沒用，先降低 Motion Magic 速度或加速度。')
    if (m.currentLimitFraction > LIMITS.saturation) hints.push('觸發 Stator 電流限制：加速度太大或機構太重，屬於物理限制。')
  }
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h2>指標</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>移動</th>
              <th className="num">軌跡時間</th>
              <th className="num">超調</th>
              <th className="num">穩定時間</th>
              <th className="num">穩態誤差</th>
              <th className="num">最大跟隨誤差</th>
              <th className="num">峰值電流</th>
              <th className="num">電壓飽和</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((m, i) => (
              <tr key={i}>
                <td>{i === 0 ? '往上' : '往下'} → {m.goal.toFixed(2)} m</td>
                <td className="num">{m.profileDuration.toFixed(2)} s</td>
                <td className={'num ' + (m.overshoot <= LIMITS.overshoot ? 'pass' : 'fail')}>{cm(m.overshoot)}</td>
                <td className={'num ' + (m.settlingTime !== null && m.settlingTime <= LIMITS.settling ? 'pass' : 'fail')}>
                  {m.settlingTime === null ? '未穩定' : `${m.settlingTime.toFixed(2)} s`}
                </td>
                <td className={'num ' + (m.steadyStateError <= LIMITS.steadyState ? 'pass' : 'fail')}>{cm(m.steadyStateError)}</td>
                <td className={'num ' + (m.maxFollowingError <= LIMITS.following ? 'pass' : 'fail')}>{cm(m.maxFollowingError)}</td>
                <td className="num">{m.peakStatorCurrent.toFixed(0)} A</td>
                <td className={'num ' + (m.saturationFraction <= LIMITS.saturation ? 'pass' : 'fail')}>{(m.saturationFraction * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: '10px 0 0' }}>
        達標標準：超調 ≤ 1 cm、軌跡結束後 0.5 s 內穩定在 ±1 cm、穩態誤差 ≤ 1 cm、跟隨誤差 ≤ 3 cm、電壓飽和 ≤ 2%。
      </p>
      {[...new Set(hints)].map((h) => (
        <div key={h} className="warn">
          {h}
        </div>
      ))}
    </div>
  )
}

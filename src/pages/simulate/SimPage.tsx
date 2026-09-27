import { useEffect, useMemo, useState } from 'react'
import { useStore, type SimSource } from '../../app/store'
import { Chart, type ChartSeries } from '../../components/Chart'
import { NumberField } from '../../components/NumberField'
import { CONTROL_PERIOD, type ControllerLocation } from '../../core/controller/slot0'
import type { MoveMetrics, SimResult } from '../../core/physics/simulate'
import type { ParameterSet } from '../../schema/parameterSet'
import { runSimulation } from '../../workers/client'
import { ExportPanel } from '../calculate/ExportPanel'
import { MiniShaft, PlaybackBar, usePlayback } from './MiniShaft'
import { buildSimInput, DEFAULT_KNOBS, TOGGLES, type PlantKnobs } from './plantKnobs'
import { SIM_SCENARIOS, type SimScenario } from './simScenarios'

/**
 * 3F 模擬。三個入口（理論值、調參建議值、自訂）共用這一頁，差別只在參數來源。
 * 受控體永遠是「目前的機構」；真實模型可以故意讓機構跟理論不一樣，看參數錯了會怎樣。
 * 教學情境會把參數換成「自訂」並設定受控體，按一下就能看到某個觀念。
 */

const SOURCES: { id: SimSource; label: string }[] = [
  { id: 'theory', label: '理論值' },
  { id: 'tuning', label: '調參建議值' },
  { id: 'custom', label: '自訂' },
]

const LIMITS = { overshoot: 0.01, settling: 0.5, steadyState: 0.01, following: 0.03, saturation: 0.02, ripple: 0.3 }

const cm = (v: number) => `${(v * 100).toFixed(1)} cm`

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
  const [scenario, setScenario] = useState<SimScenario | null>(null)
  const pb = usePlayback(result)

  const sets: Record<SimSource, ParameterSet | null> = { theory, tuning, custom }
  const source: SimSource = sets[simSource] ? simSource : 'theory'
  const ps = sets[source]!
  const otherSource: SimSource | null = source === 'custom' ? 'theory' : custom ? 'custom' : null
  const safeGoal = Math.min(mechanism.travel, Math.max(0, goal))
  const controlPeriod = periodOverride ?? CONTROL_PERIOD[location]

  const setup = useMemo(() => ({ mechanism, ff, knobs, controlPeriod, goal: safeGoal }), [mechanism, ff, knobs, controlPeriod, safeGoal])

  useEffect(() => {
    let alive = true
    runSimulation(buildSimInput(setup, ps), 'main')
      .then((r) => {
        if (!alive) return
        setResult(r)
        setError(null)
      })
      .catch((e: Error) => alive && e.message !== 'stale' && setError(e.message))
    return () => {
      alive = false
    }
  }, [setup, ps])

  const otherPs = otherSource ? sets[otherSource] : null
  useEffect(() => {
    if (!compare || !otherPs) return
    let alive = true
    runSimulation(buildSimInput(setup, otherPs), 'compare')
      .then((r) => alive && setOther(r))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [compare, otherPs, setup])

  const other = compare && otherPs ? otherRaw : null
  const charts = useMemo(() => {
    if (!result) return null
    const otherLabel = otherSource ? SOURCES.find((s) => s.id === otherSource)!.label : ''
    // 疊圖的時間軸可能不同（巡航速度不同），長度對不上時截短或補 NaN
    const fit = (a: Float64Array) => {
      const v = new Float64Array(result.t.length).fill(NaN)
      v.set(a.subarray(0, Math.min(v.length, a.length)))
      return v
    }
    const err = (r: SimResult) => r.refPos.map((x, i) => (x - r.pos[i]) * 100)
    const pos: ChartSeries[] = [
      { label: '目標（軌跡）', color: '--steel', dash: true, values: result.refPos },
      { label: '實際位置', color: '--blue', values: result.pos },
    ]
    const vel: ChartSeries[] = [
      { label: '參考速度', color: '--steel', dash: true, values: result.refVel },
      { label: '實際速度', color: '--blue', values: result.vel },
    ]
    const errS: ChartSeries[] = [{ label: '跟隨誤差（目標 − 實際）', color: '--red', values: err(result) }]
    if (other) {
      pos.push({ label: `${otherLabel}的實際位置`, color: '--violet', values: fit(other.pos) })
      vel.push({ label: `${otherLabel}的實際速度`, color: '--violet', values: fit(other.vel) })
      errS.push({ label: `${otherLabel}的跟隨誤差`, color: '--violet', values: fit(err(other)) })
    }
    const volt: ChartSeries[] = [
      { label: '輸出電壓', color: '--ink-2', values: result.voltage },
      { label: '前饋', color: '--green', values: result.feedforward },
      { label: '回授（P+I+D）', color: '--red', values: result.feedback },
    ]
    const cur: ChartSeries[] = [{ label: '每顆馬達 Stator 電流', color: '--amber', values: result.statorCurrent }]
    return { pos, vel, err: errS, volt, cur }
  }, [result, other, otherSource])

  const editCustom = (patch: (p: ParameterSet) => ParameterSet) => custom && setCustom(patch(custom))

  const loadScenario = (s: SimScenario) => {
    const st = s.setup(theory, ff)
    setCustom(st.params)
    setSimSource('custom')
    setKnobs({ ...DEFAULT_KNOBS, ...st.knobs })
    setLocation(st.location)
    setPeriodOverride(null)
    setCompare(true)
    setScenario(s)
  }
  const leaveScenario = () => {
    setScenario(null)
    setKnobs(DEFAULT_KNOBS)
    setLocation('talonfx')
    setPeriodOverride(null)
    setSimSource('theory')
  }

  return (
    <section aria-labelledby="t-sim">
      <div className="head">
        <div>
          <h1 id="t-sim">模擬</h1>
          <p className="lead">上機前先確認參數不會出事。改一個數字看看會怎樣，不用怕撞壞機構。</p>
        </div>
        <span className="phase">
          {knobs.realistic ? '真實模型' : '理想模型'}・{location === 'talonfx' ? 'TalonFX 1 kHz' : 'roboRIO 50 Hz'}
        </span>
      </div>

      <ScenarioPicker active={scenario} onPick={loadScenario} onLeave={leaveScenario} />

      <div className="bar">
        <div className="seg" role="group" aria-label="參數來源">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={source === s.id}
              disabled={!sets[s.id] && s.id !== 'custom'}
              title={s.id === 'tuning' && !tuning ? '還沒有調參建議值：先到 2F 分析日誌並套用一個建議' : undefined}
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
        <MiniShaft result={result} travel={mechanism.travel} goal={safeGoal} idx={pb.idx} />
        <div className="panel stack">
          <PlaybackBar result={result} pb={pb} />
          {charts && result && (
            <>
              <Chart title="位置" x={result.t} series={charts.pos} height={220} yLabel="m" syncKey="sim" />
              <Chart title="跟隨誤差" x={result.t} series={charts.err} height={130} yLabel="cm" syncKey="sim" />
              <Chart title="速度" x={result.t} series={charts.vel} height={130} yLabel="m/s" syncKey="sim" />
              <Chart title="電壓（前饋 + 回授）" x={result.t} series={charts.volt} height={170} yLabel="V" syncKey="sim" />
              <Chart title="電流" x={result.t} series={charts.cur} height={130} yLabel="A" syncKey="sim" />
            </>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            在圖上拖曳可以放大時間軸，點兩下還原。
          </p>
        </div>
      </div>

      {result && <MetricsTable moves={result.moves} other={other?.moves ?? null} otherLabel={otherSource ? SOURCES.find((s) => s.id === otherSource)!.label : ''} />}

      <div className="grid2" style={{ marginTop: 20 }}>
        <div className="panel">
          <h2>參數（{SOURCES.find((s) => s.id === source)!.label}）</h2>
          {source === 'custom' && custom ? (
            <CustomEditor custom={custom} edit={editCustom} reset={() => setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString() })} />
          ) : (
            <>
              <GainList ps={ps} />
              <p className="small muted" style={{ marginTop: 10 }}>
                {source === 'theory' ? '理論值由 1F 的機構資料算出，這裡不能改。' : '調參建議值來自 2F，一次只改一個參數。'}想自由調整，切到「自訂」。
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

        <PlantPanel
          knobs={knobs}
          setKnobs={setKnobs}
          location={location}
          periodOverride={periodOverride}
          controlPeriod={controlPeriod}
          setLocation={(l) => {
            setLocation(l)
            setPeriodOverride(null)
          }}
          setPeriodOverride={setPeriodOverride}
          continuous={mechanism.rig === 'continuous'}
        />
      </div>
    </section>
  )
}

function ScenarioPicker({ active, onPick, onLeave }: { active: SimScenario | null; onPick: (s: SimScenario) => void; onLeave: () => void }) {
  return (
    <details className="panel scen" open={active !== null || undefined} style={{ marginBottom: 16 }}>
      <summary>
        <b>教學情境</b>
        <span className="small muted">按一下載入一個「故意設錯」的例子，看圖找出問題。會換掉目前的「自訂」參數。</span>
      </summary>
      <div className="scen-list">
        {SIM_SCENARIOS.map((s) => (
          <button key={s.id} type="button" className="btn small" aria-pressed={active?.id === s.id} onClick={() => onPick(s)}>
            {s.title}
          </button>
        ))}
      </div>
      {active && (
        <div className="scen-card">
          <h3>{active.title}</h3>
          <p>{active.concept}</p>
          <dl>
            <dt>看哪裡</dt>
            <dd>{active.lookFor}</dd>
            <dt>接著試試</dt>
            <dd>{active.tryNext}</dd>
          </dl>
          <button className="btn small" type="button" onClick={onLeave}>
            離開情境（回到理論值、理想模型）
          </button>
        </div>
      )}
    </details>
  )
}

function CustomEditor({
  custom,
  edit,
  reset,
}: {
  custom: ParameterSet
  edit: (patch: (p: ParameterSet) => ParameterSet) => void
  reset: () => void
}) {
  const slots = custom.slotByDirection
  const setSlot = (dir: 'up' | 'down', k: 'kS' | 'kG', v: number) =>
    edit((p) => (p.slotByDirection ? { ...p, slotByDirection: { ...p.slotByDirection, [dir]: { ...p.slotByDirection[dir], [k]: v } } } : p))
  return (
    <>
      <div className="gains">
        {(['kS', 'kG', 'kV', 'kA'] as const).map((k) => (
          <NumberField
            key={k}
            label={slots && (k === 'kS' || k === 'kG') ? `${k}（沒用到）` : k}
            value={custom.feedforward[k]}
            onChange={(v) => edit((p) => ({ ...p, feedforward: { ...p.feedforward, [k]: v } }))}
            unit={k === 'kS' || k === 'kG' ? 'V' : k === 'kV' ? 'V/(m/s)' : 'V/(m/s²)'}
          />
        ))}
        {(['kP', 'kI', 'kD'] as const).map((k) => (
          <NumberField
            key={k}
            label={k}
            value={custom.feedback[k]}
            min={0}
            onChange={(v) => edit((p) => ({ ...p, feedback: { ...p.feedback, [k]: v } }))}
            unit={k === 'kP' ? 'V/m' : k === 'kI' ? 'V/(m·s)' : 'V/(m/s)'}
          />
        ))}
        <span />
        <NumberField
          label="巡航速度"
          value={custom.motionMagic.cruiseVelocity}
          min={0.01}
          onChange={(v) => edit((p) => ({ ...p, motionMagic: { ...p.motionMagic, cruiseVelocity: v } }))}
          unit="m/s"
        />
        <NumberField
          label="加速度"
          value={custom.motionMagic.acceleration}
          min={0.01}
          onChange={(v) => edit((p) => ({ ...p, motionMagic: { ...p.motionMagic, acceleration: v } }))}
          unit="m/s²"
        />
      </div>

      <label className="check" style={{ marginTop: 14 }}>
        <input
          type="checkbox"
          checked={!!slots}
          onChange={(e) =>
            edit((p) => {
              if (!e.target.checked) return { ...p, slotByDirection: undefined }
              const base = { kS: p.feedforward.kS, kG: p.feedforward.kG }
              return { ...p, slotByDirection: { up: base, down: { ...base } } }
            })
          }
        />
        往下用 Slot 1（摩擦不對稱時，往上、往下各自設 kS、kG）
      </label>
      {slots && (
        <div className="gains" style={{ marginTop: 10 }}>
          <NumberField label="往上 kS（Slot 0）" value={slots.up.kS} onChange={(v) => setSlot('up', 'kS', v)} unit="V" />
          <NumberField label="往上 kG（Slot 0）" value={slots.up.kG} onChange={(v) => setSlot('up', 'kG', v)} unit="V" />
          <NumberField label="往下 kS（Slot 1）" value={slots.down.kS} onChange={(v) => setSlot('down', 'kS', v)} unit="V" />
          <NumberField label="往下 kG（Slot 1）" value={slots.down.kG} onChange={(v) => setSlot('down', 'kG', v)} unit="V" />
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn small" type="button" onClick={reset}>
          重置為理論值
        </button>
        <span className="small muted">一次只改一個參數，才看得出是誰造成的變化。</span>
      </div>
      {custom.note && <p className="small muted">來源：{custom.note}</p>}
    </>
  )
}

function PlantPanel({
  knobs,
  setKnobs,
  location,
  periodOverride,
  controlPeriod,
  setLocation,
  setPeriodOverride,
  continuous,
}: {
  knobs: PlantKnobs
  setKnobs: (k: PlantKnobs) => void
  location: ControllerLocation
  periodOverride: number | null
  controlPeriod: number
  setLocation: (l: ControllerLocation) => void
  setPeriodOverride: (v: number) => void
  continuous: boolean
}) {
  const set = (patch: Partial<PlantKnobs>) => setKnobs({ ...knobs, ...patch })
  return (
    <div className="panel">
      <h2>受控體（模擬的電梯）</h2>
      <div className="seg" role="group" aria-label="模型">
        <button type="button" aria-pressed={!knobs.realistic} onClick={() => set({ realistic: false })}>
          理想模型
        </button>
        <button type="button" aria-pressed={knobs.realistic} onClick={() => set({ realistic: true })}>
          真實模型
        </button>
      </div>
      <p className="small muted" style={{ margin: '8px 0 12px' }}>
        {knobs.realistic
          ? '每一項都可以單獨開關。一次只開一項，看圖怎麼變，就知道它對電梯的影響。'
          : '沒有摩擦、沒有電流限制，只有重力、慣性和反電動勢（電壓最多到電池電壓）。理論值在這裡應該幾乎完美。'}
      </p>
      {knobs.realistic && (
        <ul className="toggles">
          {TOGGLES.map((t) => (
            <li key={t.key}>
              <label className="check">
                <input type="checkbox" checked={knobs[t.key]} onChange={(e) => set({ [t.key]: e.target.checked })} />
                <b>{t.label}</b>
              </label>
              <p className="small muted">
                {t.what}
                {t.key === 'stageJump' && !continuous && '（你的機構是串級式，通常不會有這個問題）'}
              </p>
              {knobs[t.key] && t.key === 'friction' && (
                <div className="fields">
                  <NumberField label="往上摩擦" value={knobs.frictionUp} min={0} max={3} onChange={(v) => set({ frictionUp: v })} unit="V" />
                  <NumberField label="往下摩擦" value={knobs.frictionDown} min={0} max={3} onChange={(v) => set({ frictionDown: v })} unit="V" />
                </div>
              )}
              {knobs[t.key] && t.key === 'gearbox' && (
                <div className="fields">
                  <NumberField label="效率" value={knobs.efficiency} display={100} min={30} max={100} onChange={(v) => set({ efficiency: v })} unit="%" />
                </div>
              )}
              {knobs[t.key] && t.key === 'sensor' && (
                <div className="fields">
                  <NumberField label="延遲" value={knobs.sensorDelay} display={1000} min={0} max={200} onChange={(v) => set({ sensorDelay: v })} unit="ms" />
                  <NumberField label="位置雜訊" value={knobs.sensorNoise} display={1000} min={0} max={20} onChange={(v) => set({ sensorNoise: v })} unit="mm" />
                </div>
              )}
              {knobs[t.key] && t.key === 'stageJump' && (
                <div className="fields">
                  <NumberField label="kG 跳多少" value={knobs.stageJumpDelta} min={-3} max={3} onChange={(v) => set({ stageJumpDelta: v })} unit="V" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="fields" style={{ marginTop: 12 }}>
        <NumberField label="電池電壓" value={knobs.batteryVoltage} min={6} max={13.5} onChange={(v) => set({ batteryVoltage: v })} unit="V" />
        <span />
        <NumberField
          label="實際重力 / 理論"
          value={knobs.kGScale}
          display={100}
          min={0}
          max={300}
          onChange={(v) => set({ kGScale: v })}
          unit="%"
          hint="例如實際比量的重 20%，填 120"
        />
        <NumberField label="實際 kV / 理論" value={knobs.kVScale} display={100} min={10} max={300} onChange={(v) => set({ kVScale: v })} unit="%" />
        <NumberField label="實際慣性 / 理論" value={knobs.kAScale} display={100} min={10} max={300} onChange={(v) => set({ kAScale: v })} unit="%" />
      </div>
      <h3 style={{ marginTop: 18 }}>控制器位置</h3>
      <div className="seg" role="group" aria-label="控制器位置">
        {(['talonfx', 'roborio'] as const).map((l) => (
          <button key={l} type="button" aria-pressed={location === l && periodOverride === null} onClick={() => setLocation(l)}>
            {l === 'talonfx' ? 'TalonFX（1 kHz）' : 'roboRIO（50 Hz）'}
          </button>
        ))}
      </div>
      <details style={{ marginTop: 10 }}>
        <summary className="small" style={{ cursor: 'pointer' }}>
          進階：自訂控制週期
        </summary>
        <div className="fields" style={{ marginTop: 8 }}>
          <NumberField label="控制週期" value={controlPeriod} display={1000} min={1} max={100} onChange={(v) => setPeriodOverride(v)} unit="ms" />
        </div>
      </details>
      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="btn small"
          type="button"
          onClick={() => {
            setKnobs(DEFAULT_KNOBS)
            setLocation('talonfx')
          }}
        >
          重置受控體
        </button>
      </div>
    </div>
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
  if (ps.slotByDirection) {
    rows.push(['往下 kS（Slot 1）', ps.slotByDirection.down.kS, 'V'], ['往下 kG（Slot 1）', ps.slotByDirection.down.kG, 'V'])
  }
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

function MetricsRow({ m, label }: { m: MoveMetrics; label: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{m.profileDuration.toFixed(2)} s</td>
      <td className={'num ' + (m.overshoot <= LIMITS.overshoot ? 'pass' : 'fail')}>{cm(m.overshoot)}</td>
      <td className={'num ' + (m.settlingTime !== null && m.settlingTime <= LIMITS.settling ? 'pass' : 'fail')}>
        {m.settlingTime === null ? '未穩定' : `${m.settlingTime.toFixed(2)} s`}
      </td>
      <td className={'num ' + (m.steadyStateError <= LIMITS.steadyState ? 'pass' : 'fail')}>{cm(m.steadyStateError)}</td>
      <td className={'num ' + (m.maxFollowingError <= LIMITS.following ? 'pass' : 'fail')}>{cm(m.maxFollowingError)}</td>
      <td className="num">{m.peakStatorCurrent.toFixed(0)} A</td>
      <td className={'num ' + (m.saturationFraction <= LIMITS.saturation ? 'pass' : 'fail')}>{(m.saturationFraction * 100).toFixed(1)}%</td>
      <td className={'num ' + (m.holdVoltageRipple <= LIMITS.ripple ? 'pass' : 'fail')}>{m.holdVoltageRipple.toFixed(2)} V</td>
    </tr>
  )
}

function MetricsTable({ moves, other, otherLabel }: { moves: MoveMetrics[]; other: MoveMetrics[] | null; otherLabel: string }) {
  const hints: string[] = []
  for (const m of moves) {
    if (m.saturationFraction > LIMITS.saturation) hints.push('輸出電壓貼到電池電壓：馬達已經全力，調 PID 沒用，先降低 Motion Magic 速度或加速度。')
    if (m.currentLimitFraction > LIMITS.saturation) hints.push('觸發 Stator 電流限制：加速度太大或機構太重，屬於物理限制。')
    if (m.holdVoltageRipple > LIMITS.ripple) hints.push('到位後電壓一直抖：可能在振盪（kP 太大、控制週期太長、延遲），或 kD 把雜訊放大了。')
  }
  const moveLabel = (m: MoveMetrics, i: number) => `${i === 0 ? '往上' : '往下'} → ${m.goal.toFixed(2)} m${moves.some((x) => x.slot === 1) ? `（Slot ${m.slot}）` : ''}`
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
              <th className="num">到位電壓抖動</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((m, i) => (
              <MetricsRow key={i} m={m} label={moveLabel(m, i)} />
            ))}
            {other?.map((m, i) => (
              <MetricsRow key={'o' + i} m={m} label={`${otherLabel}：${i === 0 ? '往上' : '往下'}`} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: '10px 0 0' }}>
        達標標準：超調 ≤ 1 cm、軌跡結束後 0.5 s 內穩定在 ±1 cm、穩態誤差 ≤ 1 cm、跟隨誤差 ≤ 3 cm、電壓飽和 ≤ 2%、到位後電壓抖動 ≤ 0.3 V。
      </p>
      {[...new Set(hints)].map((h) => (
        <div key={h} className="warn">
          {h}
        </div>
      ))}
    </div>
  )
}

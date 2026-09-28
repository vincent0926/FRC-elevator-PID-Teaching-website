import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, type Calibration, type SimSource } from '../../app/store'
import { Chart, type ChartSeries } from '../../components/Chart'
import { NumberField } from '../../components/NumberField'
import { CONTROL_PERIOD, type AntiWindup, type ControllerLocation } from '../../core/controller/slot0'
import { CHALLENGE_ATTEMPTS, makeChallenge, nextStatus, referenceSolution, type ChallengeLevel, type HiddenPlant } from '../../core/challenge'
import { simulate, type SimResult } from '../../core/physics/simulate'
import { passesSpec } from '../../core/physics/spec'
import type { ParameterSet } from '../../schema/parameterSet'
import { runSimulation } from '../../workers/client'
import { ExportPanel } from '../calculate/ExportPanel'
import { CalibrationPanel } from './CalibrationPanel'
import { ChallengePanel, type ChallengeState } from './ChallengePanel'
import { ApproxNote, PLANT_ASSUMPTIONS, SIM_SCOPE } from '../../components/ApproxNote'
import { ControllerSettings } from './ControllerSettings'
import { CustomEditor } from './CustomEditor'
import { AntiWindupEditor } from './AntiWindupEditor'
import { TuningGuide } from './TuningGuide'
import { tuningStepParams } from './tuningSteps'
import { MetricsTable } from './Metrics'
import { SpecEditor } from './SpecEditor'
import { ElevatorView } from './ElevatorView'
import { PlaybackBar, usePlayback } from './MiniShaft'
import { RobustnessPanel } from './RobustnessPanel'
import { ParamLibrary } from '../../components/ParamLibrary'
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

/** 挑戰模式的受控體：真實模型，倍率與摩擦是隱藏的 */
const hiddenKnobs = (h: HiddenPlant): PlantKnobs => ({
  ...DEFAULT_KNOBS,
  realistic: true,
  frictionUp: h.frictionUp,
  frictionDown: h.frictionDown,
  kGScale: h.kGScale,
  kVScale: h.kVScale,
  kAScale: h.kAScale,
})

const calibratedKnobs = (c: Calibration): PlantKnobs => ({
  ...DEFAULT_KNOBS,
  realistic: true,
  frictionUp: c.friction,
  frictionDown: c.friction,
  kGScale: c.kGScale,
  kVScale: c.kVScale,
  kAScale: c.kAScale,
  calibrated: true,
})

export function SimPage() {
  const { mechanism, ff, theory, custom, setCustom, tuning, simSource, setSimSource, baseline, setBaseline, calibration, pendingScenario, openScenario, spec, setSpec, compareSet, setCompareSet } = useStore()
  const [knobs, setKnobs] = useState<PlantKnobs>(DEFAULT_KNOBS)
  const [location, setLocation] = useState<ControllerLocation>('talonfx')
  const [periodOverride, setPeriodOverride] = useState<number | null>(null)
  const [antiWindup, setAntiWindup] = useState<AntiWindup>({ mode: 'none' })
  const [goal, setGoal] = useState(() => Math.round(mechanism.travel * 0.75 * 100) / 100)
  // 起始高度：null = 行程的 10%（跟著機構的行程變）
  const [start, setStart] = useState<number | null>(null)
  const [compare, setCompare] = useState(false)
  const [result, setResult] = useState<SimResult | null>(null)
  const [otherRaw, setOther] = useState<SimResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scenario, setScenario] = useState<SimScenario | null>(null)
  const [challenge, setChallenge] = useState<(ChallengeState & { submitted: ParameterSet }) | null>(null)
  // 送出後等模擬結果出來才判斷勝負
  const judging = useRef(false)
  const specRef = useRef(spec)
  specRef.current = spec
  const pb = usePlayback(result)

  const sets: Record<SimSource, ParameterSet | null> = { theory, tuning, custom }
  const source: SimSource = challenge ? 'custom' : sets[simSource] ? simSource : 'theory'
  const ps = challenge ? challenge.submitted : sets[source]!
  const otherSource: SimSource | null = source === 'custom' ? 'theory' : custom ? 'custom' : null
  const safeGoal = Math.min(mechanism.travel, Math.max(0, goal))
  const safeStart = Math.min(mechanism.travel, Math.max(0, start ?? Math.min(mechanism.travel * 0.1, safeGoal)))
  const controlPeriod = periodOverride ?? CONTROL_PERIOD[location]
  const hidden = challenge?.hidden
  const simKnobs = useMemo(() => (hidden ? hiddenKnobs(hidden) : knobs), [hidden, knobs])

  const setup = useMemo(
    () => ({ mechanism, ff, knobs: simKnobs, controlPeriod, goal: safeGoal, start: safeStart, tolerance: spec.steadyState, antiWindup: challenge ? undefined : antiWindup }),
    [mechanism, ff, simKnobs, controlPeriod, safeGoal, safeStart, spec.steadyState, antiWindup, challenge],
  )
  // 穩健性測試用同一個物件，參數沒變時舊結果才會繼續顯示
  const robustBase = useMemo(() => buildSimInput(setup, ps), [setup, ps])

  useEffect(() => {
    let alive = true
    runSimulation(buildSimInput(setup, ps), 'main')
      .then((r) => {
        if (!alive) return
        setResult(r)
        setError(null)
        if (judging.current) {
          judging.current = false
          setChallenge((c) => (c ? { ...c, status: nextStatus(passesSpec(r.moves, specRef.current), c.attempts, c.max) } : c))
        }
      })
      .catch((e: Error) => alive && e.message !== 'stale' && setError(e.message))
    return () => {
      alive = false
    }
  }, [setup, ps])

  // 參數庫選的參數組優先（挑戰模式不疊）
  const libCompare = challenge ? null : compareSet
  const otherPs = libCompare ? libCompare.params : otherSource ? sets[otherSource] : null
  const otherLabel = libCompare ? `「${libCompare.label}」` : otherSource ? SOURCES.find((s) => s.id === otherSource)!.label : ''
  useEffect(() => {
    if (compareSet) setCompare(true)
  }, [compareSet])
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
    const perMotor = Math.max(1, mechanism.motorCount)
    const cur: ChartSeries[] = [
      { label: '每顆馬達 Stator 電流', color: '--amber', values: result.statorCurrent },
      { label: '每顆馬達電池端（Supply）電流', color: '--blue', dash: true, values: result.supplyCurrent.map((x) => x / perMotor) },
    ]
    return { pos, vel, err: errS, volt, cur }
  }, [result, other, otherLabel, mechanism.motorCount])

  const editCustom = (patch: (p: ParameterSet) => ParameterSet) => custom && setCustom(patch(custom))

  const loadScenario = (s: SimScenario) => {
    const st = s.setup(theory, ff)
    setCustom(st.params)
    setSimSource('custom')
    setKnobs({ ...DEFAULT_KNOBS, ...st.knobs })
    setLocation(st.location)
    setPeriodOverride(null)
    setAntiWindup(st.antiWindup ?? { mode: 'none' })
    setCompare(true)
    setScenario(s)
  }
  const startChallenge = (level: ChallengeLevel) => {
    const probe = (h: HiddenPlant, p: ParameterSet) => passesSpec(simulate(buildSimInput({ ...setup, knobs: hiddenKnobs(h) }, p)).moves, spec)
    // 出題：理論值就過了的不要；參考解答也過不了的也不要
    const hidden = makeChallenge(Math.floor(Math.random() * 1e9), level, (h) => probe(h, theory) || !probe(h, solutionParams(h)))
    if (!hidden) {
      setError('這台電梯的機構資料出不了題目：試了 30 台，不是理論值就過了、就是怎麼調都過不了。檢查 1F 的機構資料（例如 kG 是不是超過計算電壓的一半），或換個難度。')
      return
    }
    setError(null)
    const start: ParameterSet = { ...theory, source: 'custom', createdAt: new Date().toISOString(), note: '挑戰模式' }
    setCustom(start)
    setScenario(null)
    setCompare(false)
    setChallenge({ level, hidden, max: CHALLENGE_ATTEMPTS[level], attempts: 0, status: 'playing', submitted: start })
  }
  const submitChallenge = () => {
    if (!challenge || !custom || challenge.status !== 'playing') return
    judging.current = true
    setChallenge({ ...challenge, attempts: challenge.attempts + 1, submitted: { ...custom } })
  }
  // 參考解答（出題篩選、結束後「用參考解答跑一次」共用）
  const solutionParams = (h: HiddenPlant): ParameterSet => {
    const sol = referenceSolution(h, ff)
    return {
      ...theory,
      source: 'custom',
      createdAt: new Date().toISOString(),
      note: '挑戰模式參考解答',
      feedforward: { kS: sol.kS, kG: sol.kG, kV: sol.kV, kA: sol.kA },
      feedback: { ...theory.feedback, kP: sol.kP },
      motionMagic: { cruiseVelocity: theory.motionMagic.cruiseVelocity * sol.motionMagicScale, acceleration: theory.motionMagic.acceleration * sol.motionMagicScale },
    }
  }
  const trySolution = () => {
    if (!challenge || challenge.status === 'playing') return
    const sp = solutionParams(challenge.hidden)
    setCustom(sp)
    // 不算次數：只是讓你看參考解答在這台電梯上的曲線
    setChallenge({ ...challenge, submitted: sp })
  }
  const quitChallenge = () => {
    judging.current = false
    setChallenge(null)
    setSimSource('custom')
  }
  const applyCalibration = (c: Calibration) => {
    setKnobs(calibratedKnobs(c))
  }

  // 其他頁面（4F 常見的坑）要求載入某個情境
  useEffect(() => {
    if (!pendingScenario) return
    const sc = SIM_SCENARIOS.find((x) => x.id === pendingScenario)
    openScenario(null)
    if (sc) loadScenario(sc)
    // loadScenario 每次 render 都是新的函式，只在 pendingScenario 變的時候跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScenario])

  const leaveScenario = () => {
    setScenario(null)
    setKnobs(DEFAULT_KNOBS)
    setLocation('talonfx')
    setPeriodOverride(null)
    setAntiWindup({ mode: 'none' })
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
          {challenge ? '挑戰中（受控體隱藏）' : knobs.calibrated ? '已校正模型' : knobs.realistic ? '真實模型' : '理想模型'}・{knobs.realistic && !challenge ? (knobs.controllerType === 'sparkmax' ? 'SPARK MAX' : 'TalonFX') + ' ' : ''}{location === 'talonfx' ? '1 kHz' : 'roboRIO 50 Hz'}
        </span>
      </div>

      <ChallengePanel
        state={challenge}
        onStart={startChallenge}
        onSubmit={submitChallenge}
        onQuit={quitChallenge}
        solution={challenge && challenge.status !== 'playing' ? referenceSolution(challenge.hidden, ff) : null}
        submitted={challenge?.submitted ?? null}
        onTrySolution={trySolution}
      />
      {!challenge && (
        <TuningGuide
          onStep={(i) => {
            setScenario(null)
            setCustom(tuningStepParams(theory, i, knobs.realistic && knobs.friction ? knobs.frictionUp : 0))
            setSimSource('custom')
          }}
          onReset={() => {
            setScenario(null)
            setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString(), note: '理論值' })
            setSimSource('custom')
          }}
          onWellTuned={() => {
            setScenario(null)
            // 前饋補上目前受控體的摩擦（理想模型沒有摩擦就是理論值）
            const kS = knobs.realistic && knobs.friction ? (knobs.frictionUp + knobs.frictionDown) / 2 : theory.feedforward.kS
            const dKg = knobs.realistic && knobs.friction ? (knobs.frictionUp - knobs.frictionDown) / 2 : 0
            setCustom({
              ...theory,
              source: 'custom',
              createdAt: new Date().toISOString(),
              note: '調好的範例',
              feedforward: { ...theory.feedforward, kS, kG: theory.feedforward.kG * knobs.kGScale + dKg, kV: theory.feedforward.kV * knobs.kVScale, kA: theory.feedforward.kA * knobs.kAScale },
            })
            setSimSource('custom')
          }}
          onScenario={(id) => {
            const sc = SIM_SCENARIOS.find((s) => s.id === id)
            if (sc) loadScenario(sc)
          }}
        />
      )}
      {!challenge && <ScenarioPicker active={scenario} onPick={loadScenario} onLeave={leaveScenario} />}

      <div className="bar">
        <div className="seg" role="group" aria-label="參數來源">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={source === s.id}
              disabled={(!sets[s.id] && s.id !== 'custom') || (!!challenge && s.id !== 'custom')}
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
        <div style={{ width: 140 }}>
          <NumberField label="起始高度" value={safeStart} onChange={setStart} unit="m" step={0.05} min={0} max={mechanism.travel} />
        </div>
        <div style={{ width: 140 }}>
          <NumberField label="目標高度" value={goal} onChange={setGoal} unit="m" step={0.05} min={0} max={mechanism.travel} />
        </div>
        {otherPs && (
          <label className="check">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            疊上{otherLabel}比較
          </label>
        )}
        {libCompare && (
          <button className="linkbtn small" type="button" onClick={() => setCompareSet(null)}>
            不疊參數庫的，改回{otherSource ? SOURCES.find((s) => s.id === otherSource)!.label : '原本的'}
          </button>
        )}
      </div>

      {error && <div className="warn">模擬失敗：{error}</div>}
      {source === 'tuning' && !knobs.calibrated && !challenge && (
        <div className="note" style={{ marginBottom: 12 }}>
          未校正，僅供參考：目前的受控體是用 1F 理論值算的。到下面「模型校正」用實機日誌校正後，預覽調參建議會比較接近真的機器人。
        </div>
      )}

      <div className="simwrap">
        <ElevatorView result={result} mechanism={mechanism} goal={safeGoal} idx={pb.idx} />
        <div className="panel stack">
          <PlaybackBar result={result} pb={pb} />
          {charts && result && (
            <>
              <Chart title="位置" x={result.t} series={charts.pos} height={220} yLabel="m" syncKey="sim" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note="虛線是 Motion Magic 的軌跡（電梯應該在的高度），實線是電梯真的位置（鼓輪線位移）。兩條線貼在一起就是跟得好。" />
              <Chart title="跟隨誤差" x={result.t} series={charts.err} height={130} yLabel="cm" syncKey="sim" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note="軌跡減實際位置。正的是落後（還沒到）、負的是超前或衝過頭。停住後應該回到 0 附近。" />
              <Chart title="速度" x={result.t} series={charts.vel} height={130} yLabel="m/s" syncKey="sim" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note="虛線是軌跡要的速度（梯形：加速、等速、減速），實線是真的速度。" />
              <Chart title="電壓（前饋 + 回授）" x={result.t} series={charts.volt} height={170} yLabel="V" syncKey="sim" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note="綠線是前饋（kS + kG + kV·v + kA·a，照軌跡事先算好），紅線是回授（P+I+D，看誤差補的）。前饋準的時候紅線幾乎是 0；紅線一直偏同一邊，就是前饋哪裡不對。" />
              <Chart title="電流" x={result.t} series={charts.cur} height={130} yLabel="A" syncKey="sim" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note="每顆馬達的電流。貼著電流限制（真實模型）時馬達已經出全力，調 PID 沒有用，要放慢 Motion Magic。" />
            </>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            在圖上拖曳可以放大時間軸，點兩下還原。
          </p>
        </div>
      </div>

      {result && (
        <MetricsTable
          moves={result.moves}
          other={other?.moves ?? null}
          otherLabel={otherLabel}
          spec={spec}
          editor={!challenge && <SpecEditor spec={spec} setSpec={setSpec} />}
        />
      )}

      <div className="grid2" style={{ marginTop: 20 }}>
        <div className="panel">
          <h2>參數（{SOURCES.find((s) => s.id === source)!.label}）</h2>
          {source === 'custom' && custom ? (
            <CustomEditor
              custom={custom}
              edit={editCustom}
              resetTheory={() => setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString() })}
              baseline={baseline}
              setBaseline={(p) => setBaseline({ ...p, createdAt: new Date().toISOString(), note: p.note ?? '自訂' })}
              resetBaseline={() => baseline && setCustom({ ...baseline, source: 'custom', createdAt: new Date().toISOString() })}
              locked={!!challenge}
            />
          ) : (
            <>
              <GainList ps={ps} />
              <p className="small muted" style={{ marginTop: 10 }}>
                {source === 'theory' ? '理論值由 1F 的機構資料算出，這裡不能改。' : '調參建議值來自 2F，一次只改一個參數。'}想自由調整，切到「自訂」。
              </p>
            </>
          )}
          {!challenge && <AntiWindupEditor value={antiWindup} onChange={setAntiWindup} kI={ps.feedback.kI} />}
          <details style={{ marginTop: 16 }}>
            <summary className="small" style={{ cursor: 'pointer' }}>
              達標了？輸出這組參數
            </summary>
            <div style={{ marginTop: 12 }}>
              <ExportPanel ps={ps} />
            </div>
          </details>
        </div>

        {challenge ? (
          <div className="panel">
            <h2>受控體（隱藏中）</h2>
            <p className="small muted">挑戰模式：這台電梯跟理論值不一樣，但不告訴你哪裡不一樣。真實模型（摩擦、電流限制、電池壓降），TalonFX 1 kHz。挑戰結束後會公布答案。</p>
          </div>
        ) : (
        <PlantPanel
          statorDefault={mechanism.statorCurrentLimit}
          travel={mechanism.travel}
          calibration={calibration}
          onCalibrated={() => calibration && applyCalibration(calibration)}
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
        )}
      </div>

      {!challenge && (
        <>
          <RobustnessPanel base={robustBase} mechanism={mechanism} ff={ff} realistic={knobs.realistic} spec={spec} />
          <CalibrationPanel onApply={applyCalibration} />
          <details className="panel scen" style={{ marginTop: 20 }}>
            <summary>
              <b>參數庫</b>
              <span className="small muted">存下調好的參數組（理論值、模擬最佳、實機最終），逐項比較或疊圖。</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <ParamLibrary current={ps} currentLabel={SOURCES.find((s) => s.id === source)!.label} defaultTag="simBest" />
            </div>
          </details>
        </>
      )}
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

function PlantPanel({
  statorDefault,
  travel,
  calibration,
  onCalibrated,
  knobs,
  setKnobs,
  location,
  periodOverride,
  controlPeriod,
  setLocation,
  setPeriodOverride,
  continuous,
}: {
  statorDefault: number
  travel: number
  calibration: Calibration | null
  onCalibrated: () => void
  knobs: PlantKnobs
  setKnobs: (k: PlantKnobs) => void
  location: ControllerLocation
  periodOverride: number | null
  controlPeriod: number
  setLocation: (l: ControllerLocation) => void
  setPeriodOverride: (v: number) => void
  continuous: boolean
}) {
  const set = (patch: Partial<PlantKnobs>) => setKnobs({ ...knobs, ...patch, calibrated: false })
  return (
    <div className="panel">
      <h2>受控體（模擬的電梯）</h2>
      <div className="seg" role="group" aria-label="模型">
        <button type="button" aria-pressed={!knobs.realistic} onClick={() => set({ realistic: false })}>
          理想模型
        </button>
        <button type="button" aria-pressed={knobs.realistic && !knobs.calibrated} onClick={() => set({ realistic: true })}>
          真實模型
        </button>
        <button type="button" aria-pressed={knobs.calibrated} disabled={!calibration} title={calibration ? undefined : '先到下面「模型校正」用實機日誌校正'} onClick={onCalibrated}>
          已校正
        </button>
      </div>
      <p className="small muted" style={{ margin: '8px 0 12px' }}>
        {knobs.calibrated && calibration
          ? `重力、kV、慣性、摩擦用「${calibration.logName}」校正過（重播誤差 ${(calibration.rms * 100).toFixed(1)} cm）。改任何一項就變回一般的真實模型。`
          : knobs.realistic
          ? '每一項都可以單獨開關。一次只開一項，看圖怎麼變，就知道它對電梯的影響。'
          : '沒有摩擦、沒有電流限制、沒有控制器的其他限制，只有重力、慣性和反電動勢（電壓最多到電池電壓）。理論值在這裡應該幾乎完美。馬達控制器的設定（電流限制、軟體限位、輸出上限）在真實模型裡。'}
      </p>
      <ApproxNote
        summary={
          knobs.calibrated
            ? '校正只調了重力、kV、慣性、摩擦四個數，其他簡化還在。用來預覽趨勢、抓明顯的錯，數字以實測為準。'
            : '教學模擬：用來理解趨勢、先抓出明顯的錯（振盪、飽和、撞限位），不是 TalonFX 韌體的數值重現，也不保證跟真的機器人一樣。數字以實測為準。'
        }
        items={PLANT_ASSUMPTIONS}
      >
        <p className="small" style={{ margin: '8px 0 4px' }}>
          <b>教學模擬，不是 TalonFX／SPARK MAX 韌體的數值重現。</b>
        </p>
        <div className="sim-scope">
          {SIM_SCOPE.map((g) => (
            <div key={g.title}>
              <b className="small">{g.title}</b>
              <ul className="small">
                {g.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ApproxNote>
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
      {knobs.realistic && <ControllerSettings knobs={knobs} set={set} statorDefault={statorDefault} travel={travel} />}
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
            {l === 'talonfx' ? '馬達控制器內建（1 kHz）' : 'roboRIO（50 Hz）'}
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


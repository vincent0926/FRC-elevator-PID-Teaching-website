import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../app/store'
import { useElevator, type Calibration, type SimSource } from '../../app/elevatorStore'
import { Chart, type ChartSeries } from '../../components/Chart'
import { NumberField } from '../../components/NumberField'
import { CONTROL_PERIOD, type AntiWindup, type ControllerLocation } from '../../core/controller/slot0'
import { CHALLENGE_ATTEMPTS, makeChallenge, nextStatus, referenceSolution, type ChallengeLevel, type HiddenPlant } from '../../core/challenge'
import { resampleByTime, simulate, type SimResult } from '../../core/physics/simulate'
import { passesSpec } from '../../core/physics/spec'
import type { ParameterSet } from '../../schema/parameterSet'
import { runSimulation } from '../../workers/client'
import { CalibrationPanel } from './CalibrationPanel'
import { ChallengePanel, type ChallengeState } from './ChallengePanel'
import { ApproxNote, PLANT_ASSUMPTIONS, SIM_SCOPE } from '../../components/ApproxNote'
import { ControllerSettings } from './ControllerSettings'
import { CustomEditor } from './CustomEditor'
import { TuneSliders } from '../../components/TuneSliders'
import { metersPerRotation } from '../../core/units'
import { alignedFromSim } from '../../core/log/sampleLog'
import type { TuneKey } from './tuneRange'
import { AntiWindupEditor } from './AntiWindupEditor'
import { TuningGuide } from './TuningGuide'
import { tuningStepParams } from './tuningSteps'
import { MetricsTable } from './Metrics'
import { SpecEditor } from './SpecEditor'
import { ElevatorView } from './ElevatorView'
import { Fold } from '../../components/Fold'
import { useSlow } from '../../components/useSlow'
import { PlaybackBar, usePlayback } from './MiniShaft'
import { RobustnessPanel } from './RobustnessPanel'
import { buildSimInput, DEFAULT_KNOBS, TOGGLES, type PlantKnobs } from './plantKnobs'
import { SIM_SCENARIOS, type SimScenario } from './simScenarios'
import { HelpLink } from '../../components/HelpLink'
import { GUIDE_ANCHOR } from '../guide/guideContent'
import { t } from '../../core/lang'
import { SERIES_STYLE } from '../../components/seriesStyle'

/**
 * 3F 模擬。三個入口（理論值、調參建議值、自訂）共用這一頁，差別只在參數來源。
 * 受控體永遠是「目前的機構」；真實模型可以故意讓機構跟理論不一樣，看參數錯了會怎樣。
 * 教學情境會把參數換成「自訂」並設定受控體，按一下就能看到某個觀念。
 */

const SOURCES: { id: SimSource; label: string }[] = [
  { id: 'theory', label: t('理論值', 'Theory') },
  { id: 'tuning', label: t('調參建議值', 'Tuning suggestion') },
  { id: 'custom', label: t('自訂', 'Custom') },
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

const ELEVATOR_UNITS: Record<TuneKey, string> = {
  kS: 'V',
  kG: 'V',
  kV: 'V/(m/s)',
  kA: 'V/(m/s²)',
  kP: 'V/m',
  kI: 'V/(m·s)',
  kD: 'V/(m/s)',
  cruiseVelocity: 'm/s',
  acceleration: 'm/s²',
}

export function SimPage() {
  const { pendingScenario, openScenario, go } = useStore()
  const { mechanism, ff, theory, custom, setCustom, tuning, simSource, setSimSource, baseline, setBaseline, calibration, spec, setSpec, compareSet, setCompareSet, setSimLog } = useElevator()
  const [knobs, setKnobs] = useState<PlantKnobs>(DEFAULT_KNOBS)
  const [location, setLocation] = useState<ControllerLocation>('talonfx')
  const [periodOverride, setPeriodOverride] = useState<number | null>(null)
  const [antiWindup, setAntiWindup] = useState<AntiWindup>({ mode: 'none' })
  const [goal, setGoal] = useState(() => Math.round(mechanism.travel * 0.75 * 100) / 100)
  // 起始高度：null = 行程的 10%（跟著機構的行程變）
  const [start, setStart] = useState<number | null>(null)
  const [compare, setCompare] = useState(false)
  const [result, setResult] = useState<SimResult | null>(null)
  // 這個結果是用哪組參數、哪個閉迴路位置算的（送到 2F 要帶這份，不是畫面上現在的值：新模擬還沒算完時兩者不同）
  const [resultInfo, setResultInfo] = useState<{ params: ParameterSet; location: ControllerLocation; label: string; challenge: boolean } | null>(null)
  const [otherRaw, setOther] = useState<SimResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 結果是用哪一份輸入算的：跟現在的輸入不同就是還在算
  const [doneFor, setDoneFor] = useState<{ setup: unknown; ps: unknown } | null>(null)
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
        setDoneFor({ setup, ps })
        setResultInfo({ params: ps, location, label: SOURCES.find((s) => s.id === source)!.label, challenge: !!challenge })
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
  // 還在算：輸入變了但結果還是上一份。算超過 0.25 秒才顯示，拖滑桿時不會閃
  const pending = !error && (!doneFor || doneFor.setup !== setup || doneFor.ps !== ps)
  const slow = useSlow(pending ? ps : null)

  // 從滑桿切到自訂時存下的那組（例如調參建議值）優先當疊圖對象（挑戰模式不疊）
  const libCompare = challenge ? null : compareSet
  const otherPs = libCompare ? libCompare.params : otherSource ? sets[otherSource] : null
  const otherLabel = libCompare ? t(`「${libCompare.label}」`, `“${libCompare.label}”`) : otherSource ? SOURCES.find((s) => s.id === otherSource)!.label : ''
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
    // 比較那組依時間對到這組的時間軸上，播放時圖例才是同一個時間的值
    const fit = (a: Float64Array) => (other ? resampleByTime(result.t, other.t, a) : a)
    const err = (r: SimResult) => r.refPos.map((x, i) => (x - r.pos[i]) * 100)
    const pos: ChartSeries[] = [
      { label: t('目標（軌跡）', 'Target (profile)'), color: '--steel', dash: true, values: result.refPos },
      { label: t('實際位置', 'Actual position'), color: '--blue', values: result.pos },
    ]
    const vel: ChartSeries[] = [
      { label: t('參考速度', 'Reference velocity'), color: '--steel', dash: true, values: result.refVel },
      { label: t('實際速度', 'Actual velocity'), color: '--blue', values: result.vel },
    ]
    const errS: ChartSeries[] = [{ label: t('跟隨誤差（目標 − 實際）', 'Following error (target − actual)'), color: '--red', values: err(result) }]
    if (other) {
      pos.push({ label: t(`${otherLabel}的實際位置`, `${otherLabel} actual position`), color: '--violet', values: fit(other.pos) })
      vel.push({ label: t(`${otherLabel}的實際速度`, `${otherLabel} actual velocity`), color: '--violet', values: fit(other.vel) })
      errS.push({ label: t(`${otherLabel}的跟隨誤差`, `${otherLabel} following error`), color: '--violet', values: fit(err(other)) })
    }
    const volt: ChartSeries[] = [
      { label: t('輸出電壓', 'Output voltage'), color: '--ink-2', values: result.voltage },
      { label: t('前饋', 'Feedforward'), ...SERIES_STYLE.feedforward, values: result.feedforward },
      { label: t('回授（P+I+D）', 'Feedback (P+I+D)'), ...SERIES_STYLE.feedback, values: result.feedback },
    ]
    const perMotor = Math.max(1, mechanism.motorCount)
    const cur: ChartSeries[] = [
      { label: t('每顆馬達 Stator 電流', 'Stator current per motor'), color: '--amber', values: result.statorCurrent },
      { label: t('每顆馬達電池端（Supply）電流', 'Battery-side (supply) current per motor'), color: '--blue', dash: true, values: result.supplyCurrent.map((x) => x / perMotor) },
    ]
    return { pos, vel, err: errS, volt, cur }
  }, [result, other, otherLabel, mechanism.motorCount])

  const editCustom = (patch: (p: ParameterSet) => ParameterSet) => custom && setCustom(patch(custom))
  // 滑桿：看的不是「自訂」時，用畫面上這組參數當起點切到自訂，並疊上原本那組比較
  const tweak = (patch: (p: ParameterSet) => ParameterSet) => {
    if (source === 'custom' && custom) {
      setCustom(patch(custom))
      return
    }
    const label = SOURCES.find((x) => x.id === source)!.label
    setCustom(patch({ ...ps, source: 'custom', createdAt: new Date().toISOString(), note: t(`從${label}開始調`, `Tuned from ${label}`) }))
    setSimSource('custom')
    // 疊圖要比的是剛才看的那組：理論值切過來時自然會比理論值；其他來源（調參建議值）存一份快照來比
    setCompareSet(source === 'theory' ? null : { label, params: ps })
    setCompare(true)
  }
  const resetToTheory = () => {
    setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString(), note: t('理論值', 'Theory') })
    setSimSource('custom')
  }

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
      setError(t('這台電梯的機構資料出不了題目：試了 30 台，不是理論值就過了、就是怎麼調都過不了。檢查 1F 的機構資料（例如 kG 是不是超過計算電壓的一半），或換個難度。', 'Couldn’t make a challenge from this elevator’s mechanism data: of 30 tries, each either passed with theory values or couldn’t pass no matter what. Check the 1F mechanism data (e.g. whether kG is over half the calculation voltage), or try another difficulty.'))
      return
    }
    setError(null)
    const start: ParameterSet = { ...theory, source: 'custom', createdAt: new Date().toISOString(), note: t('挑戰模式', 'Challenge mode') }
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
      note: t('挑戰模式參考解答', 'Challenge reference solution'),
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
          <h1 id="t-sim">{t('模擬', 'Simulate')}</h1>
          <p className="lead">
            {t('上機前先在模擬裡找出明顯的參數問題。改一個數字看看會怎樣，不用怕撞壞機構。', 'Find obvious gain problems in the sim before going to the robot. Change a number and see what happens, with no risk of breaking anything.')}{' '}
            <HelpLink section={GUIDE_ANCHOR.sim} />
          </p>
        </div>
        <span className="phase">
          {challenge ? t('挑戰中（受控體隱藏）', 'Challenge (plant hidden)') : knobs.calibrated ? t('已校正模型', 'Calibrated model') : knobs.realistic ? t('真實模型', 'Realistic model') : t('理想模型', 'Ideal model')}・{knobs.realistic && !challenge ? (knobs.controllerType === 'sparkmax' ? 'SPARK MAX' : 'TalonFX') + ' ' : ''}{location === 'talonfx' ? '1 kHz' : 'roboRIO 50 Hz'}
        </span>
      </div>

      <div className="scen-row">
      {!challenge && (
        <TuningGuide
          onStep={(i) => {
            setScenario(null)
            setCustom(tuningStepParams(theory, i, knobs.realistic && knobs.friction ? knobs.frictionUp : 0))
            setSimSource('custom')
          }}
          onReset={() => {
            setScenario(null)
            setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString(), note: t('理論值', 'Theory') })
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
              note: t('調好的範例', 'Tuned example'),
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
      <ChallengePanel
        state={challenge}
        onStart={startChallenge}
        onSubmit={submitChallenge}
        onQuit={quitChallenge}
        solution={challenge && challenge.status !== 'playing' ? referenceSolution(challenge.hidden, ff) : null}
        submitted={challenge?.submitted ?? null}
        onTrySolution={trySolution}
      />
      </div>

      <div className="bar">
        <div className="seg" role="group" aria-label={t('參數來源', 'Gain source')}>
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={source === s.id}
              disabled={(!sets[s.id] && s.id !== 'custom') || (!!challenge && s.id !== 'custom')}
              title={s.id === 'tuning' && !tuning ? t('還沒有調參建議值：先到 2F 分析日誌並套用一個建議', 'No tuning suggestion yet: analyze a log in 2F and apply a suggestion first') : undefined}
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
          <NumberField label={t('起始高度', 'Start height')} value={safeStart} onChange={setStart} unit="m" step={0.05} min={0} max={mechanism.travel} />
        </div>
        <div style={{ width: 140 }}>
          <NumberField label={t('目標高度', 'Target height')} value={goal} onChange={setGoal} unit="m" step={0.05} min={0} max={mechanism.travel} />
        </div>
        {otherPs && (
          <label className="check">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            {t(`疊上${otherLabel}比較`, `Overlay ${otherLabel} to compare`)}
          </label>
        )}
        {libCompare && (
          <button className="linkbtn small" type="button" onClick={() => setCompareSet(null)}>
            {t(`不疊「${libCompare.label}」，改回${otherSource ? SOURCES.find((s) => s.id === otherSource)!.label : '原本的'}`, `Stop overlaying “${libCompare.label}”, back to ${otherSource ? SOURCES.find((s) => s.id === otherSource)!.label : 'the original'}`)}
          </button>
        )}
        {!challenge && (
          <button
            className="btn small"
            type="button"
            disabled={!result || !resultInfo || resultInfo.challenge}
            title={t('把這次模擬的資料送到 2F 調參建議，看哪個參數該先改', 'Send this simulation’s data to 2F tuning advice to see which gain to change first')}
            onClick={() => {
              // 挑戰模式的結果（隱藏的受控體）不能送：退出挑戰後、一般模擬還沒算完前，畫面上還是挑戰的結果
              if (!result || !resultInfo || resultInfo.challenge) return
              setSimLog({ log: alignedFromSim(result), name: t(`3F 模擬（${resultInfo.label}）`, `3F sim (${resultInfo.label})`), params: resultInfo.params, location: resultInfo.location })
              go('tune')
            }}
          >
            {t('送到 2F 調參建議', 'Send to 2F tuning advice')}
          </button>
        )}
      </div>

      {error && <div className="warn">{t('模擬失敗：', 'Simulation failed: ')}{error}</div>}
      {source === 'tuning' && !knobs.calibrated && !challenge && (
        <div className="note" style={{ marginBottom: 12 }}>
          {t(
            <>
            未校正，僅供參考：目前的受控體是用 1F 理論值算的。到下面「模型校正」用實機日誌校正後，預覽調參建議會比較接近真的機器人。
            </>,
            <>
              Not calibrated, for reference only: the current plant is computed from the 1F theory values. Calibrate it with a robot log in “Model calibration” below, and the tuning suggestion preview gets closer to the real robot.
            </>,
          )}
        </div>
      )}

      <div className={slow ? 'simwrap busy' : 'simwrap'} aria-busy={slow}>
        <ElevatorView result={result} mechanism={mechanism} goal={safeGoal} idx={pb.idx} />
        <div className="panel stack">
          {slow && (
            <div className="small calc-busy" role="status">
              {t('計算中…下面的圖還是上一份的結果', 'Computing… the charts below are still the previous result')}
            </div>
          )}
          <PlaybackBar result={result} pb={pb} />
          {!challenge && (
            <TuneSliders
              mechanism="elevator"
              values={ps}
              theory={theory}
              editingCustom={source === 'custom'}
              sourceLabel={SOURCES.find((x) => x.id === source)!.label}
              onEdit={tweak}
              onResetAll={resetToTheory}
              units={ELEVATOR_UNITS}
              rotation={{
                perRot: metersPerRotation(mechanism.drumRadius),
                note: t(`鼓輪轉 1 圈 = ${metersPerRotation(mechanism.drumRadius).toFixed(4)} m`, `One drum turn = ${metersPerRotation(mechanism.drumRadius).toFixed(4)} m`),
                copy: ps.slotByDirection ? t('kV、kA、kP、kI、kD 的數字 Slot0Configs（往上）和 Slot1Configs（往下）都填一樣的；kS、kG 照下面參數區的往上、往下分開填；巡航速度、加速度填 MotionMagicConfigs。', 'kV, kA, kP, kI and kD go into both Slot0Configs (up) and Slot1Configs (down) the same; set kS and kG separately for up and down in the gain section below; cruise velocity and acceleration go into MotionMagicConfigs.') : undefined,
              }}
              disabled={ps.slotByDirection ? { kS: t('開了往下 Slot 1，kS 在下面的參數區分往上、往下設', 'With the down Slot 1 on, set kS separately for up and down in the gain section below'), kG: t('開了往下 Slot 1，kG 在下面的參數區分往上、往下設', 'With the down Slot 1 on, set kG separately for up and down in the gain section below') } : undefined}
            />
          )}
          {charts && result && (
            <>
              <Chart title={t('位置', 'Position')} x={result.t} series={charts.pos} height={220} yLabel="m" syncKey="sim" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note={t('虛線是 Motion Magic 的軌跡（電梯應該在的高度），實線是電梯真的位置（鼓輪線位移）。兩條線貼在一起就是跟得好。', 'The dashed line is the Motion Magic profile (where the elevator should be) and the solid line is the real position (drum rope displacement). When the two lines overlap, it’s tracking well.')} />
              <Chart title={t('跟隨誤差', 'Following error')} x={result.t} series={charts.err} height={170} yLabel="cm" syncKey="sim" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note={t('軌跡減實際位置。正的是落後（還沒到）、負的是超前或衝過頭。停住後應該回到 0 附近。', 'Profile minus actual position. Positive is lagging (not there yet); negative is ahead or overshooting. After stopping it should return near 0.')} />
              <Chart title={t('速度', 'Velocity')} x={result.t} series={charts.vel} height={170} yLabel="m/s" syncKey="sim" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note={t('虛線是軌跡要的速度（梯形：加速、等速、減速），實線是真的速度。', 'The dashed line is the profile’s velocity (trapezoid: accelerate, cruise, decelerate) and the solid line is the real velocity.')} />
              <Chart title={t('電壓（前饋 + 回授）', 'Voltage (feedforward + feedback)')} x={result.t} series={charts.volt} height={190} yLabel="V" syncKey="sim" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note={t('綠線是前饋（kS + kG + kV·v + kA·a，照軌跡事先算好），紅線是回授（P+I+D，看誤差補的）。前饋準的時候紅線幾乎是 0；紅線一直偏同一邊，就是前饋哪裡不對。', 'The green line is feedforward (kS + kG + kV·v + kA·a, computed ahead from the profile) and the red line is feedback (P+I+D, making up the error). With accurate feedforward the red line is almost 0; if it stays on one side, something in the feedforward is off.')} />
              <Chart title={t('電流', 'Current')} x={result.t} series={charts.cur} height={170} yLabel="A" syncKey="sim" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note={t('每顆馬達的電流。貼著電流限制（真實模型）時馬達已經出全力，調 PID 沒有用，要放慢 Motion Magic。', 'Current per motor. When it’s pinned at the current limit (realistic model) the motor is already giving everything; tuning PID won’t help, so slow down Motion Magic.')} />
            </>
          )}
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
        <Fold
          open={source === 'custom'}
          title={source === 'custom' ? t('自訂參數：Slot 1 與基準', 'Custom gains: Slot 1 and baseline') : t('進階設定', 'Advanced settings')}
          summary={t(`積分防飽和：${antiWindup.mode === 'none' ? '沒有' : '有'}${source === 'custom' ? '，可改 Slot 1 與基準' : ''}`, `Anti-windup: ${antiWindup.mode === 'none' ? 'none' : 'on'}${source === 'custom' ? '; Slot 1 and baseline editable' : ''}`)}
        >
          {source === 'custom' && custom && (
            <CustomEditor
              custom={custom}
              edit={editCustom}
              resetTheory={() => setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString() })}
              baseline={baseline}
              setBaseline={(p) => setBaseline({ ...p, createdAt: new Date().toISOString(), note: p.note ?? t('自訂', 'Custom') })}
              resetBaseline={() => baseline && setCustom({ ...baseline, source: 'custom', createdAt: new Date().toISOString() })}
              locked={!!challenge}
            />
          )}
          {/* 滑桿在開了 Slot 1 時把 kS、kG 停用並指到這裡；不是自訂時沒有編輯欄，至少讓人看到往上、往下各是多少 */}
          {source !== 'custom' && ps.slotByDirection && (
            <p className="small">
              {t(
                `往上（Slot 0）kS ${ps.slotByDirection.up.kS.toFixed(3)} V、kG ${ps.slotByDirection.up.kG.toFixed(3)} V；往下（Slot 1）kS ${ps.slotByDirection.down.kS.toFixed(3)} V、kG ${ps.slotByDirection.down.kG.toFixed(3)} V`,
                `Up (Slot 0) kS ${ps.slotByDirection.up.kS.toFixed(3)} V, kG ${ps.slotByDirection.up.kG.toFixed(3)} V; down (Slot 1) kS ${ps.slotByDirection.down.kS.toFixed(3)} V, kG ${ps.slotByDirection.down.kG.toFixed(3)} V`,
              )}
            </p>
          )}
          {!challenge && <AntiWindupEditor value={antiWindup} onChange={setAntiWindup} kI={ps.feedback.kI} />}
        </Fold>

        {challenge ? (
          <Fold open title={t('受控體（隱藏中）', 'Plant (hidden)')} summary={t('挑戰模式', 'Challenge mode')}>
            <p className="small muted">{t('挑戰模式：這台電梯跟理論值不一樣，但不告訴你哪裡不一樣。真實模型（摩擦、電流限制、電池壓降），TalonFX 1 kHz。挑戰結束後會公布答案。', 'Challenge mode: this elevator differs from theory, but you aren’t told how. Realistic model (friction, current limits, battery sag), TalonFX 1 kHz. The answer is revealed when the challenge ends.')}</p>
          </Fold>
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
          open={scenario !== null}
        />
        )}
      </div>

      {!challenge && (
        <>
          <RobustnessPanel base={robustBase} mechanism={mechanism} ff={ff} realistic={knobs.realistic} spec={spec} />
          <CalibrationPanel onApply={applyCalibration} />
        </>
      )}
    </section>
  )
}

function ScenarioPicker({ active, onPick, onLeave }: { active: SimScenario | null; onPick: (s: SimScenario) => void; onLeave: () => void }) {
  return (
    <details className="panel scen" open={active !== null || undefined}>
      <summary>
        <b>{t('教學情境', 'Teaching scenarios')}</b>
        <span className="small muted">{t('按一下載入一個「故意設錯」的例子，看圖找出問題。會換掉目前的「自訂」參數。', 'Click to load a deliberately wrong example and find the problem from the charts. This replaces your current “Custom” gains.')}</span>
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
            <dt>{t('看哪裡', 'Where to look')}</dt>
            <dd>{active.lookFor}</dd>
            <dt>{t('接著試試', 'Try next')}</dt>
            <dd>{active.tryNext}</dd>
          </dl>
          <button className="btn small" type="button" onClick={onLeave}>
            {t('離開情境（回到理論值、理想模型）', 'Leave scenario (back to theory, ideal model)')}
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
  open,
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
  open: boolean
}) {
  const set = (patch: Partial<PlantKnobs>) => setKnobs({ ...knobs, ...patch, calibrated: false })
  return (
    <Fold
      open={open}
      title={t('受控體（模擬的電梯）', 'Plant (the simulated elevator)')}
      summary={t(`${knobs.calibrated ? '已校正' : knobs.realistic ? '真實' : '理想'}模型，${location === 'talonfx' ? 'TalonFX 1 kHz' : 'roboRIO 50 Hz'}`, `${knobs.calibrated ? 'Calibrated' : knobs.realistic ? 'Realistic' : 'Ideal'} model, ${location === 'talonfx' ? 'TalonFX 1 kHz' : 'roboRIO 50 Hz'}`)}
    >
      <div className="seg" role="group" aria-label={t('模型', 'Model')}>
        <button type="button" aria-pressed={!knobs.realistic} onClick={() => set({ realistic: false })}>
          {t('理想模型', 'Ideal model')}
        </button>
        <button type="button" aria-pressed={knobs.realistic && !knobs.calibrated} onClick={() => set({ realistic: true })}>
          {t('真實模型', 'Realistic model')}
        </button>
        <button type="button" aria-pressed={knobs.calibrated} disabled={!calibration} title={calibration ? undefined : t('先到下面「模型校正」用實機日誌校正', 'First calibrate with a robot log in “Model calibration” below')} onClick={onCalibrated}>
          {t('已校正', 'Calibrated')}
        </button>
      </div>
      <p className="small muted" style={{ margin: '8px 0 12px' }}>
        {knobs.calibrated && calibration
          ? t(`重力、kV、慣性、摩擦用「${calibration.logName}」校正過（重播誤差 ${(calibration.rms * 100).toFixed(1)} cm）。改任何一項就變回一般的真實模型。`, `Gravity, kV, inertia and friction were calibrated with “${calibration.logName}” (replay error ${(calibration.rms * 100).toFixed(1)} cm). Changing anything switches back to the plain realistic model.`)
          : knobs.realistic
          ? t('每一項都可以單獨開關。一次只開一項，看圖怎麼變，就知道它對電梯的影響。', 'Each item can be switched on and off separately. Turn on one at a time and watch how the charts change to see its effect on the elevator.')
          : t('沒有摩擦、沒有電流限制、沒有控制器的其他限制，只有重力、慣性和反電動勢（電壓最多到電池電壓）。理論值在這裡應該幾乎完美。', 'No friction, no current limit, no other controller limits: only gravity, inertia and back-EMF (voltage up to the battery voltage). Theory values should be nearly perfect here.')}
      </p>
      <ApproxNote
        summary={
          knobs.calibrated
            ? t('校正只調了重力、kV、慣性、摩擦四個數，其他簡化還在。用來預覽趨勢、抓明顯的錯，數字以實測為準。', 'Calibration only adjusts four numbers (gravity, kV, inertia, friction); the other simplifications remain. Use it to preview trends and catch obvious mistakes; real numbers come from testing.')
            : t('教學模擬：用來理解趨勢、先抓出明顯的錯（振盪、飽和、撞限位），不是 TalonFX 韌體的數值重現，也不保證跟真的機器人一樣。數字以實測為準。', 'A teaching simulation: for understanding trends and catching obvious mistakes first (oscillation, saturation, hitting limits). It isn’t a numerical reproduction of TalonFX firmware, and it isn’t guaranteed to match the real robot. Real numbers come from testing.')
        }
        items={PLANT_ASSUMPTIONS}
      >
        <p className="small" style={{ margin: '8px 0 4px' }}>
          <b>{t('教學模擬，不是 TalonFX／SPARK MAX 韌體的數值重現。', 'A teaching simulation, not a numerical reproduction of TalonFX / SPARK MAX firmware.')}</b>
        </p>
        <div className="sim-scope">
          {SIM_SCOPE.map((g) => (
            <div key={g.title}>
              <b className="small">{g.title}</b>
              <ul className="small">
                {g.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ApproxNote>
      {knobs.realistic && (
        <ul className="toggles">
          {TOGGLES.map((tg) => (
            <li key={tg.key}>
              <label className="check">
                <input type="checkbox" checked={knobs[tg.key]} onChange={(e) => set({ [tg.key]: e.target.checked })} />
                <b>{tg.label}</b>
              </label>
              <p className="small muted">
                {tg.what}
                {tg.key === 'stageJump' && !continuous && t('（你的機構是串級式，通常不會有這個問題）', '(your mechanism is a cascade, so this usually isn’t an issue)')}
              </p>
              {knobs[tg.key] && tg.key === 'friction' && (
                <div className="fields">
                  <NumberField label={t('往上摩擦', 'Friction up')} value={knobs.frictionUp} min={0} max={3} onChange={(v) => set({ frictionUp: v })} unit="V" />
                  <NumberField label={t('往下摩擦', 'Friction down')} value={knobs.frictionDown} min={0} max={3} onChange={(v) => set({ frictionDown: v })} unit="V" />
                </div>
              )}
              {knobs[tg.key] && tg.key === 'gearbox' && (
                <div className="fields">
                  <NumberField label={t('效率', 'Efficiency')} value={knobs.efficiency} display={100} min={30} max={100} onChange={(v) => set({ efficiency: v })} unit="%" />
                </div>
              )}
              {knobs[tg.key] && tg.key === 'sensor' && (
                <div className="fields">
                  <NumberField label={t('延遲', 'Delay')} value={knobs.sensorDelay} display={1000} min={0} max={200} onChange={(v) => set({ sensorDelay: v })} unit="ms" />
                  <NumberField label={t('位置雜訊', 'Position noise')} value={knobs.sensorNoise} display={1000} min={0} max={20} onChange={(v) => set({ sensorNoise: v })} unit="mm" />
                </div>
              )}
              {knobs[tg.key] && tg.key === 'stageJump' && (
                <div className="fields">
                  <NumberField label={t('kG 跳多少', 'kG jump')} value={knobs.stageJumpDelta} min={-3} max={3} onChange={(v) => set({ stageJumpDelta: v })} unit="V" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {knobs.realistic && <ControllerSettings knobs={knobs} set={set} statorDefault={statorDefault} travel={travel} />}
      <div className="fields" style={{ marginTop: 12 }}>
        <NumberField label={t('電池電壓', 'Battery voltage')} value={knobs.batteryVoltage} min={6} max={13.5} onChange={(v) => set({ batteryVoltage: v })} unit="V" />
        <span />
        <NumberField
          label={t('實際重力 / 理論', 'Actual gravity / theory')}
          value={knobs.kGScale}
          display={100}
          min={0}
          max={300}
          onChange={(v) => set({ kGScale: v })}
          unit="%"
          hint={t('例如實際比量的重 20%，填 120', 'e.g. enter 120 if it’s really 20% heavier than measured')}
        />
        <NumberField label={t('實際 kV / 理論', 'Actual kV / theory')} value={knobs.kVScale} display={100} min={10} max={300} onChange={(v) => set({ kVScale: v })} unit="%" />
        <NumberField label={t('實際慣性 / 理論', 'Actual inertia / theory')} value={knobs.kAScale} display={100} min={10} max={300} onChange={(v) => set({ kAScale: v })} unit="%" />
      </div>
      <h3 style={{ marginTop: 18 }}>{t('控制器位置', 'Controller location')}</h3>
      <div className="seg" role="group" aria-label={t('控制器位置', 'Controller location')}>
        {(['talonfx', 'roborio'] as const).map((l) => (
          <button key={l} type="button" aria-pressed={location === l && periodOverride === null} onClick={() => setLocation(l)}>
            {l === 'talonfx' ? t('馬達控制器內建（1 kHz）', 'On the motor controller (1 kHz)') : t('roboRIO（50 Hz）', 'roboRIO (50 Hz)')}
          </button>
        ))}
      </div>
      <details style={{ marginTop: 10 }}>
        <summary className="small" style={{ cursor: 'pointer' }}>
          {t('進階：自訂控制週期', 'Advanced: custom control period')}
        </summary>
        <div className="fields" style={{ marginTop: 8 }}>
          <NumberField label={t('控制週期', 'Control period')} value={controlPeriod} display={1000} min={1} max={100} onChange={(v) => setPeriodOverride(v)} unit="ms" />
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
          {t('重置受控體', 'Reset plant')}
        </button>
      </div>
    </Fold>
  )
}


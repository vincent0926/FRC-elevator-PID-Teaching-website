import { useEffect, useMemo, useState } from 'react'
import { ApproxNote } from '../../components/ApproxNote'
import { Chart, type ChartSeries } from '../../components/Chart'
import { NumberField } from '../../components/NumberField'
import { TuneSliders } from '../../components/TuneSliders'
import { alignedFromSim } from '../../core/log/sampleLog'
import type { TuneKey } from '../simulate/tuneRange'
import type { AntiWindup, ControllerLocation, GravityType } from '../../core/controller/slot0'
import { resampleByTime, type SimResult } from '../../core/physics/simulate'
import { ARM_DEFAULT_SPEC, ARM_SPEC_PRESETS } from '../../core/physics/spec'
import { DEG, type ArmParameterSet } from '../../schema/armParameterSet'
import { runSimulation } from '../../workers/client'
import { AntiWindupEditor } from '../simulate/AntiWindupEditor'
import { MetricsTable } from '../simulate/Metrics'
import { PlaybackBar, usePlayback } from '../simulate/MiniShaft'
import { SpecEditor } from '../simulate/SpecEditor'
import { TuningGuide } from '../simulate/TuningGuide'
import { tuningStepParams } from '../simulate/tuningSteps'
import { ARM_SCENARIOS, type ArmScenario } from './armScenarios'
import { DEFAULT_ARM_KNOBS, armStartAngle, buildArmSimInput, type ArmKnobs } from './armSim'
import { useArm } from './armStore'
import { useStore } from '../../app/store'
import { ArmView } from './ArmView'
import { UnsavedNote } from './UnsavedNote'
import { HelpLink } from '../../components/HelpLink'
import { GUIDE_ANCHOR } from '../guide/guideContent'
import { t } from '../../core/lang'
import { SERIES_STYLE } from '../../components/seriesStyle'
import { fixed as f } from '../../core/format'

/** 手臂 3F 模擬：理論值／自訂、理想／真實模型、重力型態、教學情境、照順序調、指標（角度） */

const R2D = 180 / Math.PI

const ARM_ASSUMPTIONS = t(
  [
    '控制輸入 u 以電壓 [V] 表示：不是說電壓是力矩，而是把馬達輸入統一寫成電壓，讓電氣模型和機械模型直接接起來。',
    '手臂是剛體：沒有彎曲、背隙；鏈條、皮帶不會伸長。',
    '負載是末端的一個質點；真的遊戲物件有大小，也可能在夾爪裡晃。',
    '摩擦只有固定大小的庫侖摩擦（kS），不隨角度變。',
    '重力只算手臂所在的垂直平面；機器人在加速、傾斜時的慣性力沒有算。',
    '電池固定電壓加固定內阻 0.02 Ω；電流限制是理想的。',
    '控制器的 Arm_Cosine 用目標角度算 cos（跟 WPILib ArmFeedforward 一樣）；Phoenix 6 實際用哪個角度以 CTRE 文件為準，跟得上軌跡時幾乎一樣。',
  ],
  [
    'The control input u is expressed in volts [V]. That doesn’t mean voltage is torque; the motor input is just written as a voltage so the electrical and mechanical models connect directly.',
    'The arm is rigid: no bending or backlash; chains and belts don’t stretch.',
    'The load is a point mass at the tip; real game pieces have size and may shift in the gripper.',
    'Friction is only constant-magnitude Coulomb friction (kS) and doesn’t change with angle.',
    'Gravity is only in the arm’s vertical plane; inertial forces from the robot accelerating or tilting aren’t included.',
    'The battery is a fixed voltage plus a fixed 0.02 Ω internal resistance; the current limit is ideal.',
    'The controller’s Arm_Cosine computes cos from the target angle (like WPILib ArmFeedforward); which angle Phoenix 6 actually uses follows the CTRE docs, and it’s almost the same while tracking the profile.',
  ],
)

export function ArmSimPage() {
  const { arm, ff, theory, custom, setCustom, source, setSource, spec, setSpec, setSimLog } = useArm()
  const [knobs, setKnobs] = useState<ArmKnobs>(DEFAULT_ARM_KNOBS)
  const [location, setLocation] = useState<ControllerLocation>('talonfx')
  const [gravityType, setGravityType] = useState<GravityType>('armCosine')
  const [goal, setGoal] = useState(() => Math.min(arm.maxAngle, 80 * DEG))
  const [start, setStart] = useState(() => armStartAngle(arm))
  const [antiWindup, setAntiWindup] = useState<AntiWindup>({ mode: 'none' })
  const [compare, setCompare] = useState(false)
  const [scenario, setScenario] = useState<ArmScenario | null>(null)
  const [result, setResult] = useState<SimResult | null>(null)
  // 這個結果是用哪組參數、哪個閉迴路位置算的（送到 2F 要帶這份，不是畫面上現在的值：新模擬還沒算完時兩者不同）
  const [resultInfo, setResultInfo] = useState<{ params: ArmParameterSet; location: ControllerLocation; label: string } | null>(null)
  // 這份結果是用哪個重力型態算的：圖例和說明跟著結果，不跟著還沒算完的選擇
  const [resultGravity, setResultGravity] = useState<GravityType>('armCosine')
  const [other, setOther] = useState<SimResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pb = usePlayback(result)

  const src = source === 'custom' && custom ? 'custom' : 'theory'
  const ps: ArmParameterSet = src === 'custom' ? custom! : theory
  const safeGoal = Math.min(arm.maxAngle, Math.max(arm.minAngle, goal))
  const safeStart = Math.min(arm.maxAngle, Math.max(arm.minAngle, start))
  const setup = useMemo(
    () => ({ arm, ff, knobs, location, goal: safeGoal, start: safeStart, gravityType, tolerance: spec.steadyState, antiWindup }),
    [arm, ff, knobs, location, safeGoal, safeStart, gravityType, spec.steadyState, antiWindup],
  )

  useEffect(() => {
    let alive = true
    runSimulation(buildArmSimInput(setup, ps), 'arm-main')
      .then((r) => {
        if (!alive) return
        setResult(r)
        setResultInfo({ params: ps, location: setup.location, label: src === 'custom' ? t('自訂', 'Custom') : t('理論值', 'Theory') })
        setResultGravity(setup.gravityType)
        setError(null)
      })
      .catch((e: Error) => alive && e.message !== 'stale' && setError(e.message))
    return () => {
      alive = false
    }
  }, [setup, ps])

  const showCompare = compare && src === 'custom'
  useEffect(() => {
    if (!showCompare) return
    let alive = true
    runSimulation(buildArmSimInput(setup, theory), 'arm-compare')
      .then((r) => alive && setOther(r))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [showCompare, setup, theory])
  const otherShown = showCompare ? other : null

  const charts = useMemo(() => {
    if (!result) return null
    const deg = (a: Float64Array) => a.map((x) => x * R2D)
    // 比較那組依時間對到這組的時間軸上，播放時圖例才是同一個時間的值
    const fit = (a: Float64Array) => (otherShown ? resampleByTime(result.t, otherShown.t, a) : a)
    const pos: ChartSeries[] = [
      { label: t('目標（軌跡）', 'Target (profile)'), color: '--steel', dash: true, values: deg(result.refPos) },
      { label: t('實際角度', 'Actual angle'), color: '--blue', values: deg(result.pos) },
    ]
    const err: ChartSeries[] = [{ label: t('跟隨誤差（目標 − 實際）', 'Following error (target − actual)'), color: '--red', values: result.refPos.map((x, i) => (x - result.pos[i]) * R2D) }]
    const vel: ChartSeries[] = [
      { label: t('參考角速度', 'Reference angular velocity'), color: '--steel', dash: true, values: deg(result.refVel) },
      { label: t('實際角速度', 'Actual angular velocity'), color: '--blue', values: deg(result.vel) },
    ]
    if (otherShown) {
      pos.push({ label: t('理論值的實際角度', 'Theory: actual angle'), color: '--violet', values: fit(deg(otherShown.pos)) })
      err.push({ label: t('理論值的跟隨誤差', 'Theory: following error'), color: '--violet', values: fit(otherShown.refPos.map((x, i) => (x - otherShown.pos[i]) * R2D)) })
    }
    const volt: ChartSeries[] = [
      { label: t('輸出電壓', 'Output voltage'), color: '--ink-2', values: result.voltage },
      { label: resultGravity === 'constant' ? t('前饋（常數 kG）', 'Feedforward (constant kG)') : t('前饋（含 kG·cos θ）', 'Feedforward (with kG·cos θ)'), ...SERIES_STYLE.feedforward, values: result.feedforward },
      { label: t('回授（P+I+D）', 'Feedback (P+I+D)'), ...SERIES_STYLE.feedback, values: result.feedback },
    ]
    const cur: ChartSeries[] = [{ label: t('每顆馬達 Stator 電流', 'Stator current per motor'), color: '--amber', values: result.statorCurrent }]
    return { pos, err, vel, volt, cur }
  }, [result, otherShown, resultGravity])

  // 滑桿：看的是理論值時，用理論值當起點切到自訂，並疊上理論值比較
  const tweak = (patch: (p: ArmParameterSet) => ArmParameterSet) => {
    if (src === 'custom') {
      setCustom(patch(ps))
      return
    }
    setCustom(patch({ ...theory, source: 'custom', createdAt: new Date().toISOString(), note: t('從理論值開始調', 'Tuned from theory') }))
    setSource('custom')
    setCompare(true)
  }
  const resetToTheory = () => {
    setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString(), note: t('理論值', 'Theory') })
    setSource('custom')
  }
  const loadScenario = (s: ArmScenario) => {
    const st = s.setup(theory, ff)
    setCustom(st.params)
    setSource('custom')
    setKnobs({ ...DEFAULT_ARM_KNOBS, ...st.knobs })
    setLocation(st.location)
    setGravityType(st.gravityType)
    setGoal(Math.min(arm.maxAngle, st.goal))
    setStart(armStartAngle(arm))
    setAntiWindup({ mode: 'none' })
    setCompare(true)
    setScenario(s)
  }
  // 課程深層連結要求載入某個手臂情境
  const { pendingScenario, openScenario, go } = useStore()
  useEffect(() => {
    if (!pendingScenario) return
    const sc = ARM_SCENARIOS.find((x) => x.id === pendingScenario)
    openScenario(null)
    if (sc) loadScenario(sc)
    // loadScenario 每次 render 都是新的函式，只在 pendingScenario 變的時候跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScenario])

  const leaveScenario = () => {
    setScenario(null)
    setKnobs(DEFAULT_ARM_KNOBS)
    setLocation('talonfx')
    setGravityType('armCosine')
    setSource('theory')
  }
  const setK = (patch: Partial<ArmKnobs>) => setKnobs({ ...knobs, ...patch })

  return (
    <section aria-labelledby="t-arm-sim">
      <div className="head">
        <div>
          <h1 id="t-arm-sim">{t('手臂・模擬', 'Arm · Simulate')}</h1>
          <p className="lead">
            {t(`上機前先在模擬裡找出明顯的參數問題。從起始角度（現在 ${f(safeStart * R2D, 0)}°）轉到目標，停一下再轉回來。`, `Find obvious gain problems in the sim before going to the robot. It turns from the start angle (now ${f(safeStart * R2D, 0)}°) to the target, pauses, then turns back. `)}
            <HelpLink section={GUIDE_ANCHOR.sim} />
          </p>
        </div>
      </div>

      <div className="scen-row">
      <TuningGuide
        onStep={(i) => {
          setScenario(null)
          setCustom(tuningStepParams(theory, i, knobs.realistic && knobs.friction ? knobs.frictionUp : 0, 0.5))
          setSource('custom')
        }}
        onReset={() => {
          setScenario(null)
          setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString(), note: t('理論值', 'Theory') })
          setSource('custom')
        }}
        onWellTuned={() => {
          setScenario(null)
          const kS = knobs.realistic && knobs.friction ? (knobs.frictionUp + knobs.frictionDown) / 2 : theory.feedforward.kS
          setCustom({
            ...theory,
            source: 'custom',
            createdAt: new Date().toISOString(),
            note: t('調好的範例', 'Tuned example'),
            feedforward: { ...theory.feedforward, kS, kG: theory.feedforward.kG * knobs.kGScale, kA: theory.feedforward.kA * knobs.kAScale },
          })
          setGravityType('armCosine')
          setSource('custom')
        }}
        onScenario={(id) => {
          const sc = ARM_SCENARIOS.find((s) => s.id === (id === 'kPTooBig' ? 'armKpTooBig' : 'armWindup'))
          if (sc) loadScenario(sc)
        }}
      />

      <details className="panel scen" open={scenario !== null || undefined}>
        <summary>
          <b>{t('教學情境', 'Teaching scenarios')}</b>
          <span className="small muted">{t('按一下載入一個「故意設錯」的例子，看圖找出問題。會換掉目前的「自訂」參數。', 'Click to load a deliberately wrong example and find the problem from the charts. This replaces your current “Custom” gains.')}</span>
        </summary>
        <div className="scen-list">
          {ARM_SCENARIOS.map((s) => (
            <button key={s.id} type="button" className="btn small" aria-pressed={scenario?.id === s.id} onClick={() => loadScenario(s)}>
              {s.title}
            </button>
          ))}
        </div>
        {scenario && (
          <div className="scen-card">
            <h3>{scenario.title}</h3>
            <p>{scenario.concept}</p>
            <dl>
              <dt>{t('看哪裡', 'Where to look')}</dt>
              <dd>{scenario.lookFor}</dd>
              <dt>{t('接著試', 'Try next')}</dt>
              <dd>{scenario.tryNext}</dd>
            </dl>
            <button className="btn small" type="button" onClick={leaveScenario}>
              {t('離開情境', 'Leave scenario')}
            </button>
          </div>
        )}
      </details>
      </div>

      <div className="bar">
        <div className="seg" role="group" aria-label={t('參數來源', 'Gain source')}>
          <button type="button" aria-pressed={src === 'theory'} onClick={() => setSource('theory')}>
            {t('理論值', 'Theory')}
          </button>
          <button
            type="button"
            aria-pressed={src === 'custom'}
            onClick={() => {
              if (!custom) setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString() })
              setSource('custom')
            }}
          >
            {t('自訂', 'Custom')}
          </button>
        </div>
        <div style={{ width: 150 }}>
          <NumberField label={t('起始角度', 'Start angle')} value={start} onChange={setStart} unit="°" step={5} display={R2D} min={-180} max={180} />
        </div>
        <div style={{ width: 150 }}>
          <NumberField label={t('目標角度', 'Target angle')} value={goal} onChange={setGoal} unit="°" step={5} display={R2D} min={-180} max={180} />
        </div>
        <label className="check">
          {t('重力型態', 'Gravity type')}
          <span className="inp">
            <select value={gravityType} onChange={(e) => setGravityType(e.target.value as GravityType)} aria-label={t('重力型態', 'Gravity type')}>
              <option value="armCosine">{t('Arm_Cosine（kG·cos θ）', 'Arm_Cosine (kG·cos θ)')}</option>
              <option value="constant">{t('常數 kG（當成電梯，錯的）', 'Constant kG (treated as an elevator, wrong)')}</option>
            </select>
          </span>
        </label>
        {src === 'custom' && (
          <label className="check">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            {t('疊上理論值比較', 'Overlay theory to compare')}
          </label>
        )}
        <button
          className="btn small"
          type="button"
          disabled={!result || !resultInfo}
          title={t('把這次模擬的資料送到 2F 調參建議，看哪個參數該先改', 'Send this simulation’s data to 2F tuning advice to see which gain to change first')}
          onClick={() => {
            if (!result || !resultInfo) return
            setSimLog({ log: alignedFromSim(result), name: t(`3F 模擬（${resultInfo.label}）`, `3F sim (${resultInfo.label})`), params: resultInfo.params, location: resultInfo.location })
            go('tune')
          }}
        >
          {t('送到 2F 調參建議', 'Send to 2F tuning advice')}
        </button>
      </div>

      <UnsavedNote />
      {error && <div className="warn">{t('模擬失敗：', 'Simulation failed: ')}{error}</div>}
      {gravityType === 'constant' && <div className="note">{t('重力型態是「常數 kG」：控制器不會乘 cos θ。程式裡對手臂一定要設 GravityType = Arm_Cosine。', 'Gravity type is “constant kG”: the controller won’t multiply by cos θ. For an arm, the code must always set GravityType = Arm_Cosine.')}</div>}

      <div className="simwrap">
        <ArmView result={result} arm={arm} goal={safeGoal} idx={pb.idx} zeroOffset={knobs.zeroOffset} />
        <div className="panel stack">
          <PlaybackBar result={result} pb={pb} unit="rad" />
          <TuneSliders
            mechanism="arm"
            values={ps}
            theory={theory}
            editingCustom={src === 'custom'}
            sourceLabel={src === 'custom' ? t('自訂', 'Custom') : t('理論值', 'Theory')}
            onEdit={tweak}
            onResetAll={resetToTheory}
            units={ARM_UNITS}
            display={{ cruiseVelocity: R2D, acceleration: R2D }}
            rotation={{ perRot: 2 * Math.PI, note: t('手臂轉 1 圈 = 2π rad = 360°', 'One arm turn = 2π rad = 360°') }}
          />
          {charts && result && (
            <>
              <Chart title={t('角度', 'Angle')} x={result.t} series={charts.pos} height={220} yLabel="°" syncKey="arm" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note={t('虛線是 Motion Magic 的軌跡（手臂應該在的角度），實線是手臂真的角度。兩條線貼在一起就是跟得好；0° 是水平、90° 是直立。', 'The dashed line is the Motion Magic profile (where the arm should be) and the solid line is the arm’s real angle. When the two lines overlap, it’s tracking well.')} />
              <Chart title={t('跟隨誤差', 'Following error')} x={result.t} series={charts.err} height={170} yLabel="°" syncKey="arm" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note={t('軌跡減實際角度。正的是落後（手臂還沒到）、負的是超前或衝過頭。停住後應該回到 0 附近。', 'Profile minus actual angle. Positive is lagging (the arm isn’t there yet); negative is ahead or overshooting. After stopping it should return near 0.')} />
              <Chart title={t('角速度', 'Angular velocity')} x={result.t} series={charts.vel} height={170} yLabel="°/s" syncKey="arm" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note={t('虛線是軌跡要的轉速（梯形：加速、等速、減速），實線是真的轉速。', 'The dashed line is the profile’s speed (trapezoid: accelerate, cruise, decelerate) and the solid line is the real speed.')} />
              <Chart title={t('電壓（前饋 + 回授）', 'Voltage (feedforward + feedback)')} x={result.t} series={charts.volt} height={190} yLabel="V" syncKey="arm" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note={t(`綠線是前饋（${resultGravity === 'constant' ? 'kS + kG（常數，沒有乘 cos θ）' : 'kS + kG·cos θ'} + kV·ω + kA·α，照軌跡事先算好），紅線是回授（P+I+D，看誤差補的）。前饋準的時候紅線幾乎是 0；紅線一直偏同一邊，就是前饋哪裡不對。`, `The green line is feedforward (${resultGravity === 'constant' ? 'kS + kG (constant, not multiplied by cos θ)' : 'kS + kG·cos θ'} + kV·ω + kA·α, computed ahead from the profile) and the red line is feedback (P+I+D, making up the error). With accurate feedforward the red line is almost 0; if it stays on one side, something in the feedforward is off.`)} />
              <Chart title={t('電流', 'Current')} x={result.t} series={charts.cur} height={170} yLabel="A" syncKey="arm" cursorX={pb.idx !== null ? result.t[pb.idx] : null} note={t('每顆馬達的電流。貼著電流限制（真實模型）時馬達已經出全力，調 PID 沒有用，要放慢 Motion Magic。', 'Current per motor. When it’s pinned at the current limit (realistic model) the motor is already at full effort; tuning PID won’t help, so slow down Motion Magic.')} />
            </>
          )}
        </div>
      </div>

      {result && (
        <MetricsTable
          moves={result.moves}
          other={otherShown?.moves ?? null}
          otherLabel={t('理論值', 'Theory')}
          spec={spec}
          unit="rad"
          moveLabels={[t('轉出去', 'Out'), t('收回來', 'Back')]}
          editor={<SpecEditor spec={spec} setSpec={setSpec} presets={ARM_SPEC_PRESETS} defaultSpec={ARM_DEFAULT_SPEC} unit="rad" />}
        />
      )}

      <div className="grid2" style={{ marginTop: 20 }}>
        <div className="panel">
          <h2>{t('進階設定', 'Advanced settings')}</h2>
          {src === 'custom' && ps.note && <p className="small muted">{t('自訂參數來源：', 'Custom gains source: ')}{ps.note}</p>}
          <AntiWindupEditor value={antiWindup} onChange={setAntiWindup} kI={ps.feedback.kI} />
        </div>

        <div className="panel">
          <h2>{t('受控體（模擬的手臂）', 'Plant (the simulated arm)')}</h2>
          <div className="seg" role="group" aria-label={t('模型', 'Model')}>
            <button type="button" aria-pressed={!knobs.realistic} onClick={() => setK({ realistic: false })}>
              {t('理想模型', 'Ideal model')}
            </button>
            <button type="button" aria-pressed={knobs.realistic} onClick={() => setK({ realistic: true })}>
              {t('真實模型', 'Realistic model')}
            </button>
          </div>
          <div className="seg" role="group" aria-label={t('閉迴路位置', 'Closed-loop location')} style={{ marginLeft: 8 }}>
            <button type="button" aria-pressed={location === 'talonfx'} onClick={() => setLocation('talonfx')}>
              TalonFX 1 kHz
            </button>
            <button type="button" aria-pressed={location === 'roborio'} onClick={() => setLocation('roborio')}>
              roboRIO 50 Hz
            </button>
          </div>
          {knobs.realistic ? (
            <div className="stack" style={{ marginTop: 12 }}>
              <label className="check">
                <input type="checkbox" checked={knobs.friction} onChange={(e) => setK({ friction: e.target.checked })} />
                {t('摩擦', 'Friction')}
              </label>
              {knobs.friction && (
                <div className="gains">
                  <NumberField label={t('往上摩擦', 'Friction up')} value={knobs.frictionUp} onChange={(v) => setK({ frictionUp: v })} unit="V" min={0} max={3} step={0.01} />
                  <NumberField label={t('往下摩擦', 'Friction down')} value={knobs.frictionDown} onChange={(v) => setK({ frictionDown: v })} unit="V" min={0} max={3} step={0.01} />
                </div>
              )}
              <label className="check">
                <input type="checkbox" checked={knobs.currentLimit} onChange={(e) => setK({ currentLimit: e.target.checked })} />
                {t(`Stator 電流限制（${arm.statorCurrentLimit} A）`, `Stator current limit (${arm.statorCurrentLimit} A)`)}
              </label>
              <label className="check">
                <input type="checkbox" checked={knobs.voltageLimit} onChange={(e) => setK({ voltageLimit: e.target.checked })} />
                {t('電壓飽和（輸出最多到電池電壓）', 'Voltage saturation (output up to battery voltage)')}
              </label>
              <label className="check">
                <input type="checkbox" checked={knobs.batterySag} onChange={(e) => setK({ batterySag: e.target.checked })} />
                {t('電池壓降', 'Battery sag')}
              </label>
              <NumberField label={t('電池電壓', 'Battery voltage')} value={knobs.batteryVoltage} onChange={(v) => setK({ batteryVoltage: v })} unit="V" min={6} max={13} step={0.1} />
              <label className="check">
                <input type="checkbox" checked={knobs.gearbox} onChange={(e) => setK({ gearbox: e.target.checked })} />
                {t('齒輪箱效率', 'Gearbox efficiency')} {Math.round(knobs.efficiency * 100)}%
              </label>
              <label className="check">
                <input type="checkbox" checked={knobs.sensor} onChange={(e) => setK({ sensor: e.target.checked })} />
                {t('感測延遲與雜訊', 'Sensor delay and noise')}
              </label>
              {knobs.sensor && (
                <div className="gains">
                  <NumberField label={t('延遲', 'Delay')} value={knobs.sensorDelay} display={1000} onChange={(v) => setK({ sensorDelay: v })} unit="ms" min={0} max={100} />
                  <NumberField label={t('角度雜訊', 'Angle noise')} value={knobs.sensorNoise} display={R2D} onChange={(v) => setK({ sensorNoise: v })} unit="°" min={0} max={5} step={0.01} />
                </div>
              )}
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 12 }}>{t('理想模型：沒有摩擦、沒有電流限制和電池壓降、感測器沒有延遲。用來看清楚每個參數在做什麼。', 'Ideal model: no friction, no current limit or battery sag, no sensor delay. For seeing clearly what each gain does.')}</p>
          )}
          <div className="gains" style={{ marginTop: 12 }}>
            <NumberField
              label={t('真實重力是理論的幾倍', 'Real gravity × theory')}
              value={knobs.kGScale}
              onChange={(v) => setK({ kGScale: v })}
              unit="×"
              min={0.2}
              max={5}
              step={0.1}
              hint={t('例如夾了比 1F 填的更重的東西', 'e.g. holding something heavier than entered in 1F')}
            />
            <NumberField
              label={t('編碼器零點偏差', 'Encoder zero offset')}
              value={knobs.zeroOffset}
              display={R2D}
              onChange={(v) => setK({ zeroOffset: v })}
              unit="°"
              min={-90}
              max={90}
              hint={t('0 = 零點設在水平（正確）', '0 = zero at horizontal (correct)')}
            />
          </div>
        </div>
      </div>

      <ApproxNote
        summary={t('教學模擬：用來理解趨勢、先抓出明顯的錯（重力型態、零點、飽和、振盪），不是 TalonFX 韌體的數值重現。數字以實測為準。', 'A teaching simulation: for understanding trends and catching obvious mistakes first (gravity type, zero, saturation, oscillation). It isn’t a numerical reproduction of TalonFX firmware. Real numbers come from testing.')}
        items={ARM_ASSUMPTIONS}
      />
    </section>
  )
}

const ARM_UNITS: Record<TuneKey, string> = {
  kS: 'V',
  kG: 'V',
  kV: 'V/(rad/s)',
  kA: 'V/(rad/s²)',
  kP: 'V/rad',
  kI: 'V/(rad·s)',
  kD: 'V/(rad/s)',
  cruiseVelocity: '°/s',
  acceleration: '°/s²',
}


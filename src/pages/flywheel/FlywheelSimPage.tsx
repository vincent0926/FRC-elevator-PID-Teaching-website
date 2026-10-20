import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { Chart, type ChartSeries } from '../../components/Chart'
import { NumberField } from '../../components/NumberField'
import { MOTOR_SPECS } from '../../core/motors'
import { flywheelJava } from '../../core/codegen/flywheel'
import {
  computeFlywheelFeedforward,
  DEFAULT_LIMIT_FRACTION,
  DEFAULT_FLYWHEEL_SPEC,
  DEFAULT_KNOBS,
  flywheelFailures,
  flywheelMetrics,
  shotOutcomes,
  simulateFlywheel,
  moveAims,
  moveOutcomes,
  type MoveOutcome,
  wheelForGoal,
  wheelLimit,
  exitRadius,
  theoryGains,
  type FlywheelGains,
  type FlywheelMechanism,
  type FlywheelKnobs,
  type FlywheelSpec,
  type ShotPlan,
  angleFromTurret,
  turretDeg,
} from '../../core/flywheel/flywheel'
import { PlaybackBar, usePlayback } from '../simulate/MiniShaft'
import { FLYWHEEL_PRESETS, GAIN_ROWS, gainRange, missText, moveMissText, yawText } from './flywheelTune'
import { FlywheelView } from './FlywheelView'
import { MoveView } from './MoveView'
import { BallFields, distanceHint, FROM_LABEL, GoalDistanceField, HubPreset, MechFields, TurretFields } from './FlywheelForms'
import { loadFlywheelStyle, SHAPES, useFlywheelMechanism, useMoveSettings, usePersisted, useRpsLimit, useShotPlan, type MoveSettings } from './flywheelStore'
import { t } from '../../core/lang'

/**
 * 3F 射球飛輪連射模擬：轉到目標轉速、連射幾發，看掉速和恢復。內部 SI（rad/s），畫面一律 rps。
 * 進站選「邊移動邊射」時，機器人邊開邊射：每一發的距離不同，看有補償和沒補償進不進。
 */

const TAU = 2 * Math.PI
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function FlywheelSimPage() {
  const [mech, setMech] = useFlywheelMechanism()
  const [plan, setPlan] = useShotPlan()
  const [move, setMove] = useMoveSettings()
  // 讀一次就好：換用法要回進站重選
  const [style] = useState(loadFlywheelStyle)
  const moving = style === 'move'
  return (
    <section aria-labelledby="t-fw-sim">
      <div className="head">
        <div>
          <h1 id="t-fw-sim">{moving ? t('射球飛輪・邊移動邊射模擬', 'Flywheel shooter · Shoot-on-the-move sim') : t('射球飛輪・模擬', 'Flywheel shooter · Simulate')}</h1>
          <p className="lead">
            {moving
              ? t('機器人邊開邊射：每一發離目標的距離、方向都不一樣。看有補償（每一發重算轉速和底盤偏角）和沒補償（照站著射的轉速表）差多少。', 'The robot shoots while driving: every shot has a different distance and direction to the target. Compare with compensation (speed and chassis offset recomputed for every shot) and without (using the standing-still speed table).')
              : t('從靜止轉到目標轉速，連射幾發，看每一發掉多少、多快回來，球落在哪裡。數字都是 Phoenix 6 的 rps，可以直接填進程式。', 'Spin up from rest to the target speed, fire several shots, and see how much each one drops, how fast it recovers and where the ball lands. All numbers are Phoenix 6 rps, ready to put in your code.')}
          </p>
        </div>
      </div>
      <ShotSim mech={mech} setMech={setMech} plan={plan} setPlan={setPlan} move={moving ? { settings: move, set: setMove } : undefined} />
    </section>
  )
}

/** 連射模擬本體 */
function ShotSim({
  mech,
  setMech,
  plan: basePlan,
  setPlan,
  move,
}: {
  mech: FlywheelMechanism
  setMech: (m: FlywheelMechanism) => void
  plan: ShotPlan
  setPlan: (p: ShotPlan) => void
  move?: { settings: MoveSettings; set: (m: MoveSettings) => void }
}) {
  const { go } = useStore()
  const [knobs, setKnobs] = usePersisted<FlywheelKnobs>('flywheel:knobs', DEFAULT_KNOBS)
  const [spec, setSpec] = usePersisted<FlywheelSpec>('flywheel:spec', DEFAULT_FLYWHEEL_SPEC)
  const ff = useMemo(() => computeFlywheelFeedforward(mech), [mech])
  const theory = useMemo(() => theoryGains(ff), [ff])
  const [limit, setLimit] = useRpsLimit()
  const maxWheel = wheelLimit(ff.freeSpeed, limit.rps)
  // 有填轉速上限，而且比馬達做得到的低
  const userLimit = limit.rps > 0 && limit.rps * TAU < ff.freeSpeed * DEFAULT_LIMIT_FRACTION
  // null = 跟著理論值（改機構資料時一起變）
  const [custom, setCustom] = usePersisted<{ gains: FlywheelGains | null }>('flywheel:gains', { gains: null }, (g) => g.gains === null || GAIN_ROWS.every(({ k }) => Number.isFinite(g.gains?.[k])))
  const gains = custom.gains ?? theory
  const [preset, setPreset] = useState<string | null>(null)

  const setP = (p: Partial<ShotPlan>) => setPlan({ ...basePlan, ...p })
  const mv = move?.settings
  const setMv = (p: Partial<MoveSettings>) => move?.set({ ...move.settings, ...p })
  // 邊移動邊射：發數、間隔用自己的；每一發的目標轉速照當時的距離算，第一發的當成模擬的目標轉速
  const aims = useMemo(
    () => (mv ? moveAims(mech, { ...basePlan, shots: mv.shots, interval: mv.interval }, { motion: { toward: mv.toward, side: mv.side }, compensate: mv.compensate, maxWheel }) : null),
    [mech, basePlan, mv, maxWheel],
  )
  const plan = useMemo(() => (mv && aims ? { ...basePlan, shots: mv.shots, interval: mv.interval, target: aims[0].target } : basePlan), [basePlan, mv, aims])
  const setK = (p: Partial<FlywheelKnobs>) => setKnobs({ ...knobs, ...p })
  const setGain = (k: keyof FlywheelGains, v: number) => {
    setPreset(null)
    setCustom({ gains: { ...gains, [k]: v } })
  }

  const result = useMemo(() => simulateFlywheel(mech, gains, knobs, plan, aims?.map((a) => a.target)), [mech, gains, knobs, plan, aims])
  const metrics = useMemo(() => flywheelMetrics(result, plan, spec), [result, plan, spec])
  const fails = flywheelFailures(metrics, plan, spec)
  const outcomes = useMemo(
    () => (mv && aims ? moveOutcomes(result, mech, plan, aims) : shotOutcomes(result, mech, plan)),
    [result, mech, plan, mv, aims],
  )
  const hits = outcomes.filter((o) => o.hit).length
  const recoveryOk = (r: number | null) => r !== null && r <= spec.recovery
  const shotStats = useMemo(() => {
    let maxDip = 0
    let slowest: number | null = 0
    for (const sh of metrics.shots) {
      maxDip = Math.max(maxDip, sh.dip)
      slowest = slowest === null || sh.recovery === null ? null : Math.max(slowest, sh.recovery)
    }
    return { maxDip, slowest, recoveryFails: metrics.shots.filter((sh) => !(sh.recovery !== null && sh.recovery <= spec.recovery)).length }
  }, [metrics, spec.recovery])
  const goalW = wheelForGoal(exitRadius(mech), plan)
  const pb = usePlayback(result)
  const cursorX = pb.idx !== null ? result.t[pb.idx] : null
  const tol = (spec.tolPct / 100) * plan.target
  const maxTarget = aims ? Math.max(...aims.map((a) => a.target)) : plan.target
  const reachable = maxTarget <= maxWheel
  const unsolved = aims ? aims.filter((a) => !a.solved).length : 0
  const capped = aims ? aims.filter((a) => a.capped).length : 0

  const charts = useMemo(() => {
    const rps = (a: Float64Array) => Array.from(a, (x) => x / TAU)
    const vel: ChartSeries[] = [
      { label: t('目標轉速', 'Target speed'), color: '--steel', dash: true, values: rps(result.ref) },
      { label: t('實際轉速', 'Actual speed'), color: '--blue', values: rps(result.vel) },
    ]
    const volt: ChartSeries[] = [
      { label: t('輸出電壓', 'Output voltage'), color: '--ink', values: result.volt },
      { label: t('前饋', 'Feedforward'), color: '--green', values: result.ff },
      { label: t('回授', 'Feedback'), color: '--red', values: result.fb },
    ]
    const cur: ChartSeries[] = [{ label: t('每顆馬達電流', 'Current per motor'), color: '--amber', values: result.motorCurrent }]
    return { vel, volt, cur }
  }, [result])
  const shotBands = result.shotTimes.map((s): [number, number] => [s, s + 0.03])

  const hints: string[] = []
  if (!reachable && userLimit) hints.push(t(`目標 ${f(maxTarget / TAU, 0)} rps 超過你設的轉速上限 ${f(limit.rps, 0)} rps。降低目標，或確定機構轉得了再提高上限。`, `Target ${f(maxTarget / TAU, 0)} rps is above your speed limit of ${f(limit.rps, 0)} rps. Lower the target, or raise the limit once you’re sure the mechanism can handle it.`))
  else if (!reachable) hints.push(t(`目標 ${f(maxTarget / TAU, 0)} rps 太接近最高轉速（約 ${f(ff.freeSpeed / TAU, 0)} rps，還沒扣摩擦）：電壓不夠，調參數也到不了。降低目標或改齒比。`, `Target ${f(maxTarget / TAU, 0)} rps is too close to top speed (about ${f(ff.freeSpeed / TAU, 0)} rps, before friction): not enough voltage, so no tuning will get there. Lower the target or change the gear ratio.`))
  if (fails.includes('steady'))
    hints.push(metrics.steadyError > 0 ? t('轉速一直差一點：先把 kS 補成摩擦的大小，再檢查 kV；最後一點點才用 kI。', 'Speed stays a little low: first set kS to the size of the friction, then check kV; use kI only for the very last bit.') : t('轉速一直偏高：kV 或 kS 太大。', 'Speed stays high: kV or kS is too big.'))
  if (fails.includes('overshoot')) hints.push(t('衝過頭：kI 在起步時累積太多，或 kP、kV 太大。飛輪通常不用 kI。', 'Overshoot: kI built up too much during spin-up, or kP/kV is too big. Flywheels usually don’t use kI.'))
  if (fails.includes('recovery')) hints.push(t('掉速後回來太慢：加大 kP。kP 已經很大還是慢，就看電流是不是貼著限制：馬達已經出全力，換更重的飛輪（掉得少）或加馬達。', 'Too slow to recover after a drop: raise kP. If kP is already big and it’s still slow, check whether the current is pinned at the limit: the motor is already giving everything, so use a heavier flywheel (drops less) or add a motor.'))
  if (fails.includes('spinUp') && !fails.includes('steady')) hints.push(t('到速太慢：電流貼著限制就是馬達已經出全力；有加速度限制的話調大一點。', 'Too slow to spin up: if the current is pinned at the limit, the motor is already giving everything; if you have an acceleration limit, raise it.'))
  if (metrics.saturation > 0.05 && !hints.length) hints.push(t('輸出常常貼到 12 V：回授要的比電池給得多，再加 kP 也沒用。', 'Output keeps hitting 12 V: feedback is asking for more than the battery can give, so more kP won’t help.'))

  return (
    <>
      <div className="panel fw-mech">
        <b>{t('機構', 'Mechanism')}</b>
        <span className="small">
          {MOTOR_SPECS[mech.motor].label} × {mech.motorCount}
          {t('、齒比 ', ', ratio ')}
          {mech.gearRatio} : 1{t('、', ', ')}
          {mech.wheelMass} kg{t('、半徑 ', ', radius ')}
          {f(mech.wheelRadius * 100, 2)} cm{t('、', ', ')}
          {SHAPES.find((x) => x.v === mech.shape)?.label ?? t(`形狀 ${mech.shape}`, `shape ${mech.shape}`)}
          {t('、', ', ')}
          {mech.back === 'rollers'
            ? t(`對面滾輪半徑 ${f(mech.backRadius * 100, 2)} cm、${mech.backMass} kg、轉速比 ${mech.backRatio}`, `opposite rollers radius ${f(mech.backRadius * 100, 2)} cm, ${mech.backMass} kg, speed ratio ${mech.backRatio}`)
            : t('對面是固定導板', 'fixed hood on the other side')}
        </span>
        <span className="small muted">{t(`J ${(ff.J * 1e4).toFixed(2)} kg·cm²，最高約 ${f(ff.freeSpeed / TAU, 0)} rps`, `J ${(ff.J * 1e4).toFixed(2)} kg·cm², top speed about ${f(ff.freeSpeed / TAU, 0)} rps`)}</span>
        <button className="linkbtn small" type="button" onClick={() => go('calc')}>
          {t('到 1F 改機構', 'Edit mechanism in 1F')}
        </button>
        <details className="fw-mech-edit">
          <summary>{t('在這裡改機構', 'Edit the mechanism here')}</summary>
          <MechFields mech={mech} setM={(p) => setMech({ ...mech, ...p })} />
        </details>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        {mv && aims ? (
          <MoveView result={result} plan={plan} motion={{ toward: mv.toward, side: mv.side }} aims={aims} shots={outcomes as MoveOutcome[]} tol={tol} idx={pb.idx} />
        ) : (
          <FlywheelView result={result} mech={mech} plan={plan} tol={tol} shots={outcomes} idx={pb.idx} />
        )}
        <div style={{ marginTop: 10 }}>
          <PlaybackBar result={result} pb={pb} readout={(k) => `${f(result.vel[k] / TAU, 1)} rps`} />
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 20 }}>
        <div className="panel">
          <h2>{t('射球', 'Shooting')}</h2>
          {mv && (
            <>
              <h3 style={{ marginTop: 0 }}>{t('機器人怎麼動', 'How the robot moves')}</h3>
              <div className="fields">
                <NumberField label={t('往目標方向的速度', 'Speed toward the target')} value={mv.toward} onChange={(v) => setMv({ toward: v })} min={-5} max={5} step={0.1} unit="m/s" hint={t('往目標開是正的；第一發時的方向', 'Positive driving toward the target; direction at the first shot')} />
                <NumberField label={t('側向速度', 'Sideways speed')} value={mv.side} onChange={(v) => setMv({ side: v })} min={-5} max={5} step={0.1} unit="m/s" hint={t('面向目標時往左開是正的', 'Facing the target, driving left is positive')} />
              </div>
              <label className="check">
                <input type="checkbox" checked={mv.compensate} onChange={(e) => setMv({ compensate: e.target.checked })} />
                {t(
                  <>
                  有補償（每一發照當時的距離和速度重算轉速、底盤偏角）
                  </>,
                  <>
                    With compensation (speed and chassis offset recomputed for each shot from that moment’s distance and velocity)
                  </>,
                )}
              </label>
              <p className="small" style={{ margin: '6px 0 12px' }}>
                {mv.compensate ? t('有補償', 'With compensation') : t('沒補償：照站著射的轉速表（只看距離），底盤正對目標', 'Without compensation: standing-still speed table (distance only), chassis facing the target')}
                {t(
                  `。這 ${mv.shots} 發機器人開了 ${f(Math.hypot(mv.toward, mv.side) * (mv.shots - 1) * mv.interval, 2)} m，目標轉速 ${f(Math.min(...aims!.map((a) => a.target)) / TAU, 1)}～${f(maxTarget / TAU, 1)} rps`,
                  `. Over these ${mv.shots} shots the robot drives ${f(Math.hypot(mv.toward, mv.side) * (mv.shots - 1) * mv.interval, 2)} m, target speed ${f(Math.min(...aims!.map((a) => a.target)) / TAU, 1)}–${f(maxTarget / TAU, 1)} rps`,
                )}
                {mv.compensate && t(`，底盤${yawRange(aims!)}`, `, chassis ${yawRange(aims!)}`)}
                {t('。', '.')}
                {capped > 0 && (
                  <span className="fail">
                    {t(
                      ` 有 ${capped} 發要的轉速超過轉速上限 ${f(maxWheel / TAU, 0)} rps，只給到上限，球會打近。`,
                      ` ${capped} shots need more than the ${f(maxWheel / TAU, 0)} rps speed limit; they only get the limit and fall short.`,
                    )}
                  </span>
                )}
                {unsolved > 0 && (
                  <span className="fail">
                    {t(
                      ` 有 ${unsolved} 發算不出來（太近、太遠或射不進），沿用前一發的轉速、底盤正對目標。`,
                      ` ${unsolved} shots have no solution (too close, too far or can’t go in); they reuse the previous shot’s speed with the chassis facing the target.`,
                    )}
                  </span>
                )}
              </p>
            </>
          )}
          <div className="fields">
            {mv ? (
              <p className="small muted" style={{ margin: 0, alignSelf: 'center' }}>
                {t(
                  <>
                  目標轉速每一發自動算（看當時離目標多遠）。
                  </>,
                  <>
                    Target speed is computed for each shot (from the distance at that moment).
                  </>,
                )}
              </p>
            ) : (
              <NumberField label={t('目標轉速', 'Target speed')} value={plan.target} display={1 / TAU} digits={1} onChange={(v) => setP({ target: v })} min={1} max={150} step={1} unit="rps" />
            )}
            <NumberField
              label={t('轉速上限', 'Speed limit')}
              value={limit.rps}
              onChange={(v) => setLimit({ rps: Math.max(0, v) })}
              min={0}
              max={300}
              step={1}
              unit="rps"
              hint={limit.rps > 0 ? (userLimit ? (mv ? t('每一發要的轉速超過就只給到上限', 'Each shot’s needed speed is capped at the limit') : t('目標超過會提示', 'You’ll be warned if the target is above it')) : t(`比馬達做得到的高，用空載的 90%（約 ${f((ff.freeSpeed * DEFAULT_LIMIT_FRACTION) / TAU, 0)} rps）`, `Higher than the motor can do; using 90% of free speed (about ${f((ff.freeSpeed * DEFAULT_LIMIT_FRACTION) / TAU, 0)} rps)`)) : t(`0 = 用馬達空載轉速的 90%（約 ${f((ff.freeSpeed * DEFAULT_LIMIT_FRACTION) / TAU, 0)} rps）`, `0 = use 90% of the motor’s free speed (about ${f((ff.freeSpeed * DEFAULT_LIMIT_FRACTION) / TAU, 0)} rps)`)}
            />
            <NumberField label={t('加速度限制', 'Acceleration limit')} value={plan.accel} display={1 / TAU} digits={0} onChange={(v) => setP({ accel: v })} min={0} max={2000} step={10} unit="rps/s" hint={t('0 = VelocityVoltage 直接跳到目標；大於 0 = MotionMagicVelocityVoltage', '0 = VelocityVoltage jumps straight to the target; above 0 = MotionMagicVelocityVoltage')} />
            <NumberField label={t('發數', 'Shots')} value={plan.shots} onChange={(v) => (mv ? setMv({ shots: Math.round(v) }) : setP({ shots: Math.round(v) }))} min={1} max={100} step={1} unit={t('發', 'shots')} />
            <NumberField label={t('每發間隔', 'Interval')} value={plan.interval} onChange={(v) => (mv ? setMv({ interval: v }) : setP({ interval: v }))} min={0.05} max={2} step={0.05} unit="s" />
            <NumberField label={t('第一發', 'First shot')} value={plan.firstShot} onChange={(v) => setP({ firstShot: v })} min={0.2} max={5} step={0.1} unit="s" hint={t('從靜止開始算', 'Counted from rest')} />
            <BallFields plan={plan} setP={setP} />
            <NumberField label={t('砲台角度', 'Turret angle')} value={turretDeg(plan.angle)} digits={1} onChange={(v) => setP({ angle: angleFromTurret(v) })} min={5} max={85} step={1} unit="°" hint={t('正上方 0°，往目標倒角度變大', 'Straight up is 0°, grows as it tips toward the target')} />
          </div>
          <h3 style={{ marginTop: 14 }}>{t('目標', 'Target')}</h3>
          <div className="fields three">
            <GoalDistanceField plan={plan} setP={setP} fromTag={!mv} hint={distanceHint(plan, !!mv)} />
            <NumberField label={t('目標高度', 'Target height')} value={plan.goalHeight} onChange={(v) => setP({ goalHeight: v })} min={0} max={5} step={0.05} unit="m" hint={t('0 = 地面', '0 = floor')} />
            <NumberField label={t('開口寬度', 'Opening width')} value={plan.goalWidth} onChange={(v) => setP({ goalWidth: v })} min={0.05} max={3} step={0.05} unit="m" />
          </div>
          <HubPreset setP={setP} />
          <div style={{ marginTop: 12 }}>
            <TurretFields plan={plan} setP={setP} angle={plan.angle} />
          </div>
          {!mv && <p className="small" style={{ margin: '8px 0 0' }}>
            {goalW === null ? (
              <span className="fail">{t('這個砲台角度射不進：目標太近或太高。改砲台角度或目標。', 'Doesn’t go in at this turret angle: the target is too close or too high. Change the turret angle or target.')}</span>
            ) : (
              <>
                {t('要進目標大約要 ', 'To hit the target it needs about ')}
                <b>{f(goalW / TAU, 1)} rps</b>
                {t(`（現在目標轉速 ${f(plan.target / TAU, 1)} rps）。`, ` (current target speed ${f(plan.target / TAU, 1)} rps). `)}
                {Math.abs(goalW - plan.target) > 0.05 * TAU && (
                  <button className="linkbtn small" type="button" onClick={() => setP({ target: Math.round((goalW / TAU) * 10) * (TAU / 10) })}>
                    {t('設成目標轉速', 'Set as target speed')}
                  </button>
                )}
              </>
            )}
          </p>}
        </div>

        <div className="panel">
          <h2>{t('真實一點（近似模型）', 'More realistic (approximate model)')}</h2>
          <div className="fields">
            <NumberField label={t('摩擦（等效 kS）', 'Friction (equivalent kS)')} value={knobs.friction} onChange={(v) => setK({ friction: v })} min={0} max={2} step={0.01} unit="V" />
            <NumberField label={t('Stator 電流限制', 'Stator current limit')} value={knobs.statorLimit} onChange={(v) => setK({ statorLimit: v })} min={0} max={200} step={5} unit="A" hint={t('每顆馬達；0 = 不限', 'Per motor; 0 = no limit')} />
          </div>
          <label className="check">
            <input type="checkbox" checked={knobs.noReverse} onChange={(e) => setK({ noReverse: e.target.checked })} />
            {t(
              <>
              PeakReverseVoltage = 0（不出反向電壓，掉速時只靠摩擦慢下來）
              </>,
              <>
                PeakReverseVoltage = 0 (no reverse voltage; after a drop it only slows down by friction)
              </>,
            )}
          </label>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {t(
              <>
              球帶走的轉速用動量估：球出去的速度當成輪緣速度的一半。射程用拋體運動算，不計空氣阻力。這些都是近似模型。
              </>,
              <>
                The speed taken by each ball is estimated from momentum, with the ball leaving at half the wheel surface speed. Range uses projectile motion without air drag. These are all approximate models.
              </>,
            )}
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <section className="tune" aria-label={t('親手調參數', 'Tune it yourself')}>
          <div className="tune-head">
            <h3>{t('親手調參數', 'Tune it yourself')}</h3>
            <span className="small muted">{t('一次只改一個。kP 起始值 0.2 V/rps 不是算出來的，要自己調。', 'Change one at a time. The kP starting value of 0.2 V/rps isn’t calculated; tune it yourself.')}</span>
            <button
              className="btn small"
              type="button"
              disabled={custom.gains === null}
              onClick={() => {
                setPreset(null)
                setCustom({ gains: null })
              }}
            >
              {t('全部回到理論值', 'Reset all to theory')}
            </button>
          </div>
          <div className="fw-shots" role="group" aria-label={t('試試看', 'Try these')}>
            <span className="small muted">{t('試試看：', 'Try these:')}</span>
            {FLYWHEEL_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn small"
                aria-pressed={preset === p.id}
                onClick={() => {
                  setPreset(p.id)
                  setCustom({ gains: p.gains(theory, knobs) })
                }}
              >
                {p.title}
              </button>
            ))}
          </div>
          {preset && <p className="small">{FLYWHEEL_PRESETS.find((p) => p.id === preset)!.note}</p>}
          <div className="tune-groups">
            {GAIN_ROWS.map(({ k, label, unit, hint }) => {
              const v = gains[k]
              const th = theory[k]
              const r = gainRange(k, theory, v)
              const diff = Math.abs(v - th) > 1e-12
              const show = k === 'kS' ? 1 : TAU
              const digits = Math.max(0, Math.ceil(-Math.log10(r.step * show) - 1e-9))
              return (
                <div className={'tune-row' + (diff ? ' changed' : '')} key={k}>
                  <div className="tune-label">
                    <b>{label}</b>
                    <span className="small muted">{hint}</span>
                  </div>
                  <input
                    type="range"
                    aria-label={t(`${label}（${unit}）`, `${label} (${unit})`)}
                    aria-valuetext={`${(v * show).toFixed(digits)} ${unit}`}
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    value={Math.min(r.max, Math.max(r.min, v))}
                    onChange={(e) => setGain(k, Number(e.target.value))}
                  />
                  <div className="tune-num">
                    <NumberField label={label} hideLabel value={v} display={show} digits={digits} min={0} onChange={(x) => setGain(k, x)} unit={unit} />
                  </div>
                  <div className="tune-ref small muted">
                    {t('理論', 'Theory')} {(th * show).toFixed(digits)}
                    {diff && (
                      <button className="linkbtn small" type="button" onClick={() => setGain(k, th)} aria-label={t(`${label} 回到理論值`, `Reset ${label} to theory`)}>
                        {t('↺ 回理論', '↺ Theory')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <p className="small muted" style={{ margin: '14px 0 6px' }}>
          {t(
            <>
            以下是模擬結果，不是實測。灰色直條是球碰到輪子的時間。
            </>,
            <>
              These are simulation results, not measurements. The gray bars are when a ball is touching the wheel.
            </>,
          )}
        </p>
        <Chart title={t('轉速', 'Speed')} x={result.t} series={charts.vel} height={240} yLabel="rps" syncKey="flywheel" bands={shotBands} cursorX={cursorX} note={t('虛線是目標，實線是飛輪真的轉速。每一發都會往下掉一個缺口，缺口越淺、越快填回來越好。', 'The dashed line is the target and the solid line is the real flywheel speed. Every shot knocks a notch out of it; the shallower the notch and the faster it fills back in, the better.')} />
        <Chart title={t('電壓（前饋 + 回授）', 'Voltage (feedforward + feedback)')} x={result.t} series={charts.volt} height={190} yLabel="V" syncKey="flywheel" bands={shotBands} cursorX={cursorX} note={t('綠線是前饋（kS + kV·目標轉速 + kA·加速度），紅線是回授（看誤差補的）。穩定轉的時候紅線應該接近 0。', 'The green line is feedforward (kS + kV·target speed + kA·acceleration) and the red line is feedback (making up the error). At steady speed the red line should be near 0.')} />
        <Chart title={t('電流', 'Current')} x={result.t} series={charts.cur} height={170} yLabel="A" syncKey="flywheel" bands={shotBands} cursorX={cursorX} note={t('貼著電流限制時馬達已經出全力，調 PID 沒有用。', 'When it’s pinned at the current limit the motor is already giving everything, and tuning PID won’t help.')} />
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2>{t('指標', 'Metrics')}</h2>
        <div className="fields three">
          <NumberField label={t('可以射的誤差', 'Allowed error')} value={spec.tolPct} onChange={(v) => setSpec({ ...spec, tolPct: v })} min={0.1} max={20} step={0.5} unit="%" hint={t(`目前 ±${f(tol / TAU, 2)} rps`, `Now ±${f(tol / TAU, 2)} rps`)} />
          <NumberField label={t('到速時間 ≤', 'Spin-up time ≤')} value={spec.spinUp} onChange={(v) => setSpec({ ...spec, spinUp: v })} min={0.05} max={5} step={0.05} unit="s" />
          <NumberField label={t('每發恢復 ≤', 'Recovery per shot ≤')} value={spec.recovery} onChange={(v) => setSpec({ ...spec, recovery: v })} min={0.01} max={2} step={0.01} unit="s" />
        </div>
        {t(
          <>
          <p className="small muted">達標標準是教學用的，不是 FRC 規定。</p>
          </>,
          <>
            The pass criteria are for teaching, not FRC rules.
          </>,
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('項目', 'Item')}</th>
                <th className="num">{t('結果', 'Result')}</th>
                <th>{t('判斷', 'Pass?')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('到速時間（從 0 到可以射）', 'Spin-up time (from 0 to ready to shoot)')}</td>
                <td className="num">{metrics.spinUp === null ? t('到不了', 'Never') : `${f(metrics.spinUp)} s`}</td>
                <td>{fails.includes('spinUp') ? <b className="fail">✕</b> : <b className="pass">✓</b>}</td>
              </tr>
              <tr>
                <td>{t('穩態誤差（第一發前）', 'Steady-state error (before the first shot)')}</td>
                <td className="num">{f(metrics.steadyError / TAU)} rps</td>
                <td>{fails.includes('steady') ? <b className="fail">✕</b> : <b className="pass">✓</b>}</td>
              </tr>
              <tr>
                <td>{t('衝過頭', 'Overshoot')}</td>
                <td className="num">{f(metrics.overshoot / TAU)} rps</td>
                <td>{fails.includes('overshoot') ? <b className="fail">✕</b> : <b className="pass">✓</b>}</td>
              </tr>
              <tr>
                <td>{t('每一發掉速（最多）', 'Drop per shot (largest)')}</td>
                <td className="num">
                  {f(shotStats.maxDip / TAU, 1)} rps{t('（', ' (')}{f((shotStats.maxDip / plan.target) * 100, 0)}%{t('）', ')')}
                </td>
                <td />
              </tr>
              <tr>
                <td>{t('每一發恢復（最慢）', 'Recovery per shot (slowest)')}</td>
                <td className="num">{shotStats.slowest === null ? t('有一發回不來', 'One shot never recovers') : `${f(shotStats.slowest)} s`}</td>
                <td>{shotStats.recoveryFails > 0 ? <b className="fail">{t(`✕ ${shotStats.recoveryFails} 發太慢`, `✕ ${shotStats.recoveryFails} too slow`)}</b> : <b className="pass">✓</b>}</td>
              </tr>
              <tr>
                <td>{t('進了幾發', 'Shots in')}</td>
                <td className="num">
                  {hits} / {outcomes.length}
                </td>
                <td />
              </tr>
              <tr>
                <td>{t('峰值電流（每顆）', 'Peak current (per motor)')}</td>
                <td className="num">{f(metrics.peakCurrent, 0)} A</td>
                <td />
              </tr>
              <tr>
                <td>{t('電壓飽和', 'Voltage saturation')}</td>
                <td className="num">{f(metrics.saturation * 100, 1)}%</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <details className="fw-detail">
          <summary>
            {t(`每一發的明細（${outcomes.length} 發，進了 ${hits} 發）`, `Shot-by-shot details (${outcomes.length} shots, ${hits} in)`)}
          </summary>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('發', 'Shot')}</th>
                <th className="num">{t('掉速', 'Drop')}</th>
                <th className="num">{t('恢復', 'Recovery')}</th>
                <th className="num">{t('輪子轉速', 'Wheel speed')}</th>
                <th className="num">{t('出口球速', 'Exit speed')}</th>
                <th className="num">{mv ? t('離目標', 'Distance') : t('落點', 'Landing')}</th>
                <th>{t('進了沒', 'In?')}</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((o, i) => (
                <tr key={i}>
                  <td>{t(`第 ${i + 1} 發`, `#${i + 1}`)}</td>
                  <td className="num">{f(metrics.shots[i].dip / TAU, 1)} rps</td>
                  <td className={'num ' + (recoveryOk(metrics.shots[i].recovery) ? '' : 'fail')}>{metrics.shots[i].recovery === null ? t('回不來', 'Never') : `${f(metrics.shots[i].recovery!)} s`}</td>
                  <td className="num">{f(o.wheel / TAU, 1)} rps</td>
                  <td className="num">{f(o.exit, 2)} m/s</td>
                  <td className="num">{mv ? `${f((o as MoveOutcome).pose.distance, 2)} m` : Number.isFinite(o.range) ? `${f(o.range, 2)} m` : '—'}</td>
                  <td className={o.hit ? 'pass' : 'fail'}>{mv ? moveMissText(o as MoveOutcome, plan.goalHeight) : missText(o, plan.goalHeight)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </details>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          {mv
            ? t(`看球往下掉經過目標高度（${f(plan.goalHeight, 2)} m）的地方，離目標中心在開口一半（${f((plan.goalWidth / 2) * 100, 0)} cm）以內算進（開口當成圓的）。`, `Looks at where the ball falls through the target height (${f(plan.goalHeight, 2)} m); within half the opening (${f((plan.goalWidth / 2) * 100, 0)} cm) of the target center counts as in (the opening is treated as round). `)
            : t(`落點是球往下掉經過目標高度（${f(plan.goalHeight, 2)} m）時離${FROM_LABEL[plan.distanceFrom]}多遠，離目標距離在開口一半（±${f((plan.goalWidth / 2) * 100, 0)} cm）以內算進。`, `The landing point is how far from the ${FROM_LABEL[plan.distanceFrom].toLowerCase()} the ball falls through the target height (${f(plan.goalHeight, 2)} m); within half the opening (±${f((plan.goalWidth / 2) * 100, 0)} cm) of the target distance counts as in. `)}
          {t(
            <>
            轉速差一點，落點就差一截。
            </>,
            <>
              A little speed error moves the landing point a lot.
            </>,
          )}
        </p>
        <p className="small" style={{ margin: '10px 0 0' }}>
          {t('整體：', 'Overall: ')}
          {fails.length === 0 ? <b className="pass">{t('全部達標', 'All passed')}</b> : <b className="fail">{t(`${fails.length} 項沒過`, `${fails.length} failed`)}</b>}
        </p>
        {hints.length > 0 && (
          <ul className="small">
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2>{t('程式設定', 'Code settings')}</h2>
        <p className="small muted">
          {t(
            '現在滑桿上的數字，只是設定片段，不是完整的子系統：CAN ID、馬達方向（Inverted）、Follower 方向、限位和安全的測試步驟要照你們的機器人自己寫。兩顆以上馬達時，其他顆用 Follower 跟著。',
            'The current slider values as a config snippet only, not a full subsystem: CAN IDs, motor direction (Inverted), follower direction, limits and safe test steps have to be written for your robot. With two or more motors, the others follow with Follower.',
          )}
        </p>
        <pre className="code">{flywheelJava(gains, mech, knobs, plan)}</pre>
      </div>
    </>
  )
}

/** 底盤偏角的範圍 */
function yawRange(aims: { yaw: number }[]): string {
  const ys = aims.map((a) => a.yaw)
  const lo = Math.min(...ys)
  const hi = Math.max(...ys)
  return Math.abs(hi - lo) < 1e-3 ? yawText(lo) : `${yawText(lo)}${t('～', '–')}${yawText(hi)}`
}

import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { Chart, type ChartSeries } from '../../components/Chart'
import { NumberField } from '../../components/NumberField'
import { MOTOR_SPECS } from '../../core/motors'
import { flywheelJava } from '../../core/codegen/flywheel'
import {
  computeFlywheelFeedforward,
  DEFAULT_FLYWHEEL_SPEC,
  DEFAULT_KNOBS,
  flywheelFailures,
  flywheelMetrics,
  shotOutcomes,
  simulateFlywheel,
  wheelForGoal,
  theoryGains,
  type FlywheelGains,
  type FlywheelKnobs,
  type FlywheelSpec,
  type ShotPlan,
} from '../../core/flywheel/flywheel'
import { PlaybackBar, usePlayback } from '../simulate/MiniShaft'
import { FLYWHEEL_PRESETS, GAIN_ROWS, gainRange, missText } from './flywheelTune'
import { FlywheelView } from './FlywheelView'
import { SHAPES, useFlywheelMechanism, usePersisted, useShotPlan } from './flywheelStore'

/** 3F 射球飛輪模擬：轉到目標轉速、連射幾發，看掉速和恢復。內部 SI（rad/s），畫面一律 rps。 */

const TAU = 2 * Math.PI
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function FlywheelSimPage() {
  const { go } = useStore()
  const [mech] = useFlywheelMechanism()
  const [plan, setPlan] = useShotPlan()
  const [knobs, setKnobs] = usePersisted<FlywheelKnobs>('flywheel:knobs', DEFAULT_KNOBS)
  const [spec, setSpec] = usePersisted<FlywheelSpec>('flywheel:spec', DEFAULT_FLYWHEEL_SPEC)
  const ff = useMemo(() => computeFlywheelFeedforward(mech), [mech])
  const theory = useMemo(() => theoryGains(ff), [ff])
  // null = 跟著理論值（改機構資料時一起變）
  const [custom, setCustom] = usePersisted<{ gains: FlywheelGains | null }>('flywheel:gains', { gains: null }, (g) => g.gains === null || GAIN_ROWS.every(({ k }) => Number.isFinite(g.gains?.[k])))
  const gains = custom.gains ?? theory
  const [preset, setPreset] = useState<string | null>(null)

  const setP = (p: Partial<ShotPlan>) => setPlan({ ...plan, ...p })
  const setK = (p: Partial<FlywheelKnobs>) => setKnobs({ ...knobs, ...p })
  const setGain = (k: keyof FlywheelGains, v: number) => {
    setPreset(null)
    setCustom({ gains: { ...gains, [k]: v } })
  }

  const result = useMemo(() => simulateFlywheel(mech, gains, knobs, plan), [mech, gains, knobs, plan])
  const metrics = useMemo(() => flywheelMetrics(result, plan, spec), [result, plan, spec])
  const fails = flywheelFailures(metrics, plan, spec)
  const outcomes = useMemo(() => shotOutcomes(result, mech, plan), [result, mech, plan])
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
  const goalW = wheelForGoal(mech.wheelRadius, plan)
  const pb = usePlayback(result)
  const cursorX = pb.idx !== null ? result.t[pb.idx] : null
  const tol = (spec.tolPct / 100) * plan.target
  const reachable = plan.target < ff.freeSpeed * 0.9

  const charts = useMemo(() => {
    const rps = (a: Float64Array) => Array.from(a, (x) => x / TAU)
    const vel: ChartSeries[] = [
      { label: '目標轉速', color: '--steel', dash: true, values: rps(result.ref) },
      { label: '實際轉速', color: '--blue', values: rps(result.vel) },
    ]
    const volt: ChartSeries[] = [
      { label: '輸出電壓', color: '--ink', values: result.volt },
      { label: '前饋', color: '--green', values: result.ff },
      { label: '回授', color: '--red', values: result.fb },
    ]
    const cur: ChartSeries[] = [{ label: '每顆馬達電流', color: '--amber', values: result.motorCurrent }]
    return { vel, volt, cur }
  }, [result])
  const shotBands = result.shotTimes.map((s): [number, number] => [s, s + 0.03])

  const hints: string[] = []
  if (!reachable) hints.push(`目標 ${f(plan.target / TAU, 0)} rps 太接近最高轉速（約 ${f(ff.freeSpeed / TAU, 0)} rps，還沒扣摩擦）：電壓不夠，調參數也到不了。降低目標或改齒比。`)
  if (fails.includes('steady'))
    hints.push(metrics.steadyError > 0 ? '轉速一直差一點：先把 kS 補成摩擦的大小，再檢查 kV；最後一點點才用 kI。' : '轉速一直偏高：kV 或 kS 太大。')
  if (fails.includes('overshoot')) hints.push('衝過頭：kI 在起步時累積太多，或 kP、kV 太大。飛輪通常不用 kI。')
  if (fails.includes('recovery')) hints.push('掉速後回來太慢：加大 kP。kP 已經很大還是慢，就看電流是不是貼著限制：馬達已經出全力，換更重的飛輪（掉得少）或加馬達。')
  if (fails.includes('spinUp') && !fails.includes('steady')) hints.push('到速太慢：電流貼著限制就是馬達已經出全力；有加速度限制的話調大一點。')
  if (metrics.saturation > 0.05 && !hints.length) hints.push('輸出常常貼到 12 V：回授要的比電池給得多，再加 kP 也沒用。')

  return (
    <section aria-labelledby="t-fw-sim">
      <div className="head">
        <div>
          <h1 id="t-fw-sim">射球飛輪・模擬</h1>
          <p className="lead">從靜止轉到目標轉速，連射幾發，看每一發掉多少、多快回來，球落在哪裡。數字都是 Phoenix 6 的 rps，可以直接填進程式。</p>
        </div>
      </div>

      <div className="panel fw-mech">
        <b>機構</b>
        <span className="small">
          {MOTOR_SPECS[mech.motor].label} × {mech.motorCount}、齒比 {mech.gearRatio} : 1、{mech.wheelMass} kg、半徑 {f(mech.wheelRadius * 100, 2)} cm、{SHAPES.find((x) => x.v === mech.shape)?.label ?? `形狀 ${mech.shape}`}
        </span>
        <span className="small muted">J {(ff.J * 1e4).toFixed(2)} kg·cm²，最高約 {f(ff.freeSpeed / TAU, 0)} rps</span>
        <button className="linkbtn small" type="button" onClick={() => go('calc')}>
          到 1F 改機構
        </button>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <FlywheelView result={result} mech={mech} plan={plan} tol={tol} shots={outcomes} idx={pb.idx} />
        <div style={{ marginTop: 10 }}>
          <PlaybackBar result={result} pb={pb} readout={(k) => `${f(result.vel[k] / TAU, 1)} rps`} />
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 20 }}>
        <div className="panel">
          <h2>射球</h2>
          <div className="fields">
            <NumberField label="目標轉速" value={plan.target} display={1 / TAU} digits={1} onChange={(v) => setP({ target: v })} min={1} max={150} step={1} unit="rps" />
            <NumberField label="加速度限制" value={plan.accel} display={1 / TAU} digits={0} onChange={(v) => setP({ accel: v })} min={0} max={2000} step={10} unit="rps/s" hint="0 = VelocityVoltage 直接跳到目標；大於 0 = MotionMagicVelocityVoltage" />
            <NumberField label="發數" value={plan.shots} onChange={(v) => setP({ shots: Math.round(v) })} min={1} max={100} step={1} unit="發" />
            <NumberField label="每發間隔" value={plan.interval} onChange={(v) => setP({ interval: v })} min={0.05} max={2} step={0.05} unit="s" />
            <NumberField label="第一發" value={plan.firstShot} onChange={(v) => setP({ firstShot: v })} min={0.2} max={5} step={0.1} unit="s" hint="從靜止開始算" />
            <NumberField label="球的質量" value={plan.ballMass} onChange={(v) => setP({ ballMass: v })} min={0.01} max={1} step={0.005} unit="kg" />
            <NumberField label="出射仰角" value={plan.angle} display={180 / Math.PI} digits={0} onChange={(v) => setP({ angle: v })} min={5} max={85} step={1} unit="°" />
            <NumberField label="出射高度" value={plan.height} onChange={(v) => setP({ height: v })} min={0} max={2} step={0.05} unit="m" hint="離地多高" />
          </div>
          <h3 style={{ marginTop: 14 }}>目標</h3>
          <div className="fields three">
            <NumberField label="目標距離" value={plan.goalDistance} onChange={(v) => setP({ goalDistance: v })} min={0.2} max={20} step={0.1} unit="m" hint="離出射點的水平距離" />
            <NumberField label="目標高度" value={plan.goalHeight} onChange={(v) => setP({ goalHeight: v })} min={0} max={5} step={0.05} unit="m" hint="0 = 地面" />
            <NumberField label="開口寬度" value={plan.goalWidth} onChange={(v) => setP({ goalWidth: v })} min={0.05} max={3} step={0.05} unit="m" />
          </div>
          <p className="small" style={{ margin: '8px 0 0' }}>
            {goalW === null ? (
              <span className="fail">這個仰角射不進：目標太近或太高。改仰角或目標。</span>
            ) : (
              <>
                要進目標大約要 <b>{f(goalW / TAU, 1)} rps</b>（現在目標轉速 {f(plan.target / TAU, 1)} rps）。
                {Math.abs(goalW - plan.target) > 0.05 * TAU && (
                  <button className="linkbtn small" type="button" onClick={() => setP({ target: Math.round((goalW / TAU) * 10) * (TAU / 10) })}>
                    設成目標轉速
                  </button>
                )}
              </>
            )}
          </p>
        </div>

        <div className="panel">
          <h2>真實一點（近似模型）</h2>
          <div className="fields">
            <NumberField label="摩擦（等效 kS）" value={knobs.friction} onChange={(v) => setK({ friction: v })} min={0} max={2} step={0.01} unit="V" />
            <NumberField label="Stator 電流限制" value={knobs.statorLimit} onChange={(v) => setK({ statorLimit: v })} min={0} max={200} step={5} unit="A" hint="每顆馬達；0 = 不限" />
          </div>
          <label className="check">
            <input type="checkbox" checked={knobs.noReverse} onChange={(e) => setK({ noReverse: e.target.checked })} />
            PeakReverseVoltage = 0（不出反向電壓，掉速時只靠摩擦慢下來）
          </label>
          <p className="small muted" style={{ marginBottom: 0 }}>
            球帶走的轉速用動量估：球出去的速度當成輪緣速度的一半。射程用拋體運動算，不計空氣阻力。這些都是近似模型。
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <section className="tune" aria-label="親手調參數">
          <div className="tune-head">
            <h3>親手調參數</h3>
            <span className="small muted">一次只改一個。kP 起始值 0.2 V/rps 不是算出來的，要自己調。</span>
            <button
              className="btn small"
              type="button"
              disabled={custom.gains === null}
              onClick={() => {
                setPreset(null)
                setCustom({ gains: null })
              }}
            >
              全部回到理論值
            </button>
          </div>
          <div className="fw-shots" role="group" aria-label="試試看">
            <span className="small muted">試試看：</span>
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
              const t = theory[k]
              const r = gainRange(k, theory, v)
              const diff = Math.abs(v - t) > 1e-12
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
                    aria-label={`${label}（${unit}）`}
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
                    理論 {(t * show).toFixed(digits)}
                    {diff && (
                      <button className="linkbtn small" type="button" onClick={() => setGain(k, t)} aria-label={`${label} 回到理論值`}>
                        ↺ 回理論
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <p className="small muted" style={{ margin: '14px 0 6px' }}>
          以下是模擬結果，不是實測。灰色直條是球碰到輪子的時間。
        </p>
        <Chart title="轉速" x={result.t} series={charts.vel} height={240} yLabel="rps" syncKey="flywheel" bands={shotBands} cursorX={cursorX} note="虛線是目標，實線是飛輪真的轉速。每一發都會往下掉一個缺口，缺口越淺、越快填回來越好。" />
        <Chart title="電壓（前饋 + 回授）" x={result.t} series={charts.volt} height={190} yLabel="V" syncKey="flywheel" bands={shotBands} cursorX={cursorX} note="綠線是前饋（kS + kV·目標轉速 + kA·加速度），紅線是回授（看誤差補的）。穩定轉的時候紅線應該接近 0。" />
        <Chart title="電流" x={result.t} series={charts.cur} height={170} yLabel="A" syncKey="flywheel" bands={shotBands} cursorX={cursorX} note="貼著電流限制時馬達已經出全力，調 PID 沒有用。" />
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2>指標</h2>
        <div className="fields three">
          <NumberField label="可以射的誤差" value={spec.tolPct} onChange={(v) => setSpec({ ...spec, tolPct: v })} min={0.1} max={20} step={0.5} unit="%" hint={`目前 ±${f(tol / TAU, 2)} rps`} />
          <NumberField label="到速時間 ≤" value={spec.spinUp} onChange={(v) => setSpec({ ...spec, spinUp: v })} min={0.05} max={5} step={0.05} unit="s" />
          <NumberField label="每發恢復 ≤" value={spec.recovery} onChange={(v) => setSpec({ ...spec, recovery: v })} min={0.01} max={2} step={0.01} unit="s" />
        </div>
        <p className="small muted">達標標準是教學用的，不是 FRC 規定。</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>項目</th>
                <th className="num">結果</th>
                <th>判斷</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>到速時間（從 0 到可以射）</td>
                <td className="num">{metrics.spinUp === null ? '到不了' : `${f(metrics.spinUp)} s`}</td>
                <td>{fails.includes('spinUp') ? <b className="fail">✕</b> : <b className="pass">✓</b>}</td>
              </tr>
              <tr>
                <td>穩態誤差（第一發前）</td>
                <td className="num">{f(metrics.steadyError / TAU)} rps</td>
                <td>{fails.includes('steady') ? <b className="fail">✕</b> : <b className="pass">✓</b>}</td>
              </tr>
              <tr>
                <td>衝過頭</td>
                <td className="num">{f(metrics.overshoot / TAU)} rps</td>
                <td>{fails.includes('overshoot') ? <b className="fail">✕</b> : <b className="pass">✓</b>}</td>
              </tr>
              <tr>
                <td>每一發掉速（最多）</td>
                <td className="num">
                  {f(shotStats.maxDip / TAU, 1)} rps（{f((shotStats.maxDip / plan.target) * 100, 0)}%）
                </td>
                <td />
              </tr>
              <tr>
                <td>每一發恢復（最慢）</td>
                <td className="num">{shotStats.slowest === null ? '有一發回不來' : `${f(shotStats.slowest)} s`}</td>
                <td>{shotStats.recoveryFails > 0 ? <b className="fail">✕ {shotStats.recoveryFails} 發太慢</b> : <b className="pass">✓</b>}</td>
              </tr>
              <tr>
                <td>進了幾發</td>
                <td className="num">
                  {hits} / {outcomes.length}
                </td>
                <td />
              </tr>
              <tr>
                <td>峰值電流（每顆）</td>
                <td className="num">{f(metrics.peakCurrent, 0)} A</td>
                <td />
              </tr>
              <tr>
                <td>電壓飽和</td>
                <td className="num">{f(metrics.saturation * 100, 1)}%</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <details className="fw-detail">
          <summary>
            每一發的明細（{outcomes.length} 發，進了 {hits} 發）
          </summary>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>發</th>
                <th className="num">掉速</th>
                <th className="num">恢復</th>
                <th className="num">輪子轉速</th>
                <th className="num">出口球速</th>
                <th className="num">落點</th>
                <th>進了沒</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((o, i) => (
                <tr key={i}>
                  <td>第 {i + 1} 發</td>
                  <td className="num">{f(metrics.shots[i].dip / TAU, 1)} rps</td>
                  <td className={'num ' + (recoveryOk(metrics.shots[i].recovery) ? '' : 'fail')}>{metrics.shots[i].recovery === null ? '回不來' : `${f(metrics.shots[i].recovery!)} s`}</td>
                  <td className="num">{f(o.wheel / TAU, 1)} rps</td>
                  <td className="num">{f(o.exit, 2)} m/s</td>
                  <td className="num">{Number.isFinite(o.range) ? `${f(o.range, 2)} m` : '—'}</td>
                  <td className={o.hit ? 'pass' : 'fail'}>{missText(o, plan.goalHeight)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </details>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          落點是球往下掉經過目標高度（{f(plan.goalHeight, 2)} m）時離出射點多遠，離目標距離在開口一半（±{f((plan.goalWidth / 2) * 100, 0)} cm）以內算進。轉速差一點，落點就差一截。
        </p>
        <p className="small" style={{ margin: '10px 0 0' }}>
          整體：{fails.length === 0 ? <b className="pass">全部達標</b> : <b className="fail">{fails.length} 項沒過</b>}
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
        <h2>程式設定</h2>
        <p className="small muted">現在滑桿上的數字。兩顆以上馬達時，其他顆用 Follower 跟著。</p>
        <pre className="code">{flywheelJava(gains, mech, knobs, plan)}</pre>
      </div>
    </section>
  )
}

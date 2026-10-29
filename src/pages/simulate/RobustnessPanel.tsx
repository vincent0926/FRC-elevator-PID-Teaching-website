import { useRef, useState } from 'react'
import { Chart } from '../../components/Chart'
import { NumberField } from '../../components/NumberField'
import { Fold } from '../../components/Fold'
import type { FeedforwardResult } from '../../core/feedforward'
import { DEFAULT_RANGES, type RobustRanges, type RobustResult } from '../../core/physics/robustness'
import type { SimInput } from '../../core/physics/simulate'
import { SPEC_LABEL, type Spec } from '../../core/physics/spec'
import type { ElevatorMechanism } from '../../schema/parameterSet'
import { runRobustnessTest } from '../../workers/client'
import { t } from '../../core/lang'

/**
 * 穩健性測試（3F 步驟 10）：真的機器人每天都不一樣（電池、有沒有夾遊戲物件、摩擦），
 * 同一組參數在這些變化下還達不達標？
 */

export function RobustnessPanel({ base, mechanism, ff, realistic, spec }: { base: SimInput; mechanism: ElevatorMechanism; ff: FeedforwardResult; realistic: boolean; spec: Spec }) {
  const [ranges, setRanges] = useState<RobustRanges>(DEFAULT_RANGES)
  // 結果記住是用哪一組輸入算的；參數、受控體或範圍一改，舊結果就不顯示
  const [saved, setSaved] = useState<{ r: RobustResult; ms: number; base: SimInput; mechanism: ElevatorMechanism; ff: FeedforwardResult; ranges: RobustRanges; spec: Spec } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runId = useRef(0)
  const set = (patch: Partial<RobustRanges>) => setRanges({ ...ranges, ...patch })
  const current = saved && saved.base === base && saved.mechanism === mechanism && saved.ff === ff && saved.ranges === ranges && saved.spec === spec ? saved : null
  const result = current?.r ?? null
  const ms = current?.ms ?? 0

  const run = async () => {
    const id = ++runId.current
    const inputs = { base, mechanism, ff, ranges, spec }
    setBusy(true)
    setError(null)
    const t0 = performance.now()
    try {
      const r = await runRobustnessTest(base, mechanism, ff, { ...ranges, seed: Math.floor(Math.random() * 1e9) }, spec)
      if (id === runId.current) setSaved({ r, ms: performance.now() - t0, ...inputs })
    } catch (e) {
      if (id === runId.current && !(e instanceof Error && e.message === 'stale')) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === runId.current) setBusy(false)
    }
  }

  const failCount: Partial<Record<keyof Spec, number>> = {}
  for (const r of result?.runs ?? []) for (const f of r.failures) failCount[f as keyof Spec] = (failCount[f as keyof Spec] ?? 0) + 1
  const worst = result ? result.runs[result.worstIndex] : null
  const pct = result ? Math.round(result.passRate * 100) : 0

  return (
    <Fold
      style={{ marginTop: 20 }}
      title={t('穩健性測試', 'Robustness test')}
      summary={result ? t(`上次結果：${pct}% 達標`, `Last result: ${pct}% pass`) : t('電池、負載、摩擦變了還能不能達標？', 'Still passing when battery, load and friction change?')}
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        {t('電池、負載、摩擦每天都不一樣。在下面的範圍內隨機抽樣跑很多次，看這組參數有幾成還達標。', 'Battery, load and friction change from day to day. Run many random samples within the ranges below and see what fraction still passes with these gains.')}
        {!realistic && t(' 目前是理想模型，建議先切到真實模型（有電流限制和電池壓降）再測。', ' You’re on the ideal model; switch to the realistic model (with current limits and battery sag) before testing.')}
      </p>
      <div className="fields three">
        <NumberField label={t('質量變化 ±', 'Mass variation ±')} value={ranges.massPct} display={100} min={0} max={80} onChange={(v) => set({ massPct: v })} unit="%" hint={t('遊戲物件、螺絲、線材', 'Game pieces, screws, wiring')} />
        <NumberField label={t('電池最低', 'Battery min')} value={ranges.batteryMin} min={8} max={13} onChange={(v) => set({ batteryMin: Math.min(v, ranges.batteryMax) })} unit="V" />
        <NumberField label={t('電池最高', 'Battery max')} value={ranges.batteryMax} min={8} max={13.5} onChange={(v) => set({ batteryMax: Math.max(v, ranges.batteryMin) })} unit="V" />
        <NumberField label={t('摩擦最小', 'Friction min')} value={ranges.frictionMin} min={0} max={2} onChange={(v) => set({ frictionMin: Math.min(v, ranges.frictionMax) })} unit="V" />
        <NumberField label={t('摩擦最大', 'Friction max')} value={ranges.frictionMax} min={0} max={2} onChange={(v) => set({ frictionMax: Math.max(v, ranges.frictionMin) })} unit="V" />
        <NumberField label={t('次數', 'Runs')} value={ranges.runs} min={5} max={200} step={5} onChange={(v) => set({ runs: Math.round(v) })} unit={t('次', 'runs')} />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary small" type="button" onClick={run} disabled={busy}>
          {busy ? t('模擬中…', 'Simulating…') : t(`跑 ${ranges.runs} 次`, `Run ${ranges.runs} times`)}
        </button>
        {result && <span className="small muted">{t('跑完', 'Done in')} {ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`}</span>}
      </div>
      {error && <div className="warn">{t('穩健性測試失敗：', 'Robustness test failed: ')}{error}</div>}

      {result && worst && (
        <>
          <div className="robust-sum">
            <div>
              <small>{t('達標', 'Pass rate')}</small>
              <b className={pct >= 90 ? 'pass' : pct >= 60 ? 'amber' : 'fail'}>{pct}%</b>
              <span className="small muted">
                {result.runs.filter((r) => r.pass).length} / {result.runs.length}{t(' 次', '')}
              </span>
            </div>
            <div>
              <small>{t('最常沒過的項目', 'Most common failures')}</small>
              <span className="small">
                {Object.keys(failCount).length === 0
                  ? t('全部都過', 'All passed')
                  : (Object.entries(failCount) as [keyof Spec, number][])
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, c]) => t(`${SPEC_LABEL[k]} ${c} 次`, `${SPEC_LABEL[k]} ×${c}`))
                      .join(t('、', ', '))}
              </span>
            </div>
            <div>
              <small>{t('最差的一次', 'Worst run')}</small>
              <span className="small">
                {t(`質量 ×${worst.massScale.toFixed(2)}、電池 ${worst.battery.toFixed(1)} V、摩擦 ${worst.friction.toFixed(2)} V`, `mass ×${worst.massScale.toFixed(2)}, battery ${worst.battery.toFixed(1)} V, friction ${worst.friction.toFixed(2)} V`)}
              </span>
            </div>
          </div>
          <Chart
            title={t('最差情況的位置', 'Worst-case position')}
            x={result.worst.t}
            series={[
              { label: t('目標（軌跡）', 'Target (profile)'), color: '--steel', dash: true, values: result.worst.refPos },
              { label: t('最差情況的實際位置', 'Worst-case actual position'), color: '--red', values: result.worst.pos },
            ]}
            height={200}
            yLabel="m"
          />
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            {pct >= 90
              ? t('這組參數在日常變化下大多都能達標。', 'These gains pass under most day-to-day variation.')
              : failCount.saturation
                ? t('電池低或比較重時頂到電壓上限：把 Motion Magic 的速度、加速度留多一點餘裕。', 'Low battery or extra weight hits the voltage limit: leave more margin in the Motion Magic velocity and acceleration.')
                : failCount.steadyState || failCount.settling
                  ? t('重量或摩擦變了就停不準：前饋只能補「平均」的機器人，差的部分要靠 kP。試試加大 kP。', 'It can’t stop accurately when weight or friction changes: feedforward only covers the “average” robot, and kP has to make up the rest. Try raising kP.')
                  : t('看最差情況的曲線，找出是哪一段沒過，一次改一個參數再測。', 'Look at the worst-case curve, find which part fails, change one gain at a time and test again.')}
          </p>
        </>
      )}
    </Fold>
  )
}

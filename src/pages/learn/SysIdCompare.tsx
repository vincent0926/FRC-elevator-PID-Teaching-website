import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { NumberField } from '../../components/NumberField'
import { compareSysId, measuredParameterSet, sysIdToSi, type FfGains, type SysIdUnits } from '../../core/analysis/sysid'
import { metersPerRotation } from '../../core/units'
import { t } from '../../core/lang'

/** 單元二最後一步：填入 SysId 結果，跟 1F 理論值並排比較。 */

const UNIT: Record<keyof FfGains, Record<SysIdUnits, string>> = {
  kS: { meters: 'V', rotations: 'V' },
  kG: { meters: 'V', rotations: 'V' },
  kV: { meters: 'V/(m/s)', rotations: 'V/rps' },
  kA: { meters: 'V/(m/s²)', rotations: 'V/(rps/s)' },
}

const LEVEL_TEXT = t({ ok: '正常', warn: '差有點多', bad: '差很多' }, { ok: 'Normal', warn: 'Somewhat off', bad: 'Far off' })

export function SysIdCompare() {
  const { mechanism, ff, theory, setCustom, setSimSource, go } = useStore()
  const [units, setUnits] = useState<SysIdUnits>('meters')
  const [raw, setRaw] = useState<FfGains>({ kS: 0, kG: 0, kV: 0, kA: 0 })
  const mpr = metersPerRotation(mechanism.drumRadius)
  const topRatio = Math.max(...mechanism.stages.map((s) => s.speedRatio))
  const filled = raw.kG !== 0 || raw.kV !== 0 || raw.kA !== 0
  const si = useMemo(() => sysIdToSi(raw, units, mpr), [raw, units, mpr])
  const cmp = useMemo(() => compareSysId({ kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA }, si, topRatio), [ff, si, topRatio])
  // 顯示理論值用跟輸入一樣的單位，比較好對照
  const shown = (k: keyof FfGains, v: number) => (units === 'rotations' && (k === 'kV' || k === 'kA') ? v * mpr : v)

  return (
    <div className="quiz" style={{ background: 'var(--panel)' }}>
      <b className="small">{t('SysId 結果 vs 理論值', 'SysId results vs theory')}</b>
      <p className="small muted" style={{ margin: '4px 0 10px' }}>
        {t(
          <>
          SysId 分析時用的位置欄位是什麼單位，這裡就選什麼。用範例程式的 <code>/Elevator/PositionMeters</code> 選公尺；用 SignalLogger 的 TalonFX 位置選轉。
          </>,
          <>
            Pick the units of the position field you used in the SysId analysis. With the example code’s <code>/Elevator/PositionMeters</code> pick meters; with the SignalLogger TalonFX position pick rotations.
          </>,
        )}
      </p>
      <div className="seg" role="group" aria-label={t('SysId 單位', 'SysId units')}>
        <button type="button" aria-pressed={units === 'meters'} onClick={() => setUnits('meters')}>
          {t('公尺（AdvantageKit）', 'Meters (AdvantageKit)')}
        </button>
        <button type="button" aria-pressed={units === 'rotations'} onClick={() => setUnits('rotations')}>
          {t('轉（SignalLogger）', 'Rotations (SignalLogger)')}
        </button>
      </div>
      <div className="gains" style={{ marginTop: 12 }}>
        {(['kS', 'kG', 'kV', 'kA'] as const).map((k) => (
          <NumberField key={k} label={k} value={raw[k]} onChange={(v) => setRaw({ ...raw, [k]: v })} unit={UNIT[k][units]} />
        ))}
      </div>

      {filled && (
        <>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('參數', 'Gain')}</th>
                  <th className="num">{t('理論值', 'Theory')}</th>
                  <th className="num">SysId</th>
                  <th className="num">{t('差異', 'Difference')}</th>
                  <th>{t('判斷', 'Verdict')}</th>
                </tr>
              </thead>
              <tbody>
                {cmp.rows.map((r) => (
                  <tr key={r.key}>
                    <th>{r.key}</th>
                    <td className="num">{r.key === 'kS' ? t('沒算', 'not calculated') : Number(shown(r.key, r.theory).toPrecision(4))}</td>
                    <td className="num">{Number(raw[r.key].toPrecision(4))}</td>
                    <td className="num">{r.ratio === null ? '—' : `${r.ratio >= 1 ? '+' : ''}${((r.ratio - 1) * 100).toFixed(0)}%`}</td>
                    <td>
                      <span className={r.level === 'ok' ? 'pass' : r.level === 'warn' ? 'amber' : 'fail'}>{LEVEL_TEXT[r.level]}</span>
                      <span className="small muted"> {r.hint}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cmp.findings.map((f) => (
            <div key={f} className="note">
              {f}
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn small"
              type="button"
              onClick={() => {
                setCustom(measuredParameterSet(theory, si, t('SysId 量測', 'SysId measurement')))
                setSimSource('custom')
                go('sim')
              }}
            >
              {t('用 SysId 前饋到 3F 模擬', 'Use SysId feedforward in the 3F sim')}
            </button>
            <span className="small muted">{t('會換掉目前的「自訂」參數；kP、Motion Magic 沿用理論值。', 'Replaces your current “Custom” gains; kP and Motion Magic stay at theory.')}</span>
          </div>
        </>
      )}
    </div>
  )
}

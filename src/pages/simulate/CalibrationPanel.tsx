import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { useElevator, type Calibration } from '../../app/elevatorStore'
import { ApproxNote } from '../../components/ApproxNote'
import { Chart } from '../../components/Chart'
import { randomHiddenPlant } from '../../core/challenge'
import type { AlignedLog } from '../../core/log/fieldMap'
import { sampleAlignedLog } from '../../core/log/sampleLog'
import { calibrate, CALIBRATION_RMS_LIMIT, type CalibrationResult } from '../../core/physics/calibrate'
import { t } from '../../core/lang'

/**
 * 模型校正（3F 步驟 9）：拿 2F 匯入的實機日誌，讓模擬的電梯跟真的對得上。
 * 校正好之後「已校正模型」可以用，調參建議的「在模擬中預覽」也比較可信。
 */

const cm = (v: number) => `${(v * 100).toFixed(1)} cm`

export function CalibrationPanel({ onApply }: { onApply: (c: Calibration) => void }) {
  const { go } = useStore()
  const { mechanism, ff, theory, lastLog, calibration, setCalibration } = useElevator()
  const [src, setSrc] = useState<{ log: AlignedLog; name: string; truth?: string } | null>(null)
  const result: CalibrationResult | null = useMemo(() => (src ? calibrate(src.log, mechanism, ff) : null), [src, mechanism, ff])

  const practice = () => {
    // 練習：藏一台跟理論不一樣的電梯，產生一份日誌讓你校正，最後對答案
    const h = randomHiddenPlant(Math.floor(Math.random() * 1e9), 'hard')
    const f = (h.frictionUp + h.frictionDown) / 2
    const log = sampleAlignedLog({
      mechanism,
      ff,
      gains: { ...theory.feedforward, ...theory.feedback, kS: f },
      // 加速度放慢，50 Hz 的日誌才抓得到加速段
      motionMagic: { cruiseVelocity: theory.motionMagic.cruiseVelocity * 0.6, acceleration: theory.motionMagic.acceleration * 0.4 },
      plant: { realistic: true, kGScale: h.kGScale, kVScale: h.kVScale, kAScale: h.kAScale, frictionKs: f },
      seed: Math.floor(Math.random() * 1e9),
    })
    setSrc({
      log,
      name: t('練習用範例日誌', 'Practice sample log'),
      truth: t(`答案：重量 ×${h.kGScale.toFixed(2)}、kV ×${h.kVScale.toFixed(2)}、慣性 ×${h.kAScale.toFixed(2)}、摩擦 ${f.toFixed(2)} V`, `Answer: weight ×${h.kGScale.toFixed(2)}, kV ×${h.kVScale.toFixed(2)}, inertia ×${h.kAScale.toFixed(2)}, friction ${f.toFixed(2)} V`),
    })
  }

  const save = () => {
    if (!result || !src) return
    const c: Calibration = {
      at: new Date().toISOString(),
      logName: src.name,
      kGScale: result.kGScale,
      kVScale: result.kVScale,
      kAScale: result.kAScale,
      friction: result.friction,
      rms: result.calibrated.rms,
      rmsTheory: result.theory.rms,
    }
    setCalibration(c)
    onApply(c)
  }

  const rows: [string, number, number, string][] = result
    ? [
        [t('kG（重力 − 配重）', 'kG (gravity − counterweight)'), ff.kG, result.fit.kG, 'V'],
        [t('kV（反電動勢、效率）', 'kV (back-EMF, efficiency)'), ff.kV, result.fit.kV, 'V/(m/s)'],
        [t('kA（等效質量）', 'kA (equivalent mass)'), ff.kA, result.fit.kA, 'V/(m/s²)'],
        [t('摩擦', 'Friction'), 0, result.friction, 'V'],
      ]
    : []

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h2>{t('模型校正', 'Model calibration')}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        {t(
          <>
          把實機日誌的輸出電壓餵給模擬（開迴路重播），調整重力、kV、等效質量、摩擦讓位置對得上，得到比較接近真機器人的「已校正模型」。
          </>,
          <>
            Feed the robot log’s output voltage into the sim (open-loop replay) and adjust gravity, kV, equivalent mass and friction until the positions match, giving a “Calibrated model” closer to the real robot.
          </>,
        )}
      </p>
      <ApproxNote
        summary={t('校正後的模型還是近似：它只把四個數對到這一份日誌，換了高度範圍、電池或負載就可能不準。', 'The calibrated model is still approximate: it only fits four numbers to this one log, and may be off for a different height range, battery or load.')}
        items={t(
          [
            '只擬合重力（kG）、kV、等效質量（kA）、摩擦（kS，往上往下當成一樣）四個數；齒輪箱效率、隨高度變化的力會被混進這四個數裡。',
            '擬合用的是這份日誌移動過的範圍和速度，範圍外（例如更快的 Motion Magic）是外插。',
            '重播用日誌記錄的輸出電壓（50 Hz 零階保持），兩筆之間的變化看不到。',
            '位置誤差 < 1 cm 只代表「這份日誌」對得上，不代表每一次都對。',
          ],
          [
            'Only four numbers are fitted: gravity (kG), kV, equivalent mass (kA) and friction (kS, same up and down); gearbox efficiency and height-dependent forces get folded into these four.',
            'The fit uses the range and speeds this log moved through; anything outside that (e.g. faster Motion Magic) is extrapolation.',
            'Replay uses the logged output voltage (50 Hz zero-order hold), so changes between samples aren’t visible.',
            'A position error < 1 cm only means this log matches, not that every run will.',
          ],
        )}
      />
      <div className="row">
        <button className="btn small" type="button" disabled={!lastLog} onClick={() => lastLog && setSrc({ log: lastLog.log, name: lastLog.name })}>
          {lastLog ? t(`用 2F 匯入的「${lastLog.name}」校正`, `Calibrate with “${lastLog.name}” from 2F`) : t('還沒在 2F 匯入日誌', 'No log imported in 2F yet')}
        </button>
        {!lastLog && (
          <button className="linkbtn small" type="button" onClick={() => go('tune')}>
            {t('到 2F 匯入', 'Import in 2F')}
          </button>
        )}
        <button className="btn small" type="button" onClick={practice}>
          {t('用範例日誌練習', 'Practice with a sample log')}
        </button>
        {calibration && (
          <span className="small muted">
            {t(`目前已校正：${calibration.logName}，誤差 ${cm(calibration.rms)}`, `Currently calibrated: ${calibration.logName}, error ${cm(calibration.rms)}`)}
            <button className="linkbtn" type="button" style={{ marginLeft: 8 }} onClick={() => setCalibration(null)}>
              {t('清除', 'Clear')}
            </button>
          </span>
        )}
      </div>

      {src && !result && <div className="warn">{t('這份日誌擬合不出來：需要有上下移動、而且記錄了輸出電壓和速度。', 'This log can’t be fitted: it needs up-and-down moves with output voltage and velocity recorded.')}</div>}
      {src && result && (
        <>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('受控體', 'Plant')}</th>
                  <th className="num">{t('理論', 'Theory')}</th>
                  <th className="num">{t('從日誌擬合', 'Fitted from log')}</th>
                  <th className="num">{t('倍率', 'Ratio')}</th>
                  <th>{t('單位', 'Unit')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([k, th, fit, u]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td className="num">{th === 0 ? t('沒算', 'not calculated') : Number(th.toPrecision(4))}</td>
                    <td className="num">{Number(fit.toPrecision(4))}</td>
                    <td className="num">{th === 0 ? '—' : `×${(fit / th).toFixed(2)}`}</td>
                    <td className="muted">{u}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small" style={{ margin: '8px 0' }}>
            {t('開迴路重播的位置誤差：理論模型 ', 'Open-loop replay position error: theory model ')}
            <b>{cm(result.theory.rms)}</b>
            {t(' → 校正後 ', ' → calibrated ')}
            <b className={result.ok ? 'pass' : 'fail'}>{cm(result.calibrated.rms)}</b>
            {t(
              `（門檻 ${cm(CALIBRATION_RMS_LIMIT)}，擬合 R² ${result.fit.r2.toFixed(3)}，${result.calibrated.windows} 段移動）`,
              ` (threshold ${cm(CALIBRATION_RMS_LIMIT)}, fit R² ${result.fit.r2.toFixed(3)}, ${result.calibrated.windows} moves)`,
            )}
          </p>
          {src.truth && <div className="note">{src.truth}</div>}
          {result.problems.map((p) => (
            <div key={p} className="warn">
              {p}
            </div>
          ))}
          <Chart
            title={t('開迴路重播：實測 vs 模擬', 'Open-loop replay: measured vs sim')}
            x={result.theory.t}
            series={[
              { label: t('實測位置', 'Measured position'), color: '--ink-2', values: result.theory.measured },
              { label: t('理論模型重播', 'Theory model replay'), color: '--violet', dash: true, values: result.theory.replayed },
              { label: t('校正後重播', 'Calibrated replay'), color: '--green', values: result.calibrated.replayed },
            ]}
            height={220}
            yLabel="m"
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary small" type="button" disabled={!result.ok} onClick={save}>
              {t('存成已校正模型並套用', 'Save as calibrated model and apply')}
            </button>
            <span className="small muted">{result.ok ? t('會把受控體設定改成校正後的倍率與摩擦。', 'Sets the plant to the calibrated ratios and friction.') : t('吻合度不夠，不能標成已校正。', 'Not a close enough match to mark as calibrated.')}</span>
          </div>
        </>
      )}
    </div>
  )
}

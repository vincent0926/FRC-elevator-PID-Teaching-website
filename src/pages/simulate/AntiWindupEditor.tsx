import { NumberField } from '../../components/NumberField'
import { DEFAULT_I_ZONE, DEFAULT_TRACKING, type AntiWindup, type AntiWindupMode } from '../../core/controller/slot0'
import { t } from '../../core/lang'

/** 3F 積分防飽和選項：kI 不是 0 才有作用 */

const MODES: { id: AntiWindupMode; label: string; what: string }[] = [
  { id: 'none', label: t('沒有', 'None'), what: t('一直積分。輸出頂到上限時積分還在長，追上之後放不掉就衝過頭（積分飽和）。', 'Keeps integrating. While the output is at its limit the integral keeps growing, and once it catches up it can’t let go, so it overshoots (integral windup).') },
  { id: 'clamp', label: t('飽和時停止積分', 'Stop integrating when saturated'), what: t('輸出頂到上限、誤差還在往同一邊推時，暫停積分（條件積分）。最簡單，也最常用。', 'Pause integration while the output is at its limit and the error still pushes the same way (conditional integration). Simplest and most common.') },
  { id: 'izone', label: 'I-Zone', what: t('誤差超過 I-Zone 時積分清成 0，只在接近目標時積分。WPILib PIDController.setIZone() 就是這樣。', 'Clear the integral to 0 when the error is beyond the I-Zone, so it only integrates near the target. That’s what WPILib PIDController.setIZone() does.') },
  { id: 'backCalc', label: t('反算', 'Back-calculation'), what: t('輸出被限制時，把「想要的 − 實際給的」回饋到積分，讓積分自己退回來。', 'When the output is limited, feed “wanted − actually given” back into the integral so it unwinds itself.') },
]

export function AntiWindupEditor({ value, onChange, kI }: { value: AntiWindup; onChange: (v: AntiWindup) => void; kI: number }) {
  const cur = MODES.find((m) => m.id === value.mode) ?? MODES[0]
  return (
    <div style={{ marginTop: 14 }}>
      <b className="small">{t('積分防飽和（Anti-Windup）', 'Anti-windup')}</b>
      <div className="seg" role="group" aria-label={t('積分防飽和', 'Anti-windup')} style={{ marginTop: 6, flexWrap: 'wrap' }}>
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={value.mode === m.id} onClick={() => onChange({ ...value, mode: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {cur.what}
        {kI === 0 && t(' 現在 kI = 0，這個設定沒有作用。', 'kI is 0 right now, so this setting has no effect.')}
      </p>
      {value.mode === 'izone' && (
        <div className="gains" style={{ marginTop: 8 }}>
          <NumberField
            label="I-Zone"
            value={value.iZone ?? DEFAULT_I_ZONE}
            display={100}
            min={0.1}
            max={50}
            unit="cm"
            onChange={(v) => onChange({ ...value, iZone: v })}
          />
        </div>
      )}
      {value.mode === 'backCalc' && (
        <div className="gains" style={{ marginTop: 8 }}>
          <NumberField
            label={t('反算時間常數', 'Back-calculation time constant')}
            value={value.tracking ?? DEFAULT_TRACKING}
            min={0.005}
            max={2}
            unit="s"
            onChange={(v) => onChange({ ...value, tracking: v })}
          />
        </div>
      )}
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {t(
          <>
          這是模擬器的教學選項。機器人程式裡：WPILib PIDController 用 setIZone()、setIntegratorRange()；馬達控制器內建的積分怎麼處理，以 CTRE／REV 官方文件為準。
          </>,
          <>
            This is a teaching option in the simulator. In robot code, WPILib PIDController uses setIZone() and setIntegratorRange(); for how the motor controller’s built-in integral is handled, follow the official CTRE / REV docs.
          </>,
        )}
      </p>
    </div>
  )
}

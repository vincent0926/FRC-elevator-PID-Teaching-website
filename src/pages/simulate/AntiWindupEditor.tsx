import { NumberField } from '../../components/NumberField'
import { DEFAULT_I_ZONE, DEFAULT_TRACKING, type AntiWindup, type AntiWindupMode } from '../../core/controller/slot0'

/** 3F 積分防飽和選項：kI 不是 0 才有作用 */

const MODES: { id: AntiWindupMode; label: string; what: string }[] = [
  { id: 'none', label: '沒有', what: '一直積分。輸出頂到上限時積分還在長，追上之後放不掉就衝過頭（積分飽和）。' },
  { id: 'clamp', label: '飽和時停止積分', what: '輸出頂到上限、誤差還在往同一邊推時，暫停積分（條件積分）。最簡單，也最常用。' },
  { id: 'izone', label: 'I-Zone', what: '誤差超過 I-Zone 時積分清成 0，只在接近目標時積分。WPILib PIDController.setIZone() 就是這樣。' },
  { id: 'backCalc', label: '反算', what: '輸出被限制時，把「想要的 − 實際給的」回饋到積分，讓積分自己退回來。' },
]

export function AntiWindupEditor({ value, onChange, kI }: { value: AntiWindup; onChange: (v: AntiWindup) => void; kI: number }) {
  const cur = MODES.find((m) => m.id === value.mode) ?? MODES[0]
  return (
    <div style={{ marginTop: 14 }}>
      <b className="small">積分防飽和（Anti-Windup）</b>
      <div className="seg" role="group" aria-label="積分防飽和" style={{ marginTop: 6, flexWrap: 'wrap' }}>
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={value.mode === m.id} onClick={() => onChange({ ...value, mode: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {cur.what}
        {kI === 0 && ' 現在 kI = 0，這個設定沒有作用。'}
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
            label="反算時間常數"
            value={value.tracking ?? DEFAULT_TRACKING}
            min={0.005}
            max={2}
            unit="s"
            onChange={(v) => onChange({ ...value, tracking: v })}
          />
        </div>
      )}
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        這是模擬器的教學選項。機器人程式裡：WPILib PIDController 用 setIZone()、setIntegratorRange()；馬達控制器內建的積分怎麼處理，以 CTRE／REV 官方文件為準。
      </p>
    </div>
  )
}

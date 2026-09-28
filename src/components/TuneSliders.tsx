import { useId } from 'react'
import { NumberField } from './NumberField'
import { getGain, setGain, sliderRange, snap, type TuneGains, type TuneKey } from '../pages/simulate/tuneRange'

/**
 * 3F「親手調參數」：放在播放列正下方，拖了馬上重新模擬。
 * 每條滑桿都標出理論值（刻度＋文字），可以單項或全部回到理論值。
 * 目前看的不是「自訂」時，第一次拖動會用畫面上的參數當起點切到「自訂」（由 onEdit 處理）。
 */

type Mech = 'elevator' | 'arm'

interface Def {
  k: TuneKey
  label: string
  hint: Record<Mech, string>
}

const GROUPS: { title: string; keys: Def[] }[] = [
  {
    title: '① 前饋（先調）',
    keys: [
      { k: 'kG', label: 'kG', hint: { elevator: '抵銷重力。太小停住後往下掉，太大往上飄', arm: '水平時抵銷重力（會乘 cos θ）。太小會垂下去，太大往上飄' } },
      { k: 'kS', label: 'kS', hint: { elevator: '克服摩擦的固定電壓。太大會在目標附近抖', arm: '克服摩擦的固定電壓。太大會在目標附近抖' } },
      { k: 'kV', label: 'kV', hint: { elevator: '每 1 m/s 要多少電壓。太小落後軌跡，太大超前', arm: '每 1 rad/s 要多少電壓。太小落後軌跡，太大超前' } },
      { k: 'kA', label: 'kA', hint: { elevator: '加速、減速時多給的電壓', arm: '角加速、減速時多給的電壓' } },
    ],
  },
  {
    title: '② 回授（再調）',
    keys: [
      { k: 'kP', label: 'kP', hint: { elevator: '誤差越大推越用力。太小停不準，太大會震盪', arm: '誤差越大推越用力。太小停不準，太大會震盪' } },
      { k: 'kD', label: 'kD', hint: { elevator: '壓住衝過頭和震盪。太大會抖', arm: '壓住衝過頭和擺動。太大會抖' } },
      { k: 'kI', label: 'kI', hint: { elevator: '慢慢補累積的誤差。通常 0，太大會來回擺', arm: '慢慢補累積的誤差。通常 0，太大會來回擺' } },
    ],
  },
  {
    title: '③ 軌跡（Motion Magic）',
    keys: [
      { k: 'cruiseVelocity', label: '巡航速度', hint: { elevator: '太快馬達出不了力，會落後軌跡', arm: '太快馬達出不了力，會落後軌跡' } },
      { k: 'acceleration', label: '加速度', hint: { elevator: '太大電流打滿，加速段落後', arm: '太大電流打滿，加速段落後' } },
    ],
  },
]

export interface TuneSlidersProps<T extends TuneGains> {
  mechanism: Mech
  /** 畫面上正在模擬的參數 */
  values: T
  theory: TuneGains
  /** 目前看的是不是「自訂」 */
  editingCustom: boolean
  /** 目前參數來源的名稱（理論值、調參建議值…） */
  sourceLabel: string
  onEdit: (patch: (p: T) => T) => void
  onResetAll: () => void
  units: Record<TuneKey, string>
  /** 顯示倍率（手臂的巡航、加速度內部 rad，畫面顯示度） */
  display?: Partial<Record<TuneKey, number>>
  /** 不能調的欄位與原因（例如電梯開了往下 Slot 1 時的 kS、kG） */
  disabled?: Partial<Record<TuneKey, string>>
}

export function TuneSliders<T extends TuneGains>({ mechanism, values, theory, editingCustom, sourceLabel, onEdit, onResetAll, units, display = {}, disabled = {} }: TuneSlidersProps<T>) {
  const id = useId()
  const changed = GROUPS.some((g) => g.keys.some(({ k }) => Math.abs(getGain(values, k) - getGain(theory, k)) > 1e-9))
  return (
    <section className="tune" aria-label="親手調參數">
      <div className="tune-head">
        <h3>親手調參數</h3>
        <span className="small muted">
          {editingCustom
            ? '拖動滑桿或打數字，模擬和動畫馬上更新。一次只改一個，才看得出是誰造成的變化。'
            : `現在看的是「${sourceLabel}」。拖任何一條就從這組數字開始調，自動切到「自訂」（會取代原本的自訂參數）。`}
        </span>
        <button className="btn small" type="button" onClick={onResetAll} disabled={editingCustom && !changed}>
          全部回到理論值
        </button>
      </div>
      <div className="tune-groups">
        {GROUPS.map((g) => (
          <div className="tune-group" key={g.title}>
            <h4>{g.title}</h4>
            {g.keys.map(({ k, label, hint }) => {
              const v = getGain(values, k)
              const t = getGain(theory, k)
              const r = sliderRange(k, theory, v)
              const s = display[k] ?? 1
              const off = disabled[k]
              const diff = Math.abs(v - t) > 1e-9
              const pct = t !== 0 ? Math.round((v / t) * 100) : null
              const listId = `${id}-${k}`
              // 數字欄的小數位跟著滑桿步距（畫面單位），不會出現 1.5826531 這種長串
              const digits = Math.max(0, Math.ceil(-Math.log10(r.step * s) - 1e-9))
              const set = (x: number) => onEdit((p) => setGain(p, k, x))
              return (
                <div className={'tune-row' + (diff ? ' changed' : '')} key={k}>
                  <div className="tune-label">
                    <b>{label}</b>
                    <span className="small muted">{off ?? hint[mechanism]}</span>
                  </div>
                  <input
                    type="range"
                    aria-label={`${label}（${units[k]}）`}
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    value={Math.min(r.max, Math.max(r.min, v))}
                    list={listId}
                    disabled={!!off}
                    onChange={(e) => set(snap(Number(e.target.value), r.step))}
                  />
                  <datalist id={listId}>
                    <option value={t} label="理論值" />
                  </datalist>
                  <div className="tune-num">
                    <NumberField label={label} hideLabel value={v} display={s} digits={digits} min={k === 'cruiseVelocity' || k === 'acceleration' ? r.step : k === 'kS' || k === 'kG' ? undefined : 0} onChange={set} unit={units[k]} />
                  </div>
                  <div className="tune-ref small muted">
                    理論 {Number.isFinite(t) ? (t * s).toFixed(digits) : '—'}
                    {diff && pct !== null && <em>（現在 {pct}%）</em>}
                    {diff && (
                      <button className="linkbtn small" type="button" onClick={() => set(t)} disabled={!!off} aria-label={`${label} 回到理論值`}>
                        ↺ 回理論
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
